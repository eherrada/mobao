export {};
const vars = require("../vars");

import type { Build, ChampionDef, KitDef, SpecDef } from "./abilityCatalog";

/**
 * Especializaciones (rasgos pasivos de estilo de juego) y kits de inicio del MOBA. Los datos viven en
 * abilityCatalog.ts; aca estan los ganchos pequenos:
 *   - applyBuild: modificadores estaticos al armar el heroe (vida, dano, reduccion, velocidad, curacion, ...)
 *   - onDealt:    despues de que una habilidad hace dano (robo de vida, quemadura, ralentizacion)
 *   - onBasicHit: despues de un golpe basico (robo de vida, ralentizacion, Furia/Energia por golpear)
 *   - onKill:     al matar (curacion, recurso)
 *   - tickHero:   escudos periodicos / de emergencia y bonus de dano con poca vida
 *   - damageBonus: bonus de ejecucion contra objetivos con poca vida
 */

const abilities = () => require("./abilities");
const heroesMod = () => require("./heroes");

const EXEC_THRESHOLD = 0.35;
const RESOURCE_PER_BASIC_HIT = { furia: 6, energia: 4 } as Record<string, number>;

function specOf(hero: any): SpecDef | undefined {
    return hero.mobaSpecDef;
}

/** Fija los multiplicadores base del heroe a partir de su especializacion y su kit. */
function applyBuild(hero: any, champ: ChampionDef, build: Build) {
    const spec = champ.specs.find((s) => s.id === build.spec) as SpecDef;
    const kit = champ.kits.find((k) => k.id === build.kit) as KitDef;
    const stats = heroesMod().statsFor(hero.mobaTemplateId);

    hero.mobaSpecDef = spec;
    hero.mobaKitDef = kit;
    hero.mobaBasePhys = stats.phys * (spec.phys ?? 1) * (kit.phys ?? 1);
    hero.mobaBaseSpell = stats.spell * (spec.spell ?? 1) * (kit.spell ?? 1);
    hero.mobaPhysMult = hero.mobaBasePhys;
    hero.mobaSpellMult = hero.mobaBaseSpell;
    hero.mobaHpMult = (spec.hp ?? 1) * (kit.hp ?? 1);
    hero.mobaStatic = {
        dr: (spec.dr ?? 0) + (kit.dr ?? 0),
        speed: (spec.speed ?? 0) + (kit.speed ?? 0),
        heal: spec.heal ?? 1,
        shield: spec.shield ?? 1,
        regen: (spec.regen ?? 1) * (kit.regen ?? 1),
        cc: spec.cc ?? 1,
        lifesteal: spec.lifesteal ?? 0,
    };

    // Kit: pociones y oro extra (el equipo inicial lo arma gear.buildInventory).
    const addPotions = (itemId: number, amount: number) => {
        if (!amount) return;

        const entry = Object.values(hero.inv ?? {}).find((it: any) => it.idItem === itemId) as { cant: number } | undefined;

        if (entry) entry.cant += amount;
    };

    addPotions(38, kit.redPotions ?? 0);
    addPotions(37, kit.bluePotions ?? 0);

    if (kit.gold) hero.gold = Number(hero.gold ?? 0) + kit.gold;
}

/** Dano extra por ejecucion (rasgo del lanzador) contra objetivos con poca vida. */
function damageBonus(caster: any, target: any): number {
    const spec = specOf(caster);

    if (spec?.execBonus && target.maxHp > 0 && target.hp / target.maxHp < EXEC_THRESHOLD) return 1 + spec.execBonus;

    return 1;
}

/** Despues de que una habilidad hizo `amount` de dano: robo de vida, quemadura y ralentizacion. */
function onDealt(caster: any, target: any, amount: number, school: string, ctx: { now: number }) {
    const ab = abilities();
    const spec = specOf(caster);
    const steal = ab.lifestealOf(caster, ctx.now);

    if (steal > 0 && !caster.dead) healSelf(caster, amount * steal);

    if (spec?.burn && target.hp > 0) ab.addDot(caster, target, (amount * spec.burn) / 3, school, 3, 1000, ctx.now);

    if (spec?.slowOnHit && target.hp > 0) ab.applySlow(target, spec.slowOnHit.pct, spec.slowOnHit.ms, ctx.now);
}

function healSelf(hero: any, amount: number) {
    const ab = abilities();
    const heal = Math.min(Math.round(amount), hero.maxHp - hero.hp);

    if (heal <= 0) return;

    hero.hp += heal;
    ab.sendVitals(hero);
}

/** Despues de un golpe basico que dejo `dmg` de dano (game.userDmgNpc / userDmgUser). */
function onBasicHit(attacker: any, target: any, dmg: number) {
    if (!attacker?.mobaMatchId || attacker.dead || dmg <= 0) return;

    const ab = abilities();
    const now = Date.now();
    const spec = specOf(attacker);
    const steal = ab.lifestealOf(attacker, now);

    if (steal > 0) healSelf(attacker, dmg * steal);

    if (spec?.slowOnHit && target.hp > 0) ab.applySlow(target, spec.slowOnHit.pct, spec.slowOnHit.ms, now);

    ab.gainResource(attacker, RESOURCE_PER_BASIC_HIT[attacker.mobaResource] ?? 0);
}

/** Al matar (heroe, minion o monstruo). */
function onKill(killer: any, victim: any) {
    if (!killer?.mobaMatchId || killer.dead) return;

    const spec = specOf(killer);

    if (!spec) return;

    if (spec.onKillHeal) healSelf(killer, killer.maxHp * spec.onKillHeal);

    if (spec.onKillResource) abilities().gainResource(killer, killer.maxMana * spec.onKillResource);

    void victim;
}

/** Cada tick: escudos de aura y de emergencia, y bonus de dano por poca vida. */
function tickHero(hero: any, now: number) {
    const ab = abilities();
    const spec = specOf(hero);

    if (!spec) return;

    const fx = ab.fxOf(hero);

    if (spec.lowHpDmg) {
        const ratio = hero.maxHp > 0 ? hero.hp / hero.maxHp : 1;
        const bonus = ratio < 0.5 ? (spec.lowHpDmg * (0.5 - ratio)) / 0.5 : 0;

        if (Math.abs(bonus - fx.lowHpBonus) > 0.01) {
            fx.lowHpBonus = bonus;
            ab.refreshMultipliers(hero, now);
        }
    }

    const ctx = { caster: hero, def: {} as any, rank: 1, mult: 1, now };

    if (spec.auraShield && now >= Number(hero.mobaAuraAt ?? 0)) {
        hero.mobaAuraAt = now + spec.auraShield.everyMs;

        for (const e of ab.entitiesInRadius(hero.map, hero.pos, spec.auraShield.radius)) {
            if (e.id === hero.id || ab.isFriendlyHero(hero, e)) ab.addShield(hero, e, { pct: spec.auraShield.pct, ms: spec.auraShield.everyMs + 1000 }, ctx);
        }
    }

    if (spec.emergencyShield && hero.hp / hero.maxHp < spec.emergencyShield.below && now >= Number(hero.mobaEmergencyAt ?? 0)) {
        hero.mobaEmergencyAt = now + spec.emergencyShield.cdMs;
        ab.addShield(hero, hero, { pct: spec.emergencyShield.pct, ms: 5000 }, ctx);
    }
}

void vars;

module.exports = { applyBuild, damageBonus, onDealt, onBasicHit, onKill, tickHero };
