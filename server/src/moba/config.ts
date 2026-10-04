export {};
const fs = require("fs");
const path = require("path");

/** Mapa base del MOBA y rango de ids de instancia (id = 30000 + 50*base + n, que el cliente ya sabe resolver). */
const BASE_MAP_ID = 600;
const INSTANCE_FIRST_ID = 30_000 + 50 * BASE_MAP_ID;
const INSTANCE_COUNT = 50;

const envNumber = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const TIMING = {
    // Calibrado por distancia: un carril mide ~400 tiles y el minion avanza 5 tiles/s (cruza en ~80 s, se
    // encuentran en el medio a los ~40 s): una oleada cada 40 s deja ~1 en camino por lado.
    waveIntervalMs: envNumber("MOBA_WAVE_MS", 40_000),
    firstWaveDelayMs: envNumber("MOBA_FIRST_WAVE_MS", 15_000),
    meleePerWave: envNumber("MOBA_MELEE_PER_WAVE", 2),
    castersPerWave: envNumber("MOBA_CASTERS_PER_WAVE", 2),
    cannonEveryWaves: envNumber("MOBA_CANNON_EVERY", 3),
    minionSpawnGapMs: 900,
    heroRespawnMs: envNumber("MOBA_RESPAWN_MS", 8_000),
    resetAfterWinMs: envNumber("MOBA_RESET_MS", 15_000),
    teamSize: envNumber("MOBA_TEAM_SIZE", 3),
    passiveGoldPerSecond: envNumber("MOBA_PASSIVE_GOLD", 3),
    startGold: envNumber("MOBA_START_GOLD", 600),
    jungleRespawnMs: envNumber("MOBA_JUNGLE_RESPAWN_MS", 45_000),
    buffDurationMs: 90_000,
};

const TEMPLATES = {
    tower: { blue: 9601, red: 9602 },
    nexus: { blue: 9603, red: 9604 },
    minion: { blue: 9605, red: 9606 },
    caster: { blue: 9611, red: 9612 },
    cannon: { blue: 9613, red: 9614 },
    shop: { blue: 9607, red: 9607 },
    dummy: { blue: 9610, red: 9610 },
    barracks: { blue: 9615, red: 9616 },
    jungleSmall: 9608,
    jungleBig: 9609,
    sentinel: 9620,
    bramble: 9621,
    wolfAlpha: 9622,
    golem: 9623,
    scorpion: 9624,
    spiderling: 9626,
    crab: 9628,
    drake: 9629,
    baron: 9630,
} as const;

type CampType = "sentinel" | "bramble" | "wolves" | "golems" | "scorpions" | "crab" | "drake" | "baron";

/** Monstruos de cada tipo de campamento (offsets desde el centro). El primero es el principal. */
const CAMP_LAYOUTS: Record<CampType, Array<{ template: number; dx: number; dy: number }>> = {
    sentinel: [
        { template: TEMPLATES.sentinel, dx: 0, dy: 0 },
        { template: TEMPLATES.spiderling, dx: -2, dy: 1 },
        { template: TEMPLATES.spiderling, dx: 2, dy: 1 },
    ],
    bramble: [
        { template: TEMPLATES.bramble, dx: 0, dy: 0 },
        { template: TEMPLATES.spiderling, dx: -2, dy: 1 },
        { template: TEMPLATES.spiderling, dx: 2, dy: 1 },
        { template: TEMPLATES.spiderling, dx: 0, dy: 2 },
    ],
    wolves: [
        { template: TEMPLATES.wolfAlpha, dx: 0, dy: 0 },
        { template: TEMPLATES.jungleSmall, dx: -2, dy: 1 },
        { template: TEMPLATES.jungleSmall, dx: 2, dy: 1 },
    ],
    golems: [
        { template: TEMPLATES.golem, dx: 0, dy: 0 },
        { template: TEMPLATES.jungleSmall, dx: -2, dy: 1 },
    ],
    scorpions: [
        { template: TEMPLATES.scorpion, dx: -1, dy: -1 },
        { template: TEMPLATES.scorpion, dx: 1, dy: -1 },
        { template: TEMPLATES.scorpion, dx: -1, dy: 1 },
        { template: TEMPLATES.scorpion, dx: 1, dy: 1 },
    ],
    crab: [{ template: TEMPLATES.crab, dx: 0, dy: 0 }],
    drake: [{ template: TEMPLATES.drake, dx: 0, dy: 0 }],
    baron: [{ template: TEMPLATES.baron, dx: 0, dy: 0 }],
};

// Escala de tiempo de los objetivos (los tests rapidos la bajan con MOBA_OBJ_SCALE).
const OBJ_SCALE = Number(process.env.MOBA_OBJ_SCALE) || 1;

/** Cuando aparece por primera vez y cada cuanto reaparece cada tipo (ms desde el inicio / desde la muerte). */
const CAMP_TIMING: Record<CampType, { firstMs: number; respawnMs: number }> = {
    sentinel: { firstMs: 0, respawnMs: 120_000 * OBJ_SCALE },
    bramble: { firstMs: 0, respawnMs: 120_000 * OBJ_SCALE },
    wolves: { firstMs: 0, respawnMs: 0 },
    golems: { firstMs: 0, respawnMs: 0 },
    scorpions: { firstMs: 0, respawnMs: 0 },
    crab: { firstMs: 60_000 * OBJ_SCALE, respawnMs: 150_000 * OBJ_SCALE },
    drake: { firstMs: 150_000 * OBJ_SCALE, respawnMs: 300_000 * OBJ_SCALE },
    baron: { firstMs: 420_000 * OBJ_SCALE, respawnMs: 360_000 * OBJ_SCALE },
};

type Pt = { x: number; y: number };
type StructureDef = {
    kind: "tower" | "nexus" | "shop" | "dummy" | "barracks";
    team: "blue" | "red";
    lane?: string;
    tier?: number;
    x: number;
    y: number;
};
type MapConfig = {
    size: number;
    spawn: { blue: Pt; red: Pt };
    bases: { blue: Pt; red: Pt };
    lanes: Record<string, Pt[]>;
    structures: StructureDef[];
    camps: Array<{ x: number; y: number; owner: "blue" | "red" | "neutral"; type: CampType }>;
};

let cachedConfig: MapConfig | undefined;

function getMapConfig(): MapConfig {
    if (!cachedConfig) {
        const file = path.resolve(__dirname, `../../mapas_source/mapa_${BASE_MAP_ID}/moba.json`);
        cachedConfig = JSON.parse(fs.readFileSync(file, "utf8")) as MapConfig;
    }

    return cachedConfig;
}

module.exports = { BASE_MAP_ID, INSTANCE_FIRST_ID, INSTANCE_COUNT, TIMING, TEMPLATES, CAMP_LAYOUTS, CAMP_TIMING, getMapConfig };
