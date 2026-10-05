"use client";

import {
    CHAMPION_STAT_LABELS,
    getChampionSprite,
    type ChampionInfo,
    type ChampionStatKey,
} from "@/lib/mobaChampions";
import { MOBA_RACES } from "@/lib/arenas";
import type { BuildDraft } from "@/lib/mobaCatalog";
import BuildBuilder from "./BuildBuilder";
import SpriteImage from "./SpriteImage";

/** Retrato del campeón con la raza elegida (sprite real de AO sobre fondo del color del campeón). */
export function ChampionPortrait({
    champion,
    raceId,
    className = "h-48 w-36",
    mode = "full",
    scale = 3,
    zoom,
}: {
    champion: ChampionInfo;
    raceId: number;
    className?: string;
    mode?: "full" | "head";
    scale?: number;
    /** Ampliación visual del sprite (por defecto 1.7 en cuerpo entero, 1 en cabeza). */
    zoom?: number;
}) {
    const effectiveZoom = zoom ?? (mode === "full" ? 1.7 : 1);

    return (
        <div
            className={`relative flex shrink-0 items-end justify-center overflow-hidden rounded-md border border-[#c8aa6e]/30 ${className}`}
            style={{
                background: `radial-gradient(circle at 50% 35%, ${champion.accent}55, transparent 65%), linear-gradient(180deg, #111a2a, #070b13)`,
            }}
        >
            <SpriteImage
                sprite={getChampionSprite(champion, raceId)}
                mode={mode}
                scale={scale}
                alt={champion.name}
                className="h-full w-full object-contain"
                style={{ transform: `scale(${effectiveZoom})` }}
            />
        </div>
    );
}

export function StatBars({
    stats,
    accent,
}: {
    stats: ChampionInfo["stats"];
    accent: string;
}) {
    return (
        <div className="space-y-2">
            {(Object.keys(CHAMPION_STAT_LABELS) as ChampionStatKey[]).map((key) => (
                <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-slate-400">
                        {CHAMPION_STAT_LABELS[key]}
                    </span>
                    <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4, 5].map((step) => (
                            <span
                                key={step}
                                className="h-2 flex-1 rounded-sm"
                                style={{
                                    background:
                                        step <= stats[key]
                                            ? accent
                                            : "rgba(255,255,255,0.08)",
                                }}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function RaceSelector({
    raceId,
    onChange,
    disabled,
}: {
    raceId: number;
    onChange?: (raceId: number) => void;
    disabled?: boolean;
}) {
    const selected =
        MOBA_RACES.find((race) => race.id === raceId) ?? MOBA_RACES[0];

    return (
        <div>
            <div className="flex flex-wrap gap-1.5">
                {MOBA_RACES.map((race) => (
                    <button
                        key={race.id}
                        type="button"
                        disabled={disabled || !onChange}
                        onClick={() => onChange?.(race.id)}
                        className={`rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition disabled:cursor-default ${
                            race.id === raceId
                                ? "border-[#c8aa6e] bg-[#c8aa6e]/15 text-[#e6c987]"
                                : "border-white/10 text-slate-400 hover:border-white/30 hover:text-slate-100"
                        }`}
                    >
                        {race.name}
                    </button>
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-300">{selected.mods}</p>
            <p className="text-xs text-slate-500">{selected.note}</p>
        </div>
    );
}

export function AbilityList({ champion }: { champion: ChampionInfo }) {
    if (champion.abilities.length === 0) {
        return (
            <p className="rounded border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-300">
                {champion.passive}
            </p>
        );
    }

    return (
        <ul className="grid gap-1.5 sm:grid-cols-2">
            {champion.abilities.map((ability) => (
                <li
                    key={ability.spellId}
                    className={`rounded border p-2.5 ${
                        ability.ultimate
                            ? "border-[#c8aa6e]/50 bg-[#c8aa6e]/[0.07]"
                            : "border-white/10 bg-white/[0.03]"
                    }`}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">
                            {ability.name}
                        </span>
                        {ability.ultimate ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#e6c987]">
                                Definitiva
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                        {ability.description}
                    </p>
                </li>
            ))}
        </ul>
    );
}

/** Ficha completa de un campeón: retrato, rol, estadísticas, kit y selector de raza. */
export default function ChampionDetail({
    champion,
    raceId,
    onRaceChange,
    raceLocked,
    buildDraft,
    onBuildChange,
    buildReadOnly,
}: {
    champion: ChampionInfo;
    raceId: number;
    onRaceChange?: (raceId: number) => void;
    raceLocked?: boolean;
    /** Borrador del build (lobby). Sin él y con buildReadOnly se muestra el pool y el build por defecto (galería). */
    buildDraft?: BuildDraft;
    onBuildChange?: (draft: BuildDraft) => void;
    buildReadOnly?: boolean;
}) {
    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <ChampionPortrait
                    champion={champion}
                    raceId={raceId}
                    className="h-56 w-40"
                    scale={4}
                />
                <div className="min-w-0 flex-1">
                    <p
                        className="text-[11px] font-bold uppercase tracking-[0.28em]"
                        style={{ color: champion.accent }}
                    >
                        {champion.role}
                    </p>
                    <h3 className="text-3xl font-bold text-slate-50">
                        {champion.name}
                    </h3>
                    <p className="text-sm italic text-[#c8aa6e]">
                        {champion.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{champion.style}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                        {champion.blurb}
                    </p>
                    <div className="mt-3">
                        <StatBars stats={champion.stats} accent={champion.accent} />
                    </div>
                </div>
            </div>

            <div>
                <BuildBuilder
                    templateId={champion.id}
                    draft={buildDraft}
                    onChange={onBuildChange}
                    readOnly={buildReadOnly}
                />
            </div>

            <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                    Raza
                </p>
                <RaceSelector
                    raceId={raceId}
                    onChange={onRaceChange}
                    disabled={raceLocked}
                />
            </div>
        </div>
    );
}

/** Grilla de selección de campeones. */
export function ChampionGrid({
    champions,
    selectedId,
    raceId,
    onSelect,
}: {
    champions: ChampionInfo[];
    selectedId: number | null;
    raceId: number;
    onSelect: (id: number) => void;
}) {
    return (
        <div className="grid grid-cols-4 gap-2">
            {champions.map((champion) => {
                const active = champion.id === selectedId;

                return (
                    <button
                        key={champion.id}
                        type="button"
                        onClick={() => onSelect(champion.id)}
                        className={`group relative overflow-hidden rounded-md border text-left transition ${
                            active
                                ? "border-[#e6c987] shadow-[0_0_0_1px_#e6c987]"
                                : "border-white/10 hover:border-[#c8aa6e]/60"
                        }`}
                    >
                        <ChampionPortrait
                            champion={champion}
                            raceId={raceId}
                            className="h-24 w-full !rounded-none !border-0"
                            scale={3}
                        />
                        <div className="bg-black/60 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-200">
                            {champion.name}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
