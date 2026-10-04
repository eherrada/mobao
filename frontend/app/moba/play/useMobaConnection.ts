"use client";

import { useEffect, useRef, useState } from "react";

import type { ArenaGameTicketResponse, ArenaRoomDetails } from "../../../lib/arenas";
import type { AuthErrorResponse } from "../../../lib/auth";
import {
    DEFAULT_HOTKEY_SETTINGS,
    HOTKEYS_STORAGE_KEY,
    normalizeHotkeySettings,
    type HotkeySettings,
} from "../../../lib/hotkeys";
import {
    DEFAULT_RUNTIME_TIMING,
    mergeClientRuntimeTiming,
    type ClientRuntimeConfigResponse,
    type RuntimeTimingConfig,
} from "../../../lib/runtime-config";

export const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:7666";

export type MobaConnection = {
    wsUrl: string;
    ticket: string;
    typeGame: number;
    idChar: number;
    sessionKey: string;
};

export type MobaConnectionState =
    | { phase: "loading"; connection: null; error: null }
    | { phase: "ready"; connection: MobaConnection; error: null }
    | { phase: "error"; connection: null; error: string };

/**
 * Conexion a una sala MOBA: pide la sala, genera un ticket con el heroe elegido en el lobby
 * (mismo flujo que app/play/page.tsx en modo arena) y arma la configuracion de conexion del motor.
 */
export function useMobaConnection(roomId: string, enabled: boolean): MobaConnectionState {
    const [state, setState] = useState<MobaConnectionState>({ phase: "loading", connection: null, error: null });
    const startedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || !roomId || startedRef.current === roomId) {
            return;
        }

        startedRef.current = roomId;

        const start = async () => {
            try {
                const roomResponse = await fetch(`/api/arenas/rooms/${encodeURIComponent(roomId)}`, {
                    cache: "no-store",
                });
                const room = (await roomResponse.json()) as ArenaRoomDetails | AuthErrorResponse;

                if (!roomResponse.ok || "error" in room) {
                    throw new Error("error" in room ? room.error : "No se pudo recuperar la sala");
                }

                const templateId = room.member?.selectedPvpTemplateId;

                if (templateId === null || templateId === undefined) {
                    throw new Error("Todavia no elegiste un heroe en esta sala");
                }

                const ticketResponse = await fetch(`/api/arenas/rooms/${encodeURIComponent(roomId)}/select-template`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ templateId, raceId: room.member?.selectedPvpRaceId ?? undefined }),
                });
                const ticket = (await ticketResponse.json()) as ArenaGameTicketResponse | AuthErrorResponse;

                if (!ticketResponse.ok || "error" in ticket) {
                    throw new Error("error" in ticket ? ticket.error : "No se pudo generar el ticket de partida");
                }

                setState({
                    phase: "ready",
                    error: null,
                    connection: {
                        wsUrl: DEFAULT_WS_URL,
                        ticket: ticket.ticket,
                        typeGame: 2,
                        idChar: templateId,
                        sessionKey: `moba-${roomId}-${Date.now()}`,
                    },
                });
            } catch (error) {
                startedRef.current = null;
                setState({
                    phase: "error",
                    connection: null,
                    error: error instanceof Error ? error.message : "No se pudo entrar a la partida",
                });
            }
        };

        void start();
    }, [enabled, roomId]);

    return state;
}

/** Tiempos de accion del servidor (cooldowns de hechizo, paso, etc.). */
export function useRuntimeTiming(): RuntimeTimingConfig {
    const [timing, setTiming] = useState<RuntimeTimingConfig>(DEFAULT_RUNTIME_TIMING);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch("/api/runtime-config", { cache: "no-store" });
                const result = (await response.json()) as ClientRuntimeConfigResponse | AuthErrorResponse;

                if (!response.ok || cancelled || "error" in result) return;

                setTiming(mergeClientRuntimeTiming(result.timing));
            } catch {
                // Se queda con los tiempos por defecto.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return timing;
}

/**
 * Controles del MOBA: se respetan movimiento ASDW (o lo configurado) y ataque; las acciones de AO que
 * chocan con las teclas de habilidad o no existen en el MOBA (recoger, soltar, equipar, seguros...) se anulan.
 */
export function useMobaHotkeys(): HotkeySettings {
    const [settings, setSettings] = useState<HotkeySettings>(() => mobaHotkeys(DEFAULT_HOTKEY_SETTINGS));

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(HOTKEYS_STORAGE_KEY);

            if (raw) {
                setSettings(mobaHotkeys(normalizeHotkeySettings(JSON.parse(raw))));
            }
        } catch {
            // Sin configuracion guardada: valores por defecto.
        }
    }, []);

    return settings;
}

function mobaHotkeys(base: HotkeySettings): HotkeySettings {
    return {
        ...base,
        toggleWorldMap: [],
        toggleSeguro: [],
        toggleClanSeguro: [],
        toggleHiddenSkill: [],
        pickupItem: [],
        meditate: [],
        equipItem: [],
        useItem: [],
        dropItem: [],
    };
}
