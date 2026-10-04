/**
 * Matriz de duelos 1v1 entre todos los heroes (con bots y una politica de combate simple por heroe).
 * Sirve para medir el balance: tasa de victoria y tiempo para matar. Servidor en desarrollo en :7666,
 * iniciado con `devdb/restart-server.ps1 -NoMinions` para que no haya oleadas.
 *   npx tsx src/scripts/duelMatrix.ts [raza=1] [repeticiones=1]
 */
import { Bot, DIR, debugMatches, debugState, sleep } from "./botClient";

const NAMES = ["Mago", "Clerigo", "Guerrero", "Asesino", "Bardo", "Druida", "Paladin", "Cazador"];
const COST: Record<number, number> = { 25: 1000, 23: 460, 15: 150, 8: 45, 5: 40, 3: 10, 9: 400, 24: 300 };

type Ctx = { me: any; foe: any };
type Policy = (bot: Bot, ctx: Ctx, tick: number) => void;

// slot de cada hechizo segun server/src/moba/heroes.ts (KITS)
const KIT: Record<number, number[]> = {
    0: [25, 23, 15, 24, 8, 18],
    1: [5, 3, 10, 9, 24, 20, 18, 15],
    3: [14, 18, 20, 8, 24],
    4: [3, 5, 20, 18, 24, 15],
    5: [9, 24, 5, 15, 8, 20],
    6: [3, 5, 10, 24, 8, 20],
};
const slotOf = (hero: number, spell: number) => KIT[hero].indexOf(spell) + 1;

function castBestDamage(bot: Bot, hero: number, ctx: Ctx, order: number[]) {
    const mana = ctx.me.mana ?? 0;
    for (const spell of order) {
        if (mana >= COST[spell]) {
            bot.spell(slotOf(hero, spell), ctx.foe.x, ctx.foe.y);
            return true;
        }
    }
    return false;
}

const POLICIES: Record<number, Policy> = {
    // Mago: rafaga de hechizos, sin melee.
    0: (bot, ctx) => void castBestDamage(bot, 0, ctx, [25, 23, 15, 8]),
    // Clerigo: cura si esta bajo, si no Tormenta de Fuego, si no melee.
    1: (bot, ctx) => {
        if (ctx.me.hp < ctx.me.maxHp * 0.5 && (ctx.me.mana ?? 0) >= 40) bot.spell(slotOf(1, 5), ctx.me.x, ctx.me.y);
        else if (!castBestDamage(bot, 1, ctx, [15])) bot.melee();
    },
    2: (bot) => bot.melee(),
    3: (bot) => bot.melee(),
    // Bardo: Tormenta de Fuego mientras haya mana, cura si esta bajo, si no melee.
    4: (bot, ctx) => {
        if (ctx.me.hp < ctx.me.maxHp * 0.5 && (ctx.me.mana ?? 0) >= 40) bot.spell(slotOf(4, 5), ctx.me.x, ctx.me.y);
        else if (!castBestDamage(bot, 4, ctx, [15])) bot.melee();
    },
    // Druida: Tormenta de Fuego / Proyectil, cura si esta bajo.
    5: (bot, ctx) => {
        if (ctx.me.hp < ctx.me.maxHp * 0.5 && (ctx.me.mana ?? 0) >= 40) bot.spell(slotOf(5, 5), ctx.me.x, ctx.me.y);
        else if (!castBestDamage(bot, 5, ctx, [15, 8])) bot.melee();
    },
    // Paladin: melee y cura si esta bajo.
    6: (bot, ctx) => {
        if (ctx.me.hp < ctx.me.maxHp * 0.45 && (ctx.me.mana ?? 0) >= 40) bot.spell(slotOf(6, 5), ctx.me.x, ctx.me.y);
        else bot.melee();
    },
    // Cazador: arco.
    7: (bot, ctx) => bot.range(ctx.foe.x, ctx.foe.y),
};

type Result = { a: number; b: number; winner: "a" | "b" | "draw"; ms: number; hpLeft: number };

