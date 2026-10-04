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
    def: { kind: "tower" | "nexus" | "shop" | "dummy"; team: Team; lane?: string; tier?: number; x: number; y: number };
    npcId: number;
};

type Match = {
    id: string;
    mapId: number;
    state: "running" | "ended";
    createdAt: number;
    startedAt: number;
    nextWaveAt: number;
    waveCount: number;
    resetAt: number;
    winner?: Team;
    npcIds: Set<number>;
    structures: StructureRecord[];
    spawnQueue: Array<{ at: number; team: Team; lane: string }>;
    jungleRespawns: Array<{ at: number; camp: number; slot: number }>;
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

const CAMP_SLOTS: Array<{ dx: number; dy: number; big: boolean }> = [
    { dx: 0, dy: 0, big: true },
    { dx: -2, dy: 1, big: false },
    { dx: 2, dy: 1, big: false },
];

function spawnCampMonster(match: Match, campIndex: number, slot: number) {
    const camp = config.getMapConfig().camps[campIndex];
    const def = CAMP_SLOTS[slot];

    if (!camp || !def) return;

    const pos = findFreeNear(match.mapId, { x: camp.x + def.dx, y: camp.y + def.dy }, 3);

    if (!pos) return;

    const npc = spawnMobaNpc({
        templateId: def.big ? config.TEMPLATES.jungleBig : config.TEMPLATES.jungleSmall,
        mapId: match.mapId,
        x: pos.x,
        y: pos.y,
        matchId: match.id,
        campIndex,
        campSlot: slot,
    });

    if (npc) match.npcIds.add(npc.id);
}

function spawnCamps(match: Match) {
    match.jungleRespawns = [];
    const camps = config.getMapConfig().camps ?? [];

    camps.forEach((_camp: unknown, index: number) => {
        CAMP_SLOTS.forEach((_slot, slot) => spawnCampMonster(match, index, slot));
    });
}

function createMatch(id: string): Match {
    const startedAtMs = process.hrtime.bigint();
    const mapId = allocateMapId();
    createInstanceMap(mapId);

    const now = Date.now();
    const match: Match = {
        id,
        mapId,
        state: "running",
        createdAt: now,
        startedAt: now,
        nextWaveAt: now + config.TIMING.firstWaveDelayMs,
        waveCount: 0,
        resetAt: 0,
        npcIds: new Set(),
        structures: [],
        spawnQueue: [],
        jungleRespawns: [],
    };

    matches[id] = match;
    spawnStructures(match);
    spawnCamps(match);
    console.log(`[moba] partida "${id}" creada en mapa ${mapId} (${(Number(process.hrtime.bigint() - startedAtMs) / 1e6).toFixed(1)} ms)`);
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
            if (!npc || record.def.kind === "shop" || record.def.kind === "dummy") continue;

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

    if (npc.structure === "jungle") {
        match.jungleRespawns.push({
            at: Date.now() + config.TIMING.jungleRespawnMs,
            camp: npc.campIndex,
            slot: npc.campSlot,
        });
        return;
    }

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

/** El monstruo grande da una bendicion: fuerza y agilidad extra y algo de vida. */
function onJungleKill(killer: any, monster: any) {
    if (!monster.buff) return;

    const client = vars.clients[killer.id];

    killer.attrFuerza = Number(killer.bkAttrFuerza ?? killer.attrFuerza) + 10;
    killer.attrAgilidad = Number(killer.bkAttrAgilidad ?? killer.attrAgilidad) + 10;
    killer.cooldownFuerza = Date.now();
    killer.cooldownAgilidad = Date.now();
    killer.hp = Math.min(killer.maxHp, killer.hp + Math.round(killer.maxHp * 0.3));

    if (client) {
        handleProtocol.updateFuerza(killer.attrFuerza, Math.round(config.TIMING.buffDurationMs / 1000), client);
        handleProtocol.updateAgilidad(killer.attrAgilidad, Math.round(config.TIMING.buffDurationMs / 1000), client);
        handleProtocol.updateHP(killer.hp, client);
        handleProtocol.console("[MOBA] ¡Obtienes la bendicion del Ogro! (+fuerza, +agilidad)", "green", 1, 0, client);
    }
}

function onHeroKill(killer: any, victim: any) {
    if (victim.mobaKillCredited) return;

    victim.mobaKillCredited = true;
    killer.mobaKills = (killer.mobaKills ?? 0) + 1;
}

function onMinionKill(killer: any) {
    killer.mobaCs = (killer.mobaCs ?? 0) + 1;
}

function onHeroDeath(user: any) {
    const match = matches[user.mobaMatchId];

    if (!match) return;

    user.mobaDeaths = (user.mobaDeaths ?? 0) + 1;

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
    hero.mobaKillCredited = false;
    const spawn = heroSpawnPoint(match, hero.mobaTeam, hero.mobaSlot ?? 0);

    if (hero.dead) {
        game.revivirUsuario(hero.id, { hp: hero.maxHp, mana: hero.maxMana });
        // El servidor reequipa al heroe al revivir; el cliente necesita el inventario actualizado
        // (si no, cree que no tiene arma y la tecla de ataque no hace nada).
        handleProtocol.sendMyCharacter(hero);
        socket.send(client);
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
    match.jungleRespawns = [];
    match.winner = undefined;
    match.state = "running";
    match.startedAt = Date.now();
    match.waveCount = 0;
    match.nextWaveAt = Date.now() + config.TIMING.firstWaveDelayMs;
    spawnStructures(match);
    spawnCamps(match);

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

const lastStateAt: Record<string, number> = {};
const KIND_CODE: Record<string, number> = { hero: 0, minion: 1, tower: 2, nexus: 3, shop: 4 };

/** Estado de la partida para el HUD (marcador y minimapa), ~2 veces por segundo. */
function broadcastState(match: Match, heroes: any[], live: any[], now: number) {
    if (now - (lastStateAt[match.id] ?? 0) < 500) return;

    lastStateAt[match.id] = now;

    const towers = (team: Team) =>
        match.structures.filter((s) => s.def.kind === "tower" && s.def.team === team && isAlive(s)).length;
    const nexusHp = (team: Team) => {
        const record = match.structures.find((s) => s.def.kind === "nexus" && s.def.team === team);
        const npc = record ? vars.npcs[record.npcId] : undefined;
        return npc ? Math.max(0, Math.round((npc.hp / npc.maxHp) * 100)) : 0;
    };
    const kills = (team: Team) => heroes.filter((h) => h.mobaTeam === team).reduce((sum, h) => sum + (h.mobaKills ?? 0), 0);

    const entsFor = (team: Team) => {
        const ents: number[][] = [];

        for (const hero of heroes) {
            if (hero.dead || hero.cerrado) continue;
            if (hero.mobaTeam === team || fog.isVisibleToTeam(match.id, team, hero.pos)) {
                ents.push([hero.pos.x, hero.pos.y, KIND_CODE.hero, hero.mobaTeam === "blue" ? 0 : 1]);
            }
        }

        for (const npc of live) {
            if (npc.hp <= 0 || npc.deathProcessed || npc.structure === "jungle" || npc.structure === "dummy") continue;
            const alwaysVisible = npc.structure !== "minion";
            if (alwaysVisible || npc.team === team || fog.isVisibleToTeam(match.id, team, npc.pos)) {
                ents.push([npc.pos.x, npc.pos.y, KIND_CODE[npc.structure] ?? 1, npc.team === "blue" ? 0 : 1]);
            }
        }

        return ents;
    };

    const entsByTeam = { blue: entsFor("blue"), red: entsFor("red") };
    const roster = heroes.map((h) => ({
        id: h.id,
        name: h.nameCharacter,
        team: h.mobaTeam === "blue" ? 0 : 1,
        k: h.mobaKills ?? 0,
        d: h.mobaDeaths ?? 0,
        cs: h.mobaCs ?? 0,
        dead: Boolean(h.dead),
    }));

    const base = {
        phase: match.state,
        winner: match.winner ? (match.winner === "blue" ? 0 : 1) : null,
        elapsed: Math.max(0, Math.floor((now - match.startedAt) / 1000)),
        resetIn: match.state === "ended" ? Math.max(0, Math.ceil((match.resetAt - now) / 1000)) : 0,
        score: {
            blue: { towers: towers("blue"), kills: kills("blue"), nexus: nexusHp("blue") },
            red: { towers: towers("red"), kills: kills("red"), nexus: nexusHp("red") },
        },
        heroes: roster,
        size: config.getMapConfig().size,
    };

    for (const hero of heroes) {
        const client = vars.clients[hero.id];

        if (!client || hero.cerrado) continue;

        handleProtocol.mobaState(
            {
                ...base,
                team: hero.mobaTeam === "blue" ? 0 : 1,
                me: { id: hero.id, x: hero.pos.x, y: hero.pos.y, gold: hero.gold ?? 0 },
                respawnIn: hero.dead && hero.mobaRespawnAt ? Math.max(0, Math.ceil((hero.mobaRespawnAt - now) / 1000)) : 0,
                ents: entsByTeam[hero.mobaTeam as Team],
            },
            client,
        );
    }
}

const lastRegenAt: Record<string, number> = {};
const FOUNTAIN_RADIUS = 12;

/** Los heroes vivos cerca de su punto de aparicion se curan rapido (fuente de la base). */
function regenAtFountain(match: Match, heroes: any[], now: number) {
    if (now - (lastRegenAt[match.id] ?? 0) < 1000) return;

    lastRegenAt[match.id] = now;
    const spawns = config.getMapConfig().spawn;

    for (const hero of heroes) {
        const client = vars.clients[hero.id];
        const spawn = spawns[hero.mobaTeam as Team];

        if (!client || hero.dead || !spawn || manhattan(hero.pos, spawn) > FOUNTAIN_RADIUS) continue;
        if (hero.hp >= hero.maxHp && hero.mana >= hero.maxMana) continue;

        hero.hp = Math.min(hero.maxHp, hero.hp + Math.ceil(hero.maxHp * 0.1));
        hero.mana = Math.min(hero.maxMana, hero.mana + Math.ceil(hero.maxMana * 0.1));
        handleProtocol.updateHP(hero.hp, client);
        handleProtocol.updateMana(hero.mana, client);

        game.loopAreaPos(match.mapId, hero.pos, (viewer: any) => {
            const viewerClient = vars.clients[viewer.id];

            if (!viewerClient || viewer.id === hero.id) return;

            handleProtocol.entityVitalsDelta(hero.id, hero.hp, hero.maxHp, hero.mana, hero.maxMana, viewerClient);
            socket.send(viewerClient);
        });
    }
}

const lastGoldAt: Record<string, number> = {};

function grantPassiveGold(match: Match, heroes: any[], now: number) {
    const last = lastGoldAt[match.id] ?? now;

    if (now - last < 1000) {
        lastGoldAt[match.id] = last;
        return;
    }

    lastGoldAt[match.id] = now;
    const amount = Math.floor(((now - last) / 1000) * config.TIMING.passiveGoldPerSecond);

    for (const hero of heroes) {
        const client = vars.clients[hero.id];

        if (!client || hero.dead) continue;

        hero.gold = require("../balance").clampGold(Number(hero.gold ?? 0) + amount);
        handleProtocol.actGold(hero.gold, client);
    }
}

// Metricas de rendimiento (ventana movil) para /debug/perf y decisiones de optimizacion.
const perf = { samples: [] as number[], max: 0 };
const loopDelay = require("node:perf_hooks").monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

function recordTickDuration(ms: number) {
    perf.samples.push(ms);
    if (perf.samples.length > 200) perf.samples.shift();
    perf.max = Math.max(perf.max, ms);
}

function perfReport() {
    const s = perf.samples;
    const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    const sorted = [...s].sort((a, b) => a - b);
    return {
        tickAvgMs: Number(avg.toFixed(3)),
        tickP95Ms: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(3)),
        tickMaxMs: Number(perf.max.toFixed(3)),
        eventLoopP99Ms: Number((loopDelay.percentile(99) / 1e6).toFixed(2)),
        eventLoopMaxMs: Number((loopDelay.max / 1e6).toFixed(2)),
        matches: Object.keys(matches).length,
        npcs: Object.keys(vars.npcs).length,
    };
}

function resetPerf() {
    perf.samples = [];
    perf.max = 0;
    loopDelay.reset();
}

function tick() {
    const startedAt = process.hrtime.bigint();
    tickInner();
    recordTickDuration(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function tickInner() {
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

        if (match.jungleRespawns.length > 0) {
            const due = match.jungleRespawns.filter((r) => r.at <= now);
            match.jungleRespawns = match.jungleRespawns.filter((r) => r.at > now);
            for (const r of due) spawnCampMonster(match, r.camp, r.slot);
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
        grantPassiveGold(match, heroes, now);
        regenAtFountain(match, heroes, now);
        broadcastState(match, heroes, live, now);
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
    perfReport,
    resetPerf,
    onNpcDestroyed,
    onNpcKilledByNpc,
    onHeroDeath,
    onHeroKill,
    onMinionKill,
    onJungleKill,
    onHeroDisconnected,
};
