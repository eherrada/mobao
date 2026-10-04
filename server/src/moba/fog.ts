export {};
/**
 * Fog of war por equipo (autoritativo en el servidor).
 *
 * - Cada equipo ve el area circular alrededor de sus heroes vivos, minions y estructuras.
 * - Los heroes y minions enemigos fuera de esa area NO se envian al cliente: se filtra dentro de los metodos
 *   de handleProtocol (spawns, snapshots, movimiento, vida, efectos), asi un cliente modificado no puede verlos.
 * - Torres y nexos son conocimiento del mapa: siempre visibles.
 * - Cada tick se detectan los cambios de visibilidad y se envia el borrado/aparicion al cliente.
 */
const vars = require("../vars");
const teams = require("./teams");

type Source = { x: number; y: number; r2: number };
type Team = "blue" | "red";

const VISION_RADIUS = { hero: 10, minion: 6, tower: 11, nexus: 9 };
const AOI_RANGE = 15; // mitad del area de interes 31x31 que el servidor envia a cada cliente

const vision: Record<string, Record<Team, Source[]>> = {};

function radiusOf(entity: any): number {
    if (!entity.isNpc) return VISION_RADIUS.hero;
    if (entity.structure === "tower") return VISION_RADIUS.tower;
    if (entity.structure === "nexus") return VISION_RADIUS.nexus;
    return VISION_RADIUS.minion;
}

/** Recalcula las fuentes de vision de cada equipo de una partida. */
function refreshVision(matchId: string, heroes: any[], npcList: any[]) {
    const sources: Record<Team, Source[]> = { blue: [], red: [] };

    const add = (entity: any) => {
        const team = teams.teamOf(entity) as Team | undefined;
        if (!team) return;
        const r = radiusOf(entity);
        sources[team].push({ x: entity.pos.x, y: entity.pos.y, r2: r * r });
    };

    for (const hero of heroes) {
        if (!hero.cerrado && !hero.dead && hero.hp > 0) add(hero);
    }

    for (const npc of npcList) {
        if (npc.hp > 0 && !npc.deathProcessed) add(npc);
    }

    vision[matchId] = sources;
}

function clearMatch(matchId: string) {
    delete vision[matchId];
}

function isVisibleToTeam(matchId: string, team: Team, pos: { x: number; y: number }): boolean {
    const sources = vision[matchId]?.[team];

    if (!sources) return true;

    for (const s of sources) {
        const dx = s.x - pos.x;
        const dy = s.y - pos.y;
        if (dx * dx + dy * dy <= s.r2) return true;
    }

    return false;
}

function isHiddenEntityFor(viewerId: number | string, entity: any): boolean {
    const viewer = vars.personajes[viewerId];

    if (!viewer?.mobaMatchId || !entity || entity.mobaMatchId !== viewer.mobaMatchId) return false;

    const entityTeam = teams.teamOf(entity);

    if (!entityTeam || entityTeam === viewer.mobaTeam) return false;
    if (entity.structure === "tower" || entity.structure === "nexus") return false;

    return !isVisibleToTeam(viewer.mobaMatchId, viewer.mobaTeam, entity.pos);
}

function lookupEntity(id: number | string): any {
    return vars.personajes[id] ?? vars.npcs[id];
}

function isHiddenIdFor(viewerId: number | string, entityId: number | string): boolean {
    return isHiddenEntityFor(viewerId, lookupEntity(entityId));
}

function isPosHiddenFor(viewerId: number | string, pos: { x: number; y: number } | undefined): boolean {
    const viewer = vars.personajes[viewerId];

    if (!viewer?.mobaMatchId || !pos) return false;

    return !isVisibleToTeam(viewer.mobaMatchId, viewer.mobaTeam, pos);
}

// --- filtros sobre handleProtocol ---------------------------------------------------------

/** Metodos con la forma (idEntidad, ..., client): se omiten si la entidad esta oculta para ese cliente. */
const ENTITY_FIRST_METHODS = [
    "changeHeading", "changeHelmet", "changeRopa", "changeWeapon", "changeArrow", "changeShield",
    "inmo", "legacyInmo", "moveEntity", "actPosition", "dialog", "animFX", "playSound",
    "entityVitalsDelta", "putBodyAndHeadDead", "changeBody", "actColorName", "revivirUsuario",
    "startCastBar", "stopCastBar", "navegando",
];

let installed = false;

