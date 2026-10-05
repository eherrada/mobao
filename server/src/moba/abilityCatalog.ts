export {};

/**
 * Catalogo de habilidades del MOBA: SOLO DATOS (serializables), sin logica. El motor esta en abilities.ts y los
 * rasgos pasivos en specs.ts. El script scripts/exportAbilityCatalog.ts vuelca estos datos al frontend.
 *
 * Esencia Argentum (decision del usuario):
 *  - Los hechizos iconicos de AO se mantienen tal cual (kind "aoSpell"): se lanzan a un tile apuntado, cuestan mana
 *    y usan los efectos y duraciones de AO. NO tienen cooldown propio: el limite es el mana y el intervalo global de
 *    accion (vars.timing.actionCooldowns.spellMs, ~850 ms).
 *  - Las tecnicas nuevas (kind "tech") siguen el mismo modelo: costo de recurso + intervalo global. Solo las de
 *    movilidad (dash) y las definitivas tienen cooldown propio, moderado.
 *
 * Recursos: "mana" (AO), "furia" (Guerrero) y "energia" (Cazador y Asesino). Se guardan en hero.mana/maxMana.
 * costBase de una tecnica es un PORCENTAJE del maximo del recurso (costPct = true); el de un hechizo AO es el mana
 * absoluto de AO (costPct = false). El HUD recibe siempre el costo ya convertido (mobaState.skills[].cost).
 */

export type Resource = "mana" | "furia" | "energia";
export type Tag = "dano" | "control" | "movilidad" | "curacion" | "escudo" | "utilidad";
export type TargetKind = "self" | "point" | "line" | "area" | "ally";
export type School = "phys" | "magic";

export type Effect =
    | { t: "dmg"; school: School; k?: number; base?: number; missingHp?: number; exec?: { below: number; mult: number } }
    | { t: "heal"; base?: number; pct?: number }
    | { t: "shield"; pct: number; ms: number }
    | { t: "stun"; ms: number }
    | { t: "root"; ms: number }
    | { t: "slow"; pct: number; ms: number }
    | { t: "knock"; tiles: number }
    | { t: "dot"; school: School; k?: number; base?: number; ticks: number; everyMs: number }
    | { t: "buff"; stat: "dmg" | "speed" | "lifesteal" | "dr"; pct: number; ms: number }
    | { t: "invis" }
    | { t: "taunt"; ms: number }
    | { t: "cleanse" };

export type Shape = "self" | "target" | "ring" | "point" | "line" | "cone" | "zone" | "trap";

export type AbilityDef = {
    id: string;
    name: string;
    desc: string;
    tags: Tag[];
    target: TargetKind;
    range: number;
    cooldownMs: number;
    costBase: number;
    costPct: boolean;
    resource: Resource;
    icon: string;
    maxRank: number;
    kind: "aoSpell" | "tech";
    /** Id de hechizo de AO (aoSpell) o hechizo "de imagen" que se muestra en el panel de hechizos del cliente (tech). */
    spellId: number;
    // --- datos para el motor (solo tech) ---
    shape?: Shape;
    radius?: number;
    width?: number;
    onEnemy?: Effect[];
    onSelf?: Effect[];
    onAllies?: Effect[];
    /** Movimiento previo al efecto. blink = hasta N tiles hacia el click; away = hacia el lado contrario del click. */
    dash?: { tiles: number; mode: "forward" | "away" | "toTarget" };
    zone?: { ms: number; tickMs: number; visual: "arrows" | "fire" | "nature" | "meteor" };
    /** FX de impacto (fxGrh de AO) y proyectil visual. */
    fx?: number;
    proj?: "arrow" | number;
};

export type SpecDef = {
    id: string;
    name: string;
    desc: string;
    // Modificadores estaticos (multiplicadores 1 = sin cambio).
    hp?: number;
    phys?: number;
    spell?: number;
    dr?: number; // reduccion de dano plana (0.1 = -10 %)
    speed?: number; // +/- velocidad de paso (0.1 = 10 % mas rapido)
    heal?: number; // multiplicador de curacion hecha
    shield?: number; // multiplicador de escudos hechos
    regen?: number; // multiplicador de regeneracion del recurso
    cc?: number; // multiplicador de duracion de aturdimientos/inmovilizaciones propios
    // Rasgos con evento.
    lifesteal?: number; // fraccion del dano hecho que se cura
    lowHpDmg?: number; // bonus maximo de dano con la vida en 0 (escala lineal desde 50 % de vida)
    execBonus?: number; // +dano contra objetivos con menos de 35 % de vida
    burn?: number; // el dano magico de habilidades deja quemadura/veneno: fraccion del dano repartida en 3 s
    slowOnHit?: { pct: number; ms: number }; // golpes basicos y habilidades ralentizan
    onKillHeal?: number; // fraccion de vida maxima que se cura al matar
    onKillResource?: number; // fraccion del recurso que se recupera al matar
    auraShield?: { pct: number; radius: number; everyMs: number }; // escudo periodico a aliados cercanos (y a uno mismo)
    emergencyShield?: { below: number; pct: number; cdMs: number }; // escudo al bajar de cierta vida
};

