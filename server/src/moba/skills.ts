export {};
const vars = require("../vars");

/**
 * Puntos de habilidad estilo LoL: cada nivel da 1 punto y se invierte en una habilidad del kit del heroe.
 *  - Una habilidad sin puntos (rango 0) no se puede lanzar.
 *  - Habilidades comunes: hasta rango 5 (el rango r pide nivel 2r-1).
 *  - La definitiva (una por heroe): hasta rango 3 (pide nivel 6, 11 y 16).
 *  - El rango escala el dano y la curacion: 75 % en el rango 1 hasta 100 % en el rango maximo.
 */
const NORMAL_MAX_RANK = 5;
const ULT_MAX_RANK = 3;

// Habilidad definitiva de cada heroe (id de hechizo).
const ULT_SPELL: Record<number, number> = { 0: 25, 1: 9, 3: 14, 4: 15, 5: 15, 6: 24 };

type SkillView = {
    slot: number;
    spell: number;
    name: string;
    rank: number;
    max: number;
    ult: boolean;
    canLevel: boolean;
    nextReqLevel: number;
};

function isUlt(hero: any, slot: number): boolean {
    const spell = hero.spells?.[slot]?.idSpell;
    return Boolean(spell) && ULT_SPELL[hero.mobaTemplateId ?? -1] === spell;
}

function maxRank(hero: any, slot: number): number {
    return isUlt(hero, slot) ? ULT_MAX_RANK : NORMAL_MAX_RANK;
}

function requiredLevel(rank: number, ult: boolean): number {
    return ult ? 5 * rank + 1 : 2 * rank - 1;
}

function spentPoints(hero: any): number {
    return Object.values((hero.mobaRanks ?? {}) as Record<number, number>).reduce((sum, r) => sum + r, 0);
}

function availablePoints(hero: any): number {
    return Math.max(0, Number(hero.mobaLevel ?? 1) - spentPoints(hero));
}

function initSkills(hero: any) {
    hero.mobaRanks = {};
}

function canLevel(hero: any, slot: number): boolean {
    if (!hero.spells?.[slot]) return false;

    const rank = Number(hero.mobaRanks?.[slot] ?? 0);

    return (
        rank < maxRank(hero, slot) &&
        availablePoints(hero) > 0 &&
        Number(hero.mobaLevel ?? 1) >= requiredLevel(rank + 1, isUlt(hero, slot))
    );
}

function levelUp(hero: any, slot: number): boolean {
    if (!canLevel(hero, slot)) return false;

    hero.mobaRanks ??= {};
    hero.mobaRanks[slot] = Number(hero.mobaRanks[slot] ?? 0) + 1;
    return true;
}

/** Multiplicador de dano/curacion segun el rango de la habilidad (0 si no se aprendio). */
function rankMultiplier(hero: any, slot: number): number {
    const rank = Number(hero.mobaRanks?.[slot] ?? 0);

    if (rank < 1) return 0;

    const max = maxRank(hero, slot);
    return 0.75 + (0.25 * (rank - 1)) / (max - 1);
}

/** Reparte los puntos disponibles (bots y atajo de pruebas): primero la definitiva, despues el orden del kit. */
function autoAssign(hero: any) {
    const slots = Object.keys(hero.spells ?? {})
        .map(Number)
        .sort((a, b) => a - b);
    const preferred: number[] = require("./heroes").SKILL_ORDER[hero.mobaTemplateId ?? -1] ?? [];
    const rankOf = (slot: number) => {
        const index = preferred.indexOf(hero.spells[slot].idSpell);
        return index < 0 ? 999 : index;
    };
    const basics = slots.filter((s) => !isUlt(hero, s)).sort((a, b) => rankOf(a) - rankOf(b) || a - b);
    const ordered = [...slots.filter((s) => isUlt(hero, s)), ...basics];

    let guard = 200;
    while (availablePoints(hero) > 0 && guard-- > 0) {
        const next = ordered.find((slot) => canLevel(hero, slot));

        if (!next) break;
        levelUp(hero, next);
    }
}

function describe(hero: any): SkillView[] {
    return Object.keys(hero.spells ?? {})
        .map(Number)
        .sort((a, b) => a - b)
        .map((slot) => {
            const spell = hero.spells[slot].idSpell;
            const ult = isUlt(hero, slot);
            const rank = Number(hero.mobaRanks?.[slot] ?? 0);

            return {
                slot,
                spell,
                name: String(vars.datSpell[spell]?.name ?? `Hechizo ${spell}`),
                rank,
                max: maxRank(hero, slot),
                ult,
                canLevel: canLevel(hero, slot),
                nextReqLevel: requiredLevel(rank + 1, ult),
            };
        });
}

module.exports = {
    initSkills,
    canLevel,
    levelUp,
    rankMultiplier,
    autoAssign,
    describe,
    availablePoints,
    ULT_SPELL,
};
