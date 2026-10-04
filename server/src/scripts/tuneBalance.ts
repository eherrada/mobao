/**
 * Afinador de balance: corre la matriz de duelos, ajusta los multiplicadores por heroe en vivo
 * (/debug/balance) y repite hasta que todas las tasas de victoria queden cerca de 50 %.
 * Imprime los valores finales para copiarlos a server/src/moba/heroes.ts (STATS).
 *   npx tsx src/scripts/tuneBalance.ts [raza=1] [rondas=6] [repeticiones=2]
 */
import { runMatrix } from "./duelMatrix";

const NAMES = ["Mago", "Clerigo", "Guerrero", "Asesino", "Bardo", "Druida", "Paladin", "Cazador"];

async function getStats(): Promise<Record<string, { hp: number; phys: number; spell: number }>> {
    return (await fetch("http://127.0.0.1:7666/debug/balance")).json() as never;
}

async function setStats(hero: number, s: { hp: number; phys: number; spell: number }) {
    await fetch(`http://127.0.0.1:7666/debug/balance?hero=${hero}&hp=${s.hp}&phys=${s.phys}&spell=${s.spell}`, { method: "POST" });
}

async function main() {
    const race = Number(process.argv[2] ?? 1);
    const rounds = Number(process.argv[3] ?? 6);
    const reps = Number(process.argv[4] ?? 2);

    for (let round = 1; round <= rounds; round++) {
        const { winrate, avgTtk } = await runMatrix(race, reps, true);
        const stats = await getStats();
        console.log(`\n== Ronda ${round} ==`);
        NAMES.forEach((n, i) =>
            console.log(
                `${n.padEnd(9)} win ${(winrate[i] * 100).toFixed(0).padStart(3)}%  ttk ${avgTtk[i].toFixed(1).padStart(5)}s  hp x${stats[i].hp.toFixed(2)} phys x${stats[i].phys.toFixed(2)} spell x${stats[i].spell.toFixed(2)}`,
            ),
        );

        const worst = Math.max(...winrate.map((w) => Math.abs(w - 0.5)));
        if (worst <= 0.12) {
            console.log("\nBalance dentro del objetivo (38-62 %).");
            break;
        }

        for (let i = 0; i < 8; i++) {
            // Poder relativo: >1 si el heroe pierde de mas. Amortiguado y acotado para no oscilar.
            const w = Math.min(0.9, Math.max(0.1, winrate[i] as number));
            const power = Math.min(1.5, Math.max(0.7, Math.pow(0.5 / w, 0.4)));
            const k = Math.sqrt(power);
            const s = stats[i];
            await setStats(i, { hp: s.hp * k, phys: s.phys * k, spell: s.spell * k });
        }
    }

    const final = await getStats();
    console.log("\nSTATS finales (hp ya incluye la escala global dividida):");
    console.log(JSON.stringify(final));
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