export type KitDef = {
    id: string;
    name: string;
    desc: string;
    phys?: number;
    spell?: number;
    hp?: number;
    dr?: number;
    speed?: number;
    regen?: number;
    redPotions?: number;
    bluePotions?: number;
    gold?: number;
};

export type Build = { abilities: string[]; ult: string; spec: string; kit: string };

export type ChampionDef = {
    templateId: number;
    name: string;
    role: string;
    resource: Resource;
    pool: AbilityDef[];
    ults: AbilityDef[];
    specs: SpecDef[];
    kits: KitDef[];
    defaultBuild: Build;
};

// --- constructores --------------------------------------------------------------------------------

const NORMAL_RANKS = 5;
const ULT_RANKS = 3;

/** Hechizo de AO tal cual (mana, tile apuntado, sin cooldown propio). */
function ao(spellId: number, name: string, desc: string, tags: Tag[], manaCost: number, icon: string, target: TargetKind, ult = false): AbilityDef {
    return {
        id: `ao_${spellId}`,
        name,
        desc,
        tags,
        target,
        range: 8,
        cooldownMs: 0,
        costBase: manaCost,
        costPct: false,
        resource: "mana",
        icon,
        maxRank: ult ? ULT_RANKS : NORMAL_RANKS,
        kind: "aoSpell",
        spellId,
    };
}

type TechInit = Omit<AbilityDef, "kind" | "maxRank" | "costPct" | "cooldownMs" | "range"> & {
    cooldownMs?: number;
    range?: number;
    maxRank?: number;
};

function tech(init: TechInit, ult = false): AbilityDef {
    return {
        cooldownMs: 0,
        range: 1,
        costPct: true,
        maxRank: ult ? ULT_RANKS : NORMAL_RANKS,
        kind: "tech",
        ...init,
    } as AbilityDef;
}

/** Las definitivas de AO se listan aparte con rango maximo 3. */
function asUlt(def: AbilityDef): AbilityDef {
    return { ...def, maxRank: ULT_RANKS };
}

// Hechizos de AO (ids de jsons/spells.json).
const AO = {
    3: ao(3, "Curar Heridas Leves", "Cura poca vida a un aliado (o a vos). Barato.", ["curacion"], 10, "heart-pulse", "ally"),
    5: ao(5, "Curar Heridas Graves", "Cura bastante vida a un aliado (o a vos).", ["curacion"], 40, "heart-pulse", "ally"),
    8: ao(8, "Proyectil Mágico", "Daño mágico barato a un objetivo.", ["dano"], 45, "wand-sparkles", "point"),
    9: ao(9, "Paralizar", "Paraliza al objetivo (no puede moverse) con la duración de AO.", ["control"], 400, "snowflake", "point"),
    10: ao(10, "Remover Parálisis", "Libera a un aliado de la parálisis o inmovilización.", ["utilidad"], 300, "sparkles", "ally"),
    14: ao(14, "Invisibilidad", "Te vuelve invisible hasta que ataques o te golpeen.", ["utilidad"], 500, "eye-off", "self"),
    15: ao(15, "Tormenta de Fuego", "Daño mágico fuerte a un objetivo.", ["dano"], 150, "flame", "point"),
    18: ao(18, "Celeridad", "Aumenta tu agilidad por un rato.", ["utilidad"], 40, "wind", "self"),
    20: ao(20, "Fuerza", "Aumenta tu fuerza por un rato.", ["utilidad"], 50, "dumbbell", "self"),
    23: ao(23, "Descarga Eléctrica", "Daño mágico muy alto a un objetivo.", ["dano"], 460, "zap", "point"),
    24: ao(24, "Inmovilizar", "Inmoviliza al objetivo (no puede moverse).", ["control"], 300, "link", "point"),
    25: ao(25, "Apocalipsis", "El hechizo más poderoso de AO: daño mágico enorme.", ["dano"], 1000, "skull", "point"),
};

// Hechizo "de imagen" para el panel de hechizos del cliente (las tecnicas no existen en spells.json).
const IMG = { phys: 8, area: 15, heal: 5, shield: 3, control: 24, move: 18, buff: 20, invis: 14, bolt: 23 };

// Constantes de FX de AO (fxGrh de jsons/spells.json).
const FX = { fire: 7, paralyze: 8, heal: 9, missile: 10, shock: 11, inmo: 12, apoc: 13, strength: 17, haste: 20 };

// --- tecnicas ---------------------------------------------------------------------------------------

const TECH: Record<string, AbilityDef> = {};

function add(init: TechInit, ult = false) {
    TECH[init.id] = tech(init, ult);
}

