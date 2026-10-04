export {};
const vars = require("../vars");

/**
 * Razas jugables del MOBA. Los modificadores de atributos salen de vars.balanceRazas (fuerza/agilidad/
 * inteligencia/constitucion) y ya los aplica login.connectCharacterPvP al armar el heroe; aca se resuelve
 * lo visual (cabeza) y el equipo (enanos y gnomos usan armaduras propias).
 */
export const RACES: Array<{ id: number; name: string; headId: number }> = [
    { id: 1, name: "Humano", headId: 1 },
    { id: 2, name: "Elfo", headId: 101 },
    { id: 3, name: "Elfo Drow", headId: 201 },
    { id: 4, name: "Enano", headId: 301 },
    { id: 5, name: "Gnomo", headId: 401 },
];

const DWARF_RACES = new Set([4, 5]);

type ObjData = {
    objType: number;
    razaEnana?: number;
    minDef?: number;
    maxDef?: number;
    valor?: number;
    newbie?: number;
    anim?: number;
    clasesNoPermitidas?: number[];
};

function averageDefense(obj: ObjData): number {
    return (Number(obj.minDef ?? 0) + Number(obj.maxDef ?? 0)) / 2;
}

/** Armadura de enano/gnomo mas parecida (por defensa) a la original y permitida para la clase. */
function pickDwarfArmor(original: ObjData, classId: number): { id: number; obj: ObjData } | null {
    const target = averageDefense(original);
    let best: { id: number; obj: ObjData; gap: number } | null = null;

    for (const [id, raw] of Object.entries(vars.datObj as Record<string, ObjData>)) {
        const obj = raw;

        if (!obj || obj.objType !== vars.objType.armaduras || !obj.razaEnana || obj.newbie) continue;
        if (Number(obj.valor ?? 0) <= 0 || !obj.anim) continue;
        if (Array.isArray(obj.clasesNoPermitidas) && obj.clasesNoPermitidas.includes(classId)) continue;

        const gap = Math.abs(averageDefense(obj) - target);

        if (!best || gap < best.gap || (gap === best.gap && Number(obj.valor) < Number(best.obj.valor))) {
            best = { id: Number(id), obj, gap };
        }
    }

    return best ? { id: best.id, obj: best.obj } : null;
}

/** Aplica la raza elegida a la plantilla del heroe (ya clonada). */
function applyRace(character: any, raceId: number): void {
    const race = RACES.find((r) => r.id === raceId) ?? RACES[0];

    character.idRaza = race.id;
    character.idHead = race.headId;

    if (!DWARF_RACES.has(race.id)) return;

    // Enanos y gnomos no pueden usar las armaduras de talla humana: se reemplaza por la equivalente.
    for (const item of Object.values(character.inv ?? {}) as Array<{ idItem: number; equipped: number }>) {
        const obj = vars.datObj[item.idItem] as ObjData | undefined;

        if (!obj || obj.objType !== vars.objType.armaduras || !item.equipped || obj.razaEnana) continue;

        const replacement = pickDwarfArmor(obj, character.idClase);

        if (replacement) {
            item.idItem = replacement.id;
            character.idBody = Number(replacement.obj.anim);
        }
    }
}

module.exports = { RACES, applyRace, pickDwarfArmor };
