/**
 * Prueba de carga: varias partidas completas con oleadas aceleradas; reporta el costo del tick del MOBA.
 * Servidor en desarrollo con tiempos rapidos (restart-server.ps1 -Fast).
 */
import { Bot, debugMatches, sleep } from "./botClient";

async function perf(reset = false) {
    const res = await fetch(`http://127.0.0.1:7666/debug/perf${reset ? "?reset=1" : ""}`);
    return (await res.json()) as Record<string, number>;
}

async function main() {
    const matchesCount = Number(process.argv[2] ?? 2);
    const seconds = Number(process.argv[3] ?? 60);
    const bots: Bot[] = [];

    for (let m = 0; m < matchesCount; m++) {
        const matchId = `load-${Date.now()}-${m}`;

        for (let i = 0; i < 6; i++) {
            const bot = new Bot({
                name: `Load${m}-${i}`,
                templateId: i % 8,
                matchId,
                team: i % 2 === 0 ? "blue" : "red",
            });
            await bot.connect();
            bots.push(bot);
        }
    }

    await perf(true);
    for (let t = 0; t < seconds; t += 15) {
        await sleep(15000);
        const p = await perf();
        console.log(`t=${t + 15}s`, JSON.stringify(p));
    }

    const matches = await debugMatches();
    console.log("partidas:", JSON.stringify(matches.map((m) => ({ npcs: m.npcs, waves: m.waves }))));

    bots.forEach((b) => b.close());
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
