/**
 * Test de oleadas estilo LoL: melee + magos en cada oleada y un minion de asedio cada 3 oleadas.
 * Servidor en desarrollo con MOBA_WAVE_MS=6000 MOBA_FIRST_WAVE_MS=2000 (restart-server.ps1 -Fast).
 */
import { Bot, debugMatches, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function main() {
    const matchId = `waves-${Date.now()}`;
    const hero = new Bot({ name: "WaveObs", templateId: 2, matchId, team: "blue" });
    await hero.connect();
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;

    // Primera oleada: 2 melee + 2 magos por carril y equipo (spawn escalonado ~0,9 s entre minions).
    await sleep(2000 + 4 * 900 + 1500);
    let st = await debugState(mapId);
    const ofLane = (kind: string, team: string, lane: string) =>
        st.npcs.filter((n) => n.kind === kind && n.team === team && n.lane === lane && n.hp > 0).length;

    check(ofLane("melee", "blue", "top") >= 2 && ofLane("caster", "blue", "top") >= 2, `oleada 1: 2 melee y 2 magos azules en top (${ofLane("melee", "blue", "top")} / ${ofLane("caster", "blue", "top")})`);
    check(st.npcs.filter((n) => n.kind === "cannon").length === 0, "la primera oleada no trae minion de asedio");

    // Barracas: 3 por equipo, de donde salen los minions.
    check(st.npcs.filter((n) => n.structure === "barracks").length === 6, "hay 6 barracas (3 por equipo)");

    // Los minions salen hacia adelante: nunca vuelven hacia su propia base.
    const base = { blue: { x: 30, y: 225 }, red: { x: 225, y: 30 } } as Record<string, { x: number; y: number }>;
    const dist = (n: any) => Math.abs(n.x - base[n.team].x) + Math.abs(n.y - base[n.team].y);
    const sample = st.npcs.filter((n) => n.kind === "melee" && n.hp > 0).slice(0, 6);
    const before = new Map(sample.map((n) => [n.id, dist(n)]));
    await sleep(4000);
    const stAfter = await debugState(mapId);
    const stillThere = stAfter.npcs.filter((n) => before.has(n.id));
    check(
        stillThere.length > 0 && stillThere.every((n) => dist(n) >= (before.get(n.id) as number)),
        "los minions se alejan de su base desde el primer paso (no caminan hacia atras)",
    );

    // Tras 3 oleadas aparece el minion de asedio.
    await sleep(2 * 6000 + 2500);
    st = await debugState(mapId);
    const cannons = st.npcs.filter((n) => n.kind === "cannon");
    check(cannons.length >= 6, `en la oleada 3 salen minions de asedio (${cannons.length}: 1 por carril y equipo)`);
    const cannon = cannons[0];
    const melee = st.npcs.find((n) => n.kind === "melee")!;
    check(cannon.maxHp > melee.maxHp * 2, `el de asedio es mas pesado (${cannon.maxHp} vs ${melee.maxHp} de vida)`);

    hero.close();
    console.log(failed === 0 ? "TEST OLEADAS: OK" : `TEST OLEADAS: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
