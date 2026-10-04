import pool from "../db";
import { upsertGameNpc } from "../repositories/gameNpcs";

// Plantillas del MOBA. movement 20 = NPC controlado por la IA del MOBA (server/src/moba/ai.ts);
// la IA clasica de aoweb (movement 3) los ignora. Los cuerpos son provisorios (sprites de NPCs existentes).
const TOWER_PROJECTILE_SPELL_ID = 23; // Descarga Eléctrica (solo el efecto visual del proyectil)

const common = {
    npcType: 0,
    idHead: 0,
    movement: 20,
    exp: 0,
    gold: 0,
    poderAtaque: 100,
    poderEvasion: 0,
    magicResistance: 0,
    aguaValida: 0,
    tierraInvalida: 0,
    noRespawn: 1,
};

const tower = {
    ...common,
    hp: 4000,
    maxHp: 4000,
    def: 30,
    defM: 30,
    magicDef: 30,
    minHit: 55,
    maxHit: 75,
    stationary: 1,
    structure: "tower",
    attackRange: 9,
    attackIntervalMs: 1500,
    projectileSpell: TOWER_PROJECTILE_SPELL_ID,
};

const nexus = {
    ...common,
    hp: 8000,
    maxHp: 8000,
    def: 40,
    defM: 40,
    magicDef: 40,
    minHit: 0,
    maxHit: 0,
    stationary: 1,
    structure: "nexus",
};

const minion = {
    ...common,
    hp: 260,
    maxHp: 260,
    def: 3,
    defM: 3,
    magicDef: 0,
    minHit: 24,
    maxHit: 34,
    exp: 55,
    gold: 60,
    stationary: 0,
    structure: "minion",
    aggroRange: 7,
    attackIntervalMs: 1000,
    moveIntervalMs: 200,
    minionKind: "melee",
};

// Minion mago: ataca a distancia (alcance 5) y se queda detras de los de cuerpo a cuerpo.
const casterMinion = {
    ...minion,
    hp: 170,
    maxHp: 170,
    def: 0,
    defM: 0,
    minHit: 22,
    maxHit: 30,
    exp: 50,
    gold: 55,
    aggroRange: 7,
    attackRange: 5,
    attackIntervalMs: 1300,
    projectileSpell: 2, // Dardo Magico (efecto visual)
    minionKind: "caster",
};

// Minion de asedio: aparece cada 3 oleadas; mucho mas vida, alcance 6 y golpe fuerte.
const cannonMinion = {
    ...minion,
    hp: 700,
    maxHp: 700,
    def: 8,
    defM: 8,
    minHit: 46,
    maxHit: 62,
    exp: 120,
    gold: 180,
    aggroRange: 8,
    attackRange: 6,
    attackIntervalMs: 1500,
    moveIntervalMs: 260,
    projectileSpell: 23, // Descarga Electrica (efecto visual)
    minionKind: "cannon",
};

// Mercader de cada base: usa el sistema de comercio de AO (doble click). Precio = valor del objeto.
const SHOP_ITEMS = [38, 37, 36, 39, 645, 123, 19, 665, 479, 885, 890, 521, 128, 131, 1001, 238, 196];

const shop = {
    ...common,
    npcType: 10,
    idHead: 303,
    movement: 1,
    hp: 0,
    maxHp: 0,
    minHit: 0,
    maxHit: 0,
    def: 0,
    noRespawn: 1,
    stationary: 1,
    invulnerable: 1,
    structure: "shop",
    desc: "Compra equipo con el oro de la partida.",
    objs: SHOP_ITEMS.map((item) => ({ cant: 1, item })),
};

// Monstruos de la jungla: neutrales (sin equipo), atacan solo a quien los golpea y vuelven a su campamento.
const jungleSmall = {
    ...common,
    movement: 20,
    hp: 380,
    maxHp: 380,
    def: 6,
    defM: 6,
    magicDef: 0,
    minHit: 20,
    maxHit: 30,
    exp: 40,
    gold: 75,
    structure: "jungle",
    leash: 12,
    attackIntervalMs: 1300,
    moveIntervalMs: 300,
};

const jungleBig = {
    ...jungleSmall,
    hp: 1400,
    maxHp: 1400,
    def: 12,
    minHit: 35,
    maxHit: 55,
    exp: 110,
    gold: 270,
    buff: 1,
};

