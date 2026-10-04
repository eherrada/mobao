export {};
const vars = require("../vars");
const game = require("../game");
const npcs = require("../npcs");
const handleProtocol = require("../handleProtocol");
const socket = require("../socket");
const config = require("./config");
const teams = require("./teams");
const ai = require("./ai");
const fog = require("./fog");
const { spawnMobaNpc } = require("./npcFactory");

type Team = "blue" | "red";
type Pt = { x: number; y: number };

type StructureRecord = {
    def: { kind: "tower" | "nexus"; team: Team; lane?: string; tier?: number; x: number; y: number };
    npcId: number;
};

type Match = {
    id: string;
    mapId: number;
    state: "running" | "ended";
    createdAt: number;
    nextWaveAt: number;
    waveCount: number;
    resetAt: number;
    winner?: Team;
    npcIds: Set<number>;
    structures: StructureRecord[];
    spawnQueue: Array<{ at: number; team: Team; lane: string }>;
};

const matches: Record<string, Match> = {};

const HERO_SPAWN_OFFSETS: Pt[] = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: -3 },
    { x: 3, y: -3 },
    { x: -3, y: 0 },
    { x: 0, y: 3 },
];

// --- utilidades ---------------------------------------------------------------------

function manhattan(a: Pt, b: Pt) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Punto a la fraccion f (0..1) de una polilinea, por distancia Manhattan. */
function pointAlong(path: Pt[], f: number): Pt {
    const lengths = path.slice(1).map((p, i) => manhattan(path[i], p));
    let remaining = f * lengths.reduce((sum, len) => sum + len, 0);

    for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
            const t = lengths[i] === 0 ? 0 : remaining / lengths[i];
            return {
                x: Math.round(path[i].x + (path[i + 1].x - path[i].x) * t),
                y: Math.round(path[i].y + (path[i + 1].y - path[i].y) * t),
            };
        }

        remaining -= lengths[i];
    }

    return path[path.length - 1];
}

function findFreeNear(mapId: number, origin: Pt, maxRadius = 5): Pt | null {
    for (let r = 0; r <= maxRadius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const pos = { x: origin.x + dx, y: origin.y + dy };
                if (game.legalPosNpc(pos.x, pos.y, mapId, false, false)) return pos;
            }
        }
    }

    return null;
}

function laneForTeam(laneName: string, team: Team): Pt[] {
    const lane: Pt[] = config.getMapConfig().lanes[laneName];
    return team === "blue" ? lane : [...lane].reverse();
}

function heroesOf(match: Match): any[] {
    const heroes: any[] = [];

    for (const id in vars.personajes) {
        const hero = vars.personajes[id];

        if (hero && hero.mobaMatchId === match.id && !hero.cerrado) {
            heroes.push(hero);
        }
    }

    return heroes;
}

function announce(match: Match, text: string, color = "yellow") {
    for (const hero of heroesOf(match)) {
        const client = vars.clients[hero.id];

        if (client) {
            handleProtocol.console(`[MOBA] ${text}`, color, 1, 0, client);
        }
    }
}

function teamLabel(team: Team | undefined) {
    return team === "blue" ? "azul" : team === "red" ? "rojo" : "";
}

// --- instancia ------------------------------------------------------------------------

function allocateMapId(): number {
    for (let i = 0; i < config.INSTANCE_COUNT; i++) {
        const id = config.INSTANCE_FIRST_ID + i;

        if (!vars.mapData[id]) return id;
    }

    throw new Error("No hay mas instancias de MOBA disponibles");
}

/** Crea el estado dinamico (ocupacion) del mapa de la partida. El terreno es de solo lectura y se comparte. */
function createInstanceMap(mapId: number) {
    const base = config.BASE_MAP_ID;
    const width = vars.mapData[base].width;
    const height = vars.mapData[base].height;
    const data: any = [];

    for (let y = 1; y <= height; y++) {
        data[y] = [];
        for (let x = 1; x <= width; x++) {
            data[y][x] = { id: 0 };
        }
    }

    for (const key of [
        "name", "musicNum", "magiaSinEfecto", "noEncriptarMp", "terreno", "zona",
        "restringir", "minLevel", "maxLevel", "backup", "pk", "width", "height",
    ]) {
        data[key] = vars.mapData[base][key];
    }

    vars.mapa[mapId] = vars.mapa[base];
    vars.mapData[mapId] = data;
}

function spawnStructures(match: Match) {
    match.structures = [];

    for (const def of config.getMapConfig().structures) {
        const templateId = config.TEMPLATES[def.kind][def.team];
        const npc = spawnMobaNpc({
            templateId,
            mapId: match.mapId,
            x: def.x,
            y: def.y,
            team: def.team,
            matchId: match.id,
            lane: def.lane,
            tier: def.tier,
        });

        if (npc) {
            match.npcIds.add(npc.id);
            match.structures.push({ def, npcId: npc.id });
        }
    }

    recomputeInvulnerability(match);
}

