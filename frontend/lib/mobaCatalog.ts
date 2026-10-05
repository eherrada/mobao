import raw from "./mobaCatalog.generated.json";

/**
 * Catálogo de habilidades y builds del MOBA (generado por el servidor: cd server && npm run export-ability-catalog).
 * Contrato en MOBAO.md → "Habilidades y builds".
 */

export type AbilityDef = {
    id: string;
    name: string;
    desc: string;
    tags: string[];
    target: string;
    range: number;
    cooldownMs: number;
    costBase: number;
    costPct: boolean;
    resource: string;
    icon: string;
    maxRank: number;
    kind: "aoSpell" | "tech";
    spellId: number;
};

export type SpecDef = { id: string; name: string; desc: string };
export type KitDef = { id: string; name: string; desc: string };

export type MobaBuild = {
    abilities: string[];
    ult: string;
    spec: string;
    kit: string;
};

export type ChampionCatalog = {
    templateId: number;
    name: string;
    role: string;
    resource: string;
    pool: AbilityDef[];
    ults: AbilityDef[];
    specs: SpecDef[];
    kits: KitDef[];
    defaultBuild: MobaBuild;
};

const CHAMPIONS = (raw as unknown as { champions: Record<string, ChampionCatalog> }).champions;

export function getChampionCatalog(templateId: number | null | undefined): ChampionCatalog | null {
    if (templateId === null || templateId === undefined) return null;
    return CHAMPIONS[String(templateId)] ?? null;
}

export const RESOURCE_LABELS: Record<string, string> = {
    mana: "Maná",
    furia: "Furia",
    energia: "Energía",
};

export const TARGET_LABELS: Record<string, string> = {
    point: "Apuntada",
    ally: "Aliado",
    area: "Área",
    line: "Línea",
    self: "Propia",
};

export const TAG_LABELS: Record<string, string> = {
    dano: "Daño",
    control: "Control",
    curacion: "Curación",
    escudo: "Escudo",
    movilidad: "Movilidad",
    utilidad: "Utilidad",
};

export function costLabel(ability: AbilityDef): string {
    const resource = RESOURCE_LABELS[ability.resource] ?? ability.resource;

    return ability.costPct
        ? `${ability.costBase}% de ${resource}`
        : `${ability.costBase} ${resource}`;
}

export function cooldownLabel(ability: AbilityDef): string {
    return ability.cooldownMs > 0
        ? `${ability.cooldownMs / 1000} s`
        : "Sin cooldown";
}

/** Borrador de build en el lobby: los slots pueden tener huecos hasta completar las 4 habilidades. */
export type BuildDraft = {
    slots: (string | null)[];
    ult: string;
    spec: string;
    kit: string;
};

export function draftFromBuild(build: MobaBuild): BuildDraft {
    return {
        slots: [0, 1, 2, 3].map((index) => build.abilities[index] ?? null),
        ult: build.ult,
        spec: build.spec,
        kit: build.kit,
    };
}

export function draftToBuild(draft: BuildDraft): MobaBuild | null {
    if (draft.slots.some((slot) => !slot)) return null;

    return {
        abilities: draft.slots as string[],
        ult: draft.ult,
        spec: draft.spec,
        kit: draft.kit,
    };
}

export function buildsEqual(a: MobaBuild | null, b: MobaBuild | null): boolean {
    if (!a || !b) return a === b;

    return (
        a.ult === b.ult &&
        a.spec === b.spec &&
        a.kit === b.kit &&
        a.abilities.length === b.abilities.length &&
        a.abilities.every((id, index) => id === b.abilities[index])
    );
}

/** Mismas reglas que el servidor: ids del pool del campeón, sin repetidos. */
export function isValidBuild(
    catalog: ChampionCatalog,
    build: MobaBuild | null | undefined,
): build is MobaBuild {
    if (!build || !Array.isArray(build.abilities) || build.abilities.length !== 4) {
        return false;
    }

    const poolIds = new Set(catalog.pool.map((ability) => ability.id));

    return (
        build.abilities.every((id) => poolIds.has(id)) &&
        new Set(build.abilities).size === 4 &&
        catalog.ults.some((ult) => ult.id === build.ult) &&
        catalog.specs.some((spec) => spec.id === build.spec) &&
        catalog.kits.some((kit) => kit.id === build.kit)
    );
}

