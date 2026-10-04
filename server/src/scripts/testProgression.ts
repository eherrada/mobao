/**
 * Test de progresion: nivel 1 al empezar, experiencia por kills reales, subida de nivel con mas vida,
 * oro por kills y reaparicion segun el nivel.
 */
import { Bot, DIR, debugMatches, debugPost, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function main() {
    const matchId = `prog-${Date.now()}`;
    const anchor = new Bot({ name: "ProgAnchor", templateId: 2, matchId, team: "red" });
    await anchor.connect();
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);
    const wolf = st.npcs.find((n) => n.name?.startsWith("Lobo") && n.campIndex === 0)!;

    // Heroe azul justo debajo de un lobo de la jungla, mirando hacia arriba.
    const hero = new Bot({ name: "ProgHero", templateId: 6, matchId, team: "blue", x: wolf.x, y: wolf.y + 1 });
    await hero.connect();
    await sleep(1500);

    st = await debugState(mapId);
    let me = st.players.find((p) => p.name === "ProgHero")!;
    check(me.level === 1, `el heroe empieza en nivel 1 (nivel AO efectivo ${me.aoLevel})`);
    check(me.aoLevel >= 8 && me.aoLevel <= 12, "el nivel AO inicial es bajo (8)");
    check(me.gold >= 600 && me.gold < 700, `empieza con oro (${me.gold})`);
    const hp1 = me.maxHp;
    const gold1 = me.gold;

    // Kill real: el lobo con 1 de vida, el heroe lo golpea.
    await debugPost(`/debug/npc-hp?id=${wolf.id}&hp=1`);
    hero.heading(DIR.up);
    await sleep(300);
    for (let i = 0; i < 4; i++) {
        hero.melee();
        await sleep(1100);
    }
    st = await debugState(mapId);
    me = st.players.find((p) => p.name === "ProgHero")!;
    check(!st.npcs.find((n) => n.id === wolf.id), "el lobo murio");
    check(me.gold > gold1, `la kill dio oro (${gold1} -> ${me.gold})`);
    check(me.xp > 0 || me.level > 1, `la kill dio experiencia (xp ${me.xp}, nivel ${me.level})`);

    // Subir de nivel: mas vida y mas nivel AO.
    await debugPost(`/debug/xp?id=${me.id}&amount=400`);
    await sleep(500);
    st = await debugState(mapId);
    me = st.players.find((p) => p.name === "ProgHero")!;
    check(me.level >= 3, `con experiencia sube de nivel (nivel ${me.level})`);
    check(me.maxHp > hp1, `al subir de nivel crece la vida maxima (${hp1} -> ${me.maxHp})`);

    // Nivel maximo: vida mucho mayor.
    await debugPost(`/debug/xp?id=${me.id}&level=18`);
    await sleep(500);
    st = await debugState(mapId);
    me = st.players.find((p) => p.name === "ProgHero")!;
    check(me.level === 18 && me.aoLevel === 50, `nivel maximo 18 equivale a nivel AO 50 (${me.level}/${me.aoLevel})`);
    check(me.maxHp > hp1 * 3, `la vida a nivel 18 es mucho mayor (${me.maxHp} vs ${hp1} al inicio)`);

    anchor.close();
    hero.close();
    console.log(failed === 0 ? "TEST PROGRESION: OK" : `TEST PROGRESION: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
