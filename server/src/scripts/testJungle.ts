/**
 * Test de jungla: los monstruos solo atacan a quien los golpea, dan buff al morir el grande y reaparecen.
 * Servidor en desarrollo con MOBA_JUNGLE_RESPAWN_MS=5000 (restart-server.ps1 -Fast).
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
    const matchId = `jg-${Date.now()}`;
    // Primero un heroe en la base para crear la partida y conocer los campamentos.
    const anchor = new Bot({ name: "JgAnchor", templateId: 6, matchId, team: "blue" });
    await anchor.connect();
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);

    const jungle = st.npcs.filter((n) => n.name?.includes("Jungla"));
    check(jungle.length === 14 * 3, `hay ${jungle.length} monstruos de jungla (14 campamentos x 3)`);

    const ogre = jungle.find((n) => n.name.startsWith("Ogro") && n.campIndex === 0)!;
    const hero = new Bot({ name: "JgHero", templateId: 6, matchId, team: "blue", x: ogre.x, y: ogre.y + 1 });
    await hero.connect();
    await sleep(3500);

    st = await debugState(mapId);
    let me = st.players.find((p) => p.name === "JgHero")!;
    check(me.hp === me.maxHp, "los monstruos no atacan a un heroe que no los golpeo");

    const strBefore = me.str as number;
    hero.heading(DIR.up);
    await sleep(300);
    for (let i = 0; i < 4; i++) {
        hero.melee();
        await sleep(1100);
    }
    st = await debugState(mapId);
    me = st.players.find((p) => p.name === "JgHero")!;
    const ogreNow = st.npcs.find((n) => n.id === ogre.id)!;
    check(ogreNow.hp < ogreNow.maxHp, `el heroe daño al ogro (${ogreNow.hp}/${ogreNow.maxHp})`);
    check(me.hp < me.maxHp, `el ogro respondio al ataque (hp heroe ${me.hp}/${me.maxHp})`);

    // Matar al ogro grande: buff y reaparicion.
    await debugPost(`/debug/npc-hp?id=${ogre.id}&hp=1`);
    for (let i = 0; i < 4; i++) {
        hero.melee();
        await sleep(1100);
    }
    st = await debugState(mapId);
    check(!st.npcs.find((n) => n.id === ogre.id), "el ogro murio");
    me = st.players.find((p) => p.name === "JgHero")!;
    check((me.str as number) > strBefore, `el heroe recibio el buff de fuerza (${strBefore} -> ${me.str})`);

    await sleep(7000);
    st = await debugState(mapId);
    const respawned = st.npcs.find((n) => n.name?.startsWith("Ogro") && n.campIndex === 0);
    check(respawned, "el ogro reaparecio en su campamento");
    check(respawned && respawned.hp === respawned.maxHp, "con la vida completa");

    anchor.close();
    hero.close();
    console.log(failed === 0 ? "TEST JUNGLA: OK" : `TEST JUNGLA: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
