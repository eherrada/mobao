"use client";

import { useEffect, useState } from "react";

import type { FeedLine } from "./types";

const LIFETIME_MS = 9000;
const FADE_MS = 1500;

/** Columna de eventos (arriba a la derecha): avisos del servidor con desvanecimiento. */
export function KillFeed({ lines }: { lines: FeedLine[] }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 500);

        return () => window.clearInterval(id);
    }, []);

    const visible = lines.filter((line) => !line.sender && now - line.at < LIFETIME_MS).slice(-6);

    return (
        <div className="pointer-events-none flex w-[300px] flex-col items-end gap-1">
            {visible.map((line) => {
                const age = now - line.at;
                const opacity = age > LIFETIME_MS - FADE_MS ? Math.max(0, (LIFETIME_MS - age) / FADE_MS) : 1;

                return (
                    <div
                        key={line.id}
                        className="rounded border-r-2 bg-[#0a0d14]/80 px-2.5 py-1 text-right text-[12px] leading-tight shadow"
                        style={{ color: line.color, borderColor: line.color, opacity, transition: "opacity 0.5s" }}
                    >
                        {line.text}
                    </div>
                );
            })}
        </div>
    );
}
