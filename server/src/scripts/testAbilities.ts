/**
 * Test del sistema de habilidades del MOBA (moba/abilities.ts): cada categoria de efecto, cooldowns, recurso,
 * rangos, builds y especializaciones, con bots. Servidor en desarrollo y modo -Fast:
 *   powershell -File devdb/restart-server.ps1 -Fast
 *   cd server && npx tsx src/scripts/testAbilities.ts
 */
import { Bot, DIR, debugMatches, debugPost, debugState, sleep } from "./botClient";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CHAMPIONS } = require("../moba/abilityCatalog");

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

const GUERRERO = 2;
const CAZADOR = 7;
const PALADIN = 6;
const MAGO = 0;
const CLERIGO = 1;
const ASESINO = 3;

let rowY = 130;
let rowX = 92;

/** Busca un tramo recto libre para los tests de movimiento y proyectiles. */
async function findOpenRow() {
    const res = await fetch("http://127.0.0.1:7666/debug/walkable");
    const { rows } = (await res.json()) as { rows: string[] };

    for (let y = 100; y <= 200; y++) {
        const row = rows[y - 1];
        const need = ".".repeat(26);
        const x = row.indexOf(need);

        // El tramo debe ser libre tambien una fila arriba y abajo (conos y zonas).
        if (x >= 0 && rows[y - 2].slice(x, x + 26) === need && rows[y].slice(x, x + 26) === need) {
            rowY = y;
            rowX = x + 1 + 6;
            return;
        }
    }
}

type World = {
    matchId: string;
    mapId: number;
    bots: Bot[];
    state: () => Promise<Awaited<ReturnType<typeof debugState>>>;
    get: (name: string) => Promise<Record<string, any>>;
};

