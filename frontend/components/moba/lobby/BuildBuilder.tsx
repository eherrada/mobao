"use client";

import type { ComponentType } from "react";
import {
    AudioWaveform,
    Axe,
    Bug,
    ChevronLeft,
    ChevronRight,
    ChevronsRight,
    Cloud,
    CloudLightning,
    CloudRain,
    Crosshair,
    Droplets,
    Dumbbell,
    EyeOff,
    Fan,
    Flame,
    FlameKindling,
    FlaskConical,
    Footprints,
    Gavel,
    Hammer,
    Heart,
    HeartHandshake,
    HeartPulse,
    Leaf,
    Link,
    Megaphone,
    MicVocal,
    MoveDiagonal,
    MoveUpRight,
    Music,
    Music2,
    Shield,
    ShieldAlert,
    ShieldPlus,
    Skull,
    Snail,
    Snowflake,
    Sparkles,
    Sprout,
    Sun,
    Sword,
    Target,
    Trees,
    TriangleAlert,
    Undo2,
    WandSparkles,
    Wind,
    X,
    Zap,
} from "lucide-react";
import {
    buildPresets,
    buildsEqual,
    cooldownLabel,
    costLabel,
    draftFromBuild,
    draftToBuild,
    getChampionCatalog,
    TAG_LABELS,
    TARGET_LABELS,
    type AbilityDef,
    type BuildDraft,
    type ChampionCatalog,
    type MobaBuild,
} from "@/lib/mobaCatalog";

type IconComponent = ComponentType<{ className?: string }>;

/** Íconos lucide que usa el catálogo para las técnicas nuevas (campo icon, en kebab-case). */
const LUCIDE_ICONS: Record<string, IconComponent> = {
    "audio-waveform": AudioWaveform,
    axe: Axe,
    bug: Bug,
    "chevrons-right": ChevronsRight,
    cloud: Cloud,
    "cloud-lightning": CloudLightning,
    "cloud-rain": CloudRain,
    crosshair: Crosshair,
    droplets: Droplets,
    dumbbell: Dumbbell,
    "eye-off": EyeOff,
    fan: Fan,
    flame: Flame,
    "flame-kindling": FlameKindling,
    "flask-conical": FlaskConical,
    footprints: Footprints,
    gavel: Gavel,
    hammer: Hammer,
    heart: Heart,
    "heart-handshake": HeartHandshake,
    "heart-pulse": HeartPulse,
    leaf: Leaf,
    link: Link,
    megaphone: Megaphone,
    "mic-vocal": MicVocal,
    "move-diagonal": MoveDiagonal,
    "move-up-right": MoveUpRight,
    music: Music,
    "music-2": Music2,
    shield: Shield,
    "shield-alert": ShieldAlert,
    "shield-plus": ShieldPlus,
    skull: Skull,
    snail: Snail,
    snowflake: Snowflake,
    sparkles: Sparkles,
    sprout: Sprout,
    sun: Sun,
    sword: Sword,
    target: Target,
    trees: Trees,
    "triangle-alert": TriangleAlert,
    "undo-2": Undo2,
    "wand-sparkles": WandSparkles,
    wind: Wind,
    zap: Zap,
};

/** Ícono de una habilidad: gráfico original de AO para los hechizos clásicos, lucide para las técnicas nuevas. */
export function AbilityIcon({
    ability,
    className = "h-10 w-10",
}: {
    ability: AbilityDef;
    className?: string;
}) {
    if (ability.kind === "aoSpell") {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={`/static/spells/${ability.spellId}.png`}
                alt={ability.name}
                className={`${className} shrink-0 rounded-sm border border-[#c8aa6e]/60 bg-black/60 object-cover [image-rendering:pixelated]`}
                draggable={false}
            />
        );
    }

    const Icon = LUCIDE_ICONS[ability.icon] ?? Sparkles;

    return (
        <span
            className={`${className} flex shrink-0 items-center justify-center rounded-sm border border-white/20 bg-gradient-to-b from-slate-700/60 to-slate-900 text-slate-200`}
        >
            <Icon className="h-[60%] w-[60%]" />
        </span>
    );
}

