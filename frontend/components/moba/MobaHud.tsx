"use client";

import { useEffect, useRef, useState } from "react";

import { createMobaSkillPacket } from "../../lib/aowProtocol";

/** Estado de partida que envia el servidor (server/src/moba/match.ts → broadcastState). */
type MobaState = {
    phase: "running" | "ended";
    winner: 0 | 1 | null;
    elapsed: number;
    resetIn: number;
    team: 0 | 1;
    respawnIn: number;
    size: number;
    me: { id: number; x: number; y: number; gold: number; level: number; xp: number; xpNext: number; maxLevel: number };
    points: number;
    buffs?: Array<{ id: string; name: string; left: number; stacks: number; team: boolean }>;
    skills: Array<{
        slot: number;
        spell: number;
        name: string;
        rank: number;
        max: number;
        ult: boolean;
        canLevel: boolean;
        nextReqLevel: number;
    }>;
    score: Record<"blue" | "red", { towers: number; kills: number; nexus: number }>;
    heroes: Array<{ id: number; name: string; team: 0 | 1; k: number; d: number; cs: number; lvl: number; dead: boolean }>;
    /** [x, y, tipo(0 heroe,1 minion,2 torre,3 nexo,4 tienda), equipo(0 azul,1 rojo)] */
    ents: Array<[number, number, number, number]>;
    /** [x, y, tipo(0 centinela,1 zarza,2 comun,3 rio,4 dragon,5 rey demonio), estado(1 vivo,0 muerto,-1 sin vision)] */
    camps?: Array<[number, number, number, number]>;
};

const TEAM_COLOR = ["#4aa3ff", "#ff5a4a"] as const;
const TEAM_NAME = ["AZUL", "ROJO"] as const;
const MINIMAP_SIZE = 170;

const CAMP_STYLE = [
    { color: "#4aa3ff", r: 4, shape: "circle" }, // Centinela Azul
    { color: "#ff6a4a", r: 4, shape: "circle" }, // Zarza Roja
    { color: "#d8c27a", r: 2.5, shape: "circle" }, // campamento comun
    { color: "#4ad0b0", r: 3, shape: "circle" }, // Tortuga del Rio
    { color: "#ff9a2e", r: 5, shape: "diamond" }, // Dragon
    { color: "#b05cff", r: 6, shape: "diamond" }, // Rey Demonio
] as const;

// Trazado de carriles para el fondo del minimapa (mismo layout que server/src/scripts/generateMobaMap.ts).
const LANES: Array<Array<[number, number]>> = [
    [[30, 225], [24, 225], [24, 24], [225, 24], [225, 30]],
    [[30, 225], [225, 30]],
    [[30, 225], [30, 231], [231, 231], [231, 30], [225, 30]],
];

function formatClock(totalSeconds: number) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Minimap({ state }: { state: MobaState }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");

        if (!canvas || !ctx) return;

        const scale = MINIMAP_SIZE / state.size;
        const px = (v: number) => (v - 1) * scale;

        // Jungla: fondo verde con borde de agua.
        ctx.fillStyle = "#12301d";
        ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        ctx.strokeStyle = "rgba(70,130,200,0.6)";
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, MINIMAP_SIZE - 3, MINIMAP_SIZE - 3);

        // Rio en la diagonal (7 tiles de ancho).
        ctx.strokeStyle = "rgba(60,120,200,0.75)";
        ctx.lineWidth = Math.max(3, 7 * scale);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(MINIMAP_SIZE, MINIMAP_SIZE);
        ctx.stroke();

        // Carriles (11 tiles de ancho).
        ctx.strokeStyle = "rgba(205,185,125,0.8)";
        ctx.lineWidth = Math.max(3, 11 * scale);
        ctx.lineJoin = "round";
        for (const lane of LANES) {
            ctx.beginPath();
            lane.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px(x), px(y)) : ctx.lineTo(px(x), px(y))));
            ctx.stroke();
        }

        // Bases.
        for (const [bx, by, team] of [[30, 225, 0], [225, 30, 1]] as const) {
            ctx.fillStyle = team === 0 ? "rgba(74,163,255,0.35)" : "rgba(255,90,74,0.35)";
            ctx.fillRect(px(bx - 19), px(by - 19), 38 * scale, 38 * scale);
        }

        // Campamentos de la jungla: apagados si estan muertos, grises si no se ven.
        for (const [x, y, type, status] of state.camps ?? []) {
            const style = CAMP_STYLE[type] ?? CAMP_STYLE[2];
            ctx.globalAlpha = status === 1 ? 1 : status === 0 ? 0.3 : 0.55;
            ctx.fillStyle = status === -1 ? "#8a8f7a" : style.color;
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.lineWidth = 1;
            ctx.beginPath();

            if (style.shape === "diamond") {
                ctx.moveTo(px(x), px(y) - style.r);
                ctx.lineTo(px(x) + style.r, px(y));
                ctx.lineTo(px(x), px(y) + style.r);
                ctx.lineTo(px(x) - style.r, px(y));
                ctx.closePath();
            } else {
                ctx.arc(px(x), px(y), style.r, 0, Math.PI * 2);
            }

            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        for (const [x, y, kind, team] of state.ents) {
            ctx.fillStyle = TEAM_COLOR[team];

            if (kind === 3) {
                ctx.fillRect(px(x) - 5, px(y) - 5, 10, 10);
            } else if (kind === 2) {
                ctx.fillRect(px(x) - 3, px(y) - 3, 6, 6);
            } else if (kind === 4) {
                ctx.fillRect(px(x) - 2, px(y) - 2, 4, 4);
            } else if (kind === 0) {
                ctx.beginPath();
                ctx.arc(px(x), px(y), 4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(px(x) - 1, px(y) - 1, 2, 2);
            }
        }

        // Marca propia.
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px(state.me.x), px(state.me.y), 6, 0, Math.PI * 2);
        ctx.stroke();
    }, [state]);

    return (
        <canvas
            ref={canvasRef}
            width={MINIMAP_SIZE}
            height={MINIMAP_SIZE}
            className="rounded-md border border-white/20 bg-black/60 shadow-lg"
        />
    );
}

