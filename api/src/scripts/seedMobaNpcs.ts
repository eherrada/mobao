import pool from "../db";
import { upsertGameNpc } from "../repositories/gameNpcs";

// Plantillas del MOBA. Cuerpos provisorios: reutilizan sprites de NPCs existentes.
const TOWER_SPELL_ID = 23; // Descarga Eléctrica (tiene proyectil visual)

const common = {
    npcType: 0,
    idHead: 0,
    movement: 3,
    exp: 0,
    gold: 0,
    minHit: 0,
    maxHit: 0,
    poderAtaque: 100,
    poderEvasion: 0,
    magicResistance: 0,
    stationary: 1,
    noRespawn: 1,
    aguaValida: 0,
    tierraInvalida: 0,
};

const tower = {
    ...common,
    hp: 4000,
    maxHp: 4000,
    def: 30,
    defM: 30,
    magicDef: 30,
    structure: "tower",
    spellRange: 9,
    spellCastIntervalMs: 1800,
    spells: [{ idSpell: TOWER_SPELL_ID, cooldownSeconds: 0 }],
};

const nexus = {
    ...common,
    hp: 8000,
    maxHp: 8000,
    def: 40,
    defM: 40,
    magicDef: 40,
    structure: "nexus",
    spells: [],
};

const templates = [
    { id: 9601, data: { ...tower, name: "Torre Azul", idBody: 554, team: "blue" } },
    { id: 9602, data: { ...tower, name: "Torre Roja", idBody: 181, team: "red" } },
    { id: 9603, data: { ...nexus, name: "Nexo Azul", idBody: 542, team: "blue" } },
    { id: 9604, data: { ...nexus, name: "Nexo Rojo", idBody: 394, team: "red" } },
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