function createMatch(id: string): Match {
    const mapId = allocateMapId();
    createInstanceMap(mapId);

    const now = Date.now();
    const match: Match = {
        id,
        mapId,
        state: "running",
        createdAt: now,
        nextWaveAt: now + config.TIMING.firstWaveDelayMs,
        waveCount: 0,
        resetAt: 0,
        npcIds: new Set(),
        structures: [],
        spawnQueue: [],
    };

    matches[id] = match;
    spawnStructures(match);
    return match;
}

function getMatch(id: string): Match | undefined {
    return matches[id];
}

function ensureMatch(id: string): Match {
    return matches[id] ?? createMatch(id);
}

// --- estructuras e invulnerabilidad ---------------------------------------------------

function isAlive(record: StructureRecord) {
    const npc = vars.npcs[record.npcId];
    return Boolean(npc && npc.hp > 0 && !npc.deathProcessed);
}

/** Orden de destruccion: torre exterior -> interior -> torres de base -> nexo. */
function recomputeInvulnerability(match: Match) {
    for (const team of ["blue", "red"] as Team[]) {
        const own = match.structures.filter((s) => s.def.team === team);
        const aliveTier = (tier: number, lane?: string) =>
            own.filter((s) => s.def.kind === "tower" && s.def.tier === tier && (!lane || s.def.lane === lane) && isAlive(s));
        const anyInnerDead = own.some((s) => s.def.kind === "tower" && s.def.tier === 2 && !isAlive(s));

        for (const record of own) {
            const npc = vars.npcs[record.npcId];
            if (!npc) continue;

            if (record.def.kind === "nexus") {
                npc.invulnerable = aliveTier(3).length > 0;
            } else if (record.def.tier === 1) {
                npc.invulnerable = false;
            } else if (record.def.tier === 2) {
                npc.invulnerable = aliveTier(1, record.def.lane).length > 0;
            } else {
                npc.invulnerable = !anyInnerDead;
            }
        }
    }
}

function removeNpc(npc: any) {
    const tile = vars.mapData[npc.map]?.[npc.pos.y]?.[npc.pos.x];

    if (tile?.id === npc.id) tile.id = 0;

    npcs.loopArea(npc.id, (target: any) => {
        const client = vars.clients[target.id];
        if (client) handleProtocol.deleteCharacter(npc.id, client);
    });

    delete vars.npcs[npc.id];
    delete vars.areaNpc[npc.id];
}

// --- eventos --------------------------------------------------------------------------

/** Llamado desde npcs.muereNpc cuando muere un NPC marcado noRespawn (estructura o minion). */
function onNpcDestroyed(npc: any) {
    const match = matches[npc.mobaMatchId];

    if (!match) return;

    match.npcIds.delete(npc.id);

    if (npc.structure === "minion") return;

    const where = npc.lane ? ` del carril ${npc.lane}` : npc.tier === 3 ? " de base" : "";

    if (npc.structure === "nexus") {
        announce(match, `¡El nexo ${teamLabel(npc.team)} fue destruido!`, "red");
        endMatch(match, teams.opposite(npc.team));
        return;
    }

    announce(match, `Torre ${teamLabel(npc.team)}${where} destruida.`, "orange");
    recomputeInvulnerability(match);
}

function onNpcKilledByNpc(target: any, attacker: any) {
    void target;
    void attacker;
}

function endMatch(match: Match, winner: Team) {
    match.state = "ended";
    match.winner = winner;
    match.resetAt = Date.now() + config.TIMING.resetAfterWinMs;
    announce(match, `¡Victoria del equipo ${teamLabel(winner)}! Nueva partida en ${Math.round(config.TIMING.resetAfterWinMs / 1000)} s.`, "yellow");
}

function onHeroDeath(user: any) {
    const match = matches[user.mobaMatchId];

    if (!match) return;

    user.mobaRespawnAt = Date.now() + config.TIMING.heroRespawnMs;
    const client = vars.clients[user.id];

    if (client) {
        handleProtocol.console(
            `[MOBA] Reapareces en ${Math.round(config.TIMING.heroRespawnMs / 1000)} segundos.`,
            "yellow",
            1,
            0,
            client,
        );
    }
}

function heroSpawnPoint(match: Match, team: Team, slot: number): Pt {
    const base = config.getMapConfig().spawn[team];
    const offset = HERO_SPAWN_OFFSETS[slot % HERO_SPAWN_OFFSETS.length];
    return { x: base.x + (team === "blue" ? offset.x : -offset.x), y: base.y + (team === "blue" ? offset.y : -offset.y) };
}

function respawnHero(match: Match, hero: any) {
    const client = vars.clients[hero.id];

    if (!client) return;

    hero.mobaRespawnAt = 0;
    const spawn = heroSpawnPoint(match, hero.mobaTeam, hero.mobaSlot ?? 0);

    if (hero.dead) {
        game.revivirUsuario(hero.id, { hp: hero.maxHp, mana: hero.maxMana });
    } else {
        hero.hp = hero.maxHp;
        hero.mana = hero.maxMana;
    }

    game.telep(client, match.mapId, spawn.x, spawn.y, "moba.respawn");
}

