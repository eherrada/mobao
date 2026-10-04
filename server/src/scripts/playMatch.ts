/**
 * Partida 3v3 jugada por 6 bots que se comportan como humanos (ver humanBot.ts).
 *   npx tsx src/scripts/playMatch.ts [minutos=6]
 * Servidor en desarrollo, idealmente con el reinicio normal (sin -Fast) o con MOBA_WAVE_MS reducido.
 */
import { HumanBot } from "./humanBot";
import { debugMatches, debugState, sleep } from "./botClient";

const minutes = Number(process.argv[2] ?? 6);
const roster: Array<[string, number, "top" | "mid" | "bot"]> = [
    ["Tanque", 2, "top"],
    ["Mago", 0, "mid"],
    ["Cazador", 7, "bot"],
];

async function main() {
    const matchId = `play-${Date.now()}`;
    const bots: HumanBot[] = [];

    for (const team of ["blue", "red"] as const) {
        for (const [role, template, lane] of roster) {
            bots.push(new HumanBot(`${team[0].toUpperCase()}${role}`, template, team, lane, matchId));
        }
    }

    for (const b of bots) {
        await b.start();
    }

    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    const end = Date.now() + minutes * 60_000;
    let lastLog = 0;

    while (Date.now() < end) {
        await sleep(5000);
        const match = (await debugMatches()).find((m) => m.id === matchId);

        if (match?.state === "finished" || match?.winner) {
            console.log(`Partida terminada. Ganador: ${match.winner}`);
            break;
        }

        if (Date.now() - lastLog > 30_000) {
            lastLog = Date.now();
            const st = await debugState(mapId);
            const towers = st.npcs.filter((n) => n.structure === "tower");
            const alive = (team: string) => towers.filter((t) => t.team === team).length;
            const heroes = st.players
                .map((p) => `${p.name} L${p.level} ${p.dead ? "X" : `${p.hp}/${p.maxHp}`} (${p.x},${p.y})`)
                .join(" | ");
            const decisions = bots.map((b) => `${b.name}:${b.decision}`).join(" ");
            console.log(
                `[${Math.round((Date.now() - (end - minutes * 60_000)) / 1000)}s] torres azul=${alive("blue")} rojo=${alive("red")} minions=${st.npcs.filter((n) => n.structure === "minion").length}\n   ${heroes}
   ${decisions}`,
            );
        }
    }

    const st = await debugState(mapId);
    console.log("\n=== Resumen ===");
    for (const b of bots) {
        const p = st.players.find((x) => x.name === b.name);
        console.log(JSON.stringify({ ...b.stats, kills: p?.kills ?? b.stats.kills, level: p?.level, pos: p ? `${p.x},${p.y}` : null }));
    }

    for (const b of bots) b.stop();

    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