function AoBadge() {
    return (
        <span
            title="Hechizo clásico de Argentum Online"
            className="rounded-sm bg-[#c8aa6e] px-1 text-[9px] font-black leading-[14px] tracking-wider text-[#1a1307]"
        >
            AO
        </span>
    );
}

function TagChips({ tags }: { tags: string[] }) {
    return (
        <>
            {tags.map((tag) => (
                <span
                    key={tag}
                    className="rounded-sm bg-white/[0.07] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-slate-300"
                >
                    {TAG_LABELS[tag] ?? tag}
                </span>
            ))}
        </>
    );
}

function AbilityStats({ ability }: { ability: AbilityDef }) {
    return (
        <p className="text-[10px] leading-snug text-slate-500">
            {costLabel(ability)} · Alcance {ability.range} ·{" "}
            {TARGET_LABELS[ability.target] ?? ability.target} ·{" "}
            {cooldownLabel(ability)}
        </p>
    );
}

/** Fila compacta de íconos del build (4 habilidades + definitiva) para slots y galería. */
export function BuildIcons({
    templateId,
    build,
    className = "h-5 w-5",
}: {
    templateId: number | null;
    build: MobaBuild | null | undefined;
    className?: string;
}) {
    const catalog = getChampionCatalog(templateId);

    if (!catalog) return null;

    const effective = build ?? catalog.defaultBuild;
    const abilities = effective.abilities
        .map((id) => catalog.pool.find((entry) => entry.id === id))
        .filter((entry): entry is AbilityDef => Boolean(entry));
    const ult = catalog.ults.find((entry) => entry.id === effective.ult);

    return (
        <span
            className="flex items-center gap-1"
            title={build ? "Build elegido" : "Build por defecto"}
        >
            {abilities.map((ability) => (
                <span key={ability.id} title={ability.name}>
                    <AbilityIcon ability={ability} className={className} />
                </span>
            ))}
            {ult ? (
                <span
                    title={`Definitiva: ${ult.name}`}
                    className="ml-0.5 rounded-sm ring-1 ring-[#e6c987]"
                >
                    <AbilityIcon ability={ult} className={className} />
                </span>
            ) : null}
        </span>
    );
}

function SectionLabel({
    children,
    aside,
}: {
    children: string;
    aside?: string;
}) {
    return (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                {children}
            </p>
            {aside ? (
                <span className="text-[10px] text-slate-500">{aside}</span>
            ) : null}
        </div>
    );
}

function cardClass(active: boolean, readOnly: boolean) {
    return `rounded border p-2 text-left transition ${
        active
            ? "border-[#e6c987] bg-[#c8aa6e]/[0.12]"
            : "border-white/10 bg-white/[0.03]"
    } ${readOnly ? "cursor-default" : active ? "" : "hover:border-white/30"}`;
}

/**
 * Constructor de build estilo página de campeón: 4 habilidades del pool, 1 definitiva, 1 especialización y 1 kit.
 * Con readOnly muestra el pool y el build por defecto sin permitir cambios (galería).
 */
export default function BuildBuilder({
    templateId,
    draft,
    onChange,
    readOnly = false,
}: {
    templateId: number;
    draft?: BuildDraft;
    onChange?: (draft: BuildDraft) => void;
    readOnly?: boolean;
}) {
    const catalog = getChampionCatalog(templateId);

    if (!catalog) return null;

    return (
        <Builder
            catalog={catalog}
            draft={draft ?? draftFromBuild(catalog.defaultBuild)}
            onChange={onChange}
            readOnly={readOnly}
        />
    );
}