// Guerrero (Furia)
add({ id: "tajo_giratorio", name: "Tajo giratorio", desc: "Un tajo en círculo: daña a todos los enemigos pegados a vos.", tags: ["dano"], target: "area", costBase: 20, resource: "furia", icon: "axe", spellId: IMG.area, shape: "ring", radius: 1, onEnemy: [{ t: "dmg", school: "phys", k: 0.95 }], fx: 1 });
add({ id: "carga", name: "Carga", desc: "Embestís hasta 4 tiles en línea recta y aturdís al primero que choques.", tags: ["movilidad", "control", "dano"], target: "line", range: 4, cooldownMs: 9000, costBase: 25, resource: "furia", icon: "chevrons-right", spellId: IMG.move, shape: "line", dash: { tiles: 4, mode: "forward" }, onEnemy: [{ t: "dmg", school: "phys", k: 0.5 }, { t: "stun", ms: 900 }] });
add({ id: "grito_guerra", name: "Grito de guerra", desc: "Vos y tus aliados cercanos ganan escudo y menos daño; los NPC enemigos te atacan a vos.", tags: ["escudo", "utilidad"], target: "area", costBase: 30, resource: "furia", icon: "megaphone", spellId: IMG.shield, shape: "ring", radius: 4, onAllies: [{ t: "shield", pct: 0.1, ms: 4000 }, { t: "buff", stat: "dr", pct: 0.1, ms: 4000 }], onEnemy: [{ t: "taunt", ms: 3000 }] });
add({ id: "golpe_aplastante", name: "Golpe aplastante", desc: "Un golpe brutal al objetivo de enfrente que además lo ralentiza.", tags: ["dano", "control"], target: "point", range: 1, costBase: 35, resource: "furia", icon: "hammer", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 1.8 }, { t: "slow", pct: 0.4, ms: 2500 }] });
add({ id: "estampida", name: "Estampida", desc: "Saltás hasta 5 tiles y al caer dañás y ralentizás a los de alrededor.", tags: ["movilidad", "dano", "control"], target: "line", range: 5, cooldownMs: 10000, costBase: 20, resource: "furia", icon: "move-up-right", spellId: IMG.move, shape: "ring", radius: 1, dash: { tiles: 5, mode: "forward" }, onEnemy: [{ t: "dmg", school: "phys", k: 0.6 }, { t: "slow", pct: 0.3, ms: 1500 }] });
add({ id: "segundo_aliento", name: "Segundo aliento", desc: "Recuperás una parte de tu vida máxima.", tags: ["curacion"], target: "self", costBase: 35, resource: "furia", icon: "heart", spellId: IMG.heal, shape: "self", onSelf: [{ t: "heal", pct: 0.12 }], fx: FX.heal });
add({ id: "escudazo", name: "Escudazo", desc: "Golpeás con el escudo: poco daño, un aturdimiento muy corto y empujás al objetivo 1 tile.", tags: ["control", "dano"], target: "point", range: 1, costBase: 30, resource: "furia", icon: "shield-alert", spellId: IMG.control, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 0.6 }, { t: "stun", ms: 700 }, { t: "knock", tiles: 1 }] });
add({ id: "desgarrar", name: "Desgarrar", desc: "Un tajo que deja una herida sangrante varios segundos.", tags: ["dano"], target: "point", range: 1, costBase: 20, resource: "furia", icon: "droplets", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 0.5 }, { t: "dot", school: "phys", k: 0.25, ticks: 4, everyMs: 750 }] });
add({ id: "ejecucion", name: "Ejecución", desc: "Golpe devastador; mucho más fuerte contra enemigos con poca vida.", tags: ["dano"], target: "point", range: 1, cooldownMs: 30000, costBase: 50, resource: "furia", icon: "skull", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 2.2, exec: { below: 0.35, mult: 2 } }] }, true);
add({ id: "furia_imparable", name: "Furia imparable", desc: "Por unos segundos pegás más fuerte, te curás con cada golpe y recibís menos daño.", tags: ["utilidad", "dano"], target: "self", cooldownMs: 40000, costBase: 40, resource: "furia", icon: "flame", spellId: IMG.buff, shape: "self", onSelf: [{ t: "buff", stat: "dmg", pct: 0.25, ms: 6000 }, { t: "buff", stat: "lifesteal", pct: 0.15, ms: 6000 }, { t: "buff", stat: "dr", pct: 0.15, ms: 6000 }, { t: "buff", stat: "speed", pct: 0.2, ms: 6000 }], fx: FX.strength }, true);

