export {};
const vars = require("../vars");
const handleProtocol = require("../handleProtocol");

/**
 * Bendiciones de la jungla (estilo LoL). Las dan los monstruos con `buffId`:
 *  - sentinel  Centinela Azul   (heroe)  +25 % dano de hechizos y mana regenerado rapido
 *  - bramble   Zarza Roja       (heroe)  +20 % dano fisico y vida regenerada rapido
 *  - crab      Tortuga del Rio  (heroe)  cura al instante y regenera un rato
 *  - drake     Dragon del Rio   (equipo) acumulable (hasta 4) hasta que termine la partida: +4 % dano por carga
 *  - baron     Rey Demonio      (equipo) +25 % dano y regeneracion durante unos minutos
 * Las de heroe se pierden al morir; las de equipo siguen. Los multiplicadores se aplican sobre los valores base de
 * balance del heroe (mobaPhysMult/mobaSpellMult de login.ts) guardados en mobaBasePhys/mobaBaseSpell.
 */
type BuffDef = {
    name: string;
    scope: "hero" | "team";
    durationMs: number;
    phys: number; // bonus de dano fisico (0.2 = +20 %)
    spell: number;
    hpRegen: number; // fraccion de la vida maxima por segundo
    manaRegen: number;
    maxStacks?: number;
    instantHeal?: number; // fraccion de vida que se cura al obtenerla
};

const SCALE = Number(process.env.MOBA_BUFF_SCALE) || 1;

const BUFFS: Record<string, BuffDef> = {
    sentinel: { name: "Centinela Azul", scope: "hero", durationMs: 120_000 * SCALE, phys: 0, spell: 0.25, hpRegen: 0.002, manaRegen: 0.025 },
    bramble: { name: "Zarza Roja", scope: "hero", durationMs: 120_000 * SCALE, phys: 0.2, spell: 0, hpRegen: 0.012, manaRegen: 0.005 },
    crab: { name: "Bendicion del Rio", scope: "hero", durationMs: 45_000 * SCALE, phys: 0, spell: 0, hpRegen: 0.02, manaRegen: 0.02, instantHeal: 0.25 },
    drake: { name: "Alma del Dragon", scope: "team", durationMs: 0, phys: 0.04, spell: 0.04, hpRegen: 0.0015, manaRegen: 0.0015, maxStacks: 4 },
    baron: { name: "Poder del Rey Demonio", scope: "team", durationMs: 150_000 * SCALE, phys: 0.25, spell: 0.25, hpRegen: 0.012, manaRegen: 0.012 },
};

type Timed = { until: number; stacks: number };
type TeamBuffs = Record<string, Timed>;

/** Buffs de equipo por partida y color (se guardan en match.teamBuffs). */
function teamBuffsOf(match: any, team: string): TeamBuffs {
    match.teamBuffs ??= {};
    match.teamBuffs[team] ??= {};
    return match.teamBuffs[team];
}

function heroBuffs(hero: any): Record<string, Timed> {
    hero.mobaBuffs ??= {};
    return hero.mobaBuffs;
}

function activeBuffs(match: any, hero: any, now: number): Array<{ id: string; def: BuffDef; stacks: number; until: number }> {
    const out: Array<{ id: string; def: BuffDef; stacks: number; until: number }> = [];

    for (const [id, b] of Object.entries(heroBuffs(hero))) {
        if (b.until > now && BUFFS[id]) out.push({ id, def: BUFFS[id], stacks: b.stacks, until: b.until });
    }

    for (const [id, b] of Object.entries(teamBuffsOf(match, hero.mobaTeam))) {
        if ((b.until === 0 || b.until > now) && BUFFS[id]) out.push({ id, def: BUFFS[id], stacks: b.stacks, until: b.until });
    }

    return out;
}

/** Recalcula los multiplicadores de dano del heroe a partir de sus buffs activos. */
function recompute(match: any, hero: any, now: number) {
    hero.mobaBasePhys ??= Number(hero.mobaPhysMult ?? 1);
    hero.mobaBaseSpell ??= Number(hero.mobaSpellMult ?? 1);

    let phys = 0;
    let spell = 0;

    for (const b of activeBuffs(match, hero, now)) {
        phys += b.def.phys * b.stacks;
        spell += b.def.spell * b.stacks;
    }

    // Buffs de habilidades (dano +x %, poca vida) y de jungla se combinan multiplicando.
    const abilityFactor = require("./abilities").dmgFactor(hero, now);

    hero.mobaPhysMult = hero.mobaBasePhys * (1 + phys) * abilityFactor;
    hero.mobaSpellMult = hero.mobaBaseSpell * (1 + spell) * abilityFactor;
}

