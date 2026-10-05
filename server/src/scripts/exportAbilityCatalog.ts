/**
 * Exporta el catalogo de habilidades del MOBA al frontend (datos puros, sin logica):
 *   cd server && npx tsx src/scripts/exportAbilityCatalog.ts
 * Genera frontend/lib/mobaCatalog.generated.json con
 *   champions[templateId] = { name, role, resource, pool: AbilityDef[], ults: AbilityDef[], specs: SpecDef[],
 *                             kits: KitDef[], defaultBuild: { abilities: string[4], ult, spec, kit } }
 * AbilityDef = { id, name, desc, tags[], target, range, cooldownMs, costBase, costPct, resource, icon, maxRank, kind, spellId }
 * (costPct: costBase es % del maximo del recurso; si no, mana absoluto de AO). Los campos del motor (shape, onEnemy, ...)
 * se omiten del archivo del frontend.
 */
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CHAMPIONS } = require("../moba/abilityCatalog");

const PUBLIC_FIELDS = ["id", "name", "desc", "tags", "target", "range", "cooldownMs", "costBase", "costPct", "resource", "icon", "maxRank", "kind", "spellId"];

const pick = (def: Record<string, unknown>) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, def[k]]));

const champions: Record<string, unknown> = {};

for (const [templateId, champ] of Object.entries(CHAMPIONS as Record<string, any>)) {
    champions[templateId] = {
        templateId: champ.templateId,
        name: champ.name,
        role: champ.role,
        resource: champ.resource,
        pool: champ.pool.map(pick),
        ults: champ.ults.map(pick),
        specs: champ.specs,
        kits: champ.kits,
        defaultBuild: champ.defaultBuild,
    };
}

const out = path.resolve(__dirname, "../../../frontend/lib/mobaCatalog.generated.json");
fs.writeFileSync(out, JSON.stringify({ version: 1, champions }, null, 2) + "\n");
console.log(`Catalogo exportado: ${out} (${Object.keys(champions).length} campeones)`);
