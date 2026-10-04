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

function spellsFor(templateId: number): Record<number, { idSpell: number }> | undefined {
    const kit = KITS[templateId];

    if (!kit) return undefined;

    const spells: Record<number, { idSpell: number }> = {};
    kit.forEach((idSpell, index) => {
        spells[index + 1] = { idSpell };
    });

    return spells;
}

module.exports = { spellsFor, KITS };
