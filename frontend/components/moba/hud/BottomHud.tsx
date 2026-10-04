"use client";

import { useEffect, useState } from "react";

import { OBJECT_TYPE, type InventoryItem, type PlayerHudState } from "../../../lib/aowProtocol";
import { formatNumber } from "../../../lib/number-format";
import { ItemIcon, useGraphicsDB } from "./ItemIcon";
import { SKILL_KEYS, type MobaSkill, type MobaState } from "./types";

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

function Bar({
    value,
    max,
    from,
    to,
    label,
}: {
    value: number;
    max: number;
    from: string;
    to: string;
    label: string;
}) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

    return (
        <div className="relative h-[17px] w-full overflow-hidden rounded-[3px] border border-black/80 bg-black/70">
            <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${pct}%`, background: `linear-gradient(180deg, ${from}, ${to})` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-white [text-shadow:0_1px_2px_#000]">
                {label} {Math.round(value)} / {Math.round(max)}
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

function SkillButton({
    skill,
    index,
    cooldownLeft,
    cooldownTotal,
    armed,
    noMana,
    onCast,
    onLevelUp,
}: {
    skill: MobaSkill;
    index: number;
    cooldownLeft: number;
    cooldownTotal: number;
    armed: boolean;
    noMana: boolean;
    onCast: () => void;
    onLevelUp: () => void;
}) {
    const key = SKILL_KEYS[index]?.label ?? "";
    const learned = skill.rank > 0;
    const dim = !learned || noMana;
    const cd = cooldownLeft > 0 ? Math.min(1, cooldownLeft / Math.max(1, cooldownTotal)) : 0;

    return (
        <div className="relative flex w-[56px] flex-col items-center">
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
            <button
                type="button"
                onClick={onCast}
                title={`${skill.name} · rango ${skill.rank}/${skill.max}${skill.ult ? " · definitiva" : ""} · proximo rango: nivel ${skill.nextReqLevel}`}
                className={`relative h-[52px] w-[52px] overflow-hidden rounded border-2 ${
                    armed ? "border-white shadow-[0_0_12px_#fff]" : skill.ult ? "border-[#b57cff]" : "border-[#8a6d2f]"
                } ${skill.ult ? "bg-[#241437]" : "bg-[#141a26]"}`}
            >
                <div className={`flex h-full w-full flex-col items-center justify-center px-0.5 ${dim ? "opacity-40" : ""}`}>
                    <span className="text-[17px] font-black leading-none text-[#e9d8a6]">
                        {skill.name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-center text-[8px] leading-[9px] text-stone-300">
                        {skill.name}
                    </span>
                </div>
                {cd > 0 ? (
                    <div className="absolute inset-x-0 bottom-0 bg-black/70" style={{ height: `${cd * 100}%` }}>
                        <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white">
                            {(cooldownLeft / 1000).toFixed(1)}
                        </div>
                    </div>
                ) : null}
                {skill.ult ? <div className="absolute right-0.5 top-0.5 text-[8px] font-bold text-[#d6b3ff]">R</div> : null}
                <span className="absolute left-0.5 top-0 text-[11px] font-bold text-white [text-shadow:0_1px_2px_#000]">
                    {key}
                </span>
            </button>
            <div className="mt-1 flex gap-[3px]">
                {Array.from({ length: skill.max }, (_, i) => (
                    <span
                        key={i}
                        className={`h-[5px] w-[9px] rounded-[1px] ${i < skill.rank ? "bg-[#e9c46a]" : "bg-white/20"}`}
                    />
                ))}
            </div>
        </div>
    );
}

export function BottomHud({
    state,
    hud,
    cooldownLeft,
    cooldownTotal,
    armedSlot,
    onCast,
    onLevelUp,
    onUsePotion,
    onOpenShop,
}: {
    state: MobaState | null;
    hud: PlayerHudState | null;
    cooldownLeft: number;
    cooldownTotal: number;
    armedSlot: number | null;
    onCast: (skill: MobaSkill) => void;
    onLevelUp: (slot: number) => void;
    onUsePotion: (slot: number) => void;
    onOpenShop: () => void;
}) {
    const db = useGraphicsDB();
    const skills = state?.skills ?? [];
    const potions = getPotions(hud);
    const equipped = getEquipped(hud);
    const mana = hud?.mana ?? 0;

    return (
        <div className="pointer-events-auto flex items-end gap-3 rounded-t-lg border border-b-0 border-[#8a6d2f] bg-gradient-to-b from-[#10141d]/95 to-[#070a10]/95 px-4 pb-3 pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.6)]">
            <Portrait state={state} hud={hud} />

            <div className="flex w-[min(540px,100%)] min-w-[400px] flex-col gap-1.5">
                {state && state.points > 0 ? (
                    <div className="self-center rounded bg-amber-400/90 px-2 text-[11px] font-semibold text-black">
                        {state.points} punto{state.points > 1 ? "s" : ""} de habilidad
                    </div>
                ) : null}
                <div className="flex min-h-[90px] items-end justify-center gap-1.5">
                    {skills.length === 0 ? (
                        <div className="pb-5 text-center text-xs text-stone-400">
                            Tu heroe pelea con armas
                            <br />
                            (ataque basico: Espacio)
                        </div>
                    ) : (
                        skills.slice(0, SKILL_KEYS.length).map((skill, index) => (
                            <SkillButton
                                key={skill.slot}
                                skill={skill}
                                index={index}
                                cooldownLeft={cooldownLeft}
                                cooldownTotal={cooldownTotal}
                                armed={armedSlot === skill.slot}
                                noMana={
                                    mana <
                                    (hud?.spells.find((s) => s.slot === skill.slot)?.manaRequired ?? 0)
                                }
                                onCast={() => onCast(skill)}
                                onLevelUp={() => onLevelUp(skill.slot)}
                            />
                        ))
                    )}
                </div>
                <Bar value={hud?.hp ?? 0} max={hud?.maxHp ?? 1} from="#4fd56a" to="#1f8a3a" label="Vida" />
                {(hud?.maxMana ?? 0) > 0 ? (
                    <Bar value={mana} max={hud?.maxMana ?? 1} from="#5aa8ff" to="#2457b8" label="Mana" />
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