function SkillPanel({ state }: { state: MobaState }) {
    if (state.skills.length === 0) {
        return (
            <div
                className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-black/65 px-3 py-1 text-[11px] text-stone-300"
                style={{ bottom: "var(--moba-skills-bottom, 8px)" }}
            >
                Este heroe pelea con armas (sin habilidades)
            </div>
        );
    }

    const levelUp = (slot: number) =>
        window.dispatchEvent(new CustomEvent("mobao:send", { detail: createMobaSkillPacket(slot) }));

    return (
        <div
            className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ bottom: "var(--moba-skills-bottom, 8px)" }}
        >
            {state.points > 0 ? (
                <div className="rounded bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold text-black">
                    {state.points} punto{state.points > 1 ? "s" : ""} de habilidad: elegi donde invertirlo
                </div>
            ) : null}
            <div className="flex max-w-[94vw] gap-1 overflow-x-auto rounded-md border border-white/15 bg-black/70 p-1">
                {state.skills.map((skill) => (
                    <div
                        key={skill.slot}
                        title={`${skill.name} · rango ${skill.rank}/${skill.max}${skill.ult ? " · definitiva" : ""} · proximo rango: nivel ${skill.nextReqLevel}`}
                        className={`flex w-[58px] shrink-0 flex-col items-center rounded border px-1 py-0.5 ${
                            skill.rank === 0 ? "border-white/10 opacity-60" : "border-white/25"
                        } ${skill.ult ? "bg-purple-900/40" : "bg-white/5"}`}
                    >
                        <span className="w-full truncate text-center text-[9px] leading-tight">{skill.name}</span>
                        <div className="my-0.5 flex gap-[2px]">
                            {Array.from({ length: skill.max }, (_, i) => (
                                <span
                                    key={i}
                                    className={`h-1.5 w-1.5 rounded-full ${i < skill.rank ? "bg-amber-300" : "bg-white/20"}`}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            disabled={!skill.canLevel}
                            onClick={() => levelUp(skill.slot)}
                            className={`h-4 w-full rounded text-[11px] font-bold leading-none ${
                                skill.canLevel
                                    ? "bg-amber-400 text-black hover:bg-amber-300"
                                    : "bg-white/10 text-stone-500"
                            }`}
                        >
                            +
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LevelBadge({ state }: { state: MobaState }) {
    const { level, xp, xpNext, maxLevel } = state.me;
    const pct = level >= maxLevel ? 100 : Math.min(100, Math.round((xp / Math.max(1, xpNext)) * 100));

    return (
        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-black/65 px-2 py-1 text-xs">
            <span className="rounded bg-amber-400 px-1.5 font-bold text-black">Nv {level}</span>
            <div className="h-1.5 w-20 overflow-hidden rounded bg-white/15">
                <div className="h-full bg-sky-400" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function MobaHud() {
    const [state, setState] = useState<MobaState | null>(null);
    const [showBoard, setShowBoard] = useState(false);

    useEffect(() => {
        const onState = (event: Event) => setState((event as CustomEvent<MobaState>).detail);

        window.addEventListener("mobao:state", onState);
        return () => window.removeEventListener("mobao:state", onState);
    }, []);

    if (!state) return null;

    const mine = state.team;
    const won = state.winner !== null && state.winner === mine;
    const bluePanel = state.score.blue;
    const redPanel = state.score.red;

    return (
        <div className="pointer-events-none absolute inset-0 z-30 select-none text-white">
            {/* Marcador superior */}
            <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-stretch overflow-hidden rounded-md border border-white/15 bg-black/65 text-xs shadow-lg">
                <div className="flex flex-col px-3 py-1" style={{ borderBottom: `3px solid ${TEAM_COLOR[0]}` }}>
                    <span className="font-semibold" style={{ color: TEAM_COLOR[0] }}>
                        {bluePanel.towers}T · {bluePanel.kills}K
                    </span>
                    <span className="text-[10px] text-stone-300">Nexo {bluePanel.nexus}%</span>
                </div>
                <div className="flex items-center px-3 font-mono text-sm">{formatClock(state.elapsed)}</div>
                <div className="flex flex-col px-3 py-1 text-right" style={{ borderBottom: `3px solid ${TEAM_COLOR[1]}` }}>
                    <span className="font-semibold" style={{ color: TEAM_COLOR[1] }}>
                        {redPanel.kills}K · {redPanel.towers}T
                    </span>
                    <span className="text-[10px] text-stone-300">Nexo {redPanel.nexus}%</span>
                </div>
            </div>

            {/* Oro y marcador */}
            <div className="pointer-events-auto absolute right-2 top-2 flex flex-col items-end gap-1">
                <LevelBadge state={state} />
                <div className="rounded-md border border-white/15 bg-black/65 px-2 py-1 text-xs">
                    <span style={{ color: TEAM_COLOR[mine] }}>Equipo {TEAM_NAME[mine]}</span> · Oro{" "}
                    <span className="text-amber-300">{state.me.gold}</span>
                </div>
                {(state.buffs ?? []).map((b) => (
                    <div
                        key={b.id}
                        className="rounded-md border px-2 py-0.5 text-[11px]"
                        style={{
                            borderColor: b.team ? "#c9a227" : "#4ad0a0",
                            background: "rgba(0,0,0,0.65)",
                            color: b.team ? "#f5d76e" : "#7fe8c0",
                        }}
                        title={b.team ? "Bendicion de equipo" : "Bendicion de la jungla (se pierde al morir)"}
                    >
                        {b.name}
                        {b.stacks > 1 ? ` x${b.stacks}` : ""}
                        {b.left > 0 ? ` · ${b.left}s` : ""}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent("mobao:fullscreen"))}
                    title="Pantalla completa (Alt+Enter)"
                    className="rounded-md border border-white/15 bg-black/65 px-2 py-1 text-[11px] hover:bg-black/80"
                >
                    Pantalla completa
                </button>
                <button
                    type="button"
                    onClick={() => setShowBoard((v) => !v)}
                    className="rounded-md border border-white/15 bg-black/65 px-2 py-1 text-[11px] hover:bg-black/80"
                >
                    {showBoard ? "Ocultar marcador" : "Marcador"}
                </button>
                {showBoard ? (
                    <div className="w-56 rounded-md border border-white/15 bg-black/80 p-2 text-[11px]">
                        {[0, 1].map((team) => (
                            <div key={team} className="mb-1">
                                <div className="font-semibold" style={{ color: TEAM_COLOR[team] }}>
                                    {TEAM_NAME[team]}
                                </div>
                                {state.heroes
                                    .filter((hero) => hero.team === team)
                                    .map((hero) => (
                                        <div key={hero.id} className="flex justify-between gap-2">
                                            <span className={hero.dead ? "text-stone-500 line-through" : ""}>
                                                {hero.name}
                                            </span>
                                            <span className="font-mono text-stone-300">
                                                Nv{hero.lvl} · {hero.k}/{hero.d}/{hero.cs}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        ))}
                        <div className="text-[10px] text-stone-400">K/D/Minions</div>
                    </div>
                ) : null}
            </div>

            <SkillPanel state={state} />

            {/* Minimapa */}
            <div className="absolute bottom-2 left-2">
                <Minimap state={state} />
            </div>

            {/* Respawn y fin de partida */}
            {state.respawnIn > 0 ? (
                <div className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md bg-black/70 px-4 py-2 text-center text-sm">
                    Reapareces en <span className="font-mono text-lg">{state.respawnIn}</span> s
                </div>
            ) : null}

            {state.phase === "ended" ? (
                <div className="absolute left-1/2 top-1/4 -translate-x-1/2 rounded-lg border border-white/20 bg-black/80 px-6 py-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: won ? "#7CFC9A" : "#ff8080" }}>
                        {won ? "¡VICTORIA!" : "DERROTA"}
                    </div>
                    <div className="mt-1 text-xs text-stone-300">
                        Gana el equipo {state.winner !== null ? TEAM_NAME[state.winner] : ""} · nueva partida en{" "}
                        {state.resetIn} s
                    </div>
                </div>
            ) : null}
        </div>
    );
}