// Monstruos con bendicion y objetivos neutrales (ver server/src/moba/buffs.ts).
const spiderling = { ...jungleSmall, hp: 260, maxHp: 260, minHit: 14, maxHit: 22, exp: 30, gold: 55 };
const wolfAlpha = { ...jungleSmall, hp: 700, maxHp: 700, def: 8, minHit: 28, maxHit: 40, exp: 80, gold: 140 };
const golem = { ...jungleSmall, hp: 1200, maxHp: 1200, def: 14, minHit: 32, maxHit: 48, exp: 100, gold: 190, attackIntervalMs: 1500 };
const scorpion = { ...jungleSmall, hp: 340, maxHp: 340, def: 4, minHit: 18, maxHit: 28, exp: 36, gold: 70, moveIntervalMs: 260 };
const sentinel = {
    ...jungleSmall,
    hp: 1900,
    maxHp: 1900,
    def: 14,
    defM: 14,
    minHit: 38,
    maxHit: 58,
    exp: 150,
    gold: 150,
    attackIntervalMs: 1400,
    buffId: "sentinel",
};
const bramble = { ...sentinel, minHit: 42, maxHit: 62, buffId: "bramble" };
const crab = {
    ...jungleSmall,
    hp: 650,
    maxHp: 650,
    def: 10,
    minHit: 12,
    maxHit: 20,
    exp: 70,
    gold: 80,
    leash: 6,
    moveIntervalMs: 260,
    buffId: "crab",
};
const drake = {
    ...jungleSmall,
    hp: 4200,
    maxHp: 4200,
    def: 20,
    defM: 20,
    minHit: 60,
    maxHit: 90,
    exp: 300,
    gold: 200,
    leash: 14,
    attackIntervalMs: 1600,
    buffId: "drake",
};
const baron = {
    ...drake,
    hp: 9000,
    maxHp: 9000,
    def: 28,
    defM: 28,
    minHit: 95,
    maxHit: 140,
    exp: 500,
    gold: 300,
    attackIntervalMs: 1400,
    buffId: "baron",
};

const dummy = {
    ...common,
    hp: 6000,
    maxHp: 6000,
    def: 0,
    defM: 0,
    magicDef: 0,
    minHit: 0,
    maxHit: 0,
    stationary: 1,
    structure: "dummy",
};

// Barracas: punto de aparicion de los minions de cada carril (decorativas e invulnerables).
const barracks = {
    ...common,
    hp: 5000,
    maxHp: 5000,
    def: 0,
    defM: 0,
    magicDef: 0,
    minHit: 0,
    maxHit: 0,
    stationary: 1,
    invulnerable: 1,
    structure: "barracks",
};

const templates = [
    { id: 9601, data: { ...tower, name: "Torre Azul", idBody: 554, team: "blue" } },
    { id: 9602, data: { ...tower, name: "Torre Roja", idBody: 181, team: "red" } },
    { id: 9603, data: { ...nexus, name: "Nexo Azul", idBody: 542, team: "blue" } },
    { id: 9604, data: { ...nexus, name: "Nexo Rojo", idBody: 394, team: "red" } },
    { id: 9605, data: { ...minion, name: "Minion Azul", idBody: 15, team: "blue" } },
    { id: 9606, data: { ...minion, name: "Minion Rojo", idBody: 170, team: "red" } },
    { id: 9608, data: { ...jungleSmall, name: "Lobo de la Jungla", idBody: 10 } },
    { id: 9620, data: { ...sentinel, name: "Centinela Azul de la Jungla", idBody: 206 } },
    { id: 9621, data: { ...bramble, name: "Zarza Roja de la Jungla", idBody: 41 } },
    { id: 9622, data: { ...wolfAlpha, name: "Lobo Alfa de la Jungla", idBody: 10 } },
    { id: 9623, data: { ...golem, name: "Golem de Piedra de la Jungla", idBody: 141 } },
    { id: 9624, data: { ...scorpion, name: "Escorpion de la Jungla", idBody: 51 } },
    { id: 9626, data: { ...spiderling, name: "Aranita de la Jungla", idBody: 534 } },
    { id: 9628, data: { ...crab, name: "Tortuga del Rio de la Jungla", idBody: 74 } },
    { id: 9629, data: { ...drake, name: "Dragon del Rio de la Jungla", idBody: 218 } },
    { id: 9630, data: { ...baron, name: "Rey Demonio de la Jungla", idBody: 83 } },
    { id: 9609, data: { ...jungleBig, name: "Ogro de la Jungla", idBody: 76 } },
    { id: 9610, data: { ...dummy, name: "Muñeco de Práctica", idBody: 196, team: "red" } },
    { id: 9611, data: { ...casterMinion, name: "Minion Mago Azul", idBody: 130, idHead: 6, team: "blue" } },
    { id: 9612, data: { ...casterMinion, name: "Minion Mago Rojo", idBody: 129, idHead: 202, team: "red" } },
    { id: 9613, data: { ...cannonMinion, name: "Minion de Asedio Azul", idBody: 76, team: "blue" } },
    { id: 9614, data: { ...cannonMinion, name: "Minion de Asedio Rojo", idBody: 205, team: "red" } },
    { id: 9615, data: { ...barracks, name: "Barraca Azul", idBody: 543, team: "blue" } },
    { id: 9616, data: { ...barracks, name: "Barraca Roja", idBody: 153, team: "red" } },
    { id: 9607, data: { ...shop, name: "Mercader del Nexo", idBody: 180, team: "blue" } },
];

async function main() {
    for (const { id, data } of templates) {
        const result = await upsertGameNpc(id, data);
        console.log(`npc ${id} ${data.name}: ${result.unchanged ? "sin cambios" : "guardado"}`);
    }
    await pool.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
