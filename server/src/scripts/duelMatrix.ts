/**
 * Matriz de duelos 1v1 entre todos los heroes (con bots y una politica de combate simple por heroe).
 * Mide el balance a un nivel y nivel de equipo dados: tasa de victoria y tiempo para matar.
 * Servidor en desarrollo en :7666, iniciado con `devdb/restart-server.ps1 -NoMinions` (sin oleadas).
 *   npx tsx src/scripts/duelMatrix.ts [raza=1] [repeticiones=1] [nivel=18]
 * El nivel de equipo sale del nivel: 1-5 basico, 6-11 mejora 1, 12-17 mejora 2, 18 mejora 3.
 */
import { Bot, DIR, debugMatches, debugState, sleep } from "./botClient";

export const NAMES = ["Mago", "Clerigo", "Guerrero", "Asesino", "Bardo", "Druida", "Paladin", "Cazador"];
const COST: Record<number, number> = { 25: 1000, 23: 460, 15: 150, 8: 45, 5: 40, 3: 10, 9: 400, 24: 300 };

type Ctx = { me: any; foe: any };
type Policy = (bot: Bot, ctx: Ctx, tick: number) => void;

// Hechizos de cada kit en orden de slot (server/src/moba/heroes.ts, KITS).
const KIT: Record<number, number[]> = {
    0: [25, 23, 15, 24, 8, 18],
    1: [5, 3, 10, 9, 24, 20, 18, 15],
    3: [14, 18, 20, 8, 24],
    4: [3, 5, 20, 18, 24, 15],
    5: [9, 24, 5, 15, 8, 20],
    6: [3, 5, 10, 24, 8, 20],
};
const slotOf = (hero: number, spell: number) => KIT[hero].indexOf(spell) + 1;

/** Puede lanzarlo: aprendio la habilidad (rango > 0) y alcanza el mana. */
function canCast(hero: number, ctx: Ctx, spell: number): boolean {
    const slot = slotOf(hero, spell);
    return slot > 0 && Number(ctx.me.ranks?.[slot] ?? 0) > 0 && Number(ctx.me.mana ?? 0) >= COST[spell];
}

function castFirst(bot: Bot, hero: number, ctx: Ctx, order: number[]): boolean {
    for (const spell of order) {
        if (canCast(hero, ctx, spell)) {
            bot.spell(slotOf(hero, spell), ctx.foe.x, ctx.foe.y);
            return true;
        }
    }
    return false;
}

function healIfLow(bot: Bot, hero: number, ctx: Ctx, below: number): boolean {
    if (ctx.me.hp >= ctx.me.maxHp * below) return false;

    for (const spell of [5, 3]) {
        if (canCast(hero, ctx, spell)) {
            bot.spell(slotOf(hero, spell), ctx.me.x, ctx.me.y);
            return true;
        }
    }
    return false;
}

const POLICIES: Record<number, Policy> = {
    0: (bot, ctx) => {
        if (!castFirst(bot, 0, ctx, [25, 23, 15, 8])) bot.melee();
    },
    1: (bot, ctx) => {
        if (!healIfLow(bot, 1, ctx, 0.5) && !castFirst(bot, 1, ctx, [15])) bot.melee();
    },
    2: (bot) => bot.melee(),
    3: (bot) => bot.melee(),
    4: (bot, ctx) => {
        if (!healIfLow(bot, 4, ctx, 0.5) && !castFirst(bot, 4, ctx, [15])) bot.melee();
    },
    5: (bot, ctx) => {
        if (!healIfLow(bot, 5, ctx, 0.5) && !castFirst(bot, 5, ctx, [15, 8])) bot.melee();
    },
    6: (bot, ctx) => {
        if (!healIfLow(bot, 6, ctx, 0.45)) bot.melee();
    },
    7: (bot, ctx) => bot.range(ctx.foe.x, ctx.foe.y),
};

type Result = { a: number; b: number; winner: "a" | "b" | "draw"; ms: number; hpLeft: number };

export const gearTierFor = (level: number) => (level >= 18 ? 3 : level >= 12 ? 2 : level >= 6 ? 1 : 0);

async function duel(a: number, b: number, race: number, swap: boolean, level: number): Promise<Result> {
    const id = `duel-${a}-${b}-${swap ? 1 : 0}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const posA = swap ? { x: 45, y: 236 } : { x: 45, y: 235 };
    const posB = swap ? { x: 45, y: 235 } : { x: 45, y: 236 };
    const common = { matchId: id, race, exactMana: true, level, gearTier: gearTierFor(level) };
    const botA = new Bot({ name: "A", templateId: a, team: swap ? "red" : "blue", x: posA.x, y: posA.y, ...common });
    await botA.connect();
    const botB = new Bot({ name: "B", templateId: b, team: swap ? "blue" : "red", x: posB.x, y: posB.y, ...common });
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
    const timer = setInterval(async () => {
        state = await debugState(mapId);
    }, 500);

    let winner: Result["winner"] = "draw";
    while (Date.now() - start < 70000) {
        tick++;
        const A = get("A");
        const B = get("B");
        if (A.dead || A.hp <= 0) {
            winner = "b";
            break;
        }
        if (B.dead || B.hp <= 0) {
            winner = "a";
            break;
        }
        POLICIES[a](botA, { me: A, foe: B }, tick);
        POLICIES[b](botB, { me: B, foe: A }, tick);
        await sleep(1000);
    }
    clearInterval(timer);
    const A = get("A");
    const B = get("B");
    const hpLeft = winner === "a" ? A.hp : winner === "b" ? B.hp : 0;
    botA.close();
    botB.close();
    return { a, b, winner, ms: Date.now() - start, hpLeft };
}

export async function runMatrix(race: number, reps: number, level = 18, quiet = false) {
    const jobs: Array<() => Promise<Result>> = [];

    for (let a = 0; a < 8; a++) {
        for (let b = a + 1; b < 8; b++) {
            for (let r = 0; r < reps; r++) {
                jobs.push(() => duel(a, b, race, r % 2 === 1, level));
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

    for (const r of results) {
        games[r.a]++;
        games[r.b]++;
        if (r.winner === "a") wins[r.a]++;
        else if (r.winner === "b") wins[r.b]++;
        else {
            wins[r.a] += 0.5;
            wins[r.b] += 0.5;
        }
        ttk[r.a].push(r.ms / 1000);
        ttk[r.b].push(r.ms / 1000);
    }

    const winrate = NAMES.map((_, i) => wins[i] / Math.max(1, games[i]));
    const avgTtk = NAMES.map((_, i) => ttk[i].reduce((sum, v) => sum + v, 0) / Math.max(1, ttk[i].length));
    const draws = results.filter((r) => r.winner === "draw").length;

    if (!quiet) {
        console.log(`\nRaza ${race}, nivel ${level} (equipo ${gearTierFor(level)}) - ${results.length} duelos, ${draws} empates`);
        console.log("Heroe       winrate   TTK medio");
        NAMES.forEach((n, i) => console.log(`${n.padEnd(10)}  ${(winrate[i] * 100).toFixed(0).padStart(4)}%     ${avgTtk[i].toFixed(1)}s`));
    }

    return { winrate, avgTtk, draws, duels: results.length };
}

if (process.argv[1]?.includes("duelMatrix")) {
    runMatrix(Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 1), Number(process.argv[4] ?? 18))
        .then(() => process.exit(0))
        .catch((e) => {
            console.error(e);
            process.exit(1);
        });
}