function notify(hero: any, text: string) {
    const client = vars.clients[hero.id];

    if (client) handleProtocol.console(text, "#7fe08a", 1, 0, client);
}

/** Da un buff a un heroe (o a su equipo, segun el tipo). Devuelve el nombre para anunciarlo. */
function award(match: any, hero: any, id: string, heroesOfTeam: any[], now = Date.now()): string | null {
    const def = BUFFS[id];

    if (!def) return null;

    if (def.scope === "hero") {
        heroBuffs(hero)[id] = { until: now + def.durationMs, stacks: 1 };
        notify(hero, `[MOBA] ¡Obtienes ${def.name}!`);

        if (def.instantHeal && !hero.dead) {
            const client = vars.clients[hero.id];
            hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * def.instantHeal));

            if (client) handleProtocol.updateHP(hero.hp, client);
        }

        recompute(match, hero, now);
        return def.name;
    }

    const buffs = teamBuffsOf(match, hero.mobaTeam);
    const current = buffs[id];
    const stacks = Math.min(def.maxStacks ?? 1, (current?.stacks ?? 0) + 1);
    buffs[id] = { until: def.durationMs > 0 ? now + def.durationMs : 0, stacks };

    for (const ally of heroesOfTeam) {
        notify(ally, `[MOBA] ¡Tu equipo obtiene ${def.name}${stacks > 1 ? ` (x${stacks})` : ""}!`);
        recompute(match, ally, now);
    }

    return def.name;
}

/** Al morir se pierden los buffs de heroe. */
function clearHero(match: any, hero: any) {
    hero.mobaBuffs = {};
    recompute(match, hero, Date.now());
}

const lastTick: Record<string, number> = {};

/** Una vez por segundo: regeneracion de los buffs y vencimiento. */
function tick(match: any, heroes: any[], now: number) {
    if (now - (lastTick[match.id] ?? 0) < 1000) return;

    lastTick[match.id] = now;

    for (const hero of heroes) {
        if (hero.dead || hero.cerrado) continue;

        const own = heroBuffs(hero);

        for (const [id, b] of Object.entries(own)) {
            if (b.until <= now) {
                delete own[id];
                notify(hero, `[MOBA] Se acabo ${BUFFS[id]?.name ?? id}.`);
                recompute(match, hero, now);
            }
        }

        const team = teamBuffsOf(match, hero.mobaTeam);
        let expired = false;

        for (const [id, b] of Object.entries(team)) {
            if (b.until !== 0 && b.until <= now) {
                delete team[id];
                expired = true;
            }
        }

        if (expired) recompute(match, hero, now);

        let hpRegen = 0;
        let manaRegen = 0;

        for (const b of activeBuffs(match, hero, now)) {
            hpRegen += b.def.hpRegen * b.stacks;
            manaRegen += b.def.manaRegen * b.stacks;
        }

        const client = vars.clients[hero.id];

        if (!client || (hpRegen === 0 && manaRegen === 0)) continue;

        if (hpRegen > 0 && hero.hp < hero.maxHp) {
            hero.hp = Math.min(hero.maxHp, hero.hp + Math.ceil(hero.maxHp * hpRegen));
            handleProtocol.updateHP(hero.hp, client);
        }

        if (manaRegen > 0 && hero.mana < hero.maxMana) {
            hero.mana = Math.min(hero.maxMana, hero.mana + Math.ceil(hero.maxMana * manaRegen));
            handleProtocol.updateMana(hero.mana, client);
        }
    }
}

/** Lista para el HUD: [{id, name, left (segundos, 0 = permanente), stacks}]. */
function describe(match: any, hero: any, now: number) {
    return activeBuffs(match, hero, now).map((b) => ({
        id: b.id,
        name: b.def.name,
        left: b.until === 0 ? 0 : Math.max(1, Math.ceil((b.until - now) / 1000)),
        stacks: b.stacks,
        team: b.def.scope === "team",
    }));
}

module.exports = { BUFFS, award, clearHero, tick, describe, recompute };
