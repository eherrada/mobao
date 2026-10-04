export {};
const vars = require("../vars");
const balance = require("../balance");
const config = require("./config");
const heroes = require("./heroes");

/**
 * Progresion del MOBA (estilo LoL): los heroes empiezan en nivel 1 y suben hasta MAX_LEVEL con experiencia.
 *
 * Para reutilizar las formulas de AO (vida, mana, golpe, bonus de hechizos, requisito de habilidad = nivel*3),
 * el nivel MOBA se mapea a un "nivel AO" efectivo entre AO_MIN_LEVEL y 50, que es el que se guarda en
 * user.level. Asi los hechizos se desbloquean solos (p. ej. Paralizar en el nivel MOBA 5, Apocalipsis en el 12).
 */
const MAX_LEVEL = 18;
const AO_MIN_LEVEL = 8;
const AO_MAX_LEVEL = 50;

const XP_SCALE = Number(process.env.MOBA_XP_SCALE) || 1;
const XP_SHARE_RANGE = 14;

function aoLevel(mobaLevel: number): number {
    const l = Math.min(MAX_LEVEL, Math.max(1, mobaLevel));
    return Math.round(AO_MIN_LEVEL + ((l - 1) * (AO_MAX_LEVEL - AO_MIN_LEVEL)) / (MAX_LEVEL - 1));
}

/** Experiencia para pasar de `level` a `level + 1`. */
function xpToNext(level: number): number {
    return Math.round((150 + 60 * (level - 1)) * XP_SCALE);
}

/** Reaparicion: crece con el nivel (si MOBA_RESPAWN_MS esta definido se usa fijo, para los tests). */
function respawnMs(level: number): number {
    if (process.env.MOBA_RESPAWN_MS) return config.TIMING.heroRespawnMs;
    return 6000 + 1500 * (level - 1);
}

/** Recalcula vida/mana/golpe segun el nivel actual, conservando la proporcion de vida y mana. */
function applyLevelStats(hero: any) {
    const ao = aoLevel(hero.mobaLevel);
    const stats = heroes.statsFor(hero.mobaTemplateId ?? 0);
    const hpRatio = hero.maxHp > 0 ? hero.hp / hero.maxHp : 1;
    const manaRatio = hero.maxMana > 0 ? hero.mana / hero.maxMana : 1;

    hero.level = ao;
    hero.maxHp = Math.round(balance.getMaxHpForLevel(hero.idClase, hero.attrConstitucion, ao) * stats.hp);
    hero.maxMana = balance.getMaxManaForLevel(hero.idClase, hero.attrInteligencia, ao);
    hero.minHit = balance.getMinHitForLevel(hero.idClase, ao);
    hero.maxHit = balance.getMaxHitForLevel(hero.idClase, ao);

    if (!hero.dead) {
        // Al subir de nivel se gana el aumento de vida/mana (no se cura por completo).
        hero.hp = Math.min(hero.maxHp, Math.max(1, Math.round(hero.maxHp * hpRatio)));
        hero.mana = Math.min(hero.maxMana, Math.round(hero.maxMana * manaRatio));
    }

    hero.expNextLevel = xpToNext(hero.mobaLevel);
    hero.exp = hero.mobaXp ?? 0;
}

function syncClient(hero: any) {
    const client = vars.clients[hero.id];

    if (!client) return;

    const handleProtocol = require("../handleProtocol");
    const socket = require("../socket");

    handleProtocol.sendMyCharacter(hero);
    socket.send(client);
}

/** Inicializa la progresion de un heroe recien creado (el login ya dejo el nivel AO correspondiente). */
function initHero(hero: any, startLevel = 1) {
    hero.mobaLevel = Math.min(MAX_LEVEL, Math.max(1, startLevel));
    hero.mobaXp = 0;
    hero.exp = 0;
    hero.expNextLevel = xpToNext(hero.mobaLevel);
}

function grantXp(hero: any, amount: number) {
    if (!hero || hero.cerrado || amount <= 0 || hero.mobaLevel >= MAX_LEVEL) return;

    hero.mobaXp += Math.round(amount);
    let leveled = false;

    while (hero.mobaLevel < MAX_LEVEL && hero.mobaXp >= xpToNext(hero.mobaLevel)) {
        hero.mobaXp -= xpToNext(hero.mobaLevel);
        hero.mobaLevel++;
        leveled = true;
    }

    if (hero.mobaLevel >= MAX_LEVEL) hero.mobaXp = 0;

    applyLevelStats(hero);

    const client = vars.clients[hero.id];

    if (leveled) {
        syncClient(hero);

        if (client) {
            require("../handleProtocol").console(
                `[MOBA] ¡Subiste al nivel ${hero.mobaLevel}!`,
                "green",
                1,
                0,
                client,
            );
        }
    } else if (client) {
        require("../handleProtocol").actExp(hero.exp, client);
    }
}

function setLevel(hero: any, level: number) {
    hero.mobaLevel = Math.min(MAX_LEVEL, Math.max(1, level));
    hero.mobaXp = 0;
    applyLevelStats(hero);
    syncClient(hero);
}

/** XP compartida entre los heroes vivos del equipo cercanos a un punto (como en LoL: se reparte entre todos). */
function awardXpNear(team: string, pos: { x: number; y: number }, mapId: number, amount: number, range = XP_SHARE_RANGE) {
    const recipients: any[] = [];

    for (const id in vars.personajes) {
        const h = vars.personajes[id];

        if (
            h &&
            h.mobaTeam === team &&
            h.map === mapId &&
            !h.cerrado &&
            !h.dead &&
            Math.abs(h.pos.x - pos.x) + Math.abs(h.pos.y - pos.y) <= range
        ) {
            recipients.push(h);
        }
    }

    if (recipients.length === 0) return;

    const n = recipients.length;
    const share = (amount * (1 + 0.2 * (n - 1))) / n;

    for (const h of recipients) grantXp(h, share);
}

function grantGold(hero: any, amount: number) {
    if (!hero || hero.cerrado || amount <= 0) return;

    const client = vars.clients[hero.id];

    hero.gold = balance.clampGold(Number(hero.gold ?? 0) + Math.round(amount));

    if (client) require("../handleProtocol").actGold(hero.gold, client);
}

module.exports = {
    MAX_LEVEL,
    aoLevel,
    xpToNext,
    respawnMs,
    initHero,
    applyLevelStats,
    grantXp,
    setLevel,
    awardXpNear,
    grantGold,
};
