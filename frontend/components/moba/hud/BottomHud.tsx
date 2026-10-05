"use client";

import { Anchor, Lock, Snail, Zap } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { OBJECT_TYPE, type InventoryItem, type PlayerHudState } from "../../../lib/aowProtocol";
import { formatNumber } from "../../../lib/number-format";
import { AbilityIcon } from "./AbilityIcon";
import { ItemIcon, useGraphicsDB } from "./ItemIcon";
import { RESOURCE_STYLE, keyLabel, type MobaResource, type MobaSkill, type MobaState } from "./types";

type HeadSprite = [numFile: string, sx: number, sy: number, w: number, h: number];

let headsPromise: Promise<Record<string, HeadSprite | null>> | null = null;

function useHeads() {
    const [heads, setHeads] = useState<Record<string, HeadSprite | null> | null>(null);

    useEffect(() => {
        let active = true;

        headsPromise ??= fetch("/init/headswithfile.json")
            .then((r) => r.json() as Promise<Record<string, HeadSprite | null>>)
            .catch(() => ({}));
        void headsPromise.then((data) => active && setHeads(data));

        return () => {
            active = false;
        };
    }, []);

    return heads;
}

/** Pociones usables con las teclas 1 y 2 (las dos primeras por espacio). */
export function getPotions(hud: PlayerHudState | null): InventoryItem[] {
    return (hud?.inventory ?? [])
        .filter((item) => item.objType === OBJECT_TYPE.pociones && item.amount > 0)
        .sort((a, b) => a.slot - b.slot)
        .slice(0, 2);
}

function getEquipped(hud: PlayerHudState | null): InventoryItem[] {
    return (hud?.inventory ?? [])
        .filter((item) => item.equipped && item.objType !== OBJECT_TYPE.pociones)
        .sort((a, b) => a.slot - b.slot)
        .slice(0, 6);
}

