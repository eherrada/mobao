export {};
const vars = require("../vars");
const game = require("../game");
const handleProtocol = require("../handleProtocol");
const socket = require("../socket");
const funct = require("../functions");
const teams = require("./teams");
const { CHAMPIONS } = require("./abilityCatalog");
const { mapW, mapH } = require("../mapBounds");

import type { AbilityDef, Build, ChampionDef, Effect, SpecDef } from "./abilityCatalog";

/**
 * Motor de habilidades del MOBA (los datos estan en abilityCatalog.ts, los rasgos pasivos en specs.ts).
 *
 * Esencia Argentum:
 *  - Los hechizos de AO (kind "aoSpell") NO pasan por aca: siguen el camino original de protocol.attackSpell (tile
 *    apuntado, mana, efectos de AO, intervalo global de hechizo). Aca solo se les agrega la descripcion y el rango.
 *  - Las tecnicas (kind "tech") usan el mismo intervalo global de accion que cualquier hechizo (lo aplica
 *    protocol.attackSpell antes de llegar aca) + costo de recurso. Cooldown propio solo si el catalogo lo indica
 *    (dash y definitivas).
 *
 * Estado en el heroe:
 *   mobaBuild, mobaAbilities {slot: id}, mobaCd {id: hastaMs}, mobaResource, mobaShield/mobaShieldUntil,
 *   mobaFx {stunUntil, slows[], buffs[], dots[], ...}. Los escudos y la reduccion de dano se aplican en un setter de
 *   hero.hp (installHpGuard): asi valen para CUALQUIER fuente de dano (AO, minions, torres, habilidades).
 */

const ULT_SLOT = 5;
const NORMAL_SLOTS = [1, 2, 3, 4];
const MAX_DR = 0.6;
const MIN_SPEED = 0.4;
const MAX_SPEED = 1.8;
const RESOURCE_MAX = 100;
const REGEN_PER_SEC = { furia: 0.03, energia: 0.06 } as const; // fraccion del maximo por segundo
const STUN_DR_WINDOW_MS = 4000; // aturdimientos repetidos dentro de esta ventana duran la mitad (anti stunlock)
const STRUCTURES = new Set(["tower", "nexus", "shop", "barracks", "dummy"]);

type Ctx = {
    caster: any;
    def: AbilityDef;
    rank: number;
    mult: number;
    now: number;
    noProc?: boolean;
    from?: { x: number; y: number };
};

type Pt = { x: number; y: number };

const specs = () => require("./specs");
const skillsMod = () => require("./skills");

// --- builds ---------------------------------------------------------------------------------------

function championOf(templateId: number): ChampionDef | undefined {
    return CHAMPIONS[templateId];
}

function findAbility(templateId: number, id: string): AbilityDef | undefined {
    const champ = championOf(templateId);

    if (!champ) return undefined;

    return champ.pool.find((a) => a.id === id) ?? champ.ults.find((a) => a.id === id);
}

function defaultBuild(templateId: number): Build | undefined {
    const champ = championOf(templateId);

    return champ ? { ...champ.defaultBuild, abilities: [...champ.defaultBuild.abilities] } : undefined;
}

/** Valida un build recibido (no se confia en el cliente). Cualquier error devuelve el build por defecto. */
function resolveBuild(templateId: number, raw: unknown): Build | undefined {
    const champ = championOf(templateId);

    if (!champ) return undefined;

    let value: any = raw;

    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        } catch {
            return defaultBuild(templateId);
        }
    }

    if (!value || typeof value !== "object" || !Array.isArray(value.abilities)) return defaultBuild(templateId);

    const abilities = value.abilities as unknown[];
    const poolIds = new Set(champ.pool.map((a) => a.id));

    if (
        abilities.length !== NORMAL_SLOTS.length ||
        !abilities.every((id) => typeof id === "string" && poolIds.has(id)) ||
        new Set(abilities).size !== abilities.length ||
        typeof value.ult !== "string" ||
        !champ.ults.some((a) => a.id === value.ult) ||
        typeof value.spec !== "string" ||
        !champ.specs.some((s) => s.id === value.spec) ||
        typeof value.kit !== "string" ||
        !champ.kits.some((k) => k.id === value.kit)
    ) {
        return defaultBuild(templateId);
    }

    return { abilities: [...(abilities as string[])], ult: value.ult, spec: value.spec, kit: value.kit };
}

/** hero.spells (slot -> {idSpell}) a partir de un build: 1-4 normales y 5 la definitiva. */
function spellsFor(templateId: number, build: Build | undefined): Record<number, { idSpell: number }> | undefined {
    if (!build) return undefined;

    const spells: Record<number, { idSpell: number }> = {};
    const ids = [...build.abilities, build.ult];

    ids.forEach((id, index) => {
        const def = findAbility(templateId, id);

        if (def) spells[index + 1] = { idSpell: def.spellId };
    });

    return spells;
}

function abilityAt(hero: any, slot: number): AbilityDef | undefined {
    const id = hero.mobaAbilities?.[slot];

    return id ? findAbility(hero.mobaTemplateId, id) : undefined;
}

function isTechSlot(hero: any, slot: number): boolean {
    return abilityAt(hero, slot)?.kind === "tech";
}

function fxOf(entity: any) {
    return (entity.mobaFx ??= {
        stunUntil: 0,
        stunDrUntil: 0,
        slows: [] as Array<{ pct: number; until: number }>,
        buffs: [] as Array<{ id: string; stat: string; pct: number; until: number }>,
        dots: [] as Array<{ casterId: number; next: number; every: number; left: number; amount: number; school: string }>,
        lowHpBonus: 0,
    });
}

const fxEntities = new Set<any>();

function trackFx(entity: any) {
    fxOf(entity);
    fxEntities.add(entity);
}

// --- inicio del heroe ------------------------------------------------------------------------------

/** El hp del heroe pasa por un setter: escudo y reduccion de dano valen para cualquier fuente de dano. */
function installHpGuard(hero: any) {
    let hp = Number(hero.hp);

    Object.defineProperty(hero, "hp", {
        configurable: true,
        enumerable: true,
        get() {
            return hp;
        },
        set(value: number) {
            const next = Number(value);

            if (!Number.isFinite(next) || hero.mobaRawHp || hero.dead || next >= hp) {
                hp = next;
                return;
            }

            let damage = hp - next;
            const dr = damageReduction(hero);

            if (dr > 0) damage *= 1 - dr;

            if (Number(hero.mobaShield ?? 0) > 0) {
                const absorbed = Math.min(hero.mobaShield, damage);
                hero.mobaShield -= absorbed;
                damage -= absorbed;
            }

            // Si el golpe original era letal y nada lo absorbio del todo, sigue siendo letal.
            hp = Math.round(hp - damage);
        },
    });
}

