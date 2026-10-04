"use client";

import { TEAM_COLOR, formatClock, type MobaState } from "./types";

function TeamPanel({ side, state }: { side: 0 | 1; state: MobaState }) {
    const data = side === 0 ? state.score.blue : state.score.red;
    const mine = state.team === side;

    return (
        <div
            className={`flex items-center gap-3 px-3 py-1 ${side === 0 ? "flex-row" : "flex-row-reverse"}`}
            style={{ borderBottom: `3px solid ${TEAM_COLOR[side]}` }}
        >
            <div className={`flex flex-col ${side === 0 ? "items-start" : "items-end"}`}>
                <span className="text-[10px] uppercase tracking-widest text-stone-400">
                    {mine ? "Tu equipo" : "Rival"}
                </span>
                <div className="h-1.5 w-24 overflow-hidden rounded bg-white/10" title={`Nexo ${data.nexus}%`}>
                    <div className="h-full" style={{ width: `${data.nexus}%`, background: TEAM_COLOR[side] }} />
                </div>
            </div>
            <div className={`flex items-baseline gap-3 font-semibold ${side === 0 ? "flex-row" : "flex-row-reverse"}`}>
                <span className="text-xl leading-none" style={{ color: TEAM_COLOR[side] }} title="Asesinatos">
                    {data.kills}
                </span>
                <span className="text-xs text-stone-300" title="Torres en pie">
                    {data.towers} T
                </span>
            </div>
        </div>
    );
}

export function TopBar({ state }: { state: MobaState }) {
    return (
        <div className="pointer-events-none absolute left-1/2 top-2 flex -translate-x-1/2 items-stretch overflow-hidden rounded border border-[#8a6d2f]/70 bg-[#0a0d14]/85 text-white shadow-[0_2px_14px_rgba(0,0,0,0.6)]">
            <TeamPanel side={0} state={state} />
            <div className="flex min-w-[76px] items-center justify-center border-x border-white/10 px-3 font-mono text-base text-[#e9d8a6]">
                {formatClock(state.elapsed)}
            </div>
            <TeamPanel side={1} state={state} />
        </div>
    );
}

export function BuffChips({ state }: { state: MobaState }) {
    const buffs = state.buffs ?? [];

    if (buffs.length === 0) return null;

    return (
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[40vw] flex-col gap-1">
            {buffs.map((b) => (
                <div
                    key={b.id}
                    className="flex items-center gap-2 rounded border bg-[#0a0d14]/85 px-2 py-0.5 text-[11px] shadow"
                    style={{ borderColor: b.team ? "#c9a227" : "#3fbf93", color: b.team ? "#f5d76e" : "#7fe8c0" }}
                    title={b.team ? "Bendicion de equipo" : "Bendicion de la jungla (se pierde al morir)"}
                >
                    <span className="font-semibold">{b.name}</span>
                    {b.stacks > 1 ? <span>x{b.stacks}</span> : null}
                    {b.left > 0 ? <span className="font-mono text-stone-300">{b.left}s</span> : null}
                </div>
            ))}
        </div>
    );
}
