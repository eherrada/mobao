/**
 * Test de partida MOBA de punta a punta (con bots).
 * Requiere el servidor en desarrollo con tiempos rapidos:
 *   MOBA_WAVE_MS=6000 MOBA_FIRST_WAVE_MS=2000 MOBA_RESPAWN_MS=3000 MOBA_RESET_MS=5000
 */
import { Bot, DIR, debugMatches, debugPost, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) {
        console.log(`ok: ${msg}`);
    } else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function main() {
    const matchId = `test-${Date.now()}`;

    // --- 1. Equipos, instancia y spawn -------------------------------------------------
    const blue = new Bot({ name: "BlueHero", templateId: 2, matchId, team: "blue" });
    const red = new Bot({ name: "RedHero", templateId: 6, matchId, team: "red" });
    await blue.connect();
    await red.connect();
    await sleep(800);

    const matches = await debugMatches();
    const match = matches.find((m) => m.id === matchId);
    check(match, "la partida se creo");
    const mapId = match!.mapId as number;
    check(mapId >= 60000 && mapId < 60050, `instancia en rango dinamico del mapa base 600 (${mapId})`);

    let st = await debugState(mapId);
    const blueHero = st.players.find((p) => p.name === "BlueHero")!;
    const redHero = st.players.find((p) => p.name === "RedHero")!;
    check(blueHero?.team === "blue" && redHero?.team === "red", "heroes con su equipo");
    check(blueHero.x < 60 && blueHero.y > 190, `heroe azul aparece en su base (${blueHero.x},${blueHero.y})`);
    check(redHero.x > 190 && redHero.y < 60, `heroe rojo aparece en su base (${redHero.x},${redHero.y})`);

    const structures = st.npcs.filter((n) => n.structure === "tower" || n.structure === "nexus");
    check(structures.length === 18, `18 estructuras en la partida (${structures.length})`);

    // --- 2. Invulnerabilidad escalonada ----------------------------------------------------
    const redTowers = structures.filter((s) => s.team === "red" && s.structure === "tower");
    const outerTop = redTowers.find((t) => t.lane === "top" && t.tier === 1)!;
    const innerTop = redTowers.find((t) => t.lane === "top" && t.tier === 2)!;
    const redNexus = structures.find((s) => s.team === "red" && s.structure === "nexus")!;
    check(!outerTop.invulnerable, "torre exterior vulnerable");
    check(innerTop.invulnerable, "torre interior invulnerable al inicio");
    check(redNexus.invulnerable, "nexo invulnerable al inicio");

    // --- 3. Oleadas de minions --------------------------------------------------------------
    await sleep(4500);
    st = await debugState(mapId);
    const minions = st.npcs.filter((n) => n.structure === "minion");
    check(minions.length >= 6, `aparecieron minions (${minions.length})`);
    check(
        minions.some((m) => m.team === "blue") && minions.some((m) => m.team === "red"),
        "hay minions de ambos equipos",
    );
    const sample = minions.find((m) => m.team === "blue" && m.lane === "top")!;
    await sleep(3000);
    const st2 = await debugState(mapId);
    const moved = st2.npcs.find((n) => n.id === sample.id);
    check(
        moved && (moved.x !== sample.x || moved.y !== sample.y),
        `un minion avanza por el carril (${sample.x},${sample.y}) -> (${moved?.x},${moved?.y})`,
    );

    // --- 4. Torres: solo atacan al enemigo --------------------------------------------------
    // Se agregan dos heroes pegados a la torre roja exterior del carril top, uno de cada equipo.
    const tx = outerTop.x as number;
    const ty = outerTop.y as number;
    const blueNear = new Bot({ name: "BlueNear", templateId: 2, matchId, team: "blue", x: tx, y: ty + 2 });
    await blueNear.connect();
    // El tercer slot rojo: la partida admite 3 por equipo.
    const redNear = new Bot({ name: "RedNear", templateId: 2, matchId, team: "red", x: tx + 1, y: ty + 2 });
    await redNear.connect();
    await sleep(4000);
    st = await debugState(mapId);
    const bn = st.players.find((p) => p.name === "BlueNear")!;
    const rn = st.players.find((p) => p.name === "RedNear")!;
    check(bn.hp < bn.maxHp, `la torre roja dispara al heroe azul (${bn.hp}/${bn.maxHp})`);
    check(rn.hp === rn.maxHp, `la torre roja NO dispara al heroe rojo (${rn.hp}/${rn.maxHp})`);

    // --- 5. Fuego amigo y estructuras invulnerables ---------------------------------------------
    const hpBefore = (await debugState(mapId)).npcs.find((n) => n.id === outerTop.id)!.hp;
    redNear.heading(DIR.up);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
        redNear.melee();
        await sleep(1100);
    }
    const hpAfter = (await debugState(mapId)).npcs.find((n) => n.id === outerTop.id)!.hp;
    check(hpAfter >= hpBefore, `el heroe rojo no daña su propia torre (${hpBefore} -> ${hpAfter})`);

    // --- 6. Muerte y respawn del heroe ----------------------------------------------------
    await debugPost(`/debug/hero-hp?id=${bn.id}&hp=1`);
    await sleep(2500);
    st = await debugState(mapId);
    const dead = st.players.find((p) => p.name === "BlueNear")!;
    check(dead.dead || dead.hp <= 0, "el heroe azul murio por la torre");
    check(dead.respawnAt > 0, "se programo el respawn");
    await sleep(5500);
    st = await debugState(mapId);
    const back = st.players.find((p) => p.name === "BlueNear")!;
    check(!back.dead && back.hp > 0, `el heroe reaparecio (hp ${back.hp}/${back.maxHp})`);
    check(back.x < 60 && back.y > 190, `reaparecio en la base azul (${back.x},${back.y})`);

    // --- 7. Destruccion en cadena y victoria ---------------------------------------------------
    await debugPost(`/debug/destroy?id=${outerTop.id}`);
    await sleep(300);
    st = await debugState(mapId);
    check(
        !st.npcs.find((n) => n.id === outerTop.id),
        "la torre exterior destruida desaparecio",
    );
    check(
        !st.npcs.find((n) => n.id === innerTop.id)!.invulnerable,
        "al caer la exterior, la interior pasa a ser vulnerable",
    );

    // Se destruyen todas las estructuras rojas restantes: gana el azul.
    for (const s of st.npcs.filter((n) => n.team === "red" && (n.structure === "tower" || n.structure === "nexus"))) {
        if (s.structure === "nexus") continue;
        await debugPost(`/debug/destroy?id=${s.id}`);
    }
    await sleep(300);
    st = await debugState(mapId);
    check(!st.npcs.find((n) => n.id === redNexus.id)!.invulnerable, "con las torres caidas el nexo es vulnerable");
    await debugPost(`/debug/destroy?id=${redNexus.id}`);
    await sleep(500);
    let m = (await debugMatches()).find((x) => x.id === matchId)!;
    check(m.state === "ended" && m.winner === "blue", `la partida termino: gana ${m.winner}`);

    // --- 8. Reinicio ---------------------------------------------------------------------------
    await sleep(6500);
    m = (await debugMatches()).find((x) => x.id === matchId)!;
    check(m.state === "running" && m.winner === null, "la partida se reinicio sola");
    st = await debugState(mapId);
    check(
        st.npcs.filter((n) => n.structure === "tower" || n.structure === "nexus").length === 18,
        "las 18 estructuras volvieron",
    );

    for (const b of [blue, red, blueNear, redNear]) b.close();
    await sleep(500);
    const after = await debugMatches();
    check(!after.find((x) => x.id === matchId), "la instancia se destruye al quedar vacia");

    console.log(failed === 0 ? "TEST PARTIDA: OK" : `TEST PARTIDA: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