// Cazador (Energia)
add({ id: "disparo_certero", name: "Disparo certero", desc: "Una flecha en línea recta que golpea al primero que encuentra.", tags: ["dano"], target: "line", range: 9, costBase: 20, resource: "energia", icon: "crosshair", spellId: IMG.phys, shape: "line", proj: "arrow", onEnemy: [{ t: "dmg", school: "phys", k: 1.3 }] });
add({ id: "lluvia_flechas", name: "Lluvia de flechas", desc: "Una zona donde caen flechas unos segundos, dañando y ralentizando.", tags: ["dano", "control"], target: "point", range: 8, costBase: 30, resource: "energia", icon: "cloud-rain", spellId: IMG.area, shape: "zone", radius: 2, zone: { ms: 3000, tickMs: 600, visual: "arrows" }, onEnemy: [{ t: "dmg", school: "phys", k: 0.35 }, { t: "slow", pct: 0.2, ms: 900 }] });
add({ id: "trampa", name: "Trampa", desc: "Dejás una trampa invisible: inmoviliza y daña al primer enemigo que pase.", tags: ["control", "dano"], target: "point", range: 5, costBase: 20, resource: "energia", icon: "triangle-alert", spellId: IMG.control, shape: "trap", radius: 1, zone: { ms: 25000, tickMs: 250, visual: "nature" }, onEnemy: [{ t: "dmg", school: "phys", k: 0.5 }, { t: "root", ms: 2000 }] });
add({ id: "voltereta", name: "Voltereta", desc: "Saltás hasta 4 tiles hacia el lado contrario al que apuntás.", tags: ["movilidad"], target: "line", range: 4, cooldownMs: 8000, costBase: 15, resource: "energia", icon: "undo-2", spellId: IMG.move, shape: "self", dash: { tiles: 4, mode: "away" } });
add({ id: "disparo_ralentizante", name: "Disparo ralentizante", desc: "Flecha que daña poco y ralentiza mucho.", tags: ["dano", "control"], target: "line", range: 8, costBase: 18, resource: "energia", icon: "snail", spellId: IMG.control, shape: "line", proj: "arrow", onEnemy: [{ t: "dmg", school: "phys", k: 0.7 }, { t: "slow", pct: 0.45, ms: 2500 }] });
add({ id: "camuflaje", name: "Camuflaje", desc: "Te volvés invisible un rato (invisibilidad de AO).", tags: ["utilidad"], target: "self", cooldownMs: 20000, costBase: 35, resource: "energia", icon: "eye-off", spellId: IMG.invis, shape: "self", onSelf: [{ t: "invis" }] });
add({ id: "disparo_multiple", name: "Disparo múltiple", desc: "Una ráfaga en abanico: daña a todos los enemigos en un cono corto.", tags: ["dano"], target: "line", range: 5, costBase: 25, resource: "energia", icon: "fan", spellId: IMG.area, shape: "cone", width: 1, proj: "arrow", onEnemy: [{ t: "dmg", school: "phys", k: 0.8 }] });
add({ id: "flecha_cazadora", name: "Flecha cazadora", desc: "Flecha de largo alcance con gran daño; letal contra enemigos con poca vida.", tags: ["dano"], target: "line", range: 14, cooldownMs: 35000, costBase: 50, resource: "energia", icon: "target", spellId: IMG.bolt, shape: "line", proj: "arrow", onEnemy: [{ t: "dmg", school: "phys", k: 2.6, exec: { below: 0.3, mult: 1.6 } }] }, true);
add({ id: "tormenta_flechas", name: "Tormenta de flechas", desc: "Una enorme zona de flechas que castiga a quien se quede dentro.", tags: ["dano", "control"], target: "point", range: 8, cooldownMs: 40000, costBase: 60, resource: "energia", icon: "cloud-lightning", spellId: IMG.area, shape: "zone", radius: 3, zone: { ms: 4000, tickMs: 500, visual: "arrows" }, onEnemy: [{ t: "dmg", school: "phys", k: 0.5 }, { t: "slow", pct: 0.3, ms: 800 }] }, true);

// Asesino (Energia sobre su reserva de mana de AO)
add({ id: "punalada", name: "Puñalada", desc: "Te teletransportás junto a tu objetivo y lo apuñalás.", tags: ["movilidad", "dano"], target: "point", range: 6, cooldownMs: 7000, costBase: 20, resource: "energia", icon: "zap", spellId: IMG.phys, shape: "target", dash: { tiles: 6, mode: "toTarget" }, onEnemy: [{ t: "dmg", school: "phys", k: 1.2 }] });
add({ id: "humo", name: "Humo", desc: "Te escondés en una bomba de humo: invisible y más rápido unos segundos.", tags: ["utilidad", "movilidad"], target: "self", cooldownMs: 18000, costBase: 30, resource: "energia", icon: "cloud", spellId: IMG.invis, shape: "self", onSelf: [{ t: "invis" }, { t: "buff", stat: "speed", pct: 0.25, ms: 3000 }] });
add({ id: "veneno", name: "Veneno", desc: "Un corte con daga envenenada: daño inicial y veneno en el tiempo.", tags: ["dano"], target: "point", range: 1, costBase: 15, resource: "energia", icon: "flask-conical", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 0.3 }, { t: "dot", school: "phys", k: 0.3, ticks: 5, everyMs: 800 }] });
add({ id: "abanico_dagas", name: "Abanico de dagas", desc: "Lanzás dagas en abanico: daña a todos los enemigos del cono.", tags: ["dano"], target: "line", range: 4, costBase: 25, resource: "energia", icon: "fan", spellId: IMG.area, shape: "cone", width: 1, proj: "arrow", onEnemy: [{ t: "dmg", school: "phys", k: 0.9 }] });
add({ id: "golpe_bajo", name: "Golpe bajo", desc: "Un golpe a las piernas: daño y ralentización fuerte.", tags: ["dano", "control"], target: "point", range: 1, costBase: 18, resource: "energia", icon: "footprints", spellId: IMG.control, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 0.7 }, { t: "slow", pct: 0.5, ms: 2000 }] });
add({ id: "ejecutar", name: "Ejecutar", desc: "Un golpe mortal contra el objetivo de enfrente; muchísimo más fuerte si le queda poca vida.", tags: ["dano"], target: "point", range: 1, cooldownMs: 30000, costBase: 50, resource: "energia", icon: "skull", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 2.4, exec: { below: 0.4, mult: 2 } }] }, true);

