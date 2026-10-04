/**
 * Test de razas: cada raza cambia atributos (vida/mana), cabeza y, para enanos y gnomos, la armadura.
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

const RACE_NAMES = ["", "Humano", "Elfo", "Elfo Drow", "Enano", "Gnomo"];
const HEAD_RANGES: Record<number, [number, number]> = { 1: [1, 41], 2: [101, 122], 3: [201, 221], 4: [301, 319], 5: [401, 418] };

async function main() {
    const matchId = `race-${Date.now()}`;
    const bots: Bot[] = [];
    const heroes = [
        { template: 0, name: "Mago" },
        { template: 6, name: "Paladin" },
    ];

    // 2 heroes x 5 razas = 10 bots, repartidos en 2 partidas (3 por equipo como maximo).
    let n = 0;
    for (const hero of heroes) {
        for (let race = 1; race <= 5; race++) {
            const bot = new Bot({
                name: `${hero.name}${race}`,
                templateId: hero.template,
                matchId: `${matchId}-${Math.floor(n / 6)}`,
                team: n % 2 === 0 ? "blue" : "red",
                race,
            });
            await bot.connect();
            bots.push(bot);
            n++;
        }
    }
    await sleep(1000);

    const matches = (await debugMatches()).filter((m) => m.id.startsWith(matchId));
    const players: any[] = [];
    for (const m of matches) players.push(...(await debugState(m.mapId)).players);

    for (const hero of heroes) {
        const rows = [1, 2, 3, 4, 5].map((race) => players.find((p) => p.name === `${hero.name}${race}`)!);
        console.log(`\n${hero.name}:`);
        rows.forEach((p, i) => console.log(`  ${RACE_NAMES[i + 1].padEnd(10)} hp ${p.maxHp}  mana ${p.maxMana}  cabeza ${p.head}  cuerpo ${p.body}  armadura ${p.armorItem}`));

        rows.forEach((p, i) => {
            const race = i + 1;
            check(p.race === race, `${hero.name} ${RACE_NAMES[race]}: raza aplicada`);
            const [lo, hi] = HEAD_RANGES[race];
            check(p.head >= lo && p.head <= hi, `${hero.name} ${RACE_NAMES[race]}: cabeza de su raza (${p.head})`);
        });
        check(new Set(rows.map((p) => p.maxHp)).size > 1, `${hero.name}: las razas cambian la vida`);
        check(rows[3].armorItem !== rows[0].armorItem, `${hero.name}: el enano usa una armadura propia (${rows[3].armorItem})`);
        check(rows[4].armorItem !== rows[0].armorItem, `${hero.name}: el gnomo usa una armadura propia (${rows[4].armorItem})`);
    }

    bots.forEach((b) => b.close());
    console.log(failed === 0 ? "\nTEST RAZAS: OK" : `\nTEST RAZAS: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