/** Fija la vida salteando escudo y reduccion (API de depuracion y tests). */
function rawSetHp(hero: any, value: number) {
    hero.mobaRawHp = true;
    hero.hp = value;
    hero.mobaRawHp = false;
}

/** Aplica un build a un heroe recien creado (login). */
function initHero(hero: any, build: Build) {
    const champ = championOf(hero.mobaTemplateId);

    if (!champ) return;

    hero.mobaBuild = build;
    hero.mobaAbilities = {};
    [...build.abilities, build.ult].forEach((id, index) => (hero.mobaAbilities[index + 1] = id));
    hero.mobaCd = {};
    hero.mobaResource = champ.resource;
    hero.mobaShield = 0;
    hero.mobaShieldUntil = 0;
    trackFx(hero);
    installHpGuard(hero);
    specs().applyBuild(hero, champ, build);

    // Recalcula vida/recurso con los multiplicadores del build (empieza todo lleno).
    require("./progression").applyLevelStats(hero);
    hero.hp = hero.maxHp;
    hero.mana = hero.maxMana;
}

/** Despues de recalcular maxMana por nivel: Guerrero y Cazador usan una barra propia de 100. */
function afterLevelStats(hero: any) {
    // (applyLevelStats recalcula despues hero.mana con la proporcion anterior.)
    if (hero.mobaTemplateId === 2 || hero.mobaTemplateId === 7) hero.maxMana = RESOURCE_MAX;
}

// --- estadisticas derivadas --------------------------------------------------------------------------

function activeBuffSum(entity: any, stat: string, now = Date.now()): number {
    const fx = entity.mobaFx;

    if (!fx) return 0;

    let sum = 0;

    for (const b of fx.buffs) if (b.stat === stat && b.until > now) sum += b.pct;

    return sum;
}

function damageReduction(hero: any, now = Date.now()): number {
    const base = Number(hero.mobaStatic?.dr ?? 0);

    return Math.min(MAX_DR, base + activeBuffSum(hero, "dr", now));
}

/** Multiplicador de dano temporal (buffs de habilidades + rasgos de poca vida) que usa buffs.recompute. */
function dmgFactor(hero: any, now = Date.now()): number {
    return (1 + activeBuffSum(hero, "dmg", now)) * (1 + Number(hero.mobaFx?.lowHpBonus ?? 0));
}

function lifestealOf(hero: any, now = Date.now()): number {
    return Number(hero.mobaStatic?.lifesteal ?? 0) + activeBuffSum(hero, "lifesteal", now);
}

/** Velocidad relativa de paso (1 = normal). */
function speedMult(entity: any, now = Date.now()): number {
    const fx = entity.mobaFx;
    const staticSpeed = Number(entity.mobaStatic?.speed ?? 0);
    const bonus = staticSpeed + activeBuffSum(entity, "speed", now);
    let slow = 0;

    if (fx) for (const s of fx.slows) if (s.until > now) slow = Math.max(slow, s.pct);

    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, (1 + bonus) * (1 - Math.min(0.7, slow))));
}

/** Paso de un heroe en ms (lo usa protocol.processUserMovement). */
function walkStepMs(user: any): number {
    if (!user.mobaMatchId) return vars.timing.walkStepMs;

    return Math.round(vars.timing.walkStepMs / speedMult(user));
}

/** Factor sobre el intervalo de movimiento de un NPC (>1 = mas lento). */
function npcSlowFactor(npc: any, now = Date.now()): number {
    const fx = npc.mobaFx;

    if (!fx || fx.slows.length === 0) return 1;

    let slow = 0;

    for (const s of fx.slows) if (s.until > now) slow = Math.max(slow, s.pct);

    return 1 / (1 - Math.min(0.7, slow));
}

function isStunned(entity: any, now = Date.now()): boolean {
    return Number(entity.mobaFx?.stunUntil ?? 0) > now;
}

// --- utilidades de mundo -------------------------------------------------------------------------------

function entityById(id: any): any {
    return vars.personajes[id] ?? vars.npcs[id];
}

function entityAt(map: number, x: number, y: number): any {
    const id = vars.mapData[map]?.[y]?.[x]?.id;

    return id ? entityById(id) : undefined;
}

function isAlive(entity: any): boolean {
    return Boolean(entity) && !entity.dead && !entity.cerrado && entity.hp > 0 && !entity.deathProcessed;
}

function isHostile(caster: any, target: any): boolean {
    if (!target || target.id === caster.id || !isAlive(target) || target.invulnerable) return false;
    if (target.isNpc && STRUCTURES.has(target.structure) && target.structure !== "tower" && target.structure !== "nexus") return false;
    if (target.mobaMatchId !== caster.mobaMatchId) return false;

    return !teams.areAllies(caster, target);
}

function isFriendlyHero(caster: any, target: any): boolean {
    return Boolean(target) && !target.isNpc && isAlive(target) && target.mobaMatchId === caster.mobaMatchId && teams.areAllies(caster, target);
}

function dist(a: Pt, b: Pt): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function inMap(map: number, x: number, y: number): boolean {
    return x >= 1 && y >= 1 && x <= mapW(map) && y <= mapH(map);
}

/** Entidades vivas dentro de un radio (euclideo) alrededor de un punto. */
function entitiesInRadius(map: number, center: Pt, radius: number): any[] {
    const found: any[] = [];
    const r2 = (radius + 0.5) * (radius + 0.5);

    for (let y = center.y - radius; y <= center.y + radius; y++) {
        for (let x = center.x - radius; x <= center.x + radius; x++) {
            if (!inMap(map, x, y)) continue;

            const dx = x - center.x;
            const dy = y - center.y;

            if (dx * dx + dy * dy > r2) continue;

            const entity = entityAt(map, x, y);

            if (entity && isAlive(entity)) found.push(entity);
        }
    }

    return found;
}

function terrainBlocked(map: number, x: number, y: number): boolean {
    return !inMap(map, x, y) || Boolean(vars.mapa[map]?.[y]?.[x]?.blocked);
}

/** Tiles de una linea desde `from` hacia `toward`, hasta `length` pasos (sin incluir el origen). */
function linePoints(from: Pt, toward: Pt, length: number): Pt[] {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const norm = Math.max(Math.abs(dx), Math.abs(dy));

    if (norm === 0) return [];

    const points: Pt[] = [];
    let lastKey = "";

    for (let step = 1; step <= length; step++) {
        const p = { x: Math.round(from.x + (dx / norm) * step), y: Math.round(from.y + (dy / norm) * step) };
        const key = `${p.x},${p.y}`;

        if (key !== lastKey) {
            points.push(p);
            lastKey = key;
        }
    }

    return points;
}