// Paladin
add({ id: "golpe_sagrado", name: "Golpe sagrado", desc: "Golpe con tu arma bendecida: daña al objetivo y te cura un poco.", tags: ["dano", "curacion"], target: "point", range: 1, costBase: 20, resource: "mana", icon: "sword", spellId: IMG.phys, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 1.1 }], onSelf: [{ t: "heal", pct: 0.05 }], fx: FX.heal });
add({ id: "escudo_divino", name: "Escudo divino", desc: "Un escudo de luz que absorbe daño unos segundos.", tags: ["escudo"], target: "self", costBase: 30, resource: "mana", icon: "shield", spellId: IMG.shield, shape: "self", onSelf: [{ t: "shield", pct: 0.18, ms: 5000 }], fx: FX.heal });
add({ id: "juicio", name: "Juicio", desc: "Aturdís brevemente al objetivo cercano.", tags: ["control", "dano"], target: "point", range: 2, cooldownMs: 6000, costBase: 30, resource: "mana", icon: "gavel", spellId: IMG.control, shape: "target", onEnemy: [{ t: "dmg", school: "phys", k: 0.6 }, { t: "stun", ms: 900 }], fx: FX.shock });
add({ id: "aura_coraje", name: "Aura de coraje", desc: "Vos y tus aliados cercanos pegan más y reciben menos daño unos segundos.", tags: ["utilidad"], target: "area", costBase: 30, resource: "mana", icon: "sun", spellId: IMG.buff, shape: "ring", radius: 5, onAllies: [{ t: "buff", stat: "dr", pct: 0.1, ms: 5000 }, { t: "buff", stat: "dmg", pct: 0.1, ms: 5000 }], fx: FX.strength });
add({ id: "martillo_redencion", name: "Martillo de redención", desc: "Un martillazo en área: daña y aturde a los enemigos y cura a tus aliados cercanos.", tags: ["dano", "curacion", "control"], target: "area", cooldownMs: 35000, costBase: 50, resource: "mana", icon: "hammer", spellId: IMG.area, shape: "ring", radius: 3, onEnemy: [{ t: "dmg", school: "phys", k: 1.5 }, { t: "stun", ms: 600 }], onAllies: [{ t: "heal", pct: 0.1 }], fx: FX.apoc }, true);

// Mago
add({ id: "muro_fuego", name: "Muro de fuego", desc: "Una zona de fuego que quema a los enemigos que la cruzan.", tags: ["dano", "control"], target: "point", range: 8, costBase: 20, resource: "mana", icon: "flame-kindling", spellId: IMG.area, shape: "zone", radius: 1, zone: { ms: 4000, tickMs: 500, visual: "fire" }, onEnemy: [{ t: "dmg", school: "magic", base: 24 }], fx: FX.fire });
add({ id: "parpadeo", name: "Parpadeo", desc: "Te teletransportás hasta 5 tiles hacia donde apuntás.", tags: ["movilidad"], target: "line", range: 5, cooldownMs: 10000, costBase: 8, resource: "mana", icon: "move-diagonal", spellId: IMG.move, shape: "self", dash: { tiles: 5, mode: "forward" } });
add({ id: "escudo_arcano", name: "Escudo arcano", desc: "Una barrera de maná que absorbe daño unos segundos.", tags: ["escudo"], target: "self", costBase: 12, resource: "mana", icon: "shield-plus", spellId: IMG.shield, shape: "self", onSelf: [{ t: "shield", pct: 0.14, ms: 4000 }], fx: FX.inmo });
add({ id: "meteoros", name: "Lluvia de meteoros", desc: "Una gran zona donde caen meteoros: daño mágico y ralentización.", tags: ["dano", "control"], target: "point", range: 8, cooldownMs: 40000, costBase: 40, resource: "mana", icon: "meteor", spellId: IMG.bolt, shape: "zone", radius: 3, zone: { ms: 3500, tickMs: 700, visual: "meteor" }, onEnemy: [{ t: "dmg", school: "magic", base: 55 }, { t: "slow", pct: 0.3, ms: 900 }], fx: FX.apoc }, true);

