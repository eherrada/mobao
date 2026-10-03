/* eslint-disable @next/next/no-img-element */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Flame, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/number-format";
import type {
    RankingCharacter,
    RankingHeadSprite,
    RankingPageData,
} from "@/lib/ranking";

type RankingViewProps = {
    characters: RankingCharacter[];
    headSpritesById: Record<string, RankingHeadSprite | null>;
};

type RankingSortKey = "level" | "kills";
type RankingClassFilter = "all" | number;

const MAX_LEVEL = 50;

const sortOptions: Array<{ key: RankingSortKey; label: string }> = [
    { key: "level", label: "Nivel" },
    { key: "kills", label: "Kills" },
];

const classLabels: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

const raceLabels: Record<number, string> = {
    1: "Humano",
    2: "Elfo",
    3: "Elfo Drow",
    4: "Enano",
    5: "Gnomo",
};

const factionColors = {
    armada: "#00AFFF",
    caos: "#9B0000",
} as const;

const classFilterOptions = [
    { value: "all" as const, label: "Todos" },
    ...Object.entries(classLabels).map(([value, label]) => ({
        value: Number(value),
        label,
    })),
];

function getMetricLabel(character: RankingCharacter, sortKey: RankingSortKey) {
    return sortKey === "level"
        ? isMaxLevelCharacter(character)
            ? `Nivel ${formatNumber(character.level)}`
            : `Nivel ${formatNumber(character.level)} (${formatExperiencePercent(character)})`
        : `${formatNumber(character.kills)} kills`;
}

function isMaxLevelCharacter(character: RankingCharacter) {
    return character.level >= MAX_LEVEL;
}

function getExperiencePercent(character: RankingCharacter) {
    if (character.expNextLevel <= 0) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(100, (character.exp / character.expNextLevel) * 100),
    );
}

function formatExperiencePercent(character: RankingCharacter) {
    return `${Math.round(getExperiencePercent(character))}%`;
}

function getCharacterMeta(character: RankingCharacter) {
    const classLabel =
        classLabels[character.idClase] ?? `Clase ${character.idClase}`;
    const raceLabel =
        raceLabels[character.idRaza] ?? `Raza ${character.idRaza}`;
    return `${classLabel} · ${raceLabel}`;
}

function getCharacterNameColor(character: RankingCharacter) {
    if (character.faction === "armada") {
        return factionColors.armada;
    }

    if (character.faction === "caos") {
        return factionColors.caos;
    }

    return character.criminal ? "red" : "#3333ff";
}

function getClanTag(character: RankingCharacter) {
    return character.clanName ? `<${character.clanName}>` : null;
}

function formatUpdatedAt(value: string) {
    return new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function sortCharacters(
    characters: RankingCharacter[],
    sortKey: RankingSortKey,
) {
    return [...characters].sort((left, right) => {
        const metricDelta = right[sortKey] - left[sortKey];

        if (metricDelta !== 0) {
            return metricDelta;
        }

        if (right.level !== left.level) {
            return right.level - left.level;
        }

        if (right.exp !== left.exp) {
            return right.exp - left.exp;
        }

        if (right.kills !== left.kills) {
            return right.kills - left.kills;
        }

        return left.name.localeCompare(right.name, "es");
    });
}

function RankingHead({
    sprite,
    size,
    className,
}: {
    sprite: RankingHeadSprite | null;
    size: number;
    className?: string;
}) {
    if (!sprite) {
        return (
            <div
                className={`flex items-center justify-center rounded-[18px] border border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.22em] text-stone-500 ${className ?? ""}`}
                style={{ width: size, height: size }}
            >
                N/A
            </div>
        );
    }

    return (
        <div
            className={`relative overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),rgba(12,10,9,0.95)_58%),linear-gradient(180deg,rgba(120,53,15,0.16),rgba(12,10,9,0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className ?? ""}`}
            style={{ width: size, height: size }}
        >
            <div
                className="absolute overflow-hidden"
                style={{
                    left: 0,
                    top: 0,
                    width: size,
                    height: size,
                    imageRendering: "pixelated",
                }}
            >
                <img
                    src={`/graphics/${sprite.numFile}.png`}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                        left: -sprite.sourceX,
                        top: -sprite.sourceY,
                        width: "auto",
                        height: "auto",
                        transform: `scale(${Math.max(size / sprite.width, size / sprite.height)})`,
                        transformOrigin: `${sprite.sourceX}px ${sprite.sourceY}px`,
                        imageRendering: "pixelated",
                    }}
                />
            </div>
        </div>
    );
}