// --- union a la partida ---------------------------------------------------------------

/** Asigna equipo y punto de aparicion a un heroe que entra a la partida `matchId` (la crea si no existe). */
function joinMatch(matchId: string, preferredTeam?: Team) {
    const match = ensureMatch(matchId);
    const heroes = heroesOf(match);
    const count = (team: Team) => heroes.filter((h) => h.mobaTeam === team).length;
    const size = config.TIMING.teamSize;

    let team: Team =
        preferredTeam && count(preferredTeam) < size ? preferredTeam : count("blue") <= count("red") ? "blue" : "red";

    if (count(team) >= size) team = teams.opposite(team);
    if (count(team) >= size) throw new Error("La partida esta llena");

    const slot = count(team);
    const spawn = heroSpawnPoint(match, team, slot);

    return { match, team, slot, mapId: match.mapId, spawn };
}

// --- oleadas y tick -------------------------------------------------------------------

function queueWave(match: Match, now: number) {
    match.waveCount++;

    for (const lane of Object.keys(config.getMapConfig().lanes)) {
        for (const team of ["blue", "red"] as Team[]) {
            for (let i = 0; i < config.TIMING.minionsPerWave; i++) {
                match.spawnQueue.push({ at: now + i * config.TIMING.minionSpawnGapMs, team, lane });
            }
        }
    }
}

function spawnMinion(match: Match, team: Team, laneName: string) {
    const path = laneForTeam(laneName, team);
    const start = findFreeNear(match.mapId, pointAlong(path, 0.07), 6);

    if (!start) return;

    const npc = spawnMobaNpc({
        templateId: config.TEMPLATES.minion[team],
        mapId: match.mapId,
        x: start.x,
        y: start.y,
        team,
        matchId: match.id,
        lane: laneName,
        waypoints: path,
    });

    if (npc) match.npcIds.add(npc.id);
}

function resetMatch(match: Match) {
    for (const id of [...match.npcIds]) {
        const npc = vars.npcs[id];
        if (npc) removeNpc(npc);
    }

    match.npcIds.clear();
    match.spawnQueue = [];
    match.winner = undefined;
    match.state = "running";
    match.waveCount = 0;
    match.nextWaveAt = Date.now() + config.TIMING.firstWaveDelayMs;
    spawnStructures(match);

    for (const hero of heroesOf(match)) {
        respawnHero(match, hero);
    }

    announce(match, "¡Comienza una nueva partida!", "green");
}

function destroyMatch(match: Match) {
    for (const id of [...match.npcIds]) {
        delete vars.npcs[id];
        delete vars.areaNpc[id];
    }

    delete matches[match.id];
    fog.clearMatch(match.id);
    delete vars.mapData[match.mapId];
    delete vars.mapa[match.mapId];
}

/** Si el ultimo heroe se va, la partida y su instancia se destruyen. */
function onHeroDisconnected(user: any) {
    const match = matches[user?.mobaMatchId];

    if (match && heroesOf(match).filter((hero) => hero.id !== user.id).length === 0) {
        destroyMatch(match);
    }
}

function tick() {
    const now = Date.now();

    for (const id in matches) {
        const match = matches[id];

        if (!vars.mapData[match.mapId]) {
            destroyMatch(match);
            continue;
        }

        if (match.state === "ended") {
            if (now >= match.resetAt) resetMatch(match);
            continue;
        }

        if (now >= match.nextWaveAt) {
            queueWave(match, now);
            match.nextWaveAt = now + config.TIMING.waveIntervalMs;
        }

        if (match.spawnQueue.length > 0) {
            const due = match.spawnQueue.filter((s) => s.at <= now);
            match.spawnQueue = match.spawnQueue.filter((s) => s.at > now);
            for (const s of due) spawnMinion(match, s.team, s.lane);
        }

        const live: any[] = [];

        for (const npcId of match.npcIds) {
            const npc = vars.npcs[npcId];
            if (npc) live.push(npc);
            else match.npcIds.delete(npcId);
        }

        const heroes = heroesOf(match);
        fog.refreshVision(match.id, heroes, live);

        ai.thinkAll(match.id, now, live);

        for (const hero of heroes) {
            if (hero.dead && hero.mobaRespawnAt && now >= hero.mobaRespawnAt) {
                respawnHero(match, hero);
            }
        }

        fog.syncVisibility(heroes, live);
    }
}

/** Resumen para depuracion/tests. */
function describe() {
    return Object.values(matches).map((m) => ({
        id: m.id,
        mapId: m.mapId,
        state: m.state,
        winner: m.winner ?? null,
        waves: m.waveCount,
        npcs: m.npcIds.size,
    }));
}

module.exports = {
    joinMatch,
    ensureMatch,
    getMatch,
    tick,
    describe,
    onNpcDestroyed,
    onNpcKilledByNpc,
    onHeroDeath,
    onHeroDisconnected,
};
