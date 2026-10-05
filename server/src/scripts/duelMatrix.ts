/**
 * Matriz de duelos 1v1 entre todos los heroes (con bots y una politica de combate simple por heroe).
 * Mide el balance a un nivel y nivel de equipo dados: tasa de victoria y tiempo para matar.
 * Servidor en desarrollo en :7666, iniciado con `devdb/restart-server.ps1 -NoMinions` (sin oleadas).
 *   npx tsx src/scripts/duelMatrix.ts [raza=1] [repeticiones=1] [nivel=18]
 * El nivel de equipo sale del nivel: 1-5 basico, 6-11 mejora 1, 12-17 mejora 2, 18 mejora 3.
 */
import { Bot, DIR, debugMatches, debugState, sleep } from "./botClient";

export const NAMES = ["Mago", "Clerigo", "Guerrero", "Asesino", "Bardo", "Druida", "Paladin", "Cazador"];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CHAMPIONS } = require("../moba/abilityCatalog");

type Ctx = { me: any; foe: any };
type Policy = (bot: Bot, ctx: Ctx, tick: number) => void;

const defOf = (hero: number, id: string) => [...CHAMPIONS[hero].pool, ...CHAMPIONS[hero].ults].find((a: any) => a.id === id);

/** Habilidades del build por defecto del heroe: [{ slot, def }] (slot 5 = definitiva). */
function buildSlots(hero: number): Array<{ slot: number; def: any }> {
    const b = CHAMPIONS[hero].defaultBuild;

    return [...b.abilities, b.ult].map((id: string, i: number) => ({ slot: i + 1, def: defOf(hero, id) }));
}

/** Puede lanzarla: aprendida (rango > 0), sin cooldown propio y con recurso suficiente. */
function ready(ctx: Ctx, slot: number, def: any): boolean {
    const cost = def.costPct ? Math.ceil((def.costBase / 100) * Number(ctx.me.maxMana ?? 0)) : def.costBase;

    return Number(ctx.me.ranks?.[slot] ?? 0) > 0 && Number(ctx.me.mana ?? 0) >= cost && !((ctx.me.mob?.cds ?? {})[def.id] > 0);
}

const adjacent = (ctx: Ctx) => Math.abs(ctx.me.x - ctx.foe.x) + Math.abs(ctx.me.y - ctx.foe.y) <= 1;

/**
 * Politica generica: cura/protege si baja de la vida indicada, si no lanza la mejor habilidad ofensiva disponible
 * (la definitiva primero) y si no, golpea (cuerpo a cuerpo o con el arco). Las tecnicas de rango 1 exigen estar pegado.
 */
function policyFor(hero: number, healBelow: number, ranged = false): Policy {
    const slots = buildSlots(hero);

    return (bot, ctx) => {
        const low = ctx.me.hp < ctx.me.maxHp * healBelow;

        if (low) {
            const support = slots.find((s) => s.def.tags.some((t: string) => t === "curacion" || t === "escudo") && s.def.target !== "point" && ready(ctx, s.slot, s.def));

            if (support) {
                bot.spell(support.slot, ctx.me.x, ctx.me.y);
                return;
            }
        }

        const offense = [...slots]
            .reverse()
            .find(
                (s) =>
                    s.def.tags.some((t: string) => t === "dano" || t === "control") &&
                    !["ao_9", "ao_24"].includes(s.def.id) &&
                    ready(ctx, s.slot, s.def) &&
                    (s.def.range > 1 || adjacent(ctx)) &&
                    !(s.def.dash && s.def.dash.mode === "away"),
            );

        if (offense) {
            const self = offense.def.target === "self" || offense.def.target === "area";
            bot.spell(offense.slot, self ? ctx.me.x : ctx.foe.x, self ? ctx.me.y : ctx.foe.y);
            return;
        }

        if (ranged) bot.range(ctx.foe.x, ctx.foe.y);
        else bot.melee();
    };
}

const POLICIES: Record<number, Policy> = {
    0: policyFor(0, 0),
    1: policyFor(1, 0.5),
    2: policyFor(2, 0),
    3: policyFor(3, 0),
    4: policyFor(4, 0.5),
    5: policyFor(5, 0.5),
    6: policyFor(6, 0.45),
    7: policyFor(7, 0, true),
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
