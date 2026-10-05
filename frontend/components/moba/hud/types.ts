/** Estado de partida que envia el servidor (server/src/moba/match.ts → broadcastState). */
export type MobaState = {
    phase: "running" | "ended";
    winner: 0 | 1 | null;
    elapsed: number;
    resetIn: number;
    team: 0 | 1;
    respawnIn: number;
    size: number;
    me: MobaMe;
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
    // Campos del sistema de habilidades (abilities.ts → describeSkills); opcionales por compatibilidad.
    id?: string;
    desc?: string;
    cdLeftMs?: number;
    cdTotalMs?: number;
    cost?: number;
    resource?: MobaResource;
    range?: number;
    target?: MobaTarget;
    icon?: string;
    tags?: string[];
    kind?: "aoSpell" | "tech";
};

export type MobaResource = "mana" | "furia" | "energia";

export type MobaTarget = "self" | "point" | "line" | "area" | "ally";

export type MobaMe = {
    id: number;
    x: number;
    y: number;
    gold: number;
    level: number;
    xp: number;
    xpNext: number;
    maxLevel: number;
    /** Recurso del heroe (hero.mana / maxMana del HUD de AO es ese recurso). */
    resource?: MobaResource;
    shield?: number;
    spec?: { id: string; name: string; desc: string } | null;
    stunned?: boolean;
    rooted?: boolean;
    /** Porcentaje de ralentizacion (0 = sin ralentizar). */
    slowPct?: number;
    /** Reduccion de dano en porcentaje. */
    dr?: number;
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

/** Teclas de habilidad por posicion en el kit: 4 normales + definitiva (W y el resto del movimiento quedan libres). */
export const DEFAULT_SKILL_CODES = ["KeyQ", "KeyE", "KeyR", "KeyT", "KeyY"] as const;
export const SKILL_KEYS_STORAGE = "mobao.skillKeys.v1";

/** Teclas que no se pueden usar para una habilidad (movimiento, ataque, tienda, pociones, chat, marcador). */
const RESERVED_CODES = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Space", "Tab", "Enter", "NumpadEnter", "Escape", "KeyB", "Digit1", "Digit2", "Numpad1", "Numpad2",
]);

export function isReservedCode(code: string) {
    return RESERVED_CODES.has(code);
}

export function keyLabel(code: string): string {
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `N${code.slice(6)}`;

    return code;
}

export function loadSkillCodes(): string[] {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(SKILL_KEYS_STORAGE) ?? "null");

        if (
            Array.isArray(parsed) &&
            parsed.length === DEFAULT_SKILL_CODES.length &&
            parsed.every((c) => typeof c === "string" && c && !isReservedCode(c)) &&
            new Set(parsed).size === parsed.length
        ) {
            return parsed;
        }
    } catch {
        // Sin configuracion guardada.
    }

    return [...DEFAULT_SKILL_CODES];
}

export function saveSkillCodes(codes: string[]) {
    try {
        window.localStorage.setItem(SKILL_KEYS_STORAGE, JSON.stringify(codes));
    } catch {
        // Sin almacenamiento: la configuracion dura la sesion.
    }
}

/** Colores y nombre por recurso. */
export const RESOURCE_STYLE: Record<MobaResource, { name: string; from: string; to: string; text: string }> = {
    mana: { name: "Mana", from: "#5aa8ff", to: "#2457b8", text: "#7ab8ff" },
    furia: { name: "Furia", from: "#ff7a3d", to: "#b3201a", text: "#ff8a5c" },
    energia: { name: "Energia", from: "#e8e04d", to: "#5fae3a", text: "#d9e86a" },
};

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
