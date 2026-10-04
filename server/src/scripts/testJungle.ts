/**
 * Test de jungla: monstruos neutrales con agro compartido, bendiciones (Centinela/Zarza/Dragon/Rey Demonio),
 * reaparicion y objetivos neutrales sobre el rio.
 * Servidor en desarrollo con restart-server.ps1 -Fast (jungla 5 s, objetivos x0.03, bendiciones x0.25).
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

async function killAll(hero: Bot, mapId: number, id: number, tries = 12) {
    for (let i = 0; i < tries; i++) {
        const st = await debugState(mapId);
        if (!st.npcs.find((n) => n.id === id)) return;
        hero.melee();
        await sleep(1100);
    }
}

async function main() {
    const matchId = `jg-${Date.now()}`;
    const anchor = new Bot({ name: "JgAnchor", templateId: 6, matchId, team: "blue" });
    await anchor.connect();
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);

    // --- Distribucion de la jungla -----------------------------------------------------------------
    const jungle = st.npcs.filter((n) => n.name?.includes("de la Jungla"));
    const count = (re: RegExp) => jungle.filter((n) => re.test(n.name)).length;
    check(count(/Centinela/) === 2, `2 Centinelas (uno por lado) (${count(/Centinela/)})`);
    check(count(/Zarza/) === 2, `2 Zarzas Rojas (${count(/Zarza/)})`);
    check(count(/Lobo Alfa/) === 4, `4 Lobos Alfa (${count(/Lobo Alfa/)})`);
    check(count(/Golem/) === 4, `4 Golems (${count(/Golem/)})`);
    check(count(/Escorpion/) === 8, `8 Escorpiones (${count(/Escorpion/)})`);
    check(count(/Dragon|Rey Demonio/) === 0, "el Dragon y el Rey Demonio aun no aparecieron");
    check(jungle.every((n) => n.team == null), "la jungla es neutral");

    // --- Combate con agro compartido (Centinela) ---------------------------------------------------
    const sentinel = jungle.find((n) => /Centinela/.test(n.name) && n.team == null && n.x < 128)!;
    const hero = new Bot({ name: "JgHero", templateId: 6, matchId, team: "blue", x: sentinel.x, y: sentinel.y + 1, level: 18 });
    await hero.connect();
    await sleep(3000);

    st = await debugState(mapId);
    let me = st.players.find((p) => p.name === "JgHero")!;
    check(me.hp === me.maxHp, "los monstruos no atacan a un heroe que no los golpeo");

    const physBefore = me.physMult as number;
    hero.heading(DIR.up);
    await sleep(300);
    hero.melee();
    await sleep(1500);
    st = await debugState(mapId);
    me = st.players.find((p) => p.name === "JgHero")!;
    check(me.hp < me.maxHp, `el monstruo respondio al ataque (hp ${me.hp}/${me.maxHp})`);

    // --- Matar al Centinela: bendicion de equipo de heroe ----------------------------------------------------
    await debugPost(`/debug/npc-hp?id=${sentinel.id}&hp=1`);
    await killAll(hero, mapId, sentinel.id);
    st = await debugState(mapId);
    check(!st.npcs.find((n) => n.id === sentinel.id), "el Centinela murio");
    me = st.players.find((p) => p.name === "JgHero")!;
    check(Array.isArray(me.buffs) && me.buffs.includes("sentinel"), `el heroe tiene la bendicion del Centinela (${me.buffs})`);
    check((me.spellMult as number) > (physBefore as number) * 1.2, `sube el dano de hechizos (${me.spellMult})`);

    // --- Objetivos neutrales ----------------------------------------------------------------------------
    // Con MOBA_OBJ_SCALE 0.03 el dragon aparece a los ~4.5 s y el Rey Demonio a los ~12.6 s desde la partida.
    await sleep(9000);
    st = await debugState(mapId);
    const drake = st.npcs.find((n) => /Dragon del Rio/.test(n.name ?? ""));
    const baron = st.npcs.find((n) => /Rey Demonio/.test(n.name ?? ""));
    check(drake, "el Dragon del Rio aparecio en su claro del rio");
    check(baron, "el Rey Demonio aparecio en su claro del rio");
    check(drake && drake.team == null && drake.x > 128, `el dragon esta en el lado bot del rio (${drake?.x},${drake?.y})`);
    check(baron && baron.x < 128, `el Rey Demonio esta en el lado top del rio (${baron?.x},${baron?.y})`);

    // Dragon: bendicion de equipo acumulable. Se mata con el heroe parado a su lado (nivel 18).
    if (drake) {
        const striker = new Bot({ name: "JgDrake", templateId: 2, matchId, team: "blue", x: drake.x, y: drake.y + 1, level: 18 });
        await striker.connect();
        await sleep(500);
        await debugPost(`/debug/npc-hp?id=${drake.id}&hp=1`);
        striker.heading(DIR.up);
        await killAll(striker, mapId, drake.id, 6);
        st = await debugState(mapId);
        check(!st.npcs.find((n) => n.id === drake.id), "el Dragon murio");
        const mate = st.players.find((p) => p.name === "JgHero")!;
        check(mate.physMult && (mate.physMult as number) > 1, `todo el equipo recibe la bendicion del dragon (fisico x${mate.physMult})`);
        striker.close();
    }

    // Reaparicion de un campamento comun
    const wolves = st.npcs.find((n) => n.name?.startsWith("Lobo Alfa") && n.team == null);
    if (wolves) {
        await debugPost(`/debug/npc-hp?id=${wolves.id}&hp=1`);
        const h2 = new Bot({ name: "JgWolf", templateId: 2, matchId, team: "red", x: wolves.x, y: wolves.y + 1, level: 18 });
        await h2.connect();
        h2.heading(DIR.up);
        await killAll(h2, mapId, wolves.id, 6);
        await sleep(7000);
        st = await debugState(mapId);
        check(
            st.npcs.find((n) => n.name?.startsWith("Lobo Alfa") && n.campIndex === wolves.campIndex),
            "el Lobo Alfa reaparecio en su campamento",
        );
        h2.close();
    }

    anchor.close();
    hero.close();
    console.log(failed === 0 ? "TEST JUNGLA: OK" : `TEST JUNGLA: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
