export {};

/**
 * Kits de los heroes del MOBA (por id de plantilla PvP, ver vars.charactersPvP).
 * Los kits solo se aplican a partidas MOBA; la arena libre sigue usando los hechizos de la plantilla.
 * Ids de hechizo = claves de jsons/spells.json.
 */
const KITS: Record<number, number[]> = {
    // 0 Mago: dano en rafaga y control.
    0: [25, 23, 15, 24, 8, 18],
    // 1 Clerigo: curacion, aturdimiento y soporte.
    1: [5, 3, 10, 9, 24, 20, 18, 15],
    // 2 Guerrero: tanque cuerpo a cuerpo (sin mana).
    2: [],
    // 3 Asesino: invisibilidad, velocidad y dano barato.
    3: [14, 18, 20, 8, 24],
    // 4 Bardo: buffs y curacion para el equipo.
    4: [3, 5, 20, 18, 24, 15],
    // 5 Druida: control (aturdir/inmovilizar), curacion y dano.
    5: [9, 24, 5, 15, 8, 20],
    // 6 Paladin: sustain, control y dano.
    6: [3, 5, 10, 24, 8, 20],
    // 7 Cazador: tirador a distancia (sin mana, usa el arco).
    7: [],
};

/**
 * Balance del MOBA. Multiplicadores sobre el heroe de plantilla (nivel 50), solo en partidas MOBA:
 *  hp    vida maxima
 *  phys  dano fisico (melee y arco)
 *  spell dano de hechizos
 * HP_SCALE alarga todos los duelos por igual. Los valores salen de la matriz de duelos
 * (server/src/scripts/duelMatrix.ts); ver MOBAO.md.
 */
const HP_SCALE = Number(process.env.MOBA_HP_SCALE) || 2;

const STATS: Record<number, { hp: number; phys: number; spell: number }> = {
    0: { hp: 1, phys: 1, spell: 1 },
    1: { hp: 1, phys: 1, spell: 1 },
    2: { hp: 1, phys: 1, spell: 1 },
    3: { hp: 1, phys: 1, spell: 1 },
    4: { hp: 1, phys: 1, spell: 1 },
    5: { hp: 1, phys: 1, spell: 1 },
    6: { hp: 1, phys: 1, spell: 1 },
    7: { hp: 1, phys: 1, spell: 1 },
};

function statsFor(templateId: number) {
    const s = STATS[templateId] ?? { hp: 1, phys: 1, spell: 1 };
    return { hp: s.hp * HP_SCALE, phys: s.phys, spell: s.spell };
}

function spellsFor(templateId: number): Record<number, { idSpell: number }> | undefined {
    const kit = KITS[templateId];

    if (!kit) return undefined;

    const spells: Record<number, { idSpell: number }> = {};
    kit.forEach((idSpell, index) => {
        spells[index + 1] = { idSpell };
    });

    return spells;
}

module.exports = { spellsFor, statsFor, KITS, STATS };
