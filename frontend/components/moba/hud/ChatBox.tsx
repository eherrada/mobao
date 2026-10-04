"use client";

import { useEffect, useRef, useState } from "react";

import type { FeedLine } from "./types";

const LIFETIME_MS = 12000;

/** Chat minimo: ultimas lineas (se desvanecen) y un input que abre Enter. */
export function ChatBox({
    lines,
    open,
    onClose,
    onSend,
}: {
    lines: FeedLine[];
    open: boolean;
    onClose: () => void;
    onSend: (text: string) => void;
}) {
    const [text, setText] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (open) {
            setText("");
            window.setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);

    const chat = lines.filter((l) => l.sender).slice(-6);
    const shown = open ? chat : chat.filter((l) => now - l.at < LIFETIME_MS);

    return (
        <div className="pointer-events-none flex w-[320px] flex-col gap-1">
            {shown.length > 0 ? (
                <div className="flex flex-col gap-0.5 rounded bg-black/45 px-2 py-1 text-[12px] leading-snug">
                    {shown.map((line) => (
                        <div key={line.id} className="text-stone-100">
                            <span className="font-semibold text-[#e9d8a6]">{line.sender}: </span>
                            {line.text}
                        </div>
                    ))}
                </div>
            ) : null}
            {open ? (
                <form
                    className="pointer-events-auto"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const value = text.trim();

                        if (value) onSend(value);
                        onClose();
                    }}
                >
                    <input
                        ref={inputRef}
                        value={text}
                        maxLength={120}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") onClose();
                        }}
                        onBlur={onClose}
                        placeholder="Escribe un mensaje y presiona Enter"
                        className="w-full rounded border border-[#8a6d2f] bg-[#0a0d14]/95 px-2 py-1 text-sm text-white outline-none placeholder:text-stone-500"
                    />
                </form>
            ) : null}
        </div>
    );
}