// Clerigo
add({ id: "escudo_sagrado", name: "Escudo sagrado", desc: "Protegés a un aliado con un escudo que absorbe daño.", tags: ["escudo"], target: "ally", range: 8, costBase: 10, resource: "mana", icon: "shield-plus", spellId: IMG.shield, shape: "target", onAllies: [{ t: "shield", pct: 0.12, ms: 4000 }], fx: FX.heal });
add({ id: "sanacion_area", name: "Sanación en área", desc: "Curás a todos los aliados cercanos (y a vos).", tags: ["curacion"], target: "area", costBase: 18, resource: "mana", icon: "heart-handshake", spellId: IMG.heal, shape: "ring", radius: 4, onAllies: [{ t: "heal", base: 25, pct: 0.06 }], fx: FX.heal });
add({ id: "intervencion_divina", name: "Intervención divina", desc: "Curás mucho, protegés y liberás de controles a tus aliados cercanos.", tags: ["curacion", "escudo", "utilidad"], target: "area", cooldownMs: 45000, costBase: 50, resource: "mana", icon: "sparkles", spellId: IMG.heal, shape: "ring", radius: 5, onAllies: [{ t: "heal", pct: 0.25 }, { t: "shield", pct: 0.1, ms: 4000 }, { t: "cleanse" }], fx: FX.heal }, true);

// Bardo
add({ id: "cancion_velocidad", name: "Canción de velocidad", desc: "Una melodía que acelera a tus aliados cercanos.", tags: ["utilidad", "movilidad"], target: "area", costBase: 10, resource: "mana", icon: "music", spellId: IMG.move, shape: "ring", radius: 5, onAllies: [{ t: "buff", stat: "speed", pct: 0.25, ms: 4000 }], fx: FX.haste });
add({ id: "himno_escudo", name: "Himno de escudo", desc: "Un himno que da un escudo a tus aliados cercanos.", tags: ["escudo"], target: "area", costBase: 14, resource: "mana", icon: "music-2", spellId: IMG.shield, shape: "ring", radius: 5, onAllies: [{ t: "shield", pct: 0.08, ms: 4000 }], fx: FX.heal });
add({ id: "disonancia", name: "Disonancia", desc: "Un acorde estridente: daño mágico y ralentización a los enemigos cercanos.", tags: ["dano", "control"], target: "area", costBase: 14, resource: "mana", icon: "audio-waveform", spellId: IMG.area, shape: "ring", radius: 4, onEnemy: [{ t: "dmg", school: "magic", base: 30 }, { t: "slow", pct: 0.35, ms: 2000 }], fx: FX.shock });
add({ id: "concierto_epico", name: "Concierto épico", desc: "Curás, protegés y acelerás a tus aliados cercanos.", tags: ["curacion", "escudo", "utilidad"], target: "area", cooldownMs: 40000, costBase: 45, resource: "mana", icon: "mic-vocal", spellId: IMG.heal, shape: "ring", radius: 5, onAllies: [{ t: "heal", pct: 0.12 }, { t: "shield", pct: 0.08, ms: 4000 }, { t: "buff", stat: "speed", pct: 0.2, ms: 4000 }], fx: FX.heal }, true);

// Druida
add({ id: "raices", name: "Raíces", desc: "Raíces que brotan del suelo e inmovilizan a quien las pise.", tags: ["control"], target: "point", range: 8, costBase: 16, resource: "mana", icon: "sprout", spellId: IMG.control, shape: "zone", radius: 1, zone: { ms: 2500, tickMs: 500, visual: "nature" }, onEnemy: [{ t: "dmg", school: "magic", base: 10 }, { t: "root", ms: 600 }], fx: FX.inmo });
add({ id: "enjambre", name: "Enjambre", desc: "Una nube de insectos pica a los enemigos cercanos durante unos segundos.", tags: ["dano"], target: "area", costBase: 16, resource: "mana", icon: "bug", spellId: IMG.area, shape: "ring", radius: 3, onEnemy: [{ t: "dot", school: "magic", base: 14, ticks: 6, everyMs: 700 }], fx: FX.fire });
add({ id: "forma_corteza", name: "Forma de corteza", desc: "Tu piel se endurece: recibís menos daño y te curás un poco.", tags: ["escudo", "curacion"], target: "self", cooldownMs: 15000, costBase: 15, resource: "mana", icon: "trees", spellId: IMG.shield, shape: "self", onSelf: [{ t: "buff", stat: "dr", pct: 0.25, ms: 5000 }, { t: "heal", pct: 0.06 }], fx: FX.heal });
add({ id: "ira_naturaleza", name: "Ira de la naturaleza", desc: "Una zona enorme donde la tierra ataca e inmoviliza a los enemigos.", tags: ["dano", "control"], target: "point", range: 8, cooldownMs: 40000, costBase: 45, resource: "mana", icon: "leaf", spellId: IMG.bolt, shape: "zone", radius: 4, zone: { ms: 5000, tickMs: 700, visual: "nature" }, onEnemy: [{ t: "dmg", school: "magic", base: 40 }, { t: "root", ms: 900 }], fx: FX.inmo }, true);

// --- especializaciones y kits ----------------------------------------------------------------------

