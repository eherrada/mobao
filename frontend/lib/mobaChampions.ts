import { MOBA_RACES } from "./arenas";

/**
 * Datos de presentación de los campeones del MOBA (retratos, estadísticas relativas y kit).
 * Los ids 0..7 son las plantillas PvP del servidor (server/src/vars.ts charactersPvP) y los kits salen de
 * server/src/moba/heroes.ts (KITS). Las barras de estadísticas son orientativas (1 a 5), definidas a mano.
 */

export type ChampionStatKey = "damage" | "toughness" | "control" | "mobility";

export const CHAMPION_STAT_LABELS: Record<ChampionStatKey, string> = {
    damage: "Daño",
    toughness: "Resistencia",
    control: "Control",
    mobility: "Movilidad",
};

export type ChampionAbility = {
    /** id del hechizo en spells.json */
    spellId: number;
    name: string;
    description: string;
    ultimate?: boolean;
};

export type ChampionInfo = {
    id: number;
    name: string;
    title: string;
    role: string;
    /** Rango de combate para mostrar ("Cuerpo a cuerpo", "A distancia", "Hechizos"). */
    style: string;
    blurb: string;
    stats: Record<ChampionStatKey, number>;
    abilities: ChampionAbility[];
    /** Pasiva / explicación para los campeones sin hechizos (usan solo el arma). */
    passive?: string;
    /** Apariencia (ids de cuerpo/arma/escudo/casco de la plantilla; la cabeza depende de la raza). */
    sprite: {
        bodyId: number;
        weaponId: number;
        shieldId: number;
        helmetId: number;
    };
    accent: string;
};

