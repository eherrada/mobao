"use client";

import { TEAM_COLOR, TEAM_NAME, formatClock, type MobaState } from "./types";

/** Pantalla de fin de partida: resultado, tabla de heroes y salida. */
export function EndScreen({
    state,
    onLobby,
    onHome,
}: {
    state: MobaState;
    onLobby: () => void;
    onHome: () => void;
}) {
    const won = state.winner !== null && state.winner === state.team;

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-[2px]">
            <div className="w-[min(620px,94vw)] rounded border border-[#8a6d2f] bg-[#0a0d14]/95 p-5 text-white shadow-2xl">
                <div
                    className="text-center text-5xl font-black tracking-[0.3em]"
                    style={{ color: won ? "#7be495" : "#ff7a6b", textShadow: "0 0 24px currentColor" }}
                >
                    {won ? "VICTORIA" : "DERROTA"}
                </div>
                <div className="mt-1 text-center text-xs text-stone-400">
                    {state.winner !== null ? `Gano el equipo ${TEAM_NAME[state.winner]}` : ""} · duracion{" "}
                    {formatClock(state.elapsed)}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[0, 1].map((team) => (
                        <div key={team}>
                            <div
                                className="mb-1 border-b pb-1 text-xs font-semibold tracking-widest"
                                style={{ color: TEAM_COLOR[team], borderColor: `${TEAM_COLOR[team]}66` }}
                            >
                                {TEAM_NAME[team]}
                            </div>
                            {state.heroes
                                .filter((hero) => hero.team === team)
                                .map((hero) => (
                                    <div
                                        key={hero.id}
                                        className={`flex justify-between gap-2 px-1 py-0.5 text-sm ${
                                            hero.id === state.me.id ? "rounded bg-white/10" : ""
                                        }`}
                                    >
                                        <span className="truncate">{hero.name}</span>
                                        <span className="shrink-0 font-mono text-stone-300">
                                            Nv{hero.lvl} · {hero.k}/{hero.d}/{hero.cs}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
                <div className="mt-1 text-center text-[10px] text-stone-500">Nivel · K/D/CS</div>

                <div className="mt-4 text-center text-sm text-stone-300">
                    Nueva partida en <span className="font-mono text-lg text-[#e9d8a6]">{state.resetIn}</span> s
                </div>
                <div className="mt-3 flex justify-center gap-3">
                    <button
                        type="button"
                        onClick={onLobby}
                        className="rounded border border-[#c8aa6e] bg-[#1a1608] px-5 py-2 text-sm font-semibold text-[#e9d8a6] hover:bg-[#2a2210]"
                    >
                        Volver al lobby
                    </button>
                    <button
                        type="button"
                        onClick={onHome}
                        className="rounded border border-white/20 bg-white/5 px-5 py-2 text-sm text-stone-200 hover:bg-white/10"
                    >
                        Salir al inicio
                    </button>
                </div>
            </div>
        </div>
    );
}
