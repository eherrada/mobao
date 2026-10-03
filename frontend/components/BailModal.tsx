"use client";

import React from "react";
import { formatNumber } from "../lib/number-format";

type BailModalProps = {
    kills: number;
    citizensKilled: number;
    fianzaCount: number;
    goldRequired: number;
    goldAvailable: number;
    canPay: boolean;
    onClose: () => void;
    onPay: () => void;
};

export default function BailModal({
    kills,
    citizensKilled,
    fianzaCount,
    goldRequired,
    goldAvailable,
    canPay,
    onClose,
    onPay,
}: BailModalProps) {
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-[#8d7044] bg-[radial-gradient(circle_at_top,#45311b_0%,#22170f_48%,#130d09_100%)] text-stone-100 shadow-[0_32px_120px_rgba(0,0,0,0.6)]">
                <div className="border-b border-amber-200/15 bg-black/20 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.35em] text-amber-300/80">
                                Fianza
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-stone-50">
                                Volver a ser ciudadano
                            </h2>
                            <p className="mt-2 max-w-md text-sm text-stone-300/85">
                                Paga tu deuda en oro para limpiar tu estado
                                criminal.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-stone-200/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-stone-300 transition hover:border-stone-200/20 hover:bg-white/10 hover:text-white"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-amber-200/10 bg-black/20 p-4">
                            <div className="text-[11px] uppercase tracking-[0.25em] text-stone-400">
                                Muertes
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-amber-100">
                                {formatNumber(kills)}
                            </div>
                            <div className="mt-1 text-xs text-stone-400">
                                Cuentan para la fianza
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200/10 bg-black/20 p-4">
                            <div className="text-[11px] uppercase tracking-[0.25em] text-stone-400">
                                Oro requerido
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-amber-100">
                                {formatNumber(goldRequired)}
                            </div>
                            <div className="mt-1 text-xs text-stone-400">
                                Monedas de oro
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200/10 bg-black/20 p-4">
                            <div className="text-[11px] uppercase tracking-[0.25em] text-stone-400">
                                Oro disponible
                            </div>
                            <div
                                className={`mt-2 text-3xl font-semibold ${canPay ? "text-emerald-300" : "text-rose-300"}`}
                            >
                                {formatNumber(goldAvailable)}
                            </div>
                            <div className="mt-1 text-xs text-stone-400">
                                {canPay ? "Puedes pagarla" : "No te alcanza"}
                            </div>
                        </div>
                    </div>

                    <div
                        className={`rounded-[24px] border px-4 py-3 text-sm ${canPay ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-rose-400/25 bg-rose-500/10 text-rose-100"}`}
                    >
                        <p className="mb-2 text-xs uppercase tracking-[0.22em] text-stone-300/80">
                            Ciudadanos: {formatNumber(citizensKilled)} | Veces pagadas: {formatNumber(fianzaCount)}
                        </p>
                        {canPay
                            ? "Tienes el oro suficiente para pagar la fianza ahora mismo."
                            : "No tienes suficiente oro. Sigue consiguiendo monedas y vuelve a intentarlo."}
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-stone-200 transition hover:bg-white/10"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={onPay}
                            disabled={!canPay}
                            className="rounded-2xl px-5 py-3 text-sm font-semibold text-stone-950 transition disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                            style={{
                                background: canPay
                                    ? "linear-gradient(135deg, #f8d47b 0%, #d6a546 100%)"
                                    : undefined,
                            }}
                        >
                            Pagar fianza
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