export type BuildPreset = { id: string; label: string; hint: string; build: MobaBuild };

/** Presets por estilo derivados de los tags de las habilidades del pool (mantienen la especialización por defecto). */
export function buildPresets(catalog: ChampionCatalog): BuildPreset[] {
    const base = catalog.defaultBuild;
    const defs: { id: string; label: string; hint: string; tags: string[]; kit: string }[] = [
        { id: "dano", label: "Daño", hint: "Prioriza habilidades de daño", tags: ["dano"], kit: "ofensivo" },
        { id: "control", label: "Control", hint: "Control y movilidad", tags: ["control", "movilidad"], kit: "utilidad" },
        { id: "soporte", label: "Soporte", hint: "Curación, escudos y utilidad", tags: ["curacion", "escudo", "utilidad"], kit: "defensivo" },
    ];
    const result: BuildPreset[] = [];

    for (const def of defs) {
        const scored = catalog.pool
            .map((ability, index) => ({
                ability,
                index,
                score: ability.tags.reduce(
                    (sum, tag) => sum + (def.tags.includes(tag) ? 3 - def.tags.indexOf(tag) * 0.5 : 0),
                    0,
                ),
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.index - b.index);

        if (scored.length < 2) continue;

        const chosen = scored.slice(0, 4).map((entry) => entry.ability.id);

        // Completa con las del build por defecto si no alcanzan habilidades del estilo.
        for (const id of base.abilities) {
            if (chosen.length >= 4) break;
            if (!chosen.includes(id)) chosen.push(id);
        }

        const ult =
            catalog.ults.find((entry) => entry.tags.some((tag) => def.tags.includes(tag)))?.id ??
            base.ult;
        const kit = catalog.kits.some((entry) => entry.id === def.kit) ? def.kit : base.kit;
        const build: MobaBuild = { abilities: chosen.slice(0, 4), ult, spec: base.spec, kit };

        if (!isValidBuild(catalog, build)) continue;
        if (buildsEqual(build, base)) continue;
        if (result.some((entry) => buildsEqual(entry.build, build))) continue;

        result.push({ id: def.id, label: def.label, hint: def.hint, build });
    }

    return result;
}

const STORAGE_PREFIX = "mobao:build:";

/** Build guardado por campeón en este navegador (solo comodidad; la fuente de verdad es la sala). */
export function loadStoredDraft(templateId: number): BuildDraft | null {
    try {
        const text = window.localStorage.getItem(STORAGE_PREFIX + templateId);

        if (!text) return null;

        const parsed = JSON.parse(text) as BuildDraft;
        const catalog = getChampionCatalog(templateId);

        if (!catalog || !Array.isArray(parsed.slots) || parsed.slots.length !== 4) return null;

        const poolIds = new Set(catalog.pool.map((ability) => ability.id));
        const slots = parsed.slots.map((id) => (id && poolIds.has(id) ? id : null));

        return {
            slots,
            ult: catalog.ults.some((ult) => ult.id === parsed.ult) ? parsed.ult : catalog.defaultBuild.ult,
            spec: catalog.specs.some((spec) => spec.id === parsed.spec) ? parsed.spec : catalog.defaultBuild.spec,
            kit: catalog.kits.some((kit) => kit.id === parsed.kit) ? parsed.kit : catalog.defaultBuild.kit,
        };
    } catch {
        return null;
    }
}

export function storeDraft(templateId: number, draft: BuildDraft) {
    try {
        window.localStorage.setItem(STORAGE_PREFIX + templateId, JSON.stringify(draft));
    } catch {
        // sin almacenamiento disponible: no pasa nada
    }
}
