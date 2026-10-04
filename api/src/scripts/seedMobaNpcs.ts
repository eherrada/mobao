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
    hp: 450,
    maxHp: 450,
    def: 5,
    defM: 5,
    magicDef: 0,
    minHit: 18,
    maxHit: 26,
    exp: 60,
    gold: 20,
    stationary: 0,
    structure: "minion",
    aggroRange: 7,
    attackIntervalMs: 1200,
    moveIntervalMs: 250,
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

const templates = [
    { id: 9601, data: { ...tower, name: "Torre Azul", idBody: 554, team: "blue" } },
    { id: 9602, data: { ...tower, name: "Torre Roja", idBody: 181, team: "red" } },
    { id: 9603, data: { ...nexus, name: "Nexo Azul", idBody: 542, team: "blue" } },
    { id: 9604, data: { ...nexus, name: "Nexo Rojo", idBody: 394, team: "red" } },
    { id: 9605, data: { ...minion, name: "Minion Azul", idBody: 15, team: "blue" } },
    { id: 9606, data: { ...minion, name: "Minion Rojo", idBody: 170, team: "red" } },
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