const SPECS: Record<number, SpecDef[]> = {
    0: [
        { id: "archimago", name: "Archimago", desc: "+12 % daño de hechizos y regeneración de maná x1,5, a cambio de 8 % menos de vida.", spell: 1.12, hp: 0.92, regen: 1.5 },
        { id: "piromante", name: "Piromante", desc: "Tu daño mágico de habilidades deja una quemadura (25 % extra en 3 s).", burn: 0.25 },
        { id: "barrera_arcana", name: "Barrera arcana", desc: "Al bajar de 40 % de vida se crea un escudo del 18 % de tu vida (cada 25 s).", emergencyShield: { below: 0.4, pct: 0.18, cdMs: 25000 } },
    ],
    1: [
        { id: "luz_sanadora", name: "Luz sanadora", desc: "Tus curaciones son un 25 % más fuertes.", heal: 1.25 },
        { id: "castigador", name: "Castigador", desc: "+10 % daño de hechizos y 8 % de robo de vida.", spell: 1.1, lifesteal: 0.08 },
        { id: "devoto", name: "Devoto", desc: "Cada 5 s un escudo del 4 % de vida para vos y tus aliados cercanos, y +5 % de vida.", hp: 1.05, auraShield: { pct: 0.04, radius: 7, everyMs: 5000 } },
    ],
    2: [
        { id: "coloso", name: "Coloso", desc: "+20 % de vida y 10 % menos de daño recibido, pero te movés 10 % más lento.", hp: 1.2, dr: 0.1, speed: -0.1 },
        { id: "berserker", name: "Berserker", desc: "10 % de robo de vida y hasta +35 % de daño cuanto menos vida tenés.", lifesteal: 0.1, lowHpDmg: 0.35 },
        { id: "guardian", name: "Guardián", desc: "Cada 4 s un escudo del 5 % de vida para tus aliados cercanos y para vos, y 4 % menos daño recibido.", dr: 0.04, auraShield: { pct: 0.05, radius: 6, everyMs: 4000 } },
    ],
    3: [
        { id: "sombra", name: "Sombra", desc: "+8 % de velocidad; al matar recuperás todo tu recurso y 10 % de vida.", speed: 0.08, onKillResource: 1, onKillHeal: 0.1 },
        { id: "envenenador", name: "Envenenador", desc: "Tus golpes y habilidades ralentizan (20 %) y el daño envenena (+25 % en 3 s).", slowOnHit: { pct: 0.2, ms: 1500 }, burn: 0.25 },
        { id: "cazarrecompensas", name: "Cazarrecompensas", desc: "+5 % de daño físico y +30 % de daño contra enemigos con poca vida.", phys: 1.05, execBonus: 0.3 },
    ],
    4: [
        { id: "maestro_ritmo", name: "Maestro del ritmo", desc: "+6 % de velocidad y regeneración de maná x1,3.", speed: 0.06, regen: 1.3 },
        { id: "trovador", name: "Trovador", desc: "Curaciones y escudos un 20 % más fuertes.", heal: 1.2, shield: 1.2 },
        { id: "juglar", name: "Juglar", desc: "+10 % de daño de hechizos y tus golpes ralentizan un poco.", spell: 1.1, slowOnHit: { pct: 0.15, ms: 1200 } },
    ],
    5: [
        { id: "guardian_bosque", name: "Guardián del bosque", desc: "+12 % de vida y 6 % menos de daño recibido.", hp: 1.12, dr: 0.06 },
        { id: "cazador_naturaleza", name: "Cazador de la naturaleza", desc: "Tu daño de habilidades quema (+25 %) y ralentiza (20 %).", burn: 0.25, slowOnHit: { pct: 0.2, ms: 1500 } },
        { id: "chaman", name: "Chamán", desc: "Curaciones x1,2, regeneración de maná x1,3 y los controles duran 15 % más.", heal: 1.2, regen: 1.3, cc: 1.15 },
    ],
    6: [
        { id: "cruzado", name: "Cruzado", desc: "+8 % de daño físico y 6 % de robo de vida.", phys: 1.08, lifesteal: 0.06 },
        { id: "protector", name: "Protector", desc: "8 % menos de daño recibido y un escudo periódico (4 % cada 5 s) para aliados cercanos.", dr: 0.08, auraShield: { pct: 0.04, radius: 6, everyMs: 5000 } },
        { id: "inquisidor", name: "Inquisidor", desc: "+12 % de daño de hechizos y tus controles duran 25 % más.", spell: 1.12, cc: 1.25 },
    ],
    7: [
        { id: "francotirador", name: "Francotirador", desc: "+10 % de daño físico y +30 % de daño contra enemigos con poca vida.", phys: 1.1, execBonus: 0.3 },
        { id: "acechador", name: "Acechador", desc: "+10 % de velocidad; al matar recuperás la mitad de tu energía.", speed: 0.1, onKillResource: 0.5 },
        { id: "trampero", name: "Trampero", desc: "Tus controles duran 30 % más y tus disparos ralentizan un poco.", cc: 1.3, slowOnHit: { pct: 0.15, ms: 1000 } },
    ],
};