function headingFor(from: Pt, to: Pt): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? vars.direcciones.right : vars.direcciones.left;

    return dy >= 0 ? vars.direcciones.down : vars.direcciones.up;
}

// --- envio a clientes -------------------------------------------------------------------------------------

function clientOf(entity: any): any {
    return entity && !entity.isNpc ? vars.clients[entity.id] : undefined;
}

function toViewers(map: number, pos: Pt, fn: (client: any, viewerId: any) => void) {
    game.loopAreaPos(map, pos, (viewer: any) => {
        const client = vars.clients[viewer.id];

        if (client) fn(client, viewer.id);
    });
}

function sendVitals(entity: any) {
    const own = clientOf(entity);

    if (own) handleProtocol.updateHP(Math.max(0, entity.hp), own);

    toViewers(entity.map, entity.pos, (client, viewerId) => {
        if (viewerId === entity.id) return;

        handleProtocol.entityVitalsDelta(entity.id, entity.hp, entity.maxHp, Number(entity.mana ?? 0), Number(entity.maxMana ?? 0), client);
    });
}

function sendNumber(entity: any, text: string, color: string) {
    toViewers(entity.map, entity.pos, (client) => handleProtocol.dialog(entity.id, text, "", color, 0, client));
}

function sendFx(entity: any, fxGrh: number) {
    if (!fxGrh) return;

    toViewers(entity.map, entity.pos, (client) => handleProtocol.animFX(entity.id, fxGrh, client));
}

function sendSnapshot(entity: any) {
    toViewers(entity.map, entity.pos, (client, viewerId) => {
        if (viewerId === entity.id) return;

        if (entity.isNpc) handleProtocol.sendNpc(entity, client);
        else handleProtocol.sendCharacter(entity, viewerId);

        socket.send(client);
    });
}

function arrowGrh(): number {
    return Number(vars.datObj?.[553]?.grhIndex ?? 0);
}

function sendProjectile(map: number, from: Pt, to: Pt, kind: "arrow" | number | undefined) {
    const grh = kind === "arrow" || kind === undefined ? arrowGrh() : 0;
    const sent = new Set<number>();
    const fn = (client: any, viewerId: any) => {
        if (sent.has(Number(viewerId))) return;

        sent.add(Number(viewerId));

        if (grh > 0) handleProtocol.createProjectile(from, to, grh, client);
        else if (typeof kind === "number") handleProtocol.spellProjectile(from, to, kind, client);
    };

    toViewers(map, from, fn);
    toViewers(map, to, fn);
}

function notify(hero: any, text: string, color = "white") {
    const client = clientOf(hero);

    if (client) handleProtocol.console(text, color, 0, 0, client);
}

// --- dano, curacion y escudos -----------------------------------------------------------------------------------

function rand(min: number, max: number): number {
    return funct.randomIntFromInterval(Math.floor(min), Math.max(Math.floor(min), Math.floor(max)));
}

/** Golpe base del heroe con su arma (como game.calcularDmg, pero sin exigir flechas: las tecnicas no las gastan). */
function physHit(hero: any): number {
    const weapon = hero.inv?.[hero.idItemWeapon];
    let dmgWeapon: number;
    let dmgMax: number;
    let mod: number;

    if (weapon) {
        const obj = vars.datObj[weapon.idItem];
        dmgWeapon = rand(obj.minHit, obj.maxHit);

        if (obj.proyectil) {
            const arrow = hero.inv?.[hero.idItemArrow];
            const arrowObj = vars.datObj[arrow ? arrow.idItem : 553];

            dmgWeapon += rand(Number(arrowObj?.minHit ?? 1), Number(arrowObj?.maxHit ?? 2));
            mod = vars.modDmgProyectiles[hero.idClase];
        } else {
            mod = vars.modDmgArmas[hero.idClase];
        }

        dmgMax = obj.maxHit;
    } else {
        dmgWeapon = rand(4, 9);
        mod = vars.modDmgWrestling[hero.idClase];
        dmgMax = 9;
    }

    const base = rand(hero.minHit, hero.maxHit);

    return Math.floor((3 * dmgWeapon + (dmgMax / 5) * Math.max(0, hero.attrFuerza - 15) + base) * Number(mod ?? 1) * Number(hero.mobaPhysMult ?? 1));
}

/** Dano magico de una tecnica (misma formula de nivel/clase que los hechizos de AO). */
function magicHit(hero: any, base: number): number {
    const weapon = hero.inv?.[hero.idItemWeapon];
    const staff = Number(weapon ? vars.datObj[weapon.idItem]?.magicDamageBonus ?? 0 : 0);
    let damage = base * (1 + (3 * hero.level) / 100) * (1 + staff / 100);

    damage *= Number(vars.modDmgMagia?.[hero.idClase] ?? 1) * Number(hero.mobaSpellMult ?? 1);

    return Math.floor(damage);
}

function armorOf(target: any): { def: number; resist: number } {
    let def = 0;
    let resist = 0;

    for (const slot of [target.idItemBody, target.idItemShield, target.idItemHelmet, target.idItemRing]) {
        const item = slot ? target.inv?.[slot] : undefined;
        const obj = item ? vars.datObj[item.idItem] : undefined;

        if (!obj) continue;

        def += (Number(obj.minDef ?? 0) + Number(obj.maxDef ?? 0)) / 2;
        resist += Number(obj.resistenciaMagica ?? 0);
    }

    return { def, resist };
}

function mitigate(target: any, amount: number, school: string, ignoreArmor = false): number {
    let out = amount;

    // Los danos en el tiempo (DoT) ignoran la armadura plana: si no, cada tick chico se anularia.
    if (ignoreArmor) return Math.max(1, Math.round(out));

    if (target.isNpc) {
        out -= school === "phys" ? Number(target.def ?? 0) : Number(target.defM ?? target.def ?? 0);
    } else {
        const armor = armorOf(target);
        out = school === "phys" ? out - armor.def : out * (1 - Math.min(0.6, armor.resist / 100));
    }

    return Math.max(1, Math.round(out));
}

function killedBy(caster: any, target: any) {
    const client = clientOf(caster);

    if (client) require("../respawn").muere(client, target.id);
}

/**
 * Dano de una habilidad (o de un DoT) de `caster` a `target`. Devuelve el dano aplicado antes de escudo/reduccion.
 * Usa respawn.muere para la muerte, asi puntos, oro y XP salen por el mismo camino que un golpe normal.
 */