export default function RankingView({
    characters,
    headSpritesById,
}: RankingViewProps) {
    const [sortKey, setSortKey] = useState<RankingSortKey>("level");
    const [classFilter, setClassFilter] = useState<RankingClassFilter>("all");
    const [rankingCharacters, setRankingCharacters] = useState(characters);
    const [rankingHeads, setRankingHeads] = useState(headSpritesById);
    const [isLoading, setIsLoading] = useState(false);
    const hasLoadedInitialDataRef = useRef(false);

    useEffect(() => {
        if (!hasLoadedInitialDataRef.current) {
            hasLoadedInitialDataRef.current = true;
            return;
        }

        const controller = new AbortController();
        const query = new URLSearchParams({ sort: sortKey });

        if (classFilter !== "all") {
            query.set("classId", String(classFilter));
        }

        setIsLoading(true);
        setRankingCharacters([]);
        setRankingHeads({});

        fetch(`/api/ranking?${query.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                return (await response.json()) as RankingPageData;
            })
            .then((result) => {
                setRankingCharacters(result.characters);
                setRankingHeads(result.headSpritesById);
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                console.error("No se pudo actualizar el ranking:", error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [sortKey, classFilter]);

    const sortedCharacters = useMemo(
        () => sortCharacters(rankingCharacters, sortKey),
        [rankingCharacters, sortKey],
    );
    const podium = sortedCharacters.slice(0, 3);
    const latestUpdatedAt = useMemo(() => {
        if (rankingCharacters.length === 0) {
            return null;
        }

        return rankingCharacters.reduce((latest, character) =>
            new Date(character.updatedAt).getTime() >
            new Date(latest.updatedAt).getTime()
                ? character
                : latest,
        ).updatedAt;
    }, [rankingCharacters]);

    if (
        characters.length === 0 &&
        rankingCharacters.length === 0 &&
        !isLoading
    ) {
        return (
            <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#020617,#0c0a09)] px-4 py-12 text-stone-100">
                <div className="mx-auto max-w-4xl rounded-[32px] border border-white/8 bg-stone-950/80 p-8 text-center shadow-2xl backdrop-blur-md">
                    <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/75">
                        AOWeb
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold text-white">
                        Ranking
                    </h1>
                    <p className="mt-4 text-stone-400">
                        Todavía no hay personajes para mostrar en el ranking.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#020617,#0c0a09)] px-4 py-12 text-stone-100">
            <div className="mx-auto max-w-6xl space-y-8">
                <section>
                    <div className="mt-3 flex items-start gap-3">
                        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-amber-300">
                            <Trophy className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-semibold text-white md:text-4xl">
                                Ranking
                            </h1>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                    {podium.map((character, index) => {
                        const Icon =
                            index === 0 ? Crown : index === 1 ? Trophy : Flame;
                        const accentClass =
                            index === 0
                                ? "text-amber-300 border-amber-300/20 bg-amber-400/10"
                                : index === 1
                                  ? "text-stone-200 border-white/10 bg-white/5"
                                  : "text-orange-300 border-orange-300/20 bg-orange-400/10";

                        return (
                            <article
                                key={character.id}
                                className="relative overflow-hidden rounded-[28px] border border-white/8 bg-stone-950/80 p-5 shadow-2xl backdrop-blur-md"
                            >
                                <div className="pointer-events-none absolute -right-8 top-4 h-28 w-28 rounded-full bg-white/5 blur-3xl" />
                                <div className="relative flex items-center gap-4">
                                    <RankingHead
                                        sprite={
                                            rankingHeads[
                                                String(character.headId)
                                            ] ?? null
                                        }
                                        size={84}
                                        className="shrink-0 rounded-[24px]"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div
                                            className={`inline-flex rounded-2xl border p-3 ${accentClass}`}
                                        >
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <p className="mt-4 text-sm text-stone-400">
                                            Top {index + 1}{" "}
                                            {sortKey === "level"
                                                ? "Nivel"
                                                : "Kills"}
                                        </p>
                                        <p
                                            className="mt-1 truncate text-2xl font-semibold"
                                            style={{
                                                color: getCharacterNameColor(
                                                    character,
                                                ),
                                            }}
                                        >
                                            {character.name}
                                        </p>
                                        {getClanTag(character) ? (
                                            <p className="mt-1 truncate text-sm text-stone-300">
                                                {getClanTag(character)}
                                            </p>
                                        ) : null}
                                        <p className="mt-1 text-lg text-amber-300">
                                            {getMetricLabel(character, sortKey)}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <section className="rounded-[32px] border border-white/8 bg-stone-950/80 p-5 shadow-2xl backdrop-blur-md md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-2xl font-semibold text-white">
                                Tabla de clasificación
                            </h2>
                            {latestUpdatedAt ? (
                                <p className="mt-2 text-sm text-stone-400">
                                    Ultima actualización:{" "}
                                    {formatUpdatedAt(latestUpdatedAt)}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-3 self-start md:self-auto">
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-stone-400">
                                    Ordenar por:
                                </span>
                                <div className="inline-flex rounded-2xl border border-white/8 bg-black/20 p-1">
                                    {sortOptions.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() =>
                                                setSortKey(option.key)
                                            }
                                            className={`rounded-xl px-4 py-2 text-sm transition ${
                                                sortKey === option.key
                                                    ? "bg-amber-300 text-stone-950"
                                                    : "text-stone-300 hover:bg-white/5"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-sm text-stone-400">
                                    Filtrar por:
                                </span>
                                <select
                                    value={String(classFilter)}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setClassFilter(
                                            value === "all"
                                                ? "all"
                                                : Number(value),
                                        );
                                    }}
                                    className="rounded-2xl border border-white/8 bg-black/20 px-4 py-2 text-sm text-stone-200 outline-none"
                                >
                                    {classFilterOptions.map((option) => (
                                        <option
                                            key={String(option.value)}
                                            value={String(option.value)}
                                        >
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {isLoading ? (
                        <p className="mt-4 text-sm text-stone-500">
                            Actualizando ranking...
                        </p>
                    ) : null}

                    <div className="mt-6 overflow-x-auto rounded-[24px] border border-white/8 bg-black/15">
                        <div className="min-w-[720px]">
                            <div className="grid grid-cols-[72px_minmax(0,1.9fr)_160px_120px] gap-3 border-b border-white/8 px-4 py-4 text-[11px] uppercase tracking-[0.26em] text-stone-500 md:px-6">
                                <span>#</span>
                                <span>Jugador</span>
                                <span>Nivel</span>
                                <span>Kills</span>
                            </div>

                            <div>
                                {sortedCharacters.length === 0 ? (
                                    <div className="px-6 py-8 text-sm text-stone-400">
                                        No hay personajes para ese filtro.
                                    </div>
                                ) : (
                                    sortedCharacters.map((character, index) => (
                                        <div
                                            key={character.id}
                                            className="grid grid-cols-[72px_minmax(0,1.9fr)_160px_120px] items-center gap-3 border-b border-white/6 px-4 py-4 last:border-b-0 md:px-6"
                                        >
                                            <div className="text-lg text-stone-400">
                                                {index + 1}
                                            </div>

                                            <div className="flex min-w-0 items-center gap-4">
                                                <RankingHead
                                                    sprite={
                                                        rankingHeads[
                                                            String(
                                                                character.headId,
                                                            )
                                                        ] ?? null
                                                    }
                                                    size={58}
                                                    className="shrink-0 rounded-[20px]"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className="truncate text-base"
                                                        style={{
                                                            color: getCharacterNameColor(
                                                                character,
                                                            ),
                                                        }}
                                                    >
                                                        {character.name}
                                                    </p>
                                                    {getClanTag(character) ? (
                                                        <p className="truncate text-sm text-stone-300">
                                                            {getClanTag(
                                                                character,
                                                            )}
                                                        </p>
                                                    ) : null}
                                                    <p className="truncate text-sm text-stone-400">
                                                        {getCharacterMeta(
                                                            character,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-sm font-medium text-stone-200">
                                                {formatNumber(character.level)}
                                                {!isMaxLevelCharacter(character)
                                                    ? ` (${formatExperiencePercent(character)})`
                                                    : ""}
                                            </div>

                                            <div className="text-sm font-medium text-rose-300">
                                                {formatNumber(character.kills)}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
