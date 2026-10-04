"use client";

import { useEffect, useMemo, useState } from "react";

import type { TradeItem, TradeState } from "../../../lib/aowProtocol";
import { formatNumber } from "../../../lib/number-format";
import { ItemIcon, useGraphicsDB } from "./ItemIcon";

/** El comercio de AO cobra la mitad del valor de lista (ver TradeModal). */
export function shopPrice(item: TradeItem) {
    return Math.max(1, Math.floor(item.value / 2));
}

function detailLines(details: string) {
    return details
        .split("|")
        .map((d) => d.trim())
        .filter(Boolean);
}

/** Tienda del MOBA: catalogo que el servidor ya filtro por clase y raza. */
export function ShopModal({
    trade,
    gold,
    onBuy,
    onClose,
}: {
    trade: TradeState;
    gold: number;
    onBuy: (slot: number, amount: number) => void;
    onClose: () => void;
}) {
    const db = useGraphicsDB();
    const items = useMemo(
        () => [...trade.merchantItems].sort((a, b) => shopPrice(a) - shopPrice(b) || a.slot - b.slot),
        [trade.merchantItems],
    );
    const [selected, setSelected] = useState<number | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const current = items.find((i) => i.slot === selected) ?? items[0] ?? null;

    useEffect(() => {
        if (!flash) return;
        const id = window.setTimeout(() => setFlash(null), 1400);

        return () => window.clearTimeout(id);
    }, [flash]);

    const buy = (item: TradeItem) => {
        if (gold < shopPrice(item)) {
            setFlash("Oro insuficiente");
            return;
        }

        onBuy(item.slot, 1);
        setFlash(`Compraste ${item.name}`);
    };

    return (
        <div
            className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55"
            onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
            <div className="flex max-h-[86vh] w-[min(760px,95vw)] flex-col rounded border border-[#8a6d2f] bg-[#0a0d14]/97 text-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#8a6d2f]/60 px-4 py-2">
                    <div className="text-sm font-semibold uppercase tracking-[0.25em] text-[#e9d8a6]">Tienda</div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-amber-300">{formatNumber(gold)} oro</span>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded border border-white/20 px-2 text-xs text-stone-300 hover:bg-white/10"
                            title="Cerrar (B / Esc)"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:flex-row">
                    <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(88px,1fr))] content-start gap-2 overflow-y-auto pr-1">
                        {items.length === 0 ? (
                            <div className="col-span-full py-8 text-center text-sm text-stone-400">
                                No hay objetos disponibles para tu heroe.
                            </div>
                        ) : null}
                        {items.map((item) => {
                            const price = shopPrice(item);
                            const affordable = gold >= price;
                            const active = current?.slot === item.slot;

                            return (
                                <button
                                    key={item.slot}
                                    type="button"
                                    onClick={() => setSelected(item.slot)}
                                    onDoubleClick={() => buy(item)}
                                    className={`flex flex-col items-center gap-1 rounded border px-1 py-2 text-center ${
                                        active
                                            ? "border-[#e9d8a6] bg-[#2a2210]"
                                            : "border-white/10 bg-white/[0.04] hover:border-[#8a6d2f]"
                                    } ${affordable ? "" : "opacity-50"}`}
                                >
                                    <ItemIcon grhIndex={item.grhIndex} db={db} size={40} />
                                    <span className="line-clamp-2 min-h-[2.1em] text-[11px] leading-tight">{item.name}</span>
                                    <span className={`text-[11px] font-semibold ${affordable ? "text-amber-300" : "text-red-300"}`}>
                                        {formatNumber(price)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex w-full shrink-0 flex-col gap-2 rounded border border-white/10 bg-white/[0.03] p-3 sm:w-[220px]">
                        {current ? (
                            <>
                                <div className="flex items-center gap-3">
                                    <ItemIcon grhIndex={current.grhIndex} db={db} size={48} />
                                    <div className="text-sm font-semibold leading-tight text-[#e9d8a6]">{current.name}</div>
                                </div>
                                <div className="flex-1 space-y-0.5 text-[12px] text-stone-300">
                                    {detailLines(current.details).map((line) => (
                                        <div key={line}>{line}</div>
                                    ))}
                                </div>
                                <div className="text-sm text-amber-300">{formatNumber(shopPrice(current))} oro</div>
                                <button
                                    type="button"
                                    onClick={() => buy(current)}
                                    disabled={gold < shopPrice(current)}
                                    className="rounded border border-[#c8aa6e] bg-[#1a1608] py-1.5 text-sm font-semibold text-[#e9d8a6] hover:bg-[#2a2210] disabled:cursor-not-allowed disabled:border-white/10 disabled:text-stone-500"
                                >
                                    Comprar
                                </button>
                                <div className="h-4 text-center text-[11px] text-stone-400">{flash}</div>
                            </>
                        ) : (
                            <div className="text-sm text-stone-400">Selecciona un objeto.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