function dealDamage(caster: any, target: any, raw: number, school: string, ctx?: Ctx): number {
    if (!isAlive(target)) return 0;

    const amount = mitigate(target, raw, school, Boolean(ctx?.noProc));

    if (target.isNpc) {
        if (target.invulnerable) return 0;

        game.markNpcAggressor(target.id, caster.id);
        target.hp = Math.max(0, target.hp - amount);
    } else {
        target.hp -= amount;
        target.lastCombatActivityAt = Date.now();
        game.interruptPendingLogoutOnAttack?.(target.id, "[Servidor] La salida se canceló porque recibiste daño.");
    }

    sendVitals(target);
    sendNumber(target, String(amount), "red");

    if (ctx && !ctx.noProc) specs().onDealt(caster, target, amount, school, ctx);

    if (target.hp <= 0) killedBy(caster, target);

    return amount;
}

function healEntity(caster: any, target: any, effect: { base?: number; pct?: number }, ctx: Ctx): number {
    if (!isAlive(target) || target.isNpc) return 0;

    let amount = 0;

    if (effect.base) amount += effect.base * (1 + (3 * caster.level) / 100) * Number(caster.mobaHealMult ?? 1);
    if (effect.pct) amount += target.maxHp * effect.pct;

    amount = Math.round(amount * ctx.mult * Number(caster.mobaStatic?.heal ?? 1));
    amount = Math.max(0, Math.min(amount, target.maxHp - target.hp));

    if (amount <= 0) return 0;

    target.hp += amount;
    sendVitals(target);
    sendNumber(target, `+${amount}`, "#7fe08a");
    return amount;
}

function addShield(caster: any, target: any, effect: { pct: number; ms: number }, ctx: Ctx) {
    if (!isAlive(target) || target.isNpc) return;

    const amount = Math.round(target.maxHp * effect.pct * ctx.mult * Number(caster.mobaStatic?.shield ?? 1));

    target.mobaShield = Math.min(target.maxHp * 0.5, Number(target.mobaShield ?? 0) + amount);
    target.mobaShieldUntil = Math.max(Number(target.mobaShieldUntil ?? 0), ctx.now + effect.ms);
    sendNumber(target, `Escudo ${amount}`, "#9ad1ff");
}

function addBuff(target: any, id: string, stat: string, pct: number, ms: number, now: number) {
    if (!isAlive(target) || target.isNpc) return;

    const fx = fxOf(target);
    const existing = fx.buffs.find((b: any) => b.id === id && b.stat === stat);

    if (existing) {
        existing.pct = pct;
        existing.until = now + ms;
    } else {
        fx.buffs.push({ id, stat, pct, until: now + ms });
    }

    trackFx(target);
    refreshMultipliers(target, now);
}

function refreshMultipliers(hero: any, now = Date.now()) {
    const match = require("./match").getMatch(hero.mobaMatchId);

    if (match) require("./buffs").recompute(match, hero, now);
}

// --- control (aturdir, inmovilizar, ralentizar, empujar) ----------------------------------------------------------

function crowdControlMs(entity: any): number {
    return entity.isNpc ? vars.timing.statusDurations.crowdControlNpcMs : vars.timing.statusDurations.crowdControlUserMs;
}

/**
 * Usa el control de AO (paralizado = 2, inmovilizado = 1): el temporizador de server.ts lo libera cuando
 * `cooldownParalizado + duracion de AO` pasa, asi que se adelanta/atrasa el inicio para que venza a la hora pedida.
 */
function applyMovementLock(entity: any, state: 1 | 2, expiresAt: number) {
    const duration = crowdControlMs(entity);
    const current = entity.paralizado || entity.inmovilizado ? Number(entity.cooldownParalizado ?? 0) + duration : 0;
    const sameState = state === 2 ? Boolean(entity.paralizado) : Boolean(entity.inmovilizado) && !entity.paralizado;

    if (current >= expiresAt && sameState) return;

    if (current > expiresAt) return; // ya hay un control de AO mas largo

    entity.cooldownParalizado = expiresAt - duration;
    entity.paralizado = state === 2 ? 1 : 0;
    entity.inmovilizado = state === 1 ? 1 : 0;

    const own = clientOf(entity);

    if (own) handleProtocol.inmo(entity.id, state, own);

    sendSnapshot(entity);
}

function controlImmune(target: any): boolean {
    return !isAlive(target) || (target.isNpc && STRUCTURES.has(target.structure));
}

function applyStun(caster: any, target: any, ms: number, now: number) {
    if (controlImmune(target)) return;

    ms *= Number(caster.mobaStatic?.cc ?? 1);

    const fx = fxOf(target);

    if (now < fx.stunDrUntil) ms *= 0.5;

    const until = Math.max(fx.stunUntil, now + ms);
    fx.stunUntil = until;
    fx.stunDrUntil = until + STUN_DR_WINDOW_MS;
    trackFx(target);
    applyMovementLock(target, 2, until);
    sendNumber(target, "Aturdido", "#ffd24a");
}

function applyRoot(caster: any, target: any, ms: number, now: number) {
    if (controlImmune(target)) return;

    ms *= Number(caster.mobaStatic?.cc ?? 1);
    applyMovementLock(target, 1, now + ms);
    sendNumber(target, "Inmovilizado", "#ffd24a");
}

function applySlow(target: any, pct: number, ms: number, now: number) {
    if (controlImmune(target)) return;

    const fx = fxOf(target);

    fx.slows.push({ pct, until: now + ms });
    fx.slows = fx.slows.filter((s: any) => s.until > now).slice(-6);
    trackFx(target);
}

function cleanse(target: any) {
    if (!isAlive(target)) return;

    const fx = fxOf(target);

    fx.slows = [];
    target.paralizado = 0;
    target.inmovilizado = 0;
    target.cooldownParalizado = 0;
    fx.stunUntil = 0;

    const own = clientOf(target);

    if (own) handleProtocol.inmo(target.id, 0, own);

    sendSnapshot(target);
}

function legalFree(entity: any, x: number, y: number): boolean {
    return game.legalPos(x, y, entity.map, Boolean(entity.navegando), entity.id);
}

function teleportHero(hero: any, dest: Pt, source: string): boolean {
    const client = clientOf(hero);

    if (!client) return false;

    game.telep(client, hero.map, dest.x, dest.y, source);
    return hero.pos.x === dest.x && hero.pos.y === dest.y;
}

