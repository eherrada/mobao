/**
 * Afinador de balance: corre la matriz de duelos a varios niveles (con el equipo de cada nivel), promedia las
 * tasas de victoria, ajusta en vivo los multiplicadores por heroe (/debug/balance) y repite hasta que todos
 * queden cerca de 50 %. Imprime los valores finales para copiarlos a server/src/moba/heroes.ts (STATS).
 *   npx tsx src/scripts/tuneBalance.ts [raza=1] [rondas=6] [repeticiones=1] [niveles=1,6,12,18]
 * Requiere el servidor iniciado con `devdb/restart-server.ps1 -NoMinions -NoWatch`.
 */
import { NAMES, runMatrix } from "./duelMatrix";

type Stat = { hp: number; phys: number; spell: number };

async function getStats(): Promise<Record<string, Stat>> {
    return (await fetch("http://127.0.0.1:7666/debug/balance")).json() as never;
}

async function setStats(hero: number, s: Stat) {
    await fetch(`http://127.0.0.1:7666/debug/balance?hero=${hero}&hp=${s.hp}&phys=${s.phys}&spell=${s.spell}`, { method: "POST" });
}

async function main() {
    const race = Number(process.argv[2] ?? 1);
    const rounds = Number(process.argv[3] ?? 6);
    const reps = Number(process.argv[4] ?? 1);
    const levels = (process.argv[5] ?? "1,6,12,18").split(",").map(Number);

    for (let round = 1; round <= rounds; round++) {
        const sums = new Array(8).fill(0);
        const perLevel: number[][] = [];

        for (const level of levels) {
            const { winrate } = await runMatrix(race, reps, level, true);
            perLevel.push(winrate);
            winrate.forEach((w, i) => (sums[i] += w));
        }

        const avg: number[] = sums.map((s) => s / levels.length);
        const stats = await getStats();

        console.log(`\n== Ronda ${round} (niveles ${levels.join(", ")}) ==`);
        NAMES.forEach((n, i) =>
            console.log(
                `${n.padEnd(9)} media ${(avg[i] * 100).toFixed(0).padStart(3)}%  [${perLevel.map((p) => (p[i] * 100).toFixed(0).padStart(3)).join(" ")}]  hp x${stats[i].hp.toFixed(2)} phys x${stats[i].phys.toFixed(2)} spell x${stats[i].spell.toFixed(2)}`,
            ),
        );

        const worst = Math.max(...avg.map((w) => Math.abs(w - 0.5)));
        if (worst <= 0.1) {
            console.log("\nBalance dentro del objetivo (40-60 % de media).");
            break;
        }

        for (let i = 0; i < 8; i++) {
            const w = Math.min(0.9, Math.max(0.1, avg[i] as number));
            const power = Math.min(1.5, Math.max(0.7, Math.pow(0.5 / w, 0.45)));
            const k = Math.sqrt(power);
            const s = stats[i];
            await setStats(i, {
                hp: Math.min(3, Math.max(0.4, s.hp * k)),
                phys: Math.min(3, Math.max(0.4, s.phys * k)),
                spell: Math.min(3, Math.max(0.4, s.spell * k)),
            });
        }
    }

    const final = await getStats();
    console.log("\nSTATS finales (multiplicadores base; HP_SCALE se aplica aparte):");
    console.log(JSON.stringify(final));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