/** Barra de vida con segmento de escudo a continuacion (la barra se estira si vida + escudo superan la maxima). */
function HealthBar({ hp, maxHp, shield }: { hp: number; maxHp: number; shield: number }) {
    const total = Math.max(1, maxHp, hp + shield);
    const hpPct = Math.max(0, Math.min(100, (hp / total) * 100));
    const shieldPct = Math.max(0, Math.min(100 - hpPct, (shield / total) * 100));

    return (
        <div className="relative h-[17px] w-full overflow-hidden rounded-[3px] border border-black/80 bg-black/70">
            <div className="flex h-full w-full">
                <div
                    className="h-full shrink-0 transition-[width] duration-200"
                    style={{ width: `${hpPct}%`, background: "linear-gradient(180deg, #4fd56a, #1f8a3a)" }}
                />
                {shield > 0 ? (
                    <div
                        className="h-full shrink-0 transition-[width] duration-200"
                        style={{
                            width: `${shieldPct}%`,
                            background: "linear-gradient(180deg, #f4f1e4, #a9b4c8)",
                            boxShadow: "inset 0 0 4px rgba(255,255,255,0.9)",
                        }}
                        title={`Escudo ${Math.round(shield)}`}
                    />
                ) : null}
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white [text-shadow:0_1px_2px_#000]">
                Vida {Math.round(hp)} / {Math.round(maxHp)}
                {shield > 0 ? <span className="ml-1 text-[#e8f0ff]">(+{Math.round(shield)})</span> : null}
            </div>
        </div>
    );
}

function ResourceBar({ value, max, resource }: { value: number; max: number; resource: MobaResource }) {
    const style = RESOURCE_STYLE[resource];
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

    return (
        <div className="relative h-[15px] w-full overflow-hidden rounded-[3px] border border-black/80 bg-black/70">
            <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${pct}%`, background: `linear-gradient(180deg, ${style.from}, ${style.to})` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[10.5px] font-semibold text-white [text-shadow:0_1px_2px_#000]">
                {style.name} {Math.round(value)} / {Math.round(max)}
            </div>
        </div>
    );
}

function Portrait({ state, hud }: { state: MobaState | null; hud: PlayerHudState | null }) {
    const heads = useHeads();
    const head = hud?.idHead != null ? heads?.[String(hud.idHead)] : null;
    const level = state?.me.level ?? 1;
    const maxed = state ? level >= state.me.maxLevel : false;
    const xpPct = !state ? 0 : maxed ? 100 : Math.min(100, (state.me.xp / Math.max(1, state.me.xpNext)) * 100);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative h-[92px] w-[92px] overflow-hidden rounded-full border-[3px] border-[#c8aa6e] bg-[#12161f] shadow-[0_0_14px_rgba(0,0,0,0.8)]">
                {head ? (
                    <div
                        className="absolute left-1/2 top-1/2 bg-no-repeat"
                        style={{
                            width: head[3],
                            height: head[4],
                            backgroundImage: `url(/graphics/${head[0]}.png)`,
                            backgroundPosition: `-${head[1]}px -${head[2]}px`,
                            transform: "translate(-50%, -38%) scale(2.6)",
                            imageRendering: "pixelated",
                        }}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-2xl font-bold text-[#c8aa6e]">
                        {(hud?.nameCharacter ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                )}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t bg-black/80 px-2 text-[13px] font-bold leading-5 text-[#e9d8a6]">
                    {level}
                </div>
            </div>
            <div
                className="h-[6px] w-[92px] overflow-hidden rounded bg-black/70 ring-1 ring-black"
                title={state ? (maxed ? "Nivel maximo" : `Experiencia ${state.me.xp} / ${state.me.xpNext}`) : ""}
            >
                <div className="h-full bg-gradient-to-b from-[#b48cff] to-[#7a4fd1]" style={{ width: `${xpPct}%` }} />
            </div>
        </div>
    );
}

const TARGET_LABEL: Record<string, string> = {
    self: "Sobre vos",
    point: "Apuntada",
    line: "Direccion",
    area: "Area alrededor tuyo",
    ally: "Aliado",
};

/** Tooltip de una habilidad: nombre, rango, costo (color del recurso), alcance, recarga y descripcion. */
function SkillTooltip({ skill, keyText, cost, resource }: { skill: MobaSkill; keyText: string; cost: number; resource: MobaResource }) {
    const style = RESOURCE_STYLE[resource];
    const learned = skill.rank > 0;

    return (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-[230px] -translate-x-1/2 rounded border border-[#8a6d2f] bg-[#0a0d14]/97 p-2 text-left shadow-[0_4px_18px_rgba(0,0,0,0.8)]">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold text-[#f1dfa8]">{skill.name}</span>
                <span className="rounded bg-white/10 px-1 text-[10px] font-bold text-white">{keyText}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-stone-400">
                {skill.ult ? "Definitiva" : "Habilidad"} · rango {skill.rank}/{skill.max}
                {skill.kind === "aoSpell" ? " · hechizo AO" : ""}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
                {cost > 0 ? (
                    <span style={{ color: style.text }}>
                        Costo {Math.round(cost)} {style.name}
                    </span>
                ) : null}
                {skill.range ? <span className="text-stone-300">Alcance {skill.range}</span> : null}
                {skill.cdTotalMs ? (
                    <span className="text-stone-300">Recarga {(skill.cdTotalMs / 1000).toFixed(skill.cdTotalMs % 1000 ? 1 : 0)} s</span>
                ) : (
                    <span className="text-stone-500">Sin recarga propia</span>
                )}
            </div>
            <div className="text-[11px] text-stone-400">{TARGET_LABEL[skill.target ?? "point"]}</div>
            {skill.desc ? <p className="mt-1 text-[11.5px] leading-snug text-stone-200">{skill.desc}</p> : null}
            <div className="mt-1 text-[10.5px] text-amber-300/90">
                {!learned
                    ? skill.canLevel
                        ? "Click en + para aprenderla"
                        : `Se desbloquea en nivel ${skill.nextReqLevel}`
                    : skill.canLevel
                      ? "Click en + para subir de rango"
                      : skill.rank < skill.max
                        ? `Proximo rango: nivel ${skill.nextReqLevel}`
                        : "Rango maximo"}
                <span className="text-stone-500"> · click derecho: cambiar tecla</span>
            </div>
        </div>
    );
}

function SkillButton({
    skill,
    keyText,
    ownCdLeft,
    globalLeft,
    globalTotal,
    mana,
    fallbackCost,
    level,
    armed,
    rebinding,
    onCast,
    onLevelUp,
    onRebind,
}: {
    skill: MobaSkill;
    level: number;
    keyText: string;
    ownCdLeft: number;
    globalLeft: number;
    globalTotal: number;
    mana: number;
    fallbackCost: number;
    armed: boolean;
    rebinding: boolean;
    onCast: () => void;
    onLevelUp: () => void;
    onRebind: () => void;
}) {
    const [hover, setHover] = useState(false);
    const resource: MobaResource = skill.resource ?? "mana";
    const rs = RESOURCE_STYLE[resource];
    const cost = skill.cost ?? fallbackCost;
    const learned = skill.rank > 0;
    // Bloqueada solo si falta nivel (no si simplemente no quedan puntos).
    const locked = !learned && !skill.canLevel && skill.nextReqLevel > level;
    const noResource = learned && cost > 0 && mana < cost;
    const dim = !learned || noResource;
    const ownTotal = Math.max(1, skill.cdTotalMs ?? 0);
    const ownFrac = ownCdLeft > 0 ? Math.min(1, ownCdLeft / ownTotal) : 0;
    const globalFrac = globalLeft > 0 ? Math.min(1, globalLeft / Math.max(1, globalTotal)) : 0;

    return (
        <div className="relative flex w-[58px] flex-col items-center">
            {skill.canLevel ? (
                <button
                    type="button"
                    onClick={onLevelUp}
                    title={`Subir ${skill.name}`}
                    className="absolute -top-[22px] z-10 h-5 w-5 animate-pulse rounded-full border border-amber-200 bg-amber-400 text-[14px] font-black leading-none text-black shadow hover:bg-amber-300"
                >
                    +
                </button>
            ) : null}
            <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
                {hover ? <SkillTooltip skill={skill} keyText={keyText} cost={cost} resource={resource} /> : null}
                <button
                    type="button"
                    onClick={onCast}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        onRebind();
                    }}
                    className={`relative h-[54px] w-[54px] overflow-hidden rounded border-2 transition-shadow ${
                        armed
                            ? "border-white shadow-[0_0_14px_#fff]"
                            : skill.ult
                              ? "border-[#b57cff]"
                              : "border-[#8a6d2f]"
                    } ${skill.ult ? "bg-gradient-to-b from-[#2b1745] to-[#150a24]" : "bg-gradient-to-b from-[#1b2333] to-[#0e121b]"}`}
                >
                    <div
                        className={`flex h-full w-full items-center justify-center ${dim ? "opacity-35" : ""} ${locked ? "grayscale" : ""}`}
                        style={{ color: skill.ult ? "#d6b3ff" : rs.text }}
                    >
                        <AbilityIcon name={skill.icon} size={30} />
                    </div>

                    {/* Recarga global (~850 ms): destello breve */}
                    {globalFrac > 0 && ownFrac === 0 ? (
                        <div className="absolute inset-0 bg-white/25" style={{ opacity: 0.25 + globalFrac * 0.75 }} />
                    ) : null}

                    {/* Recarga propia: barrido circular + segundos */}
                    {ownFrac > 0 ? (
                        <div
                            className="absolute inset-0"
                            style={{
                                background: `conic-gradient(rgba(0,0,0,0.78) ${ownFrac * 360}deg, rgba(0,0,0,0.12) 0deg)`,
                            }}
                        >
                            <div className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-white [text-shadow:0_1px_3px_#000]">
                                {ownCdLeft >= 10000 ? Math.ceil(ownCdLeft / 1000) : (ownCdLeft / 1000).toFixed(1)}
                            </div>
                        </div>
                    ) : null}

                    {/* Bloqueada hasta el nivel indicado */}
                    {locked ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-[#d6b3ff]">
                            <Lock size={14} />
                            <span className="text-[10px] font-bold leading-none">Nv {skill.nextReqLevel}</span>
                        </div>
                    ) : null}

                    <span className="absolute left-0.5 top-0 rounded-br bg-black/60 px-[3px] text-[11px] font-bold text-white [text-shadow:0_1px_2px_#000]">
                        {rebinding ? "..." : keyText}
                    </span>
                    {cost > 0 && !locked ? (
                        <span
                            className="absolute bottom-0 right-0.5 text-[10.5px] font-bold [text-shadow:0_1px_2px_#000]"
                            style={{ color: noResource ? "#ff6b6b" : rs.text }}
                        >
                            {Math.round(cost)}
                        </span>
                    ) : null}
                    {skill.ult ? (
                        <span className="absolute right-0.5 top-0 text-[9px] font-black text-[#d6b3ff]">ULT</span>
                    ) : null}
                </button>
            </div>
            <div className="mt-1 flex gap-[3px]">
                {Array.from({ length: skill.max }, (_, i) => (
                    <span
                        key={i}
                        className={`h-[5px] ${skill.max > 3 ? "w-[8px]" : "w-[12px]"} rounded-[1px] ${i < skill.rank ? "bg-[#e9c46a]" : "bg-white/20"}`}
                    />
                ))}
            </div>
        </div>
    );
}

function Chip({ children, title, color }: { children: ReactNode; title?: string; color: string }) {
    return (
        <span
            title={title}
            className="flex items-center gap-1 rounded border bg-black/60 px-1.5 py-[1px] text-[10.5px] font-semibold"
            style={{ borderColor: color, color }}
        >
            {children}
        </span>
    );
}

/** Estados de control, reduccion de dano y especializacion. */
function StatusRow({ me }: { me: MobaState["me"] | undefined }) {
    if (!me) return null;
    const slow = me.slowPct ?? 0;
    const items: ReactNode[] = [];

    if (me.stunned) {
        items.push(
            <Chip key="stun" color="#ffd84a" title="Aturdido: no podes moverte, atacar ni lanzar">
                <Zap size={11} /> Aturdido
            </Chip>,
        );
    }
    if (me.rooted) {
        items.push(
            <Chip key="root" color="#7fd1ff" title="Inmovilizado: no podes moverte (si podes lanzar y atacar)">
                <Anchor size={11} /> Inmovilizado
            </Chip>,
        );
    }
    if (slow >= 5) {
        items.push(
            <Chip key="slow" color="#9fb4ff" title={`Ralentizado ${slow}%`}>
                <Snail size={11} /> Ralentizado -{slow}%
            </Chip>,
        );
    }
    if ((me.dr ?? 0) >= 1) {
        items.push(
            <Chip key="dr" color="#c8aa6e" title="Reduccion de dano recibido">
                -{me.dr}% dano
            </Chip>,
        );
    }
    if (me.spec) {
        items.push(
            <Chip key="spec" color="#b57cff" title={me.spec.desc}>
                {me.spec.name}
            </Chip>,
        );
    }

    return items.length ? <div className="flex min-h-[18px] flex-wrap justify-center gap-1">{items}</div> : null;
}

export function BottomHud({
    state,
    hud,
    now,
    stateAt,
    cooldownLeft,
    cooldownTotal,
    armedSlot,
    skillCodes,
    rebindIndex,
    onCast,
    onLevelUp,
    onRebind,
    onUsePotion,
    onOpenShop,
}: {
    state: MobaState | null;
    hud: PlayerHudState | null;
    now: number;
    /** Momento (ms) en que llego el ultimo estado: los cooldowns propios se interpolan desde ahi. */
    stateAt: number;
    cooldownLeft: number;
    cooldownTotal: number;
    armedSlot: number | null;
    skillCodes: string[];
    rebindIndex: number | null;
    onCast: (skill: MobaSkill) => void;
    onLevelUp: (slot: number) => void;
    onRebind: (index: number) => void;
    onUsePotion: (slot: number) => void;
    onOpenShop: () => void;
}) {
    const db = useGraphicsDB();
    const skills = state?.skills ?? [];
    const potions = getPotions(hud);
    const equipped = getEquipped(hud);
    const mana = hud?.mana ?? 0;
    const resource: MobaResource = state?.me.resource ?? "mana";
    const elapsedSinceState = Math.max(0, now - stateAt);

    return (
        <div className="pointer-events-auto flex items-end gap-3 rounded-t-lg border border-b-0 border-[#8a6d2f] bg-gradient-to-b from-[#10141d]/95 to-[#070a10]/95 px-4 pb-3 pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.6)]">
            <Portrait state={state} hud={hud} />

            <div className="flex w-[min(540px,100%)] min-w-[400px] flex-col gap-1.5">
                {state && state.points > 0 ? (
                    <div className="self-center rounded bg-amber-400/90 px-2 text-[11px] font-semibold text-black">
                        {state.points} punto{state.points > 1 ? "s" : ""} de habilidad
                    </div>
                ) : null}
                <StatusRow me={state?.me} />
                <div className="flex min-h-[90px] items-end justify-center gap-2">
                    {skills.length === 0 ? (
                        <div className="pb-5 text-center text-xs text-stone-400">
                            Tu heroe pelea con armas
                            <br />
                            (ataque basico: Espacio)
                        </div>
                    ) : (
                        skills.slice(0, skillCodes.length).map((skill, index) => (
                            <SkillButton
                                key={skill.slot}
                                skill={skill}
                                keyText={keyLabel(skillCodes[index])}
                                ownCdLeft={Math.max(0, (skill.cdLeftMs ?? 0) - elapsedSinceState)}
                                globalLeft={cooldownLeft}
                                globalTotal={cooldownTotal}
                                mana={mana}
                                fallbackCost={hud?.spells.find((s) => s.slot === skill.slot)?.manaRequired ?? 0}
                                level={state?.me.level ?? 1}
                                armed={armedSlot === skill.slot}
                                rebinding={rebindIndex === index}
                                onCast={() => onCast(skill)}
                                onLevelUp={() => onLevelUp(skill.slot)}
                                onRebind={() => onRebind(index)}
                            />
                        ))
                    )}
                </div>
                <HealthBar hp={hud?.hp ?? 0} maxHp={hud?.maxHp ?? 1} shield={state?.me.shield ?? 0} />
                {(hud?.maxMana ?? 0) > 0 ? (
                    <ResourceBar value={mana} max={hud?.maxMana ?? 1} resource={resource} />
                ) : null}
            </div>

            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 6 }, (_, i) => {
                        const item = equipped[i];

                        return (
                            <div
                                key={i}
                                className="flex h-[40px] w-[40px] items-center justify-center rounded border border-[#8a6d2f]/70 bg-black/50"
                                title={item?.name}
                            >
                                {item ? <ItemIcon grhIndex={item.grhIndex} db={db} size={34} /> : null}
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-1">
                    {[0, 1].map((i) => {
                        const potion = potions[i];

                        return (
                            <button
                                key={i}
                                type="button"
                                disabled={!potion}
                                onClick={() => potion && onUsePotion(potion.slot)}
                                title={potion ? `${potion.name} (tecla ${i + 1})` : `Pocion (tecla ${i + 1})`}
                                className="relative flex h-[40px] w-[40px] items-center justify-center rounded border border-[#3fbf93]/60 bg-black/50 disabled:opacity-40"
                            >
                                {potion ? <ItemIcon grhIndex={potion.grhIndex} db={db} size={34} /> : null}
                                <span className="absolute left-0.5 top-0 text-[10px] font-bold text-white [text-shadow:0_1px_2px_#000]">
                                    {i + 1}
                                </span>
                                {potion ? (
                                    <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-white [text-shadow:0_1px_2px_#000]">
                                        {potion.amount}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={onOpenShop}
                        title="Tienda (B)"
                        className="flex h-[40px] flex-1 flex-col items-center justify-center rounded border border-[#c8aa6e] bg-[#1a1608] px-1.5 text-[#e9d8a6] hover:bg-[#2a2210]"
                    >
                        <span className="text-[10px] leading-none">Tienda (B)</span>
                    </button>
                </div>
                <div className="text-center text-[15px] font-bold text-amber-300 [text-shadow:0_1px_2px_#000]">
                    {formatNumber(state?.me.gold ?? hud?.gold ?? 0)} <span className="text-[11px] font-normal">oro</span>
                </div>
            </div>
        </div>
    );
}