/** Empuja a un objetivo hasta `tiles` tiles en la direccion origen -> objetivo (se frena en obstaculos). */
function knockback(from: Pt, target: any, tiles: number) {
    if (controlImmune(target) || tiles <= 0) return;

    const away = { x: target.pos.x + Math.sign(target.pos.x - from.x) * 5, y: target.pos.y + Math.sign(target.pos.y - from.y) * 5 };
    const toward = Math.abs(target.pos.x - from.x) >= Math.abs(target.pos.y - from.y) ? { x: away.x, y: target.pos.y } : { x: target.pos.x, y: away.y };
    let dest: Pt | undefined;

    for (const p of linePoints(target.pos, toward, tiles)) {
        if (!inMap(target.map, p.x, p.y) || !(target.isNpc ? game.legalPosNpc(p.x, p.y, target.map, false, false) : legalFree(target, p.x, p.y))) break;

        dest = p;
    }

    if (!dest) return;

    if (target.isNpc) require("../npcs").moveNpcByPos(target.id, dest);
    else teleportHero(target, dest, "moba.knockback");
}

// --- efectos ---------------------------------------------------------------------------------------------------------

function effectDamage(ctx: Ctx, effect: Extract<Effect, { t: "dmg" }>, target: any): number {
    let raw = effect.school === "phys" ? physHit(ctx.caster) * (effect.k ?? 1) : magicHit(ctx.caster, effect.base ?? 0) * (effect.k ?? 1);
    const ratio = target.maxHp > 0 ? target.hp / target.maxHp : 1;

    if (effect.missingHp) raw *= 1 + effect.missingHp * (1 - ratio);
    if (effect.exec && ratio < effect.exec.below) raw *= effect.exec.mult;

    return raw * ctx.mult * specs().damageBonus(ctx.caster, target);
}

function applyToEnemy(ctx: Ctx, target: any, effects: Effect[]) {
    const now = ctx.now;

    for (const e of effects) {
        if (!isAlive(target)) break;

        switch (e.t) {
            case "dmg":
                dealDamage(ctx.caster, target, effectDamage(ctx, e, target), e.school, ctx);
                break;
            case "dot": {
                const per = e.school === "phys" ? physHit(ctx.caster) * (e.k ?? 1) : magicHit(ctx.caster, e.base ?? 0) * (e.k ?? 1);

                addDot(ctx.caster, target, per * ctx.mult, e.school, e.ticks, e.everyMs, now);
                break;
            }
            case "stun":
                applyStun(ctx.caster, target, e.ms, now);
                break;
            case "root":
                applyRoot(ctx.caster, target, e.ms, now);
                break;
            case "slow":
                applySlow(target, e.pct, e.ms, now);
                break;
            case "knock":
                knockback(ctx.from ?? ctx.caster.pos, target, e.tiles);
                break;
            case "taunt":
                if (target.isNpc && target.structure === "minion") {
                    target.mobaTaunt = { id: ctx.caster.id, until: now + e.ms };
                }
                break;
            default:
                break;
        }
    }

    if (ctx.def.fx) sendFx(target, ctx.def.fx);
}

function applyToFriend(ctx: Ctx, target: any, effects: Effect[]) {
    const now = ctx.now;

    for (const e of effects) {
        switch (e.t) {
            case "heal":
                healEntity(ctx.caster, target, e, ctx);
                break;
            case "shield":
                addShield(ctx.caster, target, e, ctx);
                break;
            case "buff":
                addBuff(target, ctx.def.id, e.stat, e.pct, e.ms, now);
                break;
            case "cleanse":
                cleanse(target);
                break;
            case "invis":
                if (target.id === ctx.caster.id) game.userSpellUser(ctx.caster.id, ctx.caster.id, 14);
                break;
            default:
                break;
        }
    }

    if (ctx.def.fx) sendFx(target, ctx.def.fx);
}

function addDot(caster: any, target: any, amountPerTick: number, school: string, ticks: number, everyMs: number, now: number) {
    const fx = fxOf(target);

    // Un mismo lanzador refresca su DoT en vez de apilarlo sin limite.
    fx.dots = fx.dots.filter((d: any) => d.casterId !== caster.id || d.school !== school).slice(-5);
    fx.dots.push({ casterId: caster.id, next: now + everyMs, every: everyMs, left: ticks, amount: Math.max(1, Math.round(amountPerTick)), school });
    trackFx(target);
}

// --- lanzamiento ---------------------------------------------------------------------------------------------------------

function tileTarget(map: number, pos: Pt): any {
    return entityAt(map, pos.x, pos.y) ?? entityAt(map, pos.x, pos.y + 1);
}

function cooldownLeft(hero: any, def: AbilityDef, now: number): number {
    return Math.max(0, Number(hero.mobaCd?.[def.id] ?? 0) - now);
}

function costOf(hero: any, def: AbilityDef): number {
    return def.costPct ? Math.ceil((def.costBase / 100) * hero.maxMana) : def.costBase;
}

/** Costo de la habilidad del slot sobre el maximo del recurso (para ordenar por conveniencia). */
function costRatio(hero: any, slot: number): number {
    const def = abilityAt(hero, slot);

    return def ? costOf(hero, def) / Math.max(1, hero.maxMana) : 1;
}

function cooldownFor(def: AbilityDef, rank: number): number {
    return Math.round(def.cooldownMs * (1 - 0.05 * (rank - 1)));
}

function resourceName(resource: string): string {
    return resource === "furia" ? "furia" : resource === "energia" ? "energía" : "maná";
}

function fail(hero: any, msg: string) {
    const client = clientOf(hero);

    if (client) {
        handleProtocol.console(msg, "white", 0, 0, client);
        handleProtocol.dialog(hero.id, msg, "", "#ffb347", 0, client);
    }
}

/**
 * Dash: devuelve el tile final (o null si no se movio). `forward` va hacia el click, `away` al lado contrario,
 * `toTarget` termina pegado al objetivo. Se frena en terreno bloqueado o entidades; devuelve la entidad con la que choco.
 */
function planDash(hero: any, mode: string, tiles: number, click: Pt, target?: any): { dest: Pt | null; hit?: any } {
    const origin = hero.pos as Pt;

    if (mode === "toTarget" && target) {
        const options = [
            { x: target.pos.x + 1, y: target.pos.y },
            { x: target.pos.x - 1, y: target.pos.y },
            { x: target.pos.x, y: target.pos.y + 1 },
            { x: target.pos.x, y: target.pos.y - 1 },
        ]
            .filter((p) => inMap(hero.map, p.x, p.y) && (legalFree(hero, p.x, p.y) || (p.x === origin.x && p.y === origin.y)))
            .sort((a, b) => dist(a, origin) - dist(b, origin));

        const best = options[0];

        return { dest: best && !(best.x === origin.x && best.y === origin.y) ? best : null, hit: target };
    }

    let toward = click;

    if (click.x === origin.x && click.y === origin.y) {
        toward = { x: origin.x + (hero.heading === vars.direcciones.right ? 1 : hero.heading === vars.direcciones.left ? -1 : 0), y: origin.y + (hero.heading === vars.direcciones.down ? 1 : hero.heading === vars.direcciones.up ? -1 : 0) };
    }

    if (mode === "away") toward = { x: origin.x * 2 - toward.x, y: origin.y * 2 - toward.y };

    let dest: Pt | null = null;
    let hit: any;

    for (const p of linePoints(origin, toward, tiles)) {
        if (!inMap(hero.map, p.x, p.y) || terrainBlocked(hero.map, p.x, p.y)) break;

        if (legalFree(hero, p.x, p.y)) {
            dest = p;
            continue;
        }

        hit = entityAt(hero.map, p.x, p.y);
        break;
    }

    return { dest, hit };
}