async function duel(a: number, b: number, race: number, swap: boolean): Promise<Result> {
    const id = `duel-${a}-${b}-${swap ? 1 : 0}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // swap: cambia quien esta arriba/abajo y que equipo es cada uno
    const posA = swap ? { x: 45, y: 236 } : { x: 45, y: 235 };
    const posB = swap ? { x: 45, y: 235 } : { x: 45, y: 236 };
    const botA = new Bot({ name: "A", templateId: a, matchId: id, team: swap ? "red" : "blue", x: posA.x, y: posA.y, race, exactMana: true });
    await botA.connect();
    const botB = new Bot({ name: "B", templateId: b, matchId: id, team: swap ? "blue" : "red", x: posB.x, y: posB.y, race, exactMana: true });
    await botB.connect();
    await sleep(500);

    const mapId = (await debugMatches()).find((m) => m.id === id)!.mapId as number;
    botA.heading(swap ? DIR.up : DIR.down);
    botB.heading(swap ? DIR.down : DIR.up);
    await sleep(300);

    const start = Date.now();
    let tick = 0;
    let state = await debugState(mapId);
    const get = (n: string) => state.players.find((p) => p.name === n)!;

    // Politicas a ritmo de ~1 accion por segundo; el estado se refresca cada 500 ms.
    const timer = setInterval(async () => {
        state = await debugState(mapId);
    }, 500);

    let winner: Result["winner"] = "draw";
    while (Date.now() - start < 60000) {
        tick++;
        const A = get("A");
        const B = get("B");
        if (A.dead || A.hp <= 0) { winner = "b"; break; }
        if (B.dead || B.hp <= 0) { winner = "a"; break; }
        POLICIES[a](botA, { me: A, foe: B }, tick);
        POLICIES[b](botB, { me: B, foe: A }, tick);
        await sleep(1000);
    }
    clearInterval(timer);
    if (Date.now() - start < 1500 && process.env.DUEL_DEBUG) {
        console.log(`EARLY ${NAMES[a]} vs ${NAMES[b]} swap=${swap}`, JSON.stringify(state.players.map((p) => ({ n: p.name, hp: p.hp, max: p.maxHp, dead: p.dead, x: p.x, y: p.y }))));
    }
    const A = get("A");
    const B = get("B");
    const hpLeft = winner === "a" ? A.hp : winner === "b" ? B.hp : 0;
    botA.close();
    botB.close();
    return { a, b, winner, ms: Date.now() - start, hpLeft };
}

export async function runMatrix(race: number, reps: number, quiet = false) {
    const jobs: Array<() => Promise<Result>> = [];

    for (let a = 0; a < 8; a++) {
        for (let b = a + 1; b < 8; b++) {
            for (let r = 0; r < reps; r++) {
                jobs.push(() => duel(a, b, race, r % 2 === 1));
            }
        }
    }

    const results: Result[] = [];
    const concurrency = 8;
    let next = 0;
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (next < jobs.length) {
                const job = jobs[next++];
                results.push(await job());
            }
        }),
    );

    const wins = new Array(8).fill(0);
    const games = new Array(8).fill(0);
    const ttk: number[][] = Array.from({ length: 8 }, () => []);
    const matrix: string[][] = Array.from({ length: 8 }, () => new Array(8).fill("  . "));

    for (const r of results) {
        games[r.a]++; games[r.b]++;
        if (r.winner === "a") wins[r.a]++;
        else if (r.winner === "b") wins[r.b]++;
        else { wins[r.a] += 0.5; wins[r.b] += 0.5; }
        const winnerIdx = r.winner === "a" ? r.a : r.b;
        const loserIdx = r.winner === "a" ? r.b : r.a;
        matrix[winnerIdx][loserIdx] = ` ${Math.round(r.ms / 1000).toString().padStart(2)}s`;
        matrix[loserIdx][winnerIdx] = "  x ";
        ttk[r.a].push(r.ms / 1000);
        ttk[r.b].push(r.ms / 1000);
    }

    const winrate = NAMES.map((_, i) => wins[i] / Math.max(1, games[i]));
    const avgTtk = NAMES.map((_, i) => ttk[i].reduce((sum, v) => sum + v, 0) / Math.max(1, ttk[i].length));
    if (quiet) return { winrate, avgTtk };

    console.log(`\nRaza ${race} — victoria (tiempo en segundos) fila gana a columna; x = pierde\n`);
    console.log("           " + NAMES.map((n) => n.slice(0, 4).padStart(4)).join(" "));
    NAMES.forEach((n, i) => console.log(n.padEnd(10), matrix[i].join(" ")));
    console.log("\nHeroe       winrate   TTK medio");
    NAMES.forEach((n, i) => {
        const avg = ttk[i].reduce((s, v) => s + v, 0) / Math.max(1, ttk[i].length);
        console.log(`${n.padEnd(10)}  ${((wins[i] / Math.max(1, games[i])) * 100).toFixed(0).padStart(4)}%     ${avg.toFixed(1)}s`);
    });
    return { winrate, avgTtk };
}

if (process.argv[1]?.includes("duelMatrix")) {
    runMatrix(Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 1))
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
