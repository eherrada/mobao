/** Estado de partida que envia el servidor (server/src/moba/match.ts → broadcastState). */
export type MobaState = {
    phase: "running" | "ended";
    winner: 0 | 1 | null;
    elapsed: number;
    resetIn: number;
    team: 0 | 1;
    respawnIn: number;
    size: number;
    me: { id: number; x: number; y: number; gold: number; level: number; xp: number; xpNext: number; maxLevel: number };
    points: number;
    buffs?: Array<{ id: string; name: string; left: number; stacks: number; team: boolean }>;
    skills: MobaSkill[];
    score: Record<"blue" | "red", { towers: number; kills: number; nexus: number }>;
    heroes: MobaHeroRow[];
    /** [x, y, tipo(0 heroe,1 minion,2 torre,3 nexo,4 tienda), equipo(0 azul,1 rojo)] */
    ents: Array<[number, number, number, number]>;
    /** [x, y, tipo(0 centinela,1 zarza,2 comun,3 rio,4 dragon,5 rey demonio), estado(1 vivo,0 muerto,-1 sin vision)] */
    camps?: Array<[number, number, number, number]>;
};

export type MobaSkill = {
    slot: number;
    spell: number;
    name: string;
    rank: number;
    max: number;
    ult: boolean;
    canLevel: boolean;
    nextReqLevel: number;
};

export type MobaHeroRow = {
    id: number;
    name: string;
    team: 0 | 1;
    k: number;
    d: number;
    cs: number;
    lvl: number;
    dead: boolean;
};

/** Linea de aviso/chat que llega por la consola del motor. */
export type FeedLine = {
    id: number;
    text: string;
    color: string;
    at: number;
    /** Si viene de un jugador (chat) en vez del servidor. */
    sender?: string;
};

export const TEAM_COLOR = ["#4aa3ff", "#ff5a4a"] as const;
export const TEAM_NAME = ["AZUL", "ROJO"] as const;

/** Teclas de habilidad por posicion en el kit (W queda libre para moverse). */
export const SKILL_KEYS = [
    { code: "KeyQ", label: "Q" },
    { code: "KeyE", label: "E" },
    { code: "KeyR", label: "R" },
    { code: "KeyT", label: "T" },
    { code: "KeyY", label: "Y" },
    { code: "KeyF", label: "F" },
    { code: "KeyG", label: "G" },
    { code: "KeyH", label: "H" },
] as const;

export function formatClock(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;

    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Colores de aviso del servidor (nombres de AO) → CSS. */
export function cssColor(color?: string): string {
    switch ((color ?? "").toLowerCase()) {
        case "red":
            return "#ff7a6b";
        case "orange":
            return "#ffb347";
        case "green":
            return "#7be495";
        case "yellow":
            return "#f5d76e";
        case "white":
        case "":
            return "#e8e6e0";
        default:
            return color ?? "#e8e6e0";
    }
}