function Builder({
    catalog,
    draft,
    onChange,
    readOnly,
}: {
    catalog: ChampionCatalog;
    draft: BuildDraft;
    onChange?: (draft: BuildDraft) => void;
    readOnly: boolean;
}) {
    const pool = catalog.pool;
    const byId = new Map<string, AbilityDef>(
        [...pool, ...catalog.ults].map((ability) => [ability.id, ability]),
    );
    const complete = draft.slots.every(Boolean);
    const current = draftToBuild(draft);
    const isDefault = buildsEqual(current, catalog.defaultBuild);
    const presets = buildPresets(catalog);
    const edit = (next: BuildDraft) => {
        if (!readOnly) onChange?.(next);
    };

    const toggleAbility = (id: string) => {
        const slot = draft.slots.indexOf(id);

        if (slot >= 0) {
            edit({ ...draft, slots: draft.slots.map((entry, index) => (index === slot ? null : entry)) });
            return;
        }

        const free = draft.slots.indexOf(null);

        if (free < 0) return;

        edit({ ...draft, slots: draft.slots.map((entry, index) => (index === free ? id : entry)) });
    };

    const moveSlot = (index: number, delta: -1 | 1) => {
        const target = index + delta;

        if (target < 0 || target > 3) return;

        const slots = [...draft.slots];
        [slots[index], slots[target]] = [slots[target], slots[index]];
        edit({ ...draft, slots });
    };

    const ult = catalog.ults.find((entry) => entry.id === draft.ult);
    const spec = catalog.specs.find((entry) => entry.id === draft.spec);
    const kit = catalog.kits.find((entry) => entry.id === draft.kit);

    return (
        <div className="space-y-4" data-testid="build-builder">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#c8aa6e]">
                    {readOnly ? "Habilidades y build por defecto" : "Tu build"}
                </p>
                {!readOnly ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {presets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                title={preset.hint}
                                onClick={() => edit(draftFromBuild(preset.build))}
                                className="rounded border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-[#c8aa6e]/60 hover:text-[#e6c987]"
                            >
                                {preset.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            disabled={isDefault}
                            onClick={() => edit(draftFromBuild(catalog.defaultBuild))}
                            className="rounded border border-[#c8aa6e]/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#e6c987] transition hover:bg-[#c8aa6e]/10 disabled:cursor-default disabled:opacity-40"
                        >
                            Build por defecto
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Slots 1-4 */}
            <div>
                <SectionLabel
                    aside={
                        readOnly
                            ? undefined
                            : complete
                              ? "Guardado automáticamente"
                              : `Elegí ${draft.slots.filter((s) => !s).length} más`
                    }
                >
                    Habilidades (4 del pool)
                </SectionLabel>
                <div className="grid grid-cols-4 gap-1.5">
                    {draft.slots.map((id, index) => {
                        const ability = id ? byId.get(id) : null;

                        return (
                            <div
                                key={index}
                                data-testid={`build-slot-${index + 1}`}
                                className={`relative flex flex-col items-center gap-1 rounded border px-1 pb-1.5 pt-3 ${
                                    ability
                                        ? "border-[#c8aa6e]/50 bg-[#c8aa6e]/[0.06]"
                                        : "border-dashed border-white/20 bg-black/20"
                                }`}
                            >
                                <span className="absolute left-1 top-0.5 text-[10px] font-black text-[#e6c987]">
                                    {index + 1}
                                </span>
                                {ability ? (
                                    <>
                                        <AbilityIcon ability={ability} className="h-9 w-9" />
                                        <span className="w-full truncate text-center text-[10px] font-semibold text-slate-200">
                                            {ability.name}
                                        </span>
                                        {!readOnly ? (
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    aria-label="Mover a la izquierda"
                                                    disabled={index === 0}
                                                    onClick={() => moveSlot(index, -1)}
                                                    className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                                                >
                                                    <ChevronLeft className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`Quitar ${ability.name}`}
                                                    onClick={() => toggleAbility(ability.id)}
                                                    className="rounded p-0.5 text-slate-400 hover:text-red-300"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Mover a la derecha"
                                                    disabled={index === 3}
                                                    onClick={() => moveSlot(index, 1)}
                                                    className="rounded p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                                                >
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <span className="flex h-[58px] items-center text-[10px] uppercase tracking-wider text-slate-600">
                                        Vacío
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Pool */}
            <div>
                <SectionLabel aside={`${pool.length} disponibles`}>
                    Pool de habilidades
                </SectionLabel>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                    {pool.map((ability) => {
                        const slot = draft.slots.indexOf(ability.id);
                        const selected = slot >= 0;
                        const full = !selected && !draft.slots.includes(null);

                        return (
                            <li key={ability.id}>
                                <button
                                    type="button"
                                    data-testid={`pool-${ability.id}`}
                                    disabled={readOnly || (full && !selected)}
                                    onClick={() => toggleAbility(ability.id)}
                                    className={`flex w-full gap-2 ${cardClass(selected, readOnly)} ${
                                        full && !readOnly ? "opacity-50" : ""
                                    }`}
                                >
                                    <div className="relative">
                                        <AbilityIcon ability={ability} />
                                        {selected ? (
                                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#e6c987] text-[10px] font-black text-[#1a1307]">
                                                {slot + 1}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-xs font-semibold text-slate-100">
                                                {ability.name}
                                            </span>
                                            {ability.kind === "aoSpell" ? <AoBadge /> : null}
                                            <TagChips tags={ability.tags} />
                                        </div>
                                        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                                            {ability.desc}
                                        </p>
                                        <AbilityStats ability={ability} />
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Definitiva */}
            <div>
                <SectionLabel aside="1 de 2">Definitiva</SectionLabel>
                <div className="grid gap-1.5 sm:grid-cols-2">
                    {catalog.ults.map((ability) => (
                        <button
                            key={ability.id}
                            type="button"
                            data-testid={`ult-${ability.id}`}
                            disabled={readOnly}
                            onClick={() => edit({ ...draft, ult: ability.id })}
                            className={`flex gap-2 ${cardClass(draft.ult === ability.id, readOnly)}`}
                        >
                            <AbilityIcon ability={ability} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-semibold text-slate-100">
                                        {ability.name}
                                    </span>
                                    {ability.kind === "aoSpell" ? <AoBadge /> : null}
                                    <TagChips tags={ability.tags} />
                                </div>
                                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                                    {ability.desc}
                                </p>
                                <AbilityStats ability={ability} />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Especialización */}
            <div>
                <SectionLabel aside="1 de 3">Especialización</SectionLabel>
                <div className="grid gap-1.5 sm:grid-cols-3">
                    {catalog.specs.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            data-testid={`spec-${entry.id}`}
                            disabled={readOnly}
                            onClick={() => edit({ ...draft, spec: entry.id })}
                            className={cardClass(draft.spec === entry.id, readOnly)}
                        >
                            <span className="text-xs font-semibold text-slate-100">
                                {entry.name}
                            </span>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                                {entry.desc}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Kit de inicio */}
            <div>
                <SectionLabel aside="1 de 3">Kit de inicio</SectionLabel>
                <div className="grid gap-1.5 sm:grid-cols-3">
                    {catalog.kits.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            data-testid={`kit-${entry.id}`}
                            disabled={readOnly}
                            onClick={() => edit({ ...draft, kit: entry.id })}
                            className={cardClass(draft.kit === entry.id, readOnly)}
                        >
                            <span className="text-xs font-semibold text-slate-100">
                                {entry.name}
                            </span>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                                {entry.desc}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Resumen */}
            <div className="rounded border border-[#c8aa6e]/30 bg-black/30 p-3">
                <SectionLabel>{readOnly ? "Build por defecto" : "Resumen del build"}</SectionLabel>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        {draft.slots.map((id, index) => {
                            const ability = id ? byId.get(id) : null;

                            return ability ? (
                                <span key={index} title={ability.name}>
                                    <AbilityIcon ability={ability} className="h-8 w-8" />
                                </span>
                            ) : (
                                <span
                                    key={index}
                                    className="h-8 w-8 rounded-sm border border-dashed border-white/20"
                                />
                            );
                        })}
                        {ult ? (
                            <span
                                title={`Definitiva: ${ult.name}`}
                                className="ml-1 rounded-sm ring-2 ring-[#e6c987]"
                            >
                                <AbilityIcon ability={ult} className="h-8 w-8" />
                            </span>
                        ) : null}
                    </div>
                    <p className="min-w-0 flex-1 text-xs text-slate-300">
                        <span className="text-slate-500">Def.</span> {ult?.name ?? "-"} ·{" "}
                        <span className="text-slate-500">Esp.</span> {spec?.name ?? "-"} ·{" "}
                        <span className="text-slate-500">Kit</span> {kit?.name ?? "-"}
                        {!readOnly && isDefault ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-[#c8aa6e]">
                                por defecto
                            </span>
                        ) : null}
                    </p>
                </div>
                {!readOnly && !complete ? (
                    <p className="mt-2 text-[11px] text-amber-300">
                        Completá las 4 habilidades para guardar el build; mientras tanto se usa el último guardado (o el
                        por defecto).
                    </p>
                ) : null}
            </div>
        </div>
    );
}