function coneTargets(caster: any, click: Pt, range: number, width: number): any[] {
    const origin = caster.pos as Pt;
    const dx = click.x - origin.x;
    const dy = click.y - origin.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const fwd = horizontal ? Math.sign(dx) || 1 : Math.sign(dy) || 1;
    const found: any[] = [];

    for (let d = 1; d <= range; d++) {
        const half = Math.floor(d / 2) + (width - 1);

        for (let off = -half; off <= half; off++) {
            const x = horizontal ? origin.x + fwd * d : origin.x + off;
            const y = horizontal ? origin.y + off : origin.y + fwd * d;

            if (!inMap(caster.map, x, y)) continue;

            const entity = entityAt(caster.map, x, y);

            if (entity && isHostile(caster, entity) && !found.includes(entity)) found.push(entity);
        }
    }

    return found;
}

type Zone = {
    id: number;
    matchId: string;
    map: number;
    center: Pt;
    radius: number;
    casterId: number;
    until: number;
    nextAt: number;
    tickMs: number;
    armedAt: number;
    trap: boolean;
    def: AbilityDef;
    rank: number;
    mult: number;
};

const zones: Zone[] = [];
let zoneSeq = 1;

function createZone(ctx: Ctx, center: Pt, trap: boolean) {
    const def = ctx.def;
    const z = def.zone!;

    zones.push({
        id: zoneSeq++,
        matchId: ctx.caster.mobaMatchId,
        map: ctx.caster.map,
        center,
        radius: def.radius ?? 1,
        casterId: ctx.caster.id,
        until: ctx.now + z.ms,
        nextAt: ctx.now + (trap ? 500 : 0),
        tickMs: z.tickMs,
        armedAt: ctx.now + 500,
        trap,
        def,
        rank: ctx.rank,
        mult: ctx.mult,
    });
}

function tickZones(now: number) {
    for (let i = zones.length - 1; i >= 0; i--) {
        const zone = zones[i];
        const caster = vars.personajes[zone.casterId];

        if (now >= zone.until || !caster || caster.cerrado || !vars.mapData[zone.map]) {
            zones.splice(i, 1);
            continue;
        }

        if (now < zone.nextAt) continue;

        zone.nextAt = now + zone.tickMs;

        const ctx: Ctx = { caster, def: zone.def, rank: zone.rank, mult: zone.mult, now, from: zone.center };
        const enemies = entitiesInRadius(zone.map, zone.center, zone.radius).filter((e) => isHostile(caster, e));

        if (zone.trap) {
            if (enemies.length === 0) continue;

            applyToEnemy(ctx, enemies[0], zone.def.onEnemy ?? []);
            zones.splice(i, 1);
            continue;
        }

        zoneVisual(zone);

        for (const enemy of enemies) applyToEnemy(ctx, enemy, zone.def.onEnemy ?? []);
    }
}

function zoneVisual(zone: Zone) {
    const visual = zone.def.zone?.visual;
    const r = zone.radius;
    const tx = zone.center.x + rand(-r, r);
    const ty = zone.center.y + rand(-r, r);

    if (!inMap(zone.map, tx, ty)) return;

    if (visual === "arrows") {
        sendProjectile(zone.map, { x: tx, y: Math.max(1, ty - 4) }, { x: tx, y: ty }, "arrow");
    } else if (zone.def.fx) {
        toViewers(zone.map, zone.center, (client) => {
            // Efecto de suelo: se anima sobre la entidad mas cercana si la hay (animFX es por entidad).
            const e = entityAt(zone.map, tx, ty);

            if (e) handleProtocol.animFX(e.id, zone.def.fx!, client);
        });
    }
}

