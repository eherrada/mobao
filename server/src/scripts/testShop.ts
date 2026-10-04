/**
 * Test de equipo y tienda: equipo inicial basico, la tienda solo ofrece lo que el heroe puede usar,
 * comprar descuenta oro y equipar mejora el arma.
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

async function shopFor(viewer: number) {
    const res = await fetch(`http://127.0.0.1:7666/debug/shop?viewer=${viewer}`);
    return (await res.json()) as { shop: { id: number; x: number; y: number }; items: Array<{ index: number; id: number; name: string; price: number }> };
}

async function main() {
    const matchId = `shop-${Date.now()}`;
    // Heroe azul (Guerrero) pegado al mercader del equipo azul (21,238).
    const hero = new Bot({ name: "ShopHero", templateId: 2, matchId, team: "blue", x: 22, y: 239 });
    await hero.connect();
    const mage = new Bot({ name: "ShopMage", templateId: 0, matchId, team: "blue", x: 24, y: 239 });
    await mage.connect();
    await sleep(1200);

    const mapId = (await debugMatches()).find((m) => m.id === matchId)!.mapId as number;
    let st = await debugState(mapId);
    const get = (n: string) => st.players.find((p) => p.name === n)!;
    const weaponOf = (p: any) => {
        const slot = p.weapon;
        const entry = (p.inv ?? []).find((e: number[]) => e[0] === Number(slot));
        return entry ? entry[1] : 0;
    };

    const startWeapon = weaponOf(get("ShopHero"));
    check(startWeapon > 0, `el guerrero empieza con un arma basica equipada (item ${startWeapon})`);
    check(get("ShopHero").weapon > 0, "el arma esta equipada en el servidor");

    // La tienda muestra solo mejoras utilizables: no hay arcos para el guerrero ni espadas para el mago.
    const warriorShop = await shopFor(get("ShopHero").id);
    const mageShop = await shopFor(get("ShopMage").id);
    const names = warriorShop.items.map((i) => i.name.toLowerCase());
    check(warriorShop.items.length >= 6, `el guerrero ve ${warriorShop.items.length} objetos en la tienda`);
    check(!names.some((n) => n.includes("arco")), "el guerrero no ve arcos");
    check(mageShop.items.some((i) => /vara|bast/i.test(i.name)), "el mago ve bastones");
    check(!mageShop.items.some((i) => /espada|hacha/i.test(i.name)), "el mago no ve espadas ni hachas");

    // Compra: primera mejora de arma del guerrero.
    const upgrade = warriorShop.items.find((i) => /espada dos manos/i.test(i.name)) ?? warriorShop.items.find((i) => i.price > 1000 && i.price < 2000);
    check(upgrade, `hay una mejora de arma al alcance (${upgrade?.name} ${upgrade?.price}g)`);

    await debugPost(`/debug/gold?id=${get("ShopHero").id}&amount=3000`);
    await sleep(300);
    st = await debugState(mapId);
    const goldBefore = get("ShopHero").gold;
    hero.click(warriorShop.shop.x, warriorShop.shop.y);
    await sleep(600);
    hero.buy(upgrade!.index, 1);
    await sleep(1200);
    st = await debugState(mapId);
    const goldAfter = get("ShopHero").gold;
    check(goldAfter < goldBefore, `la compra descuenta oro (${goldBefore} -> ${goldAfter})`);

    const inv = get("ShopHero").inv as number[][];
    const bought = inv.find((e) => e[1] === upgrade!.id);
    check(bought, "el objeto comprado esta en el inventario");

    // Equiparlo cambia el arma activa.
    if (bought) {
        hero.equip(bought[0]);
        await sleep(1200);
        st = await debugState(mapId);
        check(weaponOf(get("ShopHero")) === upgrade!.id, `al equiparlo es el arma activa (${startWeapon} -> ${weaponOf(get("ShopHero"))})`);
    }

    hero.close();
    mage.close();
    console.log(failed === 0 ? "TEST TIENDA: OK" : `TEST TIENDA: ${failed} FALLOS`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