function installProtocolFilters() {
    if (installed) return;
    installed = true;

    const hp = require("../handleProtocol");

    for (const name of ENTITY_FIRST_METHODS) {
        const original = hp[name];

        if (typeof original !== "function") continue;

        hp[name] = function (...args: any[]) {
            const client = args[args.length - 1];

            if (client && typeof client === "object" && client.id !== undefined && isHiddenIdFor(client.id, args[0])) {
                return;
            }

            return original.apply(this, args);
        };
    }

    const wrap = (name: string, shouldSkip: (args: any[]) => boolean, transform?: (args: any[]) => any[]) => {
        const original = hp[name];

        if (typeof original !== "function") return;

        hp[name] = function (...args: any[]) {
            if (shouldSkip(args)) return;
            return original.apply(this, transform ? transform(args) : args);
        };
    };

    wrap("sendNpc", ([npc, client]) => Boolean(client?.id !== undefined && isHiddenEntityFor(client.id, npc)));
    wrap("sendLegacyNpc", ([npc, client]) => Boolean(client?.id !== undefined && isHiddenEntityFor(client.id, npc)));
    wrap("sendCharacter", ([character, viewerId]) => isHiddenEntityFor(viewerId, character));
    wrap("sendLegacyCharacter", ([character, viewerId]) => isHiddenEntityFor(viewerId, character));

    wrap(
        "areaNpcsSnapshot",
        () => false,
        ([list, client]) => [
            Array.isArray(list) && client?.id !== undefined ? list.filter((n: any) => !isHiddenEntityFor(client.id, n)) : list,
            client,
        ],
    );
    wrap(
        "areaCharactersSnapshot",
        () => false,
        ([list, viewerId, client]) => [
            Array.isArray(list) ? list.filter((c: any) => !isHiddenEntityFor(viewerId, c)) : list,
            viewerId,
            client,
        ],
    );

    // Proyectiles: solo se ocultan si ni el origen ni el destino estan en la vision del equipo.
    for (const name of ["spellProjectile", "createProjectile"]) {
        wrap(name, ([start, end, , client]) =>
            Boolean(
                client?.id !== undefined && isPosHiddenFor(client.id, start) && isPosHiddenFor(client.id, end),
            ),
        );
    }
}

// --- cambios de visibilidad por tick ----------------------------------------------------------

/** Envia borrados/apariciones a los clientes cuando una entidad entra o sale de su vision. */
function syncVisibility(heroes: any[], npcList: any[]) {
    const handleProtocol = require("../handleProtocol");
    const socket = require("../socket");

    const candidates: any[] = [
        ...heroes,
        ...npcList.filter((n) => n.structure === "minion" && n.hp > 0 && !n.deathProcessed),
    ];

    for (const viewer of heroes) {
        const client = vars.clients[viewer.id];

        if (!client || viewer.cerrado) continue;

        // true = oculto para este cliente, false = visible. Sin registro = aun no observado.
        const known: Map<number, boolean> = (viewer.fogState ??= new Map<number, boolean>());

        for (const entity of candidates) {
            if (entity.id === viewer.id || teams.teamOf(entity) === viewer.mobaTeam) continue;

            const inAoi =
                Math.abs(entity.pos.x - viewer.pos.x) <= AOI_RANGE && Math.abs(entity.pos.y - viewer.pos.y) <= AOI_RANGE;

            if (!inAoi) continue;

            const hidden = isHiddenEntityFor(viewer.id, entity);
            const previous = known.get(entity.id);
            known.set(entity.id, hidden);

            if (previous === undefined) {
                // Primera observacion: los filtros de envio ya decidieron que se le mando, no hay nada que corregir.
                continue;
            }

            if (hidden && previous === false) {
                // Estaba visible para el cliente: se le ordena borrarlo.
                handleProtocol.deleteCharacter(entity.id, client);
                socket.send(client);
            } else if (!hidden && previous === true) {
                if (entity.isNpc) {
                    handleProtocol.sendNpc(entity, client);
                } else {
                    handleProtocol.sendCharacter(entity, viewer.id);
                }

                socket.send(client);
            }
        }

        // Olvida entidades que ya no existen.
        for (const id of known.keys()) {
            if (!lookupEntity(id)) known.delete(id);
        }
    }
}

module.exports = {
    refreshVision,
    clearMatch,
    syncVisibility,
    installProtocolFilters,
    isHiddenEntityFor,
    isHiddenIdFor,
    isPosHiddenFor,
    VISION_RADIUS,
};