/** Intenta lanzar la tecnica del slot. Devuelve true si se consumio (para el intervalo global y la UI). */
function castTech(ws: any, hero: any, slot: number, click: Pt): boolean {
    const def = abilityAt(hero, slot);

    if (!def || def.kind !== "tech") return false;

    const now = Date.now();

    if (isStunned(hero, now)) {
        fail(hero, "Estás aturdido.");
        return true;
    }

    const rank = Number(hero.mobaRanks?.[slot] ?? 0);

    if (rank < 1) {
        fail(hero, "Aún no aprendiste esa habilidad: gastá un punto.");
        return true;
    }

    if (cooldownLeft(hero, def, now) > 0) {
        fail(hero, `${def.name} se está recargando.`);
        return true;
    }

    const cost = costOf(hero, def);

    if (hero.mana < cost) {
        fail(hero, `No tenés ${resourceName(def.resource)} suficiente.`);
        return true;
    }

    if (!inMap(hero.map, click.x, click.y)) return true;

    const mult = skillsMod().rankMultiplier(hero, slot);
    const ctx: Ctx = { caster: hero, def, rank, mult, now, from: { x: hero.pos.x, y: hero.pos.y } };
    const origin = { x: hero.pos.x, y: hero.pos.y };
    const shape = def.shape ?? "self";
    let ok = true;

    hero.heading = headingFor(origin, click.x === origin.x && click.y === origin.y ? { x: origin.x + 1, y: origin.y } : click);

    // --- dash previo ---
    let dashHit: any;
    let moved = false;

    if (def.dash) {
        let target: any;

        if (def.dash.mode === "toTarget") {
            target = tileTarget(hero.map, click);

            if (!isHostile(hero, target) || dist(origin, target.pos) > def.range) {
                fail(hero, "No hay un objetivo al alcance.");
                return true;
            }

            if (dist(origin, target.pos) <= 1) {
                // Ya esta pegado: no hace falta moverse.
                dashHit = target;
            }
        }

        if (!dashHit) {
            const plan = planDash(hero, def.dash.mode, def.dash.tiles, click, target);

            if (!plan.dest) {
                if (def.dash.mode !== "forward" || shape === "self" || !plan.hit) {
                    fail(hero, "No hay espacio para moverte.");
                    return true;
                }
            } else {
                moved = teleportHero(hero, plan.dest, "moba.dash");
                ctx.from = { x: hero.pos.x, y: hero.pos.y };
            }

            dashHit = plan.hit;
        }
    }

    // --- efecto segun la forma ---
    switch (shape) {
        case "self":
            applyToFriend(ctx, hero, def.onSelf ?? []);
            break;

        case "ring": {
            const around = entitiesInRadius(hero.map, hero.pos, def.radius ?? 1);

            for (const e of around) {
                if (isHostile(hero, e)) applyToEnemy(ctx, e, def.onEnemy ?? []);
                else if (isFriendlyHero(hero, e) || e.id === hero.id) applyToFriend(ctx, e, def.onAllies ?? []);
            }

            if (!around.includes(hero)) applyToFriend(ctx, hero, def.onAllies ?? []);

            applyToFriend(ctx, hero, def.onSelf ?? []);
            break;
        }

        case "target": {
            let target = dashHit ?? tileTarget(hero.map, click);

            if (def.target === "ally") {
                if (!target || !isFriendlyHero(hero, target)) target = hero;

                if (dist(origin, target.pos) > def.range) {
                    fail(hero, "Está demasiado lejos.");
                    return true;
                }

                applyToFriend(ctx, target, def.onAllies ?? []);
            } else {
                if (!isHostile(hero, target)) {
                    fail(hero, "No hay un objetivo.");
                    return true;
                }

                if (dist(hero.pos, target.pos) > def.range) {
                    fail(hero, "Está demasiado lejos.");
                    return true;
                }

                applyToEnemy(ctx, target, def.onEnemy ?? []);
            }

            applyToFriend(ctx, hero, def.onSelf ?? []);
            break;
        }

        case "line": {
            if (def.dash) {
                // Carga: golpea a lo que frena el avance.
                if (dashHit && isHostile(hero, dashHit)) applyToEnemy(ctx, dashHit, def.onEnemy ?? []);
                else if (!moved) ok = false;

                break;
            }

            const path = linePoints(origin, click.x === origin.x && click.y === origin.y ? { x: origin.x + (hero.heading === vars.direcciones.right ? 1 : hero.heading === vars.direcciones.left ? -1 : 0), y: origin.y + (hero.heading === vars.direcciones.down ? 1 : hero.heading === vars.direcciones.up ? -1 : 0) } : click, def.range);
            let end = origin;
            let victim: any;

            for (const p of path) {
                if (terrainBlocked(hero.map, p.x, p.y)) break;

                end = p;

                const e = entityAt(hero.map, p.x, p.y);

                if (e && isAlive(e)) {
                    // El primero que encuentra frena la flecha: un aliado la bloquea, un enemigo la recibe.
                    if (isHostile(hero, e)) victim = e;

                    break;
                }
            }

            sendProjectile(hero.map, origin, end, def.proj);

            if (victim) applyToEnemy(ctx, victim, def.onEnemy ?? []);

            applyToFriend(ctx, hero, def.onSelf ?? []);
            break;
        }

        case "cone": {
            sendProjectile(hero.map, origin, linePoints(origin, click, def.range).slice(-1)[0] ?? click, def.proj);

            for (const e of coneTargets(hero, click, def.range, def.width ?? 1)) applyToEnemy(ctx, e, def.onEnemy ?? []);

            break;
        }

        case "zone":
        case "trap": {
            if (dist(origin, click) > def.range) {
                fail(hero, "Está demasiado lejos.");
                return true;
            }

            createZone(ctx, click, shape === "trap");
            break;
        }

        default:
            break;
    }

    if (!ok) {
        fail(hero, "No hay espacio para moverte.");
        return true;
    }

    // --- costo y cooldown ---
    hero.mana = Math.max(0, hero.mana - cost);
    hero.lastCombatActivityAt = now;

    if (def.cooldownMs > 0) {
        hero.mobaCd[def.id] = now + cooldownFor(def, rank);
    }

    const client = clientOf(hero);

    if (client) handleProtocol.updateMana(hero.mana, client);

    return true;
}

// --- tick ----------------------------------------------------------------------------------------------------------------

const lastSecond: Record<string, number> = {};

function tickFx(entity: any, now: number) {
    const fx = entity.mobaFx;

    if (!fx) return false;

    let changedBuffs = false;

    const buffsBefore = fx.buffs.length;
    fx.buffs = fx.buffs.filter((b: any) => b.until > now);
    changedBuffs = fx.buffs.length !== buffsBefore;
    fx.slows = fx.slows.filter((s: any) => s.until > now);

    for (let i = fx.dots.length - 1; i >= 0; i--) {
        const dot = fx.dots[i];

        if (now < dot.next) continue;

        const caster = vars.personajes[dot.casterId];

        if (!caster || caster.cerrado || !isAlive(entity)) {
            fx.dots.splice(i, 1);
            continue;
        }

        dot.next += dot.every;
        dot.left--;

        if (dot.left <= 0) fx.dots.splice(i, 1);

        dealDamage(caster, entity, dot.amount, dot.school, { caster, def: {} as AbilityDef, rank: 1, mult: 1, now, noProc: true });
    }

    // El estado de aturdimiento se mantiene aunque un Remover Paralisis de AO limpie la bandera.
    if (fx.stunUntil > now && !entity.paralizado && isAlive(entity)) {
        entity.cooldownParalizado = fx.stunUntil - crowdControlMs(entity);
        entity.paralizado = 1;
        entity.inmovilizado = 0;

        const own = clientOf(entity);

        if (own) handleProtocol.inmo(entity.id, 2, own);
    }

    return changedBuffs;
}

function tick(match: any, heroes: any[], now: number) {
    tickZones(now);

    for (const entity of fxEntities) {
        if (entity.cerrado || (!entity.isNpc && !vars.personajes[entity.id]) || (entity.isNpc && !vars.npcs[entity.id])) {
            fxEntities.delete(entity);
            continue;
        }

        if (entity.mobaMatchId !== match.id) continue;

        const buffsChanged = tickFx(entity, now);

        if (buffsChanged && !entity.isNpc) require("./buffs").recompute(match, entity, now);

        const fx = entity.mobaFx;

        if (entity.isNpc && fx.slows.length === 0 && fx.dots.length === 0 && fx.stunUntil <= now) fxEntities.delete(entity);
    }

    for (const hero of heroes) {
        if (hero.dead || hero.cerrado) continue;

        if (Number(hero.mobaShield ?? 0) > 0 && now >= hero.mobaShieldUntil) hero.mobaShield = 0;

        specs().tickHero(hero, now);
    }

    if (now - (lastSecond[match.id] ?? 0) >= 1000) {
        lastSecond[match.id] = now;

        for (const hero of heroes) {
            if (hero.dead || hero.cerrado) continue;

            regenResource(hero);
        }
    }
}

