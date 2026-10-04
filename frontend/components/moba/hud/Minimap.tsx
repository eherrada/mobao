"use client";

import { useEffect, useRef } from "react";

import { TEAM_COLOR, type MobaState } from "./types";

const CAMP_STYLE = [
    { color: "#4aa3ff", r: 4, shape: "circle" }, // Centinela Azul
    { color: "#ff6a4a", r: 4, shape: "circle" }, // Zarza Roja
    { color: "#d8c27a", r: 2.5, shape: "circle" }, // campamento comun
    { color: "#4ad0b0", r: 3, shape: "circle" }, // Tortuga del Rio
    { color: "#ff9a2e", r: 5, shape: "diamond" }, // Dragon
    { color: "#b05cff", r: 6, shape: "diamond" }, // Rey Demonio
] as const;

// Trazado de carriles (mismo layout que server/src/scripts/generateMobaMap.ts).
const LANES: Array<Array<[number, number]>> = [
    [[30, 225], [24, 225], [24, 24], [225, 24], [225, 30]],
    [[30, 225], [225, 30]],
    [[30, 225], [30, 231], [231, 231], [231, 30], [225, 30]],
];

/** Minimapa dibujado en canvas (resolucion interna fija de 240 px; el tamano en pantalla lo da `size`). */
export function Minimap({ state, size = 200 }: { state: MobaState; size?: number }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const RES = 240;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");

        if (!canvas || !ctx) return;

        const scale = RES / state.size;
        const px = (v: number) => (v - 1) * scale;

        ctx.clearRect(0, 0, RES, RES);
        ctx.fillStyle = "#0f2a1a";
        ctx.fillRect(0, 0, RES, RES);
        ctx.strokeStyle = "rgba(70,130,200,0.6)";
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, RES - 3, RES - 3);

        // Rio en la diagonal.
        ctx.strokeStyle = "rgba(60,120,200,0.75)";
        ctx.lineWidth = Math.max(3, 7 * scale);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(RES, RES);
        ctx.stroke();

        // Carriles.
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
                ctx.fillStyle = "#f5d76e";
                ctx.fillRect(px(x) - 2.5, px(y) - 2.5, 5, 5);
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
            width={RES}
            height={RES}
            style={{ width: size, height: size }}
            className="rounded-sm border-2 border-[#8a6d2f] bg-black/70 shadow-[0_0_14px_rgba(0,0,0,0.7)]"
        />
    );
}
