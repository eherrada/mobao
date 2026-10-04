export {};
const vars = require("../vars");

/**
 * Equipo del MOBA. Los heroes empiezan con equipo basico (nivel 0) y compran mejoras en la tienda (niveles 1-3).
 *
 * Las escaleras se generan solas a partir del catalogo de objetos de AO (vars.datObj): para cada clase, raza y
 * espacio (arma, armadura, escudo, casco) se elige, dentro de un tope de precio por nivel, el objeto utilizable
 * con mayor poder. Asi se respetan las restricciones de clase y de raza (enanos y gnomos usan armaduras propias).
 */
export type Slot = "weapon" | "armor" | "shield" | "helmet";
const SLOTS: Slot[] = ["weapon", "armor", "shield", "helmet"];

// Precio maximo del objeto de cada nivel de equipo (0 = inicial).
const TIER_CAPS = [450, 1800, 4800, 12000];

const OBJ_TYPE: Record<Slot, number> = { weapon: 2, armor: 3, shield: 16, helmet: 17 };

type Obj = {
    name: string;
    objType: number;
    valor?: number;
    minHit?: number;
    maxHit?: number;
    minDef?: number;
    maxDef?: number;
    proyectil?: number;
    magicDamageBonus?: number;
    razaEnana?: number;
    newbie?: number;
    clasesNoPermitidas?: number[];
};

const CLASS_MAGE = 1;
const CLASS_HUNTER = 9;
const POTIONS = { red: 38, blue: 37 };
const ARROW_ITEM = 553;

// Objetos del catalogo de AO que no sirven como equipo de partida (variantes femeninas, ropa de oficio, eventos).
const EXCLUDED_NAMES = /(.*-M)|vestido|novia|olimp|esclav|harapos|minero|pescador|brial|white lady|estuaria|legendaria|laureles/i;

/** Poder para ordenar la escalera: el precio de AO refleja el valor del objeto (los datos de defensa son poco confiables). */
function power(obj: Obj, slot: Slot, classId: number): number {
    void slot;
    void classId;
    return Number(obj.valor ?? 0);
}

function hasStats(obj: Obj, slot: Slot): boolean {
    if (slot === "weapon") {
        return Number(obj.maxHit ?? 0) >= 1 || Number(obj.magicDamageBonus ?? 0) > 0;
    }

    return Number(obj.maxDef ?? 0) >= 1;
}

function usable(id: string, obj: Obj, slot: Slot, classId: number, dwarf: boolean): boolean {
    if (!obj || obj.objType !== OBJ_TYPE[slot] || obj.newbie || Number(obj.valor ?? 0) <= 0) return false;
    if (EXCLUDED_NAMES.test(obj.name) || !hasStats(obj, slot)) return false;
    if (Array.isArray(obj.clasesNoPermitidas) && obj.clasesNoPermitidas.includes(classId)) return false;

    if (slot === "armor") return Boolean(obj.razaEnana) === dwarf;

    if (slot === "weapon") {
        const isBow = Boolean(obj.proyectil);
        const isStaff = Number(obj.magicDamageBonus ?? 0) > 0;

        if (classId === CLASS_HUNTER) return isBow;
        if (isBow) return false;
        if (classId === CLASS_MAGE) return isStaff;

        return true;
    }

    return true;
}

export type Ladder = Record<Slot, number[]>;
const cache = new Map<string, Ladder>();

/** Escalera de equipo de una clase: para cada espacio, el id del objeto de cada nivel (0 = ninguno). */
function ladderFor(classId: number, dwarf: boolean): Ladder {
    const key = `${classId}:${dwarf ? 1 : 0}`;
    const cached = cache.get(key);

    if (cached) return cached;

    const ladder = { weapon: [], armor: [], shield: [], helmet: [] } as Ladder;

    for (const slot of SLOTS) {
        const candidates = Object.entries(vars.datObj as Record<string, Obj>)
            .filter(([id, obj]) => usable(id, obj, slot, classId, dwarf))
            .map(([id, obj]) => ({ id: Number(id), price: Number(obj.valor), pow: power(obj, slot, classId) }));

        let lastPower = -1;
        let lastId = 0;

        TIER_CAPS.forEach((cap, tier) => {
            const best = candidates
                .filter((c) => c.price <= cap && c.pow > lastPower)
                .sort((a, b) => b.pow - a.pow || a.price - b.price)[0];

            if (best) {
                lastPower = best.pow;
                lastId = best.id;
            }

            // Si no hay una mejora en este nivel se mantiene el objeto anterior (o ninguno).
            ladder[slot][tier] = best ? best.id : tier === 0 ? 0 : lastId;
        });
    }

    cache.set(key, ladder);
    return ladder;
}

const isDwarf = (raceId: number) => raceId === 4 || raceId === 5;

/** Inventario inicial de un heroe: equipo de nivel `tier` equipado, pociones y flechas si hace falta. */
function buildInventory(classId: number, raceId: number, tier = 0): Record<number, { idItem: number; cant: number; equipped: number }> {
    const ladder = ladderFor(classId, isDwarf(raceId));
    const inv: Record<number, { idItem: number; cant: number; equipped: number }> = {};
    let slot = 1;

    inv[slot++] = { idItem: POTIONS.red, cant: 8, equipped: 0 };
    inv[slot++] = { idItem: POTIONS.blue, cant: 8, equipped: 0 };

    for (const s of SLOTS) {
        const id = ladder[s][tier];

        if (id) inv[slot++] = { idItem: id, cant: 1, equipped: 1 };
    }

    if (classId === CLASS_HUNTER) inv[slot++] = { idItem: ARROW_ITEM, cant: 300, equipped: 1 };

    return inv;
}

/** Todos los objetos que la tienda puede vender (niveles 1-3 de cualquier clase y raza + pociones). */
function shopCatalog(): number[] {
    const ids = new Set<number>([POTIONS.red, POTIONS.blue]);

    for (const classId of [1, 2, 3, 4, 6, 7, 8, 9]) {
        for (const dwarf of [false, true]) {
            const ladder = ladderFor(classId, dwarf);

            for (const s of SLOTS) {
                for (let tier = 1; tier < TIER_CAPS.length; tier++) {
                    if (ladder[s][tier]) ids.add(ladder[s][tier]);
                }
            }
        }
    }

    ids.add(ARROW_ITEM);
    return [...ids];
}

/** Lo que se le ofrece a un heroe en la tienda: sus mejoras (niveles 1-3), pociones y flechas si es cazador. */
function offeredTo(user: { idClase: number; idRaza: number }): Set<number> {
    const ladder = ladderFor(user.idClase, isDwarf(user.idRaza));
    const ids = new Set<number>([POTIONS.red, POTIONS.blue]);

    for (const s of SLOTS) {
        for (let tier = 1; tier < TIER_CAPS.length; tier++) {
            if (ladder[s][tier]) ids.add(ladder[s][tier]);
        }
    }

    if (user.idClase === CLASS_HUNTER) ids.add(ARROW_ITEM);
    return ids;
}

module.exports = { TIER_CAPS, ladderFor, buildInventory, shopCatalog, offeredTo };