function regenResource(hero: any) {
    const rate = (REGEN_PER_SEC as Record<string, number>)[hero.mobaResource] ?? 0;
    const mult = Number(hero.mobaStatic?.regen ?? 1);
    // El mana mantiene la regeneracion pasiva de match.passiveRegen (1 %/s); el rasgo solo suma la diferencia.
    const extra = hero.mobaResource === "mana" ? (mult - 1) * 0.01 : rate * mult;

    if (extra <= 0 || hero.mana >= hero.maxMana) return;

    hero.mana = Math.min(hero.maxMana, hero.mana + Math.max(1, Math.round(hero.maxMana * extra)));

    const client = clientOf(hero);

    if (client) handleProtocol.updateMana(hero.mana, client);
}

/** Ganancia de recurso (Furia/Energia por golpear, matar, etc.). */
function gainResource(hero: any, amount: number) {
    if (!hero || hero.dead || hero.mobaResource === "mana" || amount <= 0) return;

    hero.mana = Math.min(hero.maxMana, hero.mana + Math.round(amount));

    const client = clientOf(hero);

    if (client) handleProtocol.updateMana(hero.mana, client);
}

/** Al morir se pierden escudos, controles, buffs y danos en el tiempo. */
function onDeath(hero: any) {
    const fx = fxOf(hero);

    hero.mobaShield = 0;
    fx.stunUntil = 0;
    fx.slows = [];
    fx.buffs = [];
    fx.dots = [];
    fx.lowHpBonus = 0;

    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].casterId === hero.id) zones.splice(i, 1);
}

function clearMatch(matchId: string) {
    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].matchId === matchId) zones.splice(i, 1);

    for (const e of fxEntities) if (e.mobaMatchId === matchId) fxEntities.delete(e);
}

// --- descripcion para el HUD y la depuracion -----------------------------------------------------------------------------------

function describeSkills(hero: any, now = Date.now()) {
    const skills = skillsMod();
    const out: any[] = [];

    for (const slot of [...NORMAL_SLOTS, ULT_SLOT]) {
        const def = abilityAt(hero, slot);

        if (!def) continue;

        const rank = Number(hero.mobaRanks?.[slot] ?? 0);

        out.push({
            slot,
            id: def.id,
            spell: def.spellId,
            name: def.name,
            desc: def.desc,
            rank,
            max: skills.maxRank(hero, slot),
            ult: slot === ULT_SLOT,
            canLevel: skills.canLevel(hero, slot),
            nextReqLevel: skills.requiredLevel(rank + 1, slot === ULT_SLOT),
            cdLeftMs: cooldownLeft(hero, def, now),
            cdTotalMs: def.cooldownMs > 0 ? cooldownFor(def, Math.max(1, rank)) : 0,
            cost: costOf(hero, def),
            resource: hero.mobaResource ?? def.resource,
            range: def.range,
            target: def.target,
            icon: def.icon,
            tags: def.tags,
            kind: def.kind,
        });
    }

    return out;
}

function stateFor(hero: any, now = Date.now()) {
    const fx = hero.mobaFx;
    const spec: SpecDef | undefined = championOf(hero.mobaTemplateId)?.specs.find((s) => s.id === hero.mobaBuild?.spec);

    return {
        resource: hero.mobaResource ?? "mana",
        shield: Math.round(Number(hero.mobaShield ?? 0)),
        spec: spec ? { id: spec.id, name: spec.name, desc: spec.desc } : null,
        stunned: isStunned(hero, now),
        rooted: Boolean(hero.inmovilizado || hero.paralizado),
        slowPct: Math.round((1 - Math.min(1, speedMult(hero, now) / Math.max(0.01, 1 + Number(hero.mobaStatic?.speed ?? 0) + activeBuffSum(hero, "speed", now)))) * 100),
        dr: Math.round(damageReduction(hero, now) * 100),
        dots: fx ? fx.dots.length : 0,
    };
}

function debugInfo(hero: any, now = Date.now()) {
    const cds: Record<string, number> = {};

    for (const [id, until] of Object.entries((hero.mobaCd ?? {}) as Record<string, number>)) {
        if (until > now) cds[id] = until - now;
    }

    return {
        build: hero.mobaBuild ?? null,
        abilities: hero.mobaAbilities ?? null,
        cds,
        shield: Math.round(Number(hero.mobaShield ?? 0)),
        stunLeftMs: Math.max(0, Number(hero.mobaFx?.stunUntil ?? 0) - now),
        rooted: Boolean(hero.inmovilizado),
        paralyzed: Boolean(hero.paralizado),
        speedMult: Number(speedMult(hero, now).toFixed(3)),
        dr: Number(damageReduction(hero, now).toFixed(3)),
        resource: hero.mobaResource ?? null,
        spec: hero.mobaBuild?.spec ?? null,
        kit: hero.mobaBuild?.kit ?? null,
        dots: hero.mobaFx?.dots?.length ?? 0,
        buffs: (hero.mobaFx?.buffs ?? []).filter((b: any) => b.until > now).map((b: any) => `${b.id}:${b.stat}`),
        lifesteal: Number(lifestealOf(hero, now).toFixed(3)),
        zones: zones.filter((z) => z.casterId === hero.id).length,
    };
}

function debugNpcInfo(npc: any, now = Date.now()) {
    return {
        slowFactor: Number(npcSlowFactor(npc, now).toFixed(3)),
        stunned: isStunned(npc, now),
        dots: npc.mobaFx?.dots?.length ?? 0,
        taunt: npc.mobaTaunt && npc.mobaTaunt.until > now ? npc.mobaTaunt.id : null,
    };
}

module.exports = {
    ULT_SLOT,
    NORMAL_SLOTS,
    resolveBuild,
    defaultBuild,
    spellsFor,
    findAbility,
    abilityAt,
    isTechSlot,
    initHero,
    afterLevelStats,
    castTech,
    tick,
    onDeath,
    clearMatch,
    rawSetHp,
    describeSkills,
    costRatio,
    stateFor,
    debugInfo,
    debugNpcInfo,
    walkStepMs,
    speedMult,
    npcSlowFactor,
    dmgFactor,
    lifestealOf,
    damageReduction,
    isStunned,
    gainResource,
    // usados por specs.ts
    dealDamage,
    addShield,
    addDot,
    applySlow,
    addBuff,
    physHit,
    fxOf,
    trackFx,
    sendVitals,
    sendNumber,
    entitiesInRadius,
    isFriendlyHero,
    refreshMultipliers,
    isHostile,
};