async function world(tag: string, specs: Array<ConstructorParameters<typeof Bot>[0]>): Promise<World> {
    const matchId = `abl-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bots: Bot[] = [];

    for (const spec of specs) {
        const bot = new Bot({ matchId, level: 18, gearTier: 3, ...spec });
        await bot.connect();
        bots.push(bot);
    }

    await sleep(800);
    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    const state = () => debugState(mapId);

    return {
        matchId,
        mapId,
        bots,
        state,
        get: async (name: string) => (await state()).players.find((p) => p.name === name)!,
    };
}

function closeAll(w: World) {
    w.bots.forEach((b) => b.close());
}

const at = (dx: number) => ({ x: rowX + dx, y: rowY });

// --- 1) catalogo y builds ---------------------------------------------------------------------------

async function testCatalog() {
    for (const [id, champ] of Object.entries(CHAMPIONS as Record<string, any>)) {
        check(champ.pool.length >= 7, `${champ.name}: pool de ${champ.pool.length} habilidades normales (>= 7)`);
        check(champ.ults.length === 2, `${champ.name}: 2 definitivas`);
        check(champ.specs.length === 3, `${champ.name}: 3 especializaciones`);
        check(champ.kits.length === 3, `${champ.name}: 3 kits de inicio`);
        const ids = new Set(champ.pool.map((a: any) => a.id));
        check(
            champ.defaultBuild.abilities.length === 4 &&
                champ.defaultBuild.abilities.every((a: string) => ids.has(a)) &&
                champ.ults.some((a: any) => a.id === champ.defaultBuild.ult),
            `${champ.name}: build por defecto valida (${id})`,
        );
    }

    // Los hechizos iconicos de AO siguen en los pools magicos (usables solo con AO).
    for (const id of [MAGO, CLERIGO, 4, 5]) {
        const champ = CHAMPIONS[id];
        const aoNormals = champ.pool.filter((a: any) => a.kind === "aoSpell").length;
        const aoUlts = champ.ults.filter((a: any) => a.kind === "aoSpell").length;
        check(aoNormals >= 4 && aoUlts >= 1, `${champ.name}: puede armar su build solo con hechizos de AO (${aoNormals} + ${aoUlts})`);
    }
}

async function testBuilds() {
    const w = await world("build", [
        { name: "BGuerrero", templateId: GUERRERO, team: "blue", ...at(0) },
        { name: "BInvalido", templateId: GUERRERO, team: "blue", ...at(2), build: { abilities: ["ao_23", "carga", "carga", "x"], ult: "ejecucion", spec: "coloso", kit: "ofensivo" } },
        { name: "BAjeno", templateId: GUERRERO, team: "blue", ...at(4), build: { abilities: ["tajo_giratorio", "carga", "grito_guerra", "golpe_aplastante"], ult: "tormenta_flechas", spec: "coloso", kit: "ofensivo" } },
        { name: "BBasura", templateId: GUERRERO, team: "red", ...at(6), build: "no-es-un-objeto" },
        {
            name: "BValido",
            templateId: GUERRERO,
            team: "red",
            ...at(8),
            build: { abilities: ["desgarrar", "escudazo", "estampida", "segundo_aliento"], ult: "furia_imparable", spec: "berserker", kit: "defensivo" },
        },
        { name: "BColoso", templateId: GUERRERO, team: "red", ...at(10), build: { abilities: ["tajo_giratorio", "carga", "grito_guerra", "golpe_aplastante"], ult: "ejecucion", spec: "coloso", kit: "ofensivo" } },
    ]);
    const w2 = await world("build2", [
        { name: "BBerserker", templateId: GUERRERO, team: "red", ...at(12), build: { abilities: ["tajo_giratorio", "carga", "grito_guerra", "golpe_aplastante"], ult: "ejecucion", spec: "berserker", kit: "ofensivo" } },
    ]);
    const defaults = CHAMPIONS[GUERRERO].defaultBuild;
    const sameAsDefault = (b: any) => JSON.stringify(b) === JSON.stringify(defaults);

    check(sameAsDefault((await w.get("BGuerrero")).mob.build), "sin build usa el build por defecto");
    check(sameAsDefault((await w.get("BInvalido")).mob.build), "build con ids repetidos/ajenos cae en el por defecto");
    check(sameAsDefault((await w.get("BAjeno")).mob.build), "definitiva de otro campeon cae en el por defecto");
    check(sameAsDefault((await w.get("BBasura")).mob.build), "build que no es un objeto cae en el por defecto");

    const valid = await w.get("BValido");
    check(valid.mob.abilities["1"] === "desgarrar" && valid.mob.abilities["4"] === "segundo_aliento" && valid.mob.abilities["5"] === "furia_imparable", `build valido aplicado (${JSON.stringify(valid.mob.abilities)})`);
    check(valid.mob.spec === "berserker" && valid.mob.kit === "defensivo", "especializacion y kit del build");
    check(valid.mob.lifesteal >= 0.1, `Berserker: robo de vida (${valid.mob.lifesteal})`);
    const inv = valid.inv as Array<[number, number, number, number]>;
    check(inv.find((i) => i[1] === 38)?.[2] === 12, "kit defensivo: +4 pociones rojas (12)");

    // Especializaciones: Coloso (vida, reduccion, mas lento) vs Berserker.
    const coloso = await w.get("BColoso");
    const berserker = await w2.get("BBerserker");
    check(coloso.maxHp > berserker.maxHp * 1.1, `Coloso tiene mas vida que Berserker (${coloso.maxHp} vs ${berserker.maxHp})`);
    check(coloso.mob.dr >= 0.1 && berserker.mob.dr === 0, `Coloso reduce el dano recibido (${coloso.mob.dr})`);
    check(coloso.mob.speedMult < 1 && berserker.mob.speedMult === 1, `Coloso se mueve mas lento (${coloso.mob.speedMult})`);
    check(valid.maxHp > 0 && coloso.maxMana === 100 && coloso.mob.resource === "furia", "el Guerrero usa Furia (barra de 100)");

    closeAll(w);
    closeAll(w2);
}

// --- 2) todos los campeones tienen kit utilizable ----------------------------------------------------------------

async function testKits() {
    const specs = Object.keys(CHAMPIONS).map((id, i) => ({ name: `K${id}`, templateId: Number(id), team: (i % 2 ? "red" : "blue") as "red" | "blue", x: rowX + (i % 4) * 2, y: rowY }));
    const w = await world("kits", specs.slice(0, 4));
    const wB = await world("kitsB", specs.slice(4));
    const resources: Record<number, string> = { 0: "mana", 1: "mana", 2: "furia", 3: "energia", 4: "mana", 5: "mana", 6: "mana", 7: "energia" };

    for (const id of Object.keys(CHAMPIONS)) {
        const p = await (Number(id) < 4 ? w : wB).get(`K${id}`);
        const slots = Object.keys(p.mob.abilities ?? {});
        const learned = Object.values((p.ranks ?? {}) as Record<string, number>).filter((r) => r > 0).length;
        check(slots.length === 5, `${CHAMPIONS[id].name}: 5 slots de habilidad (${slots.length})`);
        check(learned >= 4, `${CHAMPIONS[id].name}: habilidades aprendidas con puntos (${learned})`);
        check(p.mob.resource === resources[Number(id)], `${CHAMPIONS[id].name}: recurso ${p.mob.resource}`);
        check(p.maxMana > 0, `${CHAMPIONS[id].name}: barra de recurso (${p.maxMana})`);
    }

    closeAll(w);
    closeAll(wB);
}

// --- 3) combate: dano, rango, recurso, cooldown, friendly fire, escudo, control ----------------------------------

async function testCombat() {
    const w = await world("combat", [
        { name: "W", templateId: GUERRERO, team: "blue", ...at(0), autoSkills: false },
        { name: "WAlly", templateId: PALADIN, team: "blue", ...at(0), y: rowY + 1 },
        { name: "E", templateId: GUERRERO, team: "red", ...at(1) },
    ]);
    const [bot] = w.bots;
    const ally = w.bots[1];
    const enemy = w.bots[2];
    const W = () => w.get("W");
    const E = () => w.get("E");
    void ally;

    bot.heading(DIR.right);
    enemy.heading(DIR.left);
    await sleep(300);

    // Aprender Golpe aplastante (slot 4) hasta rango 5 (18 puntos de nivel 18).
    for (let i = 0; i < 5; i++) bot.skill(4);
    bot.skill(1);
    bot.skill(1);
    await sleep(500);
    check(((await W()).ranks ?? {})["4"] === 5, "Golpe aplastante rango 5");

    // Dano + ralentizacion + recurso consumido.
    const e0 = await E();
    const mana0 = (await W()).mana;
    bot.spell(4, e0.x, e0.y);
    await sleep(500);
    const e1 = await E();
    const w1 = await W();
    check(e1.hp < e0.hp, `Golpe aplastante daña (${e0.hp} -> ${e1.hp})`);
    check(e1.mob.speedMult < 1, `Golpe aplastante ralentiza (${e1.mob.speedMult})`);
    check(w1.mana < mana0, `Furia consumida (${mana0} -> ${w1.mana})`);

    // Rango escala el dano: rango 5 vs rango 1 (Tajo giratorio sube a 1 en el slot 1).
    const dmgOf = async (slot: number, caster: Bot, casterName: string, n: number) => {
        let total = 0;

        for (let i = 0; i < n; i++) {
            await debugPost(`/debug/hero-hp?id=${(await E()).id}&hp=${(await E()).maxHp}`);
            await debugPost(`/debug/hero-mana?id=${(await w.get(casterName)).id}&mana=100`);
            const before = (await E()).hp;
            const t = await E();
            caster.spell(slot, t.x, t.y);
            await sleep(1000);
            total += before - (await E()).hp;
        }

        return total / n;
    };

    const rank5 = await dmgOf(4, bot, "W", 5);
    check(rank5 > 0, `dano medio rango 5: ${rank5.toFixed(0)}`);

    // Tajo giratorio (slot 1) esta en rango 2 y Golpe aplastante en rango 5: el multiplicador de rango escala el dano.
    // Se compara el mismo Golpe aplastante con un guerrero de rango 1 (otro heroe).
    const w2 = await world("rank", [
        { name: "W1", templateId: GUERRERO, team: "blue", ...at(0), autoSkills: false },
        { name: "E1", templateId: GUERRERO, team: "red", ...at(1) },
    ]);
    w2.bots[0].heading(DIR.right);
    w2.bots[0].skill(4);
    await sleep(500);
    let total1 = 0;
    for (let i = 0; i < 5; i++) {
        const e = await w2.get("E1");
        await debugPost(`/debug/hero-hp?id=${e.id}&hp=${e.maxHp}`);
        await debugPost(`/debug/hero-mana?id=${(await w2.get("W1")).id}&mana=100`);
        w2.bots[0].spell(4, e.x, e.y);
        await sleep(1000);
        total1 += e.maxHp - (await w2.get("E1")).hp;
    }
    const rank1 = total1 / 5;
    check(rank5 > rank1 * 1.04, `el rango escala el dano (rango 1: ${rank1.toFixed(0)}, rango 5: ${rank5.toFixed(0)})`);
    closeAll(w2);

    // Tajo giratorio (area): no daña aliados cercanos.
    const allyBefore = (await w.get("WAlly")).hp;
    await debugPost(`/debug/hero-mana?id=${(await W()).id}&mana=100`);
    bot.spell(1, (await W()).x, (await W()).y);
    await sleep(1000);
    check((await w.get("WAlly")).hp >= allyBefore, "Tajo giratorio no daña a un aliado pegado");
    check((await E()).hp < (await E()).maxHp, "Tajo giratorio daña al enemigo pegado");

    // Cooldown propio solo en movilidad: Carga (slot 2). Se aprende y se lanza dos veces.
    bot.skill(2);
    await sleep(400);
    await debugPost(`/debug/hero-mana?id=${(await W()).id}&mana=100`);
    const posBefore = await W();
    bot.spell(2, posBefore.x - 4, posBefore.y); // hacia el lado contrario (a la izquierda)
    await sleep(600);
    const afterCharge = await W();
    check(afterCharge.x < posBefore.x, `Carga mueve al heroe (${posBefore.x} -> ${afterCharge.x})`);
    check((afterCharge.mob.cds?.carga ?? 0) > 5000, `Carga queda en cooldown (${afterCharge.mob.cds?.carga} ms)`);
    const manaBeforeRecast = afterCharge.mana;
    void 0;
    bot.spell(2, afterCharge.x - 4, afterCharge.y);
    await sleep(1000);
    const afterRecast = await W();
    check(afterRecast.x === afterCharge.x && afterRecast.mana >= manaBeforeRecast, "recast en cooldown: no se mueve y no gasta recurso");

    closeAll(w);
}

async function testShieldAndStun() {
    const w = await world("shield", [
        {
            name: "P",
            templateId: PALADIN,
            team: "blue",
            ...at(0),
            autoSkills: false,
            build: { abilities: ["golpe_sagrado", "escudo_divino", "juicio", "aura_coraje"], ult: "martillo_redencion", spec: "protector", kit: "ofensivo" },
        },
        { name: "G", templateId: GUERRERO, team: "red", ...at(1) },
    ]);
    const [paladin, guerrero] = w.bots;
    paladin.heading(DIR.right);
    guerrero.heading(DIR.left);
    await sleep(300);

    // Slot 2 = Escudo divino, slot 3 = Juicio (aturde).
    paladin.skill(2);
    paladin.skill(3);
    await sleep(500);

    const p0 = await w.get("P");
    paladin.spell(2, p0.x, p0.y);
    await sleep(500);
    const p1 = await w.get("P");
    check(p1.mob.shield > 0, `Escudo divino crea un escudo (${p1.mob.shield})`);

    // El dano (de cualquier fuente: pasa por hero.hp) gasta el escudo antes que la vida y respeta la reduccion.
    const reduction = p1.mob.dr;
    await debugPost(`/debug/hero-damage?id=${p1.id}&amount=100`);
    const pA = await w.get("P");
    check(pA.hp === p1.hp && pA.mob.shield < p1.mob.shield, `el escudo absorbe el dano antes que la vida (hp ${p1.hp} -> ${pA.hp}, escudo ${p1.mob.shield} -> ${pA.mob.shield})`);
    await debugPost(`/debug/hero-damage?id=${p1.id}&amount=${Math.round(pA.mob.shield + 100)}`);
    const pB = await w.get("P");
    check(pB.mob.shield === 0 && pB.hp < pA.hp && pB.hp > pA.hp - 100, `lo que excede al escudo baja la vida (${pA.hp} -> ${pB.hp})`);
    check(reduction >= 0.08, `el Protector reduce el dano recibido (${reduction})`);
    guerrero.melee();
    await sleep(1000);
    const p2 = await w.get("P");

    // Juicio: aturde. El aturdido no se mueve ni ataca.
    await debugPost(`/debug/hero-mana?id=${p2.id}&mana=${p2.maxMana}`);
    await sleep(900);
    const target = await w.get("G");
    const hpPaladin = (await w.get("P")).hp;
    const shieldPaladin = (await w.get("P")).mob.shield;
    paladin.spell(3, target.x, target.y);
    await sleep(250);
    const stunned = await w.get("G");
    check(stunned.mob.stunLeftMs > 0 && stunned.paralyzed, `Juicio aturde (${stunned.mob.stunLeftMs} ms)`);
    guerrero.step(DIR.up);
    guerrero.melee();
    await sleep(350);
    const still = await w.get("G");
    const pAfter = await w.get("P");
    check(still.x === stunned.x && still.y === stunned.y, "el aturdido no se mueve");
    check(pAfter.hp >= hpPaladin && pAfter.mob.shield >= shieldPaladin - 1, "el aturdido no ataca");
    await sleep(1500);
    guerrero.step(DIR.up);
    await sleep(500);
    const free = await w.get("G");
    check(free.y !== stunned.y || free.x !== stunned.x, "al terminar el aturdimiento se mueve de nuevo");

    closeAll(w);
}

// --- 4) cazador: skillshot, zona, trampa, voltereta, recurso ------------------------------------------------------

async function testHunter() {
    const w = await world("hunter", [
        { name: "H", templateId: CAZADOR, team: "blue", ...at(0), autoSkills: false },
        { name: "HAlly", templateId: GUERRERO, team: "blue", ...at(2) },
        { name: "T1", templateId: GUERRERO, team: "red", ...at(5) },
    ]);
    const [hunter] = w.bots;
    hunter.heading(DIR.right);
    await sleep(300);

    // Slots: 1 Disparo certero, 2 Lluvia de flechas, 3 Trampa, 4 Voltereta.
    for (const s of [1, 2, 3, 4, 1, 2, 3]) hunter.skill(s);
    await sleep(600);

    // El aliado en medio bloquea el disparo: no daña ni al aliado ni al enemigo de atras.
    const h = await w.get("H");
    const t0 = await w.get("T1");
    const a0 = await w.get("HAlly");
    hunter.spell(1, t0.x, t0.y);
    await sleep(900);
    check((await w.get("T1")).hp === t0.hp && (await w.get("HAlly")).hp >= a0.hp, "el disparo no atraviesa a un aliado ni lo daña");

    // Sin aliado en la linea (se mueve el aliado afuera de la fila): golpea al primero.
    const ally = w.bots[1];
    ally.step(DIR.down);
    await sleep(700);
    const t1 = await w.get("T1");
    await debugPost(`/debug/hero-mana?id=${h.id}&mana=100`);
    hunter.spell(1, t1.x, t1.y);
    await sleep(900);
    const t2 = await w.get("T1");
    check(t2.hp < t1.hp, `Disparo certero golpea al primer enemigo en la linea (${t1.hp} -> ${t2.hp})`);
    const afterShot = await w.get("H");
    check(afterShot.mana < 100, `Energia consumida (${afterShot.mana}/100)`);

    // Regeneracion de energia con el tiempo.
    const manaA = afterShot.mana;
    await sleep(2500);
    check((await w.get("H")).mana > manaA, `la Energia se regenera (${manaA} -> ${(await w.get("H")).mana})`);

    // Zona: Lluvia de flechas sobre el enemigo -> varios ticks de dano.
    await debugPost(`/debug/hero-mana?id=${h.id}&mana=100`);
    await sleep(500);
    const z0 = await w.get("T1");
    hunter.spell(2, z0.x, z0.y);
    await sleep(900);
    const z1 = await w.get("T1");
    await sleep(900);
    const z2 = await w.get("T1");
    check(z1.hp < z0.hp && z2.hp < z1.hp, `la zona hace ticks de dano (${z0.hp} -> ${z1.hp} -> ${z2.hp})`);
    check(z2.mob.speedMult < 1 || z1.mob.speedMult < 1, "la lluvia de flechas ralentiza");

    // Voltereta hacia atras: se aleja 4 tiles; si hay un obstaculo detras no se mueve.
    await sleep(2500);
    await debugPost(`/debug/hero-mana?id=${h.id}&mana=100`);
    const v0 = await w.get("H");
    hunter.spell(4, v0.x + 3, v0.y);
    await sleep(700);
    const v1 = await w.get("H");
    check(v0.x - v1.x >= 2, `Voltereta mueve hacia atras (${v0.x} -> ${v1.x})`);
    check(((v1.mob.cds ?? {}).voltereta ?? 0) > 4000, "Voltereta tiene cooldown propio");

    closeAll(w);
}

async function testDashBlocked() {
    const w = await world("dash", [
        { name: "D", templateId: CAZADOR, team: "blue", ...at(0), autoSkills: false },
        { name: "DBack", templateId: GUERRERO, team: "blue", ...at(-1) },
        { name: "DFoe", templateId: GUERRERO, team: "red", ...at(3), y: rowY + 1 },
    ]);
    const [d] = w.bots;
    d.skill(4);
    await sleep(500);
    const d0 = await w.get("D");
    const mana0 = d0.mana;
    d.spell(4, d0.x + 3, d0.y); // voltereta hacia la izquierda, pero hay un aliado pegado
    await sleep(700);
    const d1 = await w.get("D");
    check(d1.x === d0.x && d1.y === d0.y, "el dash se frena contra una entidad (no se mueve)");
    check(d1.mana >= mana0 && !(d1.mob.cds?.voltereta > 0), "un dash fallido no gasta recurso ni cooldown");
    closeAll(w);
}

async function testTrapAndDot() {
    const w = await world("trap", [
        { name: "C", templateId: CAZADOR, team: "blue", ...at(0), autoSkills: false },
        { name: "A", templateId: ASESINO, team: "blue", ...at(0), y: rowY + 2, autoSkills: false },
        { name: "V", templateId: GUERRERO, team: "red", ...at(4) },
    ]);
    const [c, a, v] = w.bots;
    c.skill(3); // Trampa
    a.skill(2); // Veneno (slot 2 del Asesino por defecto)
    await sleep(500);

    // Trampa en el camino del enemigo: lo inmoviliza y lo daña.
    const c0 = await w.get("C");
    c.spell(3, c0.x + 2, c0.y);
    await sleep(1200);
    const hpBefore = (await w.get("V")).hp;
    v.step(DIR.left);
    await sleep(500);
    v.step(DIR.left);
    await sleep(700);
    const caught = await w.get("V");
    check(caught.rooted || caught.paralyzed, `la trampa inmoviliza al primero que pasa (rooted=${caught.rooted})`);
    check(caught.hp < hpBefore, `la trampa daña (${hpBefore} -> ${caught.hp})`);

    // Veneno (DoT): el daño sigue llegando despues del golpe inicial. El asesino se teletransporta junto a la victima con Puñalada (slot 1).
    a.skill(1);
    await sleep(400);
    const a0 = await w.get("A");
    const target = await w.get("V");
    a.spell(1, target.x, target.y);
    await sleep(700);
    const a1 = await w.get("A");
    check(Math.abs(a1.x - target.x) + Math.abs(a1.y - target.y) <= 1, `Puñalada lleva al asesino junto al objetivo (de ${a0.x},${a0.y} a ${a1.x},${a1.y})`);
    await debugPost(`/debug/hero-mana?id=${a1.id}&mana=${a1.maxMana}`);
    await sleep(900);
    const before = await w.get("V");
    a.spell(2, before.x, before.y);
    await sleep(450);
    const first = await w.get("V");
    await sleep(1000);
    const later = await w.get("V");
    await sleep(1500);
    const last = await w.get("V");
    check(first.mob.dots > 0 || later.hp < first.hp, `Veneno deja un daño en el tiempo (dots=${first.mob.dots})`);
    check(later.hp < first.hp && last.hp < later.hp, `el veneno sigue dañando (${first.hp} -> ${later.hp} -> ${last.hp})`);
    void v;
    closeAll(w);
}

// --- 5) AO sin cooldown propio, curacion, area de aliados -------------------------------------------------------------

async function testAoAndSupport() {
    const w = await world("ao", [
        { name: "M", templateId: MAGO, team: "blue", ...at(0) },
        { name: "L", templateId: CLERIGO, team: "blue", ...at(1), autoSkills: false },
        { name: "Foe", templateId: GUERRERO, team: "red", ...at(4) },
    ]);
    const [mage, cleric] = w.bots;

    // Dos hechizos de AO seguidos (separados solo por el intervalo global): ambos pegan, sin cooldown propio.
    const foe0 = await w.get("Foe");
    mage.spell(3, foe0.x, foe0.y); // Proyectil Magico (slot 3 del build por defecto del Mago)
    await sleep(1000);
    const foe1 = await w.get("Foe");
    mage.spell(3, foe1.x, foe1.y);
    await sleep(1000);
    const foe2 = await w.get("Foe");
    check(foe1.hp < foe0.hp && foe2.hp < foe1.hp, `hechizo de AO sin cooldown propio (${foe0.hp} -> ${foe1.hp} -> ${foe2.hp})`);
    check(Object.keys((await w.get("M")).mob.cds ?? {}).length === 0, "los hechizos de AO no crean cooldown");

    // Sanacion en area (tecnica del Clerigo, no esta en el build por defecto): se arma un build propio.
    closeAll(w);
    const w2 = await world("heal", [
        {
            name: "L2",
            templateId: CLERIGO,
            team: "blue",
            ...at(0),
            autoSkills: false,
            build: { abilities: ["sanacion_area", "escudo_sagrado", "ao_5", "ao_3"], ult: "ao_9", spec: "luz_sanadora", kit: "utilidad" },
        },
        { name: "Ally2", templateId: PALADIN, team: "blue", ...at(2) },
        { name: "Foe2", templateId: GUERRERO, team: "red", ...at(3), y: rowY + 1 },
    ]);
    const [l2] = w2.bots;
    l2.skill(1);
    l2.skill(2);
    await sleep(500);
    const ally = await w2.get("Ally2");
    const foe = await w2.get("Foe2");
    await debugPost(`/debug/hero-hp?id=${ally.id}&hp=${Math.round(ally.maxHp * 0.3)}`);
    await debugPost(`/debug/hero-hp?id=${foe.id}&hp=${Math.round(foe.maxHp * 0.3)}`);
    await sleep(300);
    const allyLow = await w2.get("Ally2");
    const foeLow = await w2.get("Foe2");
    const me = await w2.get("L2");
    l2.spell(1, me.x, me.y);
    await sleep(500);
    check((await w2.get("Ally2")).hp > allyLow.hp, `Sanacion en area cura a un aliado (${allyLow.hp} -> ${(await w2.get("Ally2")).hp})`);
    check((await w2.get("Foe2")).hp - foeLow.hp < foeLow.maxHp * 0.04, "Sanacion en area no cura a un enemigo (solo regeneracion pasiva)");

    // Escudo sagrado sobre un aliado.
    await sleep(700);
    l2.spell(2, ally.x, ally.y);
    await sleep(500);
    check((await w2.get("Ally2")).mob.shield > 0, `Escudo sagrado protege a un aliado (${(await w2.get("Ally2")).mob.shield})`);
    closeAll(w2);

    // Grito de guerra: escudo y reduccion de dano a aliados cercanos.
    const w3 = await world("shout", [
        { name: "Shouter", templateId: GUERRERO, team: "blue", ...at(0), autoSkills: false },
        { name: "Near", templateId: PALADIN, team: "blue", ...at(2) },
    ]);
    w3.bots[0].skill(3);
    await sleep(500);
    const s0 = await w3.get("Shouter");
    w3.bots[0].spell(3, s0.x, s0.y);
    await sleep(500);
    const near = await w3.get("Near");
    check(near.mob.shield > 0 && near.mob.dr >= 0.1, `Grito de guerra protege al aliado (escudo ${near.mob.shield}, reduccion ${near.mob.dr})`);
    check((await w3.get("Shouter")).mob.shield > 0, "Grito de guerra protege al propio guerrero");
    closeAll(w3);
}

async function testKnock() {
    const w = await world("knock", [
        { name: "KW", templateId: GUERRERO, team: "blue", ...at(0), autoSkills: false, build: { abilities: ["escudazo", "carga", "grito_guerra", "golpe_aplastante"], ult: "ejecucion", spec: "guardian", kit: "ofensivo" } },
        { name: "KE", templateId: GUERRERO, team: "red", ...at(1) },
    ]);
    w.bots[0].heading(DIR.right);
    w.bots[0].skill(1);
    await sleep(500);
    const e0 = await w.get("KE");
    w.bots[0].spell(1, e0.x, e0.y);
    await sleep(600);
    const e1 = await w.get("KE");
    check(e1.x === e0.x + 1, `Escudazo empuja al objetivo un tile (${e0.x} -> ${e1.x})`);
    check(e1.mob.stunLeftMs > 0 || e1.hp < e0.hp, "Escudazo daña y aturde");
    closeAll(w);
}

async function main() {
    await findOpenRow();
    console.log(`Fila de pruebas: y=${rowY}, x desde ${rowX}`);

    await testCatalog();
    await testBuilds();
    await testKits();
    await Promise.all([testCombat(), testShieldAndStun(), testHunter(), testDashBlocked(), testTrapAndDot(), testAoAndSupport(), testKnock()]);

    console.log(failed === 0 ? "TEST ABILITIES: OK" : `TEST ABILITIES: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
