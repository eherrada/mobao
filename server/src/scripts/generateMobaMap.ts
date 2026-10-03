/**
 * Genera mapas_source/mapa_600: el mapa unico (255x255) del MOBA.
 * Uso: pnpm generate-moba-map
 *
 * Layout (coordenadas 1..255, x hacia la derecha, y hacia abajo):
 *  - Base azul abajo-izquierda, base roja arriba-derecha.
 *  - Tres carriles: top (borde izquierdo y superior), mid (diagonal), bot (borde inferior y derecho).
 *  - Jungla entre carriles con arboles; rio en la diagonal x=y, que los carriles cruzan sin agua.
 */
import fs from "node:fs";
import path from "node:path";

const MAP_ID = 600;
const SIZE = 255;
const OUT_DIR = path.resolve(__dirname, `../../mapas_source/mapa_${MAP_ID}`);

const LANE_HALF_WIDTH = 5; // carril de 11 tiles
const BORDER = 3;
const BASE_HALF = 19;
const RIVER_HALF = 3;
const TREE_DENSITY = 0.16;
const TREE_OBJECT_INDEX = 147;

export type Team = "blue" | "red";
type Pt = { x: number; y: number };

const BLUE_BASE: Pt = { x: 30, y: 225 };
const RED_BASE: Pt = { x: 225, y: 30 };

// Waypoints de cada carril de la base azul a la roja.
const LANES: Record<"top" | "mid" | "bot", Pt[]> = {
    top: [BLUE_BASE, { x: 24, y: 225 }, { x: 24, y: 24 }, { x: 225, y: 24 }, RED_BASE],
    mid: [BLUE_BASE, RED_BASE],
    bot: [BLUE_BASE, { x: 30, y: 231 }, { x: 231, y: 231 }, { x: 231, y: 30 }, RED_BASE],
};

// RNG determinista para que el mapa sea reproducible.
function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function distToSegment(p: Pt, a: Pt, b: Pt) {
    // Distancia Chebyshev a un segmento (los carriles se mueven en 4 direcciones).
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    return Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy));
}

function laneDistance(p: Pt, lane: Pt[]) {
    let best = Infinity;
    for (let i = 0; i < lane.length - 1; i++) {
        best = Math.min(best, distToSegment(p, lane[i], lane[i + 1]));
    }
    return best;
}

function isBase(p: Pt, base: Pt) {
    return Math.abs(p.x - base.x) <= BASE_HALF && Math.abs(p.y - base.y) <= BASE_HALF;
}

/** Punto a fraccion f (0 = base azul, 1 = base roja) del recorrido del carril, por distancia Manhattan. */
export function pointAlongLane(lane: Pt[], f: number): Pt {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < lane.length - 1; i++) {
        const len = Math.abs(lane[i + 1].x - lane[i].x) + Math.abs(lane[i + 1].y - lane[i].y);
        lengths.push(len);
        total += len;
    }
    let remaining = f * total;
    for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
            const t = lengths[i] === 0 ? 0 : remaining / lengths[i];
            return {
                x: Math.round(lane[i].x + (lane[i + 1].x - lane[i].x) * t),
                y: Math.round(lane[i].y + (lane[i + 1].y - lane[i].y) * t),
            };
        }
        remaining -= lengths[i];
    }
    return lane[lane.length - 1];
}