function kitsFor(): KitDef[] {
    return [
        { id: "ofensivo", name: "Kit ofensivo", desc: "+6 % de daño físico y de hechizos.", phys: 1.06, spell: 1.06 },
        { id: "defensivo", name: "Kit defensivo", desc: "+8 % de vida, 3 % menos de daño recibido y 4 pociones rojas extra.", hp: 1.08, dr: 0.03, redPotions: 4 },
        { id: "utilidad", name: "Kit de utilidad", desc: "+4 % de velocidad, regeneración de recurso x1,15 y 6 pociones azules extra.", speed: 0.04, regen: 1.15, bluePotions: 6 },
    ];
}

// --- campeones --------------------------------------------------------------------------------------

const t = (...ids: string[]) => ids.map((id) => TECH[id]);
const a = (...ids: number[]) => ids.map((id) => AO[id as keyof typeof AO]);

function champion(
    templateId: number,
    name: string,
    role: string,
    resource: Resource,
    pool: AbilityDef[],
    ults: AbilityDef[],
    defaultBuild: { abilities: string[]; ult: string; spec: string },
): ChampionDef {
    return {
        templateId,
        name,
        role,
        resource,
        pool: pool.map((d) => ({ ...d, resource })),
        ults: ults.map((d) => ({ ...d, resource })),
        specs: SPECS[templateId],
        kits: kitsFor(),
        defaultBuild: { ...defaultBuild, kit: "ofensivo" },
    };
}

const CHAMPIONS: Record<number, ChampionDef> = {
    0: champion(0, "Mago", "Daño en ráfaga", "mana", [...a(23, 15, 8, 24, 18), ...t("muro_fuego", "parpadeo", "escudo_arcano")], [asUlt(AO[25]), TECH.meteoros], {
        abilities: ["ao_23", "ao_15", "ao_8", "ao_24"],
        ult: "ao_25",
        spec: "archimago",
    }),
    1: champion(1, "Clérigo", "Sanador", "mana", [...a(5, 3, 10, 24, 20, 18, 15), ...t("escudo_sagrado", "sanacion_area")], [asUlt(AO[9]), TECH.intervencion_divina], {
        abilities: ["ao_5", "ao_3", "ao_10", "ao_24"],
        ult: "ao_9",
        spec: "luz_sanadora",
    }),
    2: champion(2, "Guerrero", "Tanque", "furia", t("tajo_giratorio", "carga", "grito_guerra", "golpe_aplastante", "estampida", "segundo_aliento", "escudazo", "desgarrar"), t("ejecucion", "furia_imparable"), {
        abilities: ["tajo_giratorio", "carga", "grito_guerra", "golpe_aplastante"],
        ult: "ejecucion",
        spec: "coloso",
    }),
    3: champion(3, "Asesino", "Emboscada", "energia", [...t("punalada", "humo", "veneno", "abanico_dagas", "golpe_bajo"), ...a(18, 20, 8, 24)], [TECH.ejecutar, asUlt(AO[14])], {
        abilities: ["punalada", "veneno", "ao_18", "abanico_dagas"],
        ult: "ejecutar",
        spec: "cazarrecompensas",
    }),
    4: champion(4, "Bardo", "Apoyo", "mana", [...a(3, 5, 20, 18, 24), ...t("cancion_velocidad", "himno_escudo", "disonancia")], [asUlt(AO[15]), TECH.concierto_epico], {
        abilities: ["ao_5", "ao_20", "disonancia", "ao_18"],
        ult: "ao_15",
        spec: "trovador",
    }),
    5: champion(5, "Druida", "Control", "mana", [...a(9, 24, 5, 8, 20), ...t("raices", "enjambre", "forma_corteza")], [asUlt(AO[15]), TECH.ira_naturaleza], {
        abilities: ["ao_9", "ao_24", "ao_5", "ao_8"],
        ult: "ao_15",
        spec: "guardian_bosque",
    }),
    6: champion(6, "Paladín", "Combatiente", "mana", [...t("golpe_sagrado", "escudo_divino", "juicio", "aura_coraje"), ...a(3, 5, 10, 8, 20)], [TECH.martillo_redencion, asUlt(AO[24])], {
        abilities: ["golpe_sagrado", "escudo_divino", "ao_5", "ao_10"],
        ult: "martillo_redencion",
        spec: "cruzado",
    }),
    7: champion(7, "Cazador", "Tirador", "energia", t("disparo_certero", "lluvia_flechas", "trampa", "voltereta", "disparo_ralentizante", "camuflaje", "disparo_multiple"), t("flecha_cazadora", "tormenta_flechas"), {
        abilities: ["disparo_certero", "lluvia_flechas", "trampa", "voltereta"],
        ult: "flecha_cazadora",
        spec: "francotirador",
    }),
};

module.exports = { CHAMPIONS, TECH, AO_ABILITIES: AO, NORMAL_RANKS, ULT_RANKS };
