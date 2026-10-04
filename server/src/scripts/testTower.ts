/**
 * Test: una torre enemiga dispara a un heroe y puede ser destruida (no reaparece).
 * Requiere servidor en desarrollo en :7666 con el mapa 600.
 */
import { Bot, DIR, debugState, sleep } from "./botClient";

function assert(cond: unknown, msg: string) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exit(1);
    }
    console.log(`ok: ${msg}`);
}

async function main() {
    const before = await debugState();
    const towers = before.npcs.filter((n) => n.structure === "tower");
    assert(towers.length === 16, `hay 16 torres (hay ${towers.length})`);
    assert(before.npcs.filter((n) => n.structure === "nexus").length === 2, "hay 2 nexos");

    const tower = towers.find((t) => t.team === "red" && t.x === 218 && t.y === 37);
    assert(tower, "torre roja de base en (218,37)");
    const towerId = tower!.id;

    // Heroe (Guerrero = template 3) justo debajo de la torre, mirando hacia arriba.
    const bot = new Bot({ name: "TestHero", templateId: 3, mapId: 600, x: 218, y: 38 });
    await bot.connect();
    await sleep(1500);

    const mid = await debugState();
    const hero = mid.players.find((p) => p.name === "TestHero");
    assert(hero, "el heroe entro al mapa 600");
    assert(hero!.hp < hero!.maxHp, `la torre disparo al heroe (hp ${hero!.hp}/${hero!.maxHp})`);

    await fetch(`http://127.0.0.1:7666/debug/npc-hp?id=${towerId}&hp=1`, { method: "POST" });
    bot.heading(DIR.up);
    await sleep(300);
    for (let i = 0; i < 6; i++) {
        bot.melee();
        await sleep(1100);
    }

    const after = await debugState();
    assert(!after.npcs.find((n) => n.id === towerId), "la torre destruida desaparecio del mundo");
    assert(
        after.npcs.filter((n) => n.structure === "tower").length === 15,
        "quedan 15 torres (no reaparecio)",
    );

    bot.close();
    console.log("TEST TORRE: OK");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
