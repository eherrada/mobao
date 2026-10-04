"use client";

import { TEAM_COLOR, TEAM_NAME, type MobaState } from "./types";

/** Tabla de puntajes completa (se muestra mientras se mantiene Tab). */
export function ScoreBoard({ state }: { state: MobaState }) {
    return (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/35">
            <div className="w-[min(560px,92vw)] rounded border border-[#8a6d2f] bg-[#0a0d14]/95 p-3 text-white shadow-2xl">
                {[0, 1].map((team) => (
                    <div key={team} className="mb-3 last:mb-0">
                        <div
                            className="mb-1 flex items-center justify-between border-b pb-1 text-xs font-semibold tracking-widest"
                            style={{ color: TEAM_COLOR[team], borderColor: `${TEAM_COLOR[team]}66` }}
                        >
                            <span>
                                EQUIPO {TEAM_NAME[team]}
                                {state.team === team ? " (TU EQUIPO)" : ""}
                            </span>
                            <span className="grid grid-cols-[44px_56px_44px_52px] text-center text-[10px] text-stone-400">
                                <span>NIV</span>
                                <span>K / D</span>
                                <span>CS</span>
                                <span />
                            </span>
                        </div>
                        {state.heroes
                            .filter((hero) => hero.team === team)
                            .map((hero) => (
                                <div
                                    key={hero.id}
                                    className={`flex items-center justify-between px-1 py-0.5 text-sm ${
                                        hero.id === state.me.id ? "rounded bg-white/10" : ""
                                    }`}
                                >
                                    <span className={hero.dead ? "text-stone-500 line-through" : ""}>{hero.name}</span>
                                    <span className="grid grid-cols-[44px_56px_44px_52px] text-center font-mono text-stone-200">
                                        <span>{hero.lvl}</span>
                                        <span>
                                            {hero.k}/{hero.d}
                                        </span>
                                        <span>{hero.cs}</span>
                                        <span className="text-[10px] text-red-300">{hero.dead ? "muerto" : ""}</span>
                                    </span>
                                </div>
                            ))}
                    </div>
                ))}
                <div className="mt-2 text-center text-[10px] text-stone-500">K/D = asesinatos / muertes · CS = minions</div>
            </div>
        </div>
    );
}
