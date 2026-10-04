/**
 * Test de fog of war: un heroe no recibe (ni por paquetes) a los enemigos fuera de su vision.
 * Servidor en desarrollo en :7666.
 */
import { Bot, DIR, debugMatches, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function hiddenFor(viewerId: number): Promise<number[]> {
    const res = await fetch(`http://127.0.0.1:7666/debug/fog?viewer=${viewerId}`);
    return ((await res.json()) as { hidden: number[] }).hidden;
}

async function main() {
    const matchId = `fog-${Date.now()}`;

    // Heroe azul observador en medio del mapa; un rojo lejos (fuera de AOI) y otro rojo a 12 tiles (dentro del AOI, fuera de vision).
    const viewer = new Bot({ name: "FogViewer", templateId: 2, matchId, team: "blue", x: 100, y: 130 });
    await viewer.connect();
    const far = new Bot({ name: "FogFar", templateId: 2, matchId, team: "red", x: 220, y: 40 });
    await far.connect();
    const near = new Bot({ name: "FogNear", templateId: 2, matchId, team: "red", x: 112, y: 130 });
    await near.connect();
    const ally = new Bot({ name: "FogAlly", templateId: 2, matchId, team: "blue", x: 96, y: 130 });
    await ally.connect();
    await sleep(1500);

    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    const st = await debugState(mapId);
    const id = (name: string) => st.players.find((p) => p.name === name)!.id as number;
    const viewerId = id("FogViewer");

    const hidden = await hiddenFor(viewerId);
    check(hidden.includes(id("FogFar")), "enemigo lejano oculto por el servidor");
    check(hidden.includes(id("FogNear")), "enemigo a 12 tiles (fuera de vision, dentro del AOI) oculto");
    check(!hidden.includes(id("FogAlly")), "el aliado nunca esta oculto");

    check(!viewer.sawEntity(id("FogNear")), "el cliente NO recibio paquetes del enemigo oculto");
    check(!viewer.sawEntity(id("FogFar")), "el cliente NO recibio paquetes del enemigo lejano");
    check(viewer.sawEntity(id("FogAlly")), "el cliente SI recibio al aliado");

    // El enemigo se acerca a 8 tiles (dentro de vision radio 10): debe aparecer.
    near.heading(DIR.left);
    await sleep(300);
    for (let i = 0; i < 5; i++) {
        near.step(DIR.left);
        await sleep(450);
    }
    await sleep(600);

    const hidden2 = await hiddenFor(viewerId);
    check(!hidden2.includes(id("FogNear")), "al entrar en vision el enemigo deja de estar oculto");
    check(viewer.sawEntity(id("FogNear")), "el cliente recibio al enemigo al entrar en vision");

    // Se aleja de nuevo: vuelve a ocultarse (el servidor manda el borrado).
    viewer.clearFrames();
    near.heading(DIR.right);
    await sleep(300);
    for (let i = 0; i < 6; i++) {
        near.step(DIR.right);
        await sleep(450);
    }
    await sleep(600);
    const hidden3 = await hiddenFor(viewerId);
    check(hidden3.includes(id("FogNear")), "al salir de vision vuelve a estar oculto");

    for (const b of [viewer, far, near, ally]) b.close();
    console.log(failed === 0 ? "TEST FOG: OK" : `TEST FOG: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