export const MOBA_CHAMPIONS: ChampionInfo[] = [
    {
        id: 0,
        name: "Mago",
        title: "Hechicero de la ruina",
        role: "Daño en ráfaga",
        style: "A distancia · hechizos",
        blurb: "El mayor daño mágico del juego a cambio de poca vida. Castiga desde lejos y cierra con su definitiva.",
        stats: { damage: 5, toughness: 1, control: 3, mobility: 2 },
        abilities: [
            { spellId: 8, name: "Proyectil Mágico", description: "Disparo barato y constante para hostigar." },
            { spellId: 15, name: "Tormenta de Fuego", description: "Daño medio con poco costo de maná." },
            { spellId: 23, name: "Descarga Eléctrica", description: "Golpe fuerte contra un objetivo." },
            { spellId: 24, name: "Inmovilizar", description: "Deja al enemigo clavado en su lugar." },
            { spellId: 18, name: "Celeridad", description: "Aumenta tu velocidad para huir o perseguir." },
            { spellId: 25, name: "Apocalipsis", description: "Ataque devastador, el más letal del juego.", ultimate: true },
        ],
        sprite: { bodyId: 56, weaponId: 10, shieldId: 0, helmetId: 4 },
        accent: "#a78bfa",
    },
    {
        id: 1,
        name: "Clérigo",
        title: "Sanador de la luz",
        role: "Sanador · soporte",
        style: "A distancia · hechizos",
        blurb: "Mantiene vivo al equipo y frena a los enemigos con parálisis. Su definitiva decide peleas.",
        stats: { damage: 2, toughness: 3, control: 5, mobility: 2 },
        abilities: [
            { spellId: 3, name: "Curar Heridas Leves", description: "Curación barata y rápida." },
            { spellId: 5, name: "Curar Heridas Graves", description: "Curación potente para aliados en apuros." },
            { spellId: 10, name: "Remover Parálisis", description: "Libera a un aliado paralizado o inmovilizado." },
            { spellId: 24, name: "Inmovilizar", description: "Detiene el avance de un enemigo." },
            { spellId: 20, name: "Fuerza", description: "Mejora el daño de un aliado." },
            { spellId: 18, name: "Celeridad", description: "Velocidad extra para ti o un aliado." },
            { spellId: 9, name: "Paralizar", description: "Congela por completo al enemigo un rato.", ultimate: true },
        ],
        sprite: { bodyId: 56, weaponId: 24, shieldId: 6, helmetId: 6 },
        accent: "#fcd34d",
    },
    {
        id: 2,
        name: "Guerrero",
        title: "Muro de acero",
        role: "Tanque",
        style: "Cuerpo a cuerpo · sin maná",
        blurb: "El más resistente. No gasta maná: se planta en la línea y golpea fuerte de cerca.",
        stats: { damage: 3, toughness: 5, control: 1, mobility: 2 },
        abilities: [],
        passive: "Sin hechizos ni maná. Mayor resistencia a la magia y golpes fuertes cuerpo a cuerpo con escudo.",
        sprite: { bodyId: 107, weaponId: 13, shieldId: 6, helmetId: 6 },
        accent: "#f87171",
    },
    {
        id: 3,
        name: "Asesino",
        title: "Sombra del carril",
        role: "Emboscada",
        style: "Cuerpo a cuerpo · hechizos",
        blurb: "Aparece de la nada, elimina a un objetivo frágil y desaparece. Frágil si lo atrapan.",
        stats: { damage: 4, toughness: 2, control: 2, mobility: 5 },
        abilities: [
            { spellId: 8, name: "Proyectil Mágico", description: "Daño barato a distancia." },
            { spellId: 18, name: "Celeridad", description: "Velocidad para entrar y salir de la pelea." },
            { spellId: 20, name: "Fuerza", description: "Potencia tus golpes." },
            { spellId: 24, name: "Inmovilizar", description: "Evita que el objetivo escape." },
            { spellId: 14, name: "Invisibilidad", description: "Desaparece de la vista enemiga.", ultimate: true },
        ],
        sprite: { bodyId: 48, weaponId: 52, shieldId: 3, helmetId: 6 },
        accent: "#34d399",
    },
    {
        id: 4,
        name: "Bardo",
        title: "Voz del equipo",
        role: "Apoyo",
        style: "A distancia · hechizos",
        blurb: "Potencia a todo el equipo con curaciones y mejoras, y castiga con tormentas de fuego.",
        stats: { damage: 3, toughness: 2, control: 3, mobility: 3 },
        abilities: [
            { spellId: 3, name: "Curar Heridas Leves", description: "Curación barata para el equipo." },
            { spellId: 5, name: "Curar Heridas Graves", description: "Curación potente." },
            { spellId: 20, name: "Fuerza", description: "Más daño para un aliado." },
            { spellId: 18, name: "Celeridad", description: "Más velocidad para un aliado." },
            { spellId: 24, name: "Inmovilizar", description: "Controla a un enemigo." },
            { spellId: 15, name: "Tormenta de Fuego", description: "Daño de ataque a distancia.", ultimate: true },
        ],
        sprite: { bodyId: 56, weaponId: 5, shieldId: 3, helmetId: 1 },
        accent: "#38bdf8",
    },
    {
        id: 5,
        name: "Druida",
        title: "Guardián de la naturaleza",
        role: "Control",
        style: "A distancia · hechizos",
        blurb: "Encadena parálisis e inmovilizaciones para decidir dónde se pelea. También cura y quema.",
        stats: { damage: 3, toughness: 3, control: 5, mobility: 2 },
        abilities: [
            { spellId: 8, name: "Proyectil Mágico", description: "Daño constante a distancia." },
            { spellId: 5, name: "Curar Heridas Graves", description: "Curación potente." },
            { spellId: 9, name: "Paralizar", description: "Congela a un enemigo." },
            { spellId: 24, name: "Inmovilizar", description: "Lo deja clavado en su lugar." },
            { spellId: 20, name: "Fuerza", description: "Mejora el daño de un aliado." },
            { spellId: 15, name: "Tormenta de Fuego", description: "Daño de ataque a distancia.", ultimate: true },
        ],
        sprite: { bodyId: 56, weaponId: 10, shieldId: 3, helmetId: 1 },
        accent: "#4ade80",
    },
    {
        id: 6,
        name: "Paladín",
        title: "Caballero sagrado",
        role: "Combatiente",
        style: "Cuerpo a cuerpo · hechizos",
        blurb: "Equilibrado: aguanta, se cura, inmoviliza y pega. Muy flexible en cualquier carril.",
        stats: { damage: 3, toughness: 4, control: 3, mobility: 2 },
        abilities: [
            { spellId: 3, name: "Curar Heridas Leves", description: "Curación para sostener el carril." },
            { spellId: 5, name: "Curar Heridas Graves", description: "Curación potente." },
            { spellId: 10, name: "Remover Parálisis", description: "Se libera o libera a un aliado." },
            { spellId: 8, name: "Proyectil Mágico", description: "Daño a distancia." },
            { spellId: 20, name: "Fuerza", description: "Potencia tus golpes." },
            { spellId: 24, name: "Inmovilizar", description: "Deja al objetivo sin moverse.", ultimate: true },
        ],
        sprite: { bodyId: 107, weaponId: 13, shieldId: 6, helmetId: 6 },
        accent: "#fbbf24",
    },
    {
        id: 7,
        name: "Cazador",
        title: "Tirador del bosque",
        role: "Tirador",
        style: "A distancia · arco, sin maná",
        blurb: "Daño sostenido con arco desde lejos. No gasta maná: gana a quien no logra acercarse.",
        stats: { damage: 4, toughness: 2, control: 1, mobility: 4 },
        abilities: [],
        passive: "Sin hechizos ni maná. Dispara flechas a larga distancia con el mejor daño físico sostenido.",
        sprite: { bodyId: 58, weaponId: 47, shieldId: 3, helmetId: 6 },
        accent: "#fb923c",
    },
];

export function getChampion(id: number | null | undefined): ChampionInfo | null {
    if (id === null || id === undefined) return null;
    return MOBA_CHAMPIONS.find((champion) => champion.id === id) ?? null;
}

/** Cabeza inicial de cada raza (server/src/moba/races.ts). */
const RACE_HEAD_IDS: Record<number, number> = { 1: 1, 2: 101, 3: 201, 4: 301, 5: 401 };

export type ChampionSpriteIds = {
    bodyId: number;
    headId: number;
    weaponId: number;
    shieldId: number;
    helmetId: number;
};

/** Ids de sprite para renderizar al campeón con la raza elegida (enanos y gnomos usan el cuerpo bajo). */
export function getChampionSprite(champion: ChampionInfo, raceId: number): ChampionSpriteIds {
    const small = raceId === 4 || raceId === 5;

    return {
        bodyId: small ? 53 : champion.sprite.bodyId,
        headId: RACE_HEAD_IDS[raceId] ?? 1,
        weaponId: champion.sprite.weaponId,
        shieldId: champion.sprite.shieldId,
        helmetId: champion.sprite.helmetId,
    };
}

export function getRace(raceId: number | null | undefined) {
    return MOBA_RACES.find((race) => race.id === raceId) ?? MOBA_RACES[0];
}

export const MOBA_TEAMS = {
    blue: { label: "Azul", color: "#38bdf8" },
    red: { label: "Rojo", color: "#f87171" },
} as const;

export type MobaTeam = keyof typeof MOBA_TEAMS;
