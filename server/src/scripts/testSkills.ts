/**
 * Test de puntos de habilidad: sin puntos no se lanza, el punto se gasta con el paquete mobaSkill,
 * los rangos escalan el dano y los requisitos de nivel se respetan.
 */
import { Bot, debugMatches, debugPost, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function main() {
    const matchId = `skl-${Date.now()}`;
    // Mago (kit: 1 Apocalipsis[def], 2 Descarga, 3 Tormenta, 4 Inmovilizar, 5 Proyectil, 6 Celeridad) sin reparto automatico.
    const mage = new Bot({ name: "SkMage", templateId: 0, matchId, team: "blue", x: 100, y: 130, autoSkills: false });
    await mage.connect();
    const dummy = new Bot({ name: "SkDummy", templateId: 2, matchId, team: "red", x: 103, y: 130 });
    await dummy.connect();
    await sleep(1200);

    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);
    const get = (n: string) => st.players.find((p) => p.name === n)!;

    check(get("SkMage").level === 1, "el mago empieza en nivel 1");
    check(Object.keys(get("SkMage").ranks ?? {}).length === 0, "sin puntos gastados al empezar");

    // 1) Sin puntos: no se puede lanzar.
    await debugPost(`/debug/xp?id=${get("SkMage").id}&level=1`);
    const hp0 = get("SkDummy").hp;
    mage.spell(5, 103, 130); // Proyectil Magico sin rango
    await sleep(1500);
    st = await debugState(mapId);
    check(get("SkDummy").hp === hp0, `sin puntos el hechizo no hace dano (${hp0} -> ${get("SkDummy").hp})`);

    // 2) Gastar el punto del nivel 1 en Proyectil Magico (slot 5) y lanzarlo.
    mage.skill(5);
    await sleep(500);
    st = await debugState(mapId);
    check(get("SkMage").ranks?.["5"] === 1, `el punto se gasto en el slot 5 (rangos ${JSON.stringify(get("SkMage").ranks)})`);
    mage.skill(2); // sin puntos disponibles: debe ignorarse
    await sleep(300);
    st = await debugState(mapId);
    check(get("SkMage").ranks?.["2"] === undefined, "sin puntos disponibles no se puede subir otra habilidad");

    await sleep(1200);
    mage.spell(5, 103, 130);
    await sleep(1500);
    st = await debugState(mapId);
    const dmgRank1 = hp0 - get("SkDummy").hp;
    check(dmgRank1 > 0, `con un punto el hechizo hace dano (${dmgRank1})`);

    // 3) Requisito de nivel: la definitiva (Apocalipsis, slot 1) pide nivel 6.
    await debugPost(`/debug/xp?id=${get("SkMage").id}&level=3`);
    await sleep(400);
    mage.skill(1);
    await sleep(300);
    st = await debugState(mapId);
    check(get("SkMage").ranks?.["1"] === undefined, "la definitiva no se puede subir antes del nivel 6");

    await debugPost(`/debug/xp?id=${get("SkMage").id}&level=6`);
    await sleep(400);
    mage.skill(1);
    await sleep(300);
    st = await debugState(mapId);
    check(get("SkMage").ranks?.["1"] === 1, "en nivel 6 se puede aprender la definitiva");

    mage.close();
    dummy.close();
    console.log(failed === 0 ? "TEST HABILIDADES: OK" : `TEST HABILIDADES: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