function main() {
    const rand = mulberry32(600);

    type Kind = "grass" | "water" | "tree" | "lane" | "base";
    const kind: Kind[][] = [];
    const laneMask: boolean[][] = [];

    for (let y = 1; y <= SIZE; y++) {
        const row: Kind[] = [];
        const laneRow: boolean[] = [];
        for (let x = 1; x <= SIZE; x++) {
            const p = { x, y };
            const onBorder = x <= BORDER || y <= BORDER || x > SIZE - BORDER || y > SIZE - BORDER;
            const inBase = isBase(p, BLUE_BASE) || isBase(p, RED_BASE);
            const inLane = Object.values(LANES).some((lane) => laneDistance(p, lane) <= LANE_HALF_WIDTH);
            const inRiver = Math.abs(x - y) <= RIVER_HALF;

            let k: Kind;
            if (onBorder) k = "water";
            else if (inBase) k = "base";
            else if (inLane) k = "lane";
            else if (inRiver) k = "water";
            else k = rand() < TREE_DENSITY ? "tree" : "grass";

            row.push(k);
            laneRow.push(inLane || inBase);
        }
        kind.push(row);
        laneMask.push(laneRow);
    }

    // Palette: 1-16 pasto, 17-32 agua (bloqueada), 33 pasto bloqueado (bajo arbol).
    const palette: Record<string, { graphics: number; blocked?: boolean }> = {};
    for (let i = 0; i < 16; i++) palette[String(1 + i)] = { graphics: 6000 + i };
    for (let i = 0; i < 16; i++) palette[String(17 + i)] = { graphics: 1505 + i, blocked: true };
    palette["33"] = { graphics: 6000, blocked: true };

    const rows: number[][] = [];
    const objects: Record<string, { objIndex: number; amount: number }> = {};

    for (let y = 1; y <= SIZE; y++) {
        const out: number[] = [];
        for (let x = 1; x <= SIZE; x++) {
            const k = kind[y - 1][x - 1];
            const variant = Math.floor(rand() * 16);
            if (k === "water") out.push(17 + variant);
            else if (k === "tree") {
                out.push(33);
                objects[`${x},${y}`] = { objIndex: TREE_OBJECT_INDEX, amount: 1 };
            } else out.push(1 + variant);
        }
        rows.push(out);
    }

    // Placement de NPCs: torres y nexos (indices de template se definen en seedMobaNpcs).
    const NPC = { towerBlue: 9601, towerRed: 9602, nexusBlue: 9603, nexusRed: 9604 };
    const placements: Array<{ mapNum: number; x: number; y: number; npcIndex: number }> = [];
    const clear = (p: Pt) => {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = p.x + dx;
                const y = p.y + dy;
                delete objects[`${x},${y}`];
                rows[y - 1][x - 1] = 1 + Math.floor(rand() * 16);
            }
        }
    };
    const place = (p: Pt, npcIndex: number) => {
        clear(p);
        placements.push({ mapNum: MAP_ID, x: p.x, y: p.y, npcIndex });
    };

    place(BLUE_BASE, NPC.nexusBlue);
    place(RED_BASE, NPC.nexusRed);

    // Torres de base, flanqueando el nexo.
    place({ x: BLUE_BASE.x + 7, y: BLUE_BASE.y - 7 }, NPC.towerBlue);
    place({ x: BLUE_BASE.x - 7, y: BLUE_BASE.y + 7 }, NPC.towerBlue);
    place({ x: RED_BASE.x - 7, y: RED_BASE.y + 7 }, NPC.towerRed);
    place({ x: RED_BASE.x + 7, y: RED_BASE.y - 7 }, NPC.towerRed);

    // Dos torres por carril y equipo.
    for (const lane of Object.values(LANES)) {
        for (const f of [0.17, 0.38]) {
            place(pointAlongLane(lane, f), NPC.towerBlue);
            place(pointAlongLane(lane, 1 - f), NPC.towerRed);
        }
    }

    const spawn = { blue: { x: 14, y: 241 }, red: { x: 241, y: 14 } };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const write = (name: string, data: unknown) =>
        fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data) + "\n", "utf8");

    write("meta.json", {
        id: MAP_ID,
        name: "MobAO - La Grieta",
        musicNum: 28,
        magiaSinEfecto: 0,
        noEncriptarMp: 0,
        terreno: "BOSQUE",
        zona: "CAMPO",
        restringir: "",
        maxLevel: 0,
        backup: 0,
        pk: 0,
    });
    write("terrain.json", { id: MAP_ID, width: SIZE, height: SIZE, palette, rows });
    write("specials.json", { id: MAP_ID, exits: {}, objects, npcs: {}, triggers: {} });
    write("npcs.json", placements);
    write("moba.json", { size: SIZE, spawn, bases: { blue: BLUE_BASE, red: RED_BASE } });

    const trees = Object.keys(objects).length;
    console.log(
        `mapa_${MAP_ID} generado: ${SIZE}x${SIZE}, ${trees} arboles, ${placements.length} NPCs (torres+nexos) en ${OUT_DIR}`,
    );
}

main();
