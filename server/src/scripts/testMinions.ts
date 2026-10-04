/**
 * Test: los minions de ambos equipos se encuentran en el carril y pelean entre si.
 * Servidor en desarrollo con MOBA_WAVE_MS=6000 MOBA_FIRST_WAVE_MS=2000.
 */
import { Bot, debugMatches, debugState, sleep } from "./botClient";

async function main() {
    const matchId = `min-${Date.now()}`;
    const hero = new Bot({ name: "Observer", templateId: 2, matchId, team: "blue" });
    await hero.connect();
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;

    let fought = false;
    let deaths = 0;
    let maxSeen = 0;
    const seen = new Map<number, number>();

    for (let i = 0; i < 40 && !fought; i++) {
        await sleep(2000);
        const st = await debugState(mapId);
        const minions = st.npcs.filter((n) => n.structure === "minion");
        maxSeen = Math.max(maxSeen, minions.length);
        const ids = new Set(minions.map((m) => m.id));
        for (const id of seen.keys()) if (!ids.has(id)) deaths++;
        seen.clear();
        for (const m of minions) seen.set(m.id, m.hp);
        const damaged = minions.filter((m) => m.hp < m.maxHp).length;
        fought = deaths > 0 || damaged > 0;
        if (i % 5 === 0) console.log(`t=${(i + 1) * 2}s minions=${minions.length} danados=${damaged} muertos=${deaths}`);
    }

    hero.close();
    console.log(fought ? "TEST MINIONS: OK (los minions pelean entre si)" : "TEST MINIONS: FALLO (nunca pelearon)");
    process.exit(fought ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
