export {};
/**
 * API HTTP de depuracion para tests automaticos del MOBA.
 * Solo existe con NODE_ENV=development y solo responde a conexiones locales.
 *
 *   GET  /debug/state?map=600       -> jugadores y NPCs del mapa
 *   POST /debug/npc-hp?id=..&hp=..  -> fija la vida de un NPC (para probar destruccion)
 */
const vars = require("../vars");

function isLocal(request: any): boolean {
    const ip = String(request.socket?.remoteAddress ?? "");
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function json(response: any, status: number, body: unknown) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}

function snapshotEntity(entity: any) {
    return {
        id: entity.id,
        name: entity.nameCharacter,
        isNpc: Boolean(entity.isNpc),
        map: entity.map,
        x: entity.pos?.x,
        y: entity.pos?.y,
        hp: entity.hp,
        maxHp: entity.maxHp,
        team: entity.team ?? entity.mobaTeam ?? null,
        structure: entity.structure ?? null,
        lane: entity.lane ?? null,
        tier: entity.tier ?? null,
        invulnerable: Boolean(entity.invulnerable),
        str: entity.attrFuerza ?? null,
        weapon: entity.idItemWeapon ?? null,
        race: entity.idRaza ?? null,
        head: entity.idHead ?? null,
        body: entity.idBody ?? null,
        maxMana: entity.maxMana ?? null,
        armorItem: entity.idItemBody ? (entity.inv?.[entity.idItemBody]?.idItem ?? null) : null,
        campIndex: entity.campIndex ?? null,
        campSlot: entity.campSlot ?? null,
        matchId: entity.mobaMatchId ?? null,
        respawnAt: entity.mobaRespawnAt ?? 0,
        npcTemplate: entity.templateNpcIndex ?? null,
        dead: Boolean(entity.dead),
    };
}

/** Devuelve true si la peticion fue atendida. */
function handleDebugRequest(request: any, response: any): boolean {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (!url.pathname.startsWith("/debug/")) {
        return false;
    }

    if (process.env.NODE_ENV !== "development" || !isLocal(request)) {
        json(response, 404, { error: "Not found" });
        return true;
    }

    if (url.pathname === "/debug/state") {
        const map = Number(url.searchParams.get("map") ?? 0);
        const players = Object.values(vars.personajes)
            .filter((entity: any) => entity && (!map || entity.map === map))
            .map(snapshotEntity);
        const npcs = Object.values(vars.npcs)
            .filter((entity: any) => entity && (!map || entity.map === map))
            .map(snapshotEntity);
        json(response, 200, { players, npcs });
        return true;
    }

    // Entidades de la partida que el espectador NO puede ver ahora mismo (verdad del servidor).
    if (url.pathname === "/debug/fog") {
        const fog = require("./fog");
        const viewerId = String(url.searchParams.get("viewer"));
        const viewer = vars.personajes[viewerId];
        const hidden: number[] = [];

        if (viewer?.mobaMatchId) {
            for (const entity of [...Object.values(vars.personajes), ...Object.values(vars.npcs)] as any[]) {
                if (entity && entity.mobaMatchId === viewer.mobaMatchId && fog.isHiddenEntityFor(viewerId, entity)) {
                    hidden.push(entity.id);
                }
            }
        }

        json(response, 200, { hidden });
        return true;
    }

    if (url.pathname === "/debug/perf") {
        const match = require("./match");
        const report = match.perfReport();
        if (url.searchParams.get("reset")) match.resetPerf();
        json(response, 200, report);
        return true;
    }

    if (url.pathname === "/debug/matches") {
        json(response, 200, require("./match").describe());
        return true;
    }

    if (url.pathname === "/debug/npc-hp" && request.method === "POST") {
        const npc = vars.npcs[String(url.searchParams.get("id"))];

        if (!npc) {
            json(response, 404, { error: "npc not found" });
            return true;
        }

        npc.hp = Number(url.searchParams.get("hp") ?? npc.hp);
        json(response, 200, snapshotEntity(npc));
        return true;
    }

    if (url.pathname === "/debug/hero-hp" && request.method === "POST") {
        const hero = vars.personajes[String(url.searchParams.get("id"))];

        if (!hero) {
            json(response, 404, { error: "hero not found" });
            return true;
        }

        hero.hp = Number(url.searchParams.get("hp") ?? hero.hp);
        json(response, 200, snapshotEntity(hero));
        return true;
    }

    // Destruye un NPC por el mismo camino que una muerte real (hp 0 + muereNpc).
    if (url.pathname === "/debug/destroy" && request.method === "POST") {
        const npc = vars.npcs[String(url.searchParams.get("id"))];

        if (!npc) {
            json(response, 404, { error: "npc not found" });
            return true;
        }

        npc.hp = 0;
        npc.deathProcessed = true;
        require("../npcs").muereNpc(npc.id);
        json(response, 200, { destroyed: true });
        return true;
    }

    json(response, 404, { error: "unknown debug route" });
    return true;
}

module.exports = { handleDebugRequest };
