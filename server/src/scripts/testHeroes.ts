/**
 * Test de kits de heroes: curacion a aliados, dano a enemigos y fuego amigo bloqueado.
 */
import { Bot, debugMatches, debugPost, debugState, sleep } from "./botClient";

let failed = 0;
function check(cond: unknown, msg: string) {
    if (cond) console.log(`ok: ${msg}`);
    else {
        failed++;
        console.error(`FAIL: ${msg}`);
    }
}

async function main() {
    const matchId = `hero-${Date.now()}`;
    const healer = new Bot({ name: "Healer", templateId: 1, matchId, team: "blue", x: 100, y: 130 });
    await healer.connect();
    const ally = new Bot({ name: "Ally", templateId: 6, matchId, team: "blue", x: 102, y: 130 });
    await ally.connect();
    const mage = new Bot({ name: "Mage", templateId: 0, matchId, team: "blue", x: 100, y: 133 });
    await mage.connect();
    const enemy = new Bot({ name: "Enemy", templateId: 2, matchId, team: "red", x: 104, y: 133 });
    await enemy.connect();
    await sleep(1500);

    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);
    const get = (name: string) => st.players.find((p) => p.name === name)!;

    // --- Curacion a un aliado ---
    await debugPost(`/debug/hero-hp?id=${get("Ally").id}&hp=50`);
    await sleep(300);
    healer.spell(1, 102, 130); // slot 1 del Clerigo = Curar Heridas Graves
    await sleep(1500);
    st = await debugState(mapId);
    check(get("Ally").hp > 50, `el clerigo curo a su aliado (50 -> ${get("Ally").hp})`);

    // --- Dano a un enemigo ---
    const enemyBefore = get("Enemy").hp;
    mage.spell(1, 104, 133); // slot 1 del Mago = Apocalipsis
    await sleep(1500);
    st = await debugState(mapId);
    check(get("Enemy").hp < enemyBefore, `el mago daño al enemigo (${enemyBefore} -> ${get("Enemy").hp})`);

    // --- Fuego amigo bloqueado ---
    await debugPost(`/debug/hero-hp?id=${get("Ally").id}&hp=300`);
    await sleep(300);
    st = await debugState(mapId);
    const allyHp = get("Ally").hp;
    await sleep(1000); // respeta el cooldown de hechizos
    mage.spell(1, 102, 130);
    await sleep(1500);
    st = await debugState(mapId);
    check(get("Ally").hp >= allyHp, `el mago no puede dañar a su aliado (${allyHp} -> ${get("Ally").hp})`);

    [healer, ally, mage, enemy].forEach((b) => b.close());
    console.log(failed === 0 ? "TEST HEROES: OK" : `TEST HEROES: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
