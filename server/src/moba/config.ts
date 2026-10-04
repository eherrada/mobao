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
    waveIntervalMs: envNumber("MOBA_WAVE_MS", 30_000),
    firstWaveDelayMs: envNumber("MOBA_FIRST_WAVE_MS", 10_000),
    minionsPerWave: envNumber("MOBA_MINIONS_PER_WAVE", 3),
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
    shop: { blue: 9607, red: 9607 },
    dummy: { blue: 9610, red: 9610 },
    jungleSmall: 9608,
    jungleBig: 9609,
} as const;

type Pt = { x: number; y: number };
type StructureDef = {
    kind: "tower" | "nexus" | "shop" | "dummy";
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
    camps: Array<{ x: number; y: number; owner: "blue" | "red" }>;
};

let cachedConfig: MapConfig | undefined;

function getMapConfig(): MapConfig {
    if (!cachedConfig) {
        const file = path.resolve(__dirname, `../../mapas_source/mapa_${BASE_MAP_ID}/moba.json`);
        cachedConfig = JSON.parse(fs.readFileSync(file, "utf8")) as MapConfig;
    }

    return cachedConfig;
}

module.exports = { BASE_MAP_ID, INSTANCE_FIRST_ID, INSTANCE_COUNT, TIMING, TEMPLATES, getMapConfig };
