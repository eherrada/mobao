"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapRenderer } from "../../../components/game";
import { BottomHud, getPotions } from "../../../components/moba/hud/BottomHud";
import { ChatBox } from "../../../components/moba/hud/ChatBox";
import { EndScreen } from "../../../components/moba/hud/EndScreen";
import { KillFeed } from "../../../components/moba/hud/KillFeed";
import { Minimap } from "../../../components/moba/hud/Minimap";
import { ScoreBoard } from "../../../components/moba/hud/ScoreBoard";
import { ShopModal } from "../../../components/moba/hud/ShopModal";
import { BuffChips, TopBar } from "../../../components/moba/hud/TopBar";
import {
    SKILL_KEYS,
    cssColor,
    type FeedLine,
    type MobaSkill,
    type MobaState,
} from "../../../components/moba/hud/types";
import { useAuthRedirect } from "../../../hooks/useAuthRedirect";
import {
    createClickPacket,
    createMobaSkillPacket,
    type PlayerHudState,
    type TradeState,
} from "../../../lib/aowProtocol";
import { useMobaConnection, useMobaHotkeys, useRuntimeTiming } from "./useMobaConnection";

const TILE = 32;
const VIEW_TILES_H = 21;
const MIN_TILES_W = 21;
const MAX_TILES_W = 31;
const GLOBAL_COOLDOWN_MS = 850;
const SHOP_RANGE = 3;
const SHOP_POS: Record<0 | 1, [number, number]> = { 0: [21, 238], 1: [234, 17] };

type RendererStatus = { connected: boolean; connecting: boolean; error?: string };
type Request = { token: number };

const next = <T extends Request>(current: T | null): number => (current?.token ?? 0) + 1;

/** Resolucion interna con la misma relacion de aspecto que la ventana (sin distorsion ni barras negras). */
function computeScreen(vw: number, vh: number) {
    const aspect = vw / Math.max(1, vh);
    let tiles = Math.round(VIEW_TILES_H * aspect);

    if (tiles % 2 === 0) tiles += tiles < VIEW_TILES_H * aspect ? 1 : -1;
    tiles = Math.max(MIN_TILES_W, Math.min(MAX_TILES_W, tiles));

    const width = tiles * TILE;
    // Alto: 21 tiles salvo que el tope de ancho lo obligue a recortar para no estirar la imagen.
    const height = Math.round(width / aspect);

    return { width, height: Math.max(TILE * 11, height) };
}

function CenterMessage({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#05070b] text-white">
            <div className="text-xs uppercase tracking-[0.5em] text-[#8a6d2f]">MobAO</div>
            <div className="text-2xl font-semibold tracking-wide text-[#e9d8a6]">{title}</div>
            {detail ? <div className="max-w-[80vw] text-center text-sm text-stone-400">{detail}</div> : null}
            {action}
        </div>
    );
}

export default function MobaPlay() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = searchParams.get("room")?.trim() || "";
    const preview = process.env.NODE_ENV === "development" ? searchParams.get("preview") : null;
    const lobbyHref = roomId ? `/moba/lobby?room=${encodeURIComponent(roomId)}` : "/moba";

    const { session } = useAuthRedirect({ redirectTo: "/login", when: "unauthenticated", preserveRedirect: true });
    const conn = useMobaConnection(roomId, !!session);
    const runtimeTiming = useRuntimeTiming();
    const hotkeySettings = useMobaHotkeys();

    const rootRef = useRef<HTMLDivElement | null>(null);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });
    const [state, setState] = useState<MobaState | null>(null);
    const [hud, setHud] = useState<PlayerHudState | null>(null);
    const [status, setStatus] = useState<RendererStatus>({ connected: false, connecting: false });
    const [trade, setTrade] = useState<TradeState | null>(null);
    const [feed, setFeed] = useState<FeedLine[]>([]);
    const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
    const [showBoard, setShowBoard] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [armedSlot, setArmedSlot] = useState<number | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [leaveArmed, setLeaveArmed] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mapNumber, setMapNumber] = useState(600);

    // Peticiones hacia el motor (cada una lleva un token incremental).
    const [spellTargetRequest, setSpellTargetRequest] = useState<
        { slot: number; manaRequired: number; name: string; token: number } | null
    >(null);
    const [useItemURequest, setUseItemURequest] = useState<{ slot: number; token: number } | null>(null);
    const [useItemClickRequest, setUseItemClickRequest] = useState<{ slot: number; token: number } | null>(null);
    const [buyRequest, setBuyRequest] = useState<{ slot: number; amount: number; token: number } | null>(null);
    const [closeTradeRequest, setCloseTradeRequest] = useState<{ token: number } | null>(null);
    const [chatRequest, setChatRequest] = useState<{ message: string; token: number } | null>(null);

    const feedIdRef = useRef(1);
    const prevManaRef = useRef<number | null>(null);
    const stateRef = useRef<MobaState | null>(null);
    const hudRef = useRef<PlayerHudState | null>(null);
    const tradeRef = useRef<TradeState | null>(null);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);
    useEffect(() => {
        hudRef.current = hud;
    }, [hud]);
    useEffect(() => {
        tradeRef.current = trade;
    }, [trade]);

    // Tamano de la ventana.
    useEffect(() => {
        const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });

        update();
        window.addEventListener("resize", update);

        return () => window.removeEventListener("resize", update);
    }, []);

    // Estado de partida del servidor.
    useEffect(() => {
        const onState = (event: Event) => {
            const detail = (event as CustomEvent<MobaState>).detail;

            // Solo desarrollo: ?preview=ended|dead fuerza esas pantallas para revisarlas sin jugar una partida.
            setState(
                preview === "ended"
                    ? { ...detail, phase: "ended", winner: detail.team, resetIn: 14 }
                    : preview === "dead"
                      ? { ...detail, respawnIn: 23 }
                      : detail,
            );
        };

        window.addEventListener("mobao:state", onState);

        return () => window.removeEventListener("mobao:state", onState);
    }, [preview]);

    // Reloj para cooldowns y avisos.
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 100);

        return () => window.clearInterval(id);
    }, []);

    const showToast = useCallback((text: string) => setToast({ text, at: Date.now() }), []);

    useEffect(() => {
        if (!toast) return;
        const id = window.setTimeout(() => setToast(null), 2200);

        return () => window.clearTimeout(id);
    }, [toast]);

    // Mensajes de la consola del motor: avisos [MOBA] al killfeed, chat al chat, errores utiles como aviso.
    const handleConsole = useCallback(
        (entry: {
            text: string;
            color?: string;
            source: "console" | "dialog" | "system";
            speakerType?: "npc" | "user";
            senderName?: string;
        }) => {
            const text = entry.text?.trim();

            if (!text) return;

            if (entry.source === "dialog") {
                if (entry.speakerType === "npc" || !entry.senderName) return;
                setFeed((current) =>
                    [...current, { id: feedIdRef.current++, text, color: "#e8e6e0", at: Date.now(), sender: entry.senderName }].slice(-30),
                );
                return;
            }

            if (text.startsWith("[MOBA]")) {
                const clean = text.replace(/^\[MOBA\]\s*/, "");

                setFeed((current) =>
                    [...current, { id: feedIdRef.current++, text: clean, color: cssColor(entry.color), at: Date.now() }].slice(-30),
                );
                return;
            }

            if (/mana|lejos|insuficiente|no puedes|no tienes|oro/i.test(text) && text.length < 120) {
                setToast({ text: text.replace(/^\[[^\]]+\]\s*/, ""), at: Date.now() });
            }
        },
        [],
    );

    const handleStatus = useCallback((next: RendererStatus) => {
        setStatus((current) => ({ ...current, ...next }));
    }, []);

    // Cooldown global estimado: se dispara cuando baja el mana tras apuntar un hechizo.
    useEffect(() => {
        const mana = hud?.mana ?? null;
        const prev = prevManaRef.current;

        prevManaRef.current = mana;

        if (mana !== null && prev !== null && mana < prev && armedSlot !== null) {
            setCooldownUntil(Date.now() + GLOBAL_COOLDOWN_MS);
            setArmedSlot(null);
        }
    }, [hud?.mana, armedSlot]);

    // Un hechizo apuntado que no se lanza se descarta solo.
    useEffect(() => {
        if (armedSlot === null) return;
        const id = window.setTimeout(() => setArmedSlot(null), 6000);

        return () => window.clearTimeout(id);
    }, [armedSlot]);

    const dead = !!hud?.dead || (state?.respawnIn ?? 0) > 0;

    const castSkill = useCallback(
        (skill: MobaSkill) => {
            const current = hudRef.current;

            if (!current || current.dead) return;
            if (skill.rank <= 0) {
                showToast(skill.canLevel ? "Sube un punto para usar esta habilidad" : "Aun no aprendiste esta habilidad");
                return;
            }

            const manaRequired = current.spells.find((s) => s.slot === skill.slot)?.manaRequired ?? 0;

            if ((current.mana ?? 0) < manaRequired) {
                showToast("Mana insuficiente");
                return;
            }

            setArmedSlot(skill.slot);
            setSpellTargetRequest((c) => ({ slot: skill.slot, manaRequired, name: skill.name, token: next(c) }));
        },
        [showToast],
    );

    const levelUp = useCallback((slot: number) => {
        window.dispatchEvent(new CustomEvent("mobao:send", { detail: createMobaSkillPacket(slot) }));
    }, []);

    const drinkPotion = useCallback((slot: number, viaKey: boolean) => {
        if (viaKey) setUseItemURequest((c) => ({ slot, token: next(c) }));
        else setUseItemClickRequest((c) => ({ slot, token: next(c) }));
    }, []);

    const closeShop = useCallback(() => {
        setTrade(null);
        setCloseTradeRequest((c) => ({ token: next(c) }));
    }, []);

    // B: abre la tienda del equipo (el servidor abre el comercio al "clickear" al mercader) o la cierra.
    const toggleShop = useCallback(() => {
        if (tradeRef.current) {
            closeShop();
            return;
        }

        const current = stateRef.current;

        if (!current || current.respawnIn > 0) return;

        // El mercader no viaja en state.ents (es invulnerable): su posicion es fija por equipo (generateMobaMap.ts).
        const [shopX, shopY] = SHOP_POS[current.team];

        if (Math.round(Math.hypot(current.me.x - shopX, current.me.y - shopY)) > SHOP_RANGE) {
            showToast("Acercate al mercader de tu base para comprar (B)");
            return;
        }

        window.dispatchEvent(new CustomEvent("mobao:send", { detail: createClickPacket(shopX, shopY, 0) }));
    }, [closeShop, showToast]);

    const sendChat = useCallback((message: string) => {
        setChatRequest((c) => ({ message, token: next(c) }));
    }, []);

    const toggleFullscreen = useCallback(async () => {
        const root = rootRef.current;

        if (!root) return;

        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await root.requestFullscreen({ navigationUI: "hide" });
        } catch {
            showToast("No se pudo activar la pantalla completa");
        }
    }, [showToast]);

    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        const request = () => void toggleFullscreen();

        document.addEventListener("fullscreenchange", onChange);
        window.addEventListener("mobao:fullscreen", request);

        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            window.removeEventListener("mobao:fullscreen", request);
        };
    }, [toggleFullscreen]);

    const leave = useCallback(
        async (href: string) => {
            if (leaving) return;
            setLeaving(true);

            try {
                if (roomId) await fetch(`/api/arenas/rooms/${encodeURIComponent(roomId)}/leave`, { method: "POST" });
            } catch {
                // Si falla la salida igual volvemos.
            }

            router.replace(href);
        },
        [leaving, roomId, router],
    );

    // Teclado del HUD: habilidades, pociones, tienda, chat, marcador.
    useEffect(() => {
        const typing = (target: EventTarget | null) =>
            target instanceof HTMLElement &&
            (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.altKey && event.key === "Enter") {
                event.preventDefault();
                void toggleFullscreen();
                return;
            }

            if (typing(event.target)) return;

            if (event.code === "Tab") {
                event.preventDefault();
                setShowBoard(true);
                return;
            }

            if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;

            if (event.code === "Enter" || event.code === "NumpadEnter") {
                event.preventDefault();
                setChatOpen(true);
                return;
            }

            if (event.code === "Escape") {
                setArmedSlot(null);
                if (tradeRef.current) closeShop();
                return;
            }

            if (event.code === "KeyB") {
                event.preventDefault();
                toggleShop();
                return;
            }

            if (event.code === "Digit1" || event.code === "Digit2" || event.code === "Numpad1" || event.code === "Numpad2") {
                const potion = getPotions(hudRef.current)[event.code.endsWith("1") ? 0 : 1];

                if (potion) {
                    event.preventDefault();
                    drinkPotion(potion.slot, true);
                }
                return;
            }

            const index = SKILL_KEYS.findIndex((k) => k.code === event.code);
            const skill = index >= 0 ? stateRef.current?.skills[index] : undefined;

            if (skill) {
                event.preventDefault();
                castSkill(skill);
            }
        };

        const onKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Tab") {
                event.preventDefault();
                setShowBoard(false);
            }
        };

        const onBlur = () => setShowBoard(false);

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [castSkill, closeShop, toggleFullscreen, toggleShop, drinkPotion]);

    // Si la sala no sirve, volvemos al lobby despues de mostrar el motivo.
    useEffect(() => {
        if (conn.phase !== "error") return;
        const id = window.setTimeout(() => router.replace(lobbyHref), 3500);

        return () => window.clearTimeout(id);
    }, [conn.phase, lobbyHref, router]);

    useEffect(() => {
        if (!leaveArmed) return;
        const id = window.setTimeout(() => setLeaveArmed(false), 3000);

        return () => window.clearTimeout(id);
    }, [leaveArmed]);

    const screen = useMemo(() => computeScreen(viewport.width || 1280, viewport.height || 720), [viewport]);
    const uiScale = Math.max(0.55, Math.min(1.3, Math.min(viewport.width / 1366, viewport.height / 768) || 1));

    const connection = conn.phase === "ready" ? conn.connection : null;

    // El motor se memoiza para que el HUD (que cambia cada 100 ms) no lo vuelva a reconciliar.
    const engine = useMemo(
        () =>
            viewport.width > 0 ? (
                <MapRenderer
                    embedded
                    hideStatusTexts
                    mapNumber={mapNumber}
                    onMapChange={setMapNumber}
                    width={viewport.width}
                    height={viewport.height}
                    screenWidth={screen.width}
                    screenHeight={screen.height}
                    connection={connection}
                    useItemURequest={useItemURequest}
                    useItemClickRequest={useItemClickRequest}
                    buyRequest={buyRequest}
                    closeTradeRequest={closeTradeRequest}
                    spellTargetRequest={spellTargetRequest}
                    chatRequest={chatRequest}
                    runtimeTiming={runtimeTiming}
                    hotkeySettings={hotkeySettings}
                    macros={[]}
                    onStatusChange={handleStatus}
                    onHudChange={setHud}
                    onConsoleMessage={handleConsole}
                    onTradeStateChange={setTrade}
                />
            ) : null,
        [
            mapNumber,
            viewport.width,
            viewport.height,
            screen.width,
            screen.height,
            connection,
            useItemURequest,
            useItemClickRequest,
            buyRequest,
            closeTradeRequest,
            spellTargetRequest,
            chatRequest,
            runtimeTiming,
            hotkeySettings,
            handleStatus,
            handleConsole,
        ],
    );

    const cooldownLeft = Math.max(0, cooldownUntil - now);
    const ready = !!state && !!hud;
    const failure = conn.phase === "error" ? conn.error : status.error && !status.connected && !status.connecting ? status.error : null;

    return (
        <div ref={rootRef} className="fixed inset-0 select-none overflow-hidden bg-black text-white">
            {!roomId ? (
                <CenterMessage
                    title="Falta la sala"
                    detail="Entra a una partida desde el lobby."
                    action={
                        <button
                            type="button"
                            onClick={() => router.replace("/moba")}
                            className="rounded border border-[#c8aa6e] px-4 py-1.5 text-sm text-[#e9d8a6] hover:bg-white/10"
                        >
                            Ir al inicio
                        </button>
                    }
                />
            ) : null}

            <div className="absolute inset-0 [&_canvas]:!rounded-none [&>div>div]:!rounded-none">{engine}</div>

            {/* HUD */}
            {state ? (
                <div className="pointer-events-none absolute inset-0 z-20">
                    <TopBar state={state} />
                    <BuffChips state={state} />

                    {/* Arriba a la derecha: botones y eventos */}
                    <div
                        className="absolute right-3 top-3 flex flex-col items-end gap-2"
                        style={{ transform: `scale(${uiScale})`, transformOrigin: "top right" }}
                    >
                        <div className="pointer-events-auto flex gap-1.5">
                            <HudButton onClick={() => setShowBoard((v) => !v)} title="Marcador (Tab)">
                                Marcador
                            </HudButton>
                            <HudButton onClick={() => sendChat("/recall")} title="Volver a la base (8 s, quieto)">
                                Base
                            </HudButton>
                            <HudButton onClick={() => void toggleFullscreen()} title="Pantalla completa (Alt+Enter)">
                                {isFullscreen ? "Ventana" : "Pantalla completa"}
                            </HudButton>
                            <HudButton
                                onClick={() => (leaveArmed ? void leave("/moba") : setLeaveArmed(true))}
                                title="Salir de la partida"
                                danger={leaveArmed}
                            >
                                {leaveArmed ? "¿Seguro? Click para salir" : "Salir"}
                            </HudButton>
                        </div>
                        <KillFeed lines={feed} />
                    </div>

                    {/* Abajo a la izquierda: chat y minimapa */}
                    <div
                        className="absolute bottom-3 left-3 flex flex-col gap-2"
                        style={{ transform: `scale(${uiScale})`, transformOrigin: "bottom left" }}
                    >
                        <ChatBox lines={feed} open={chatOpen} onClose={() => setChatOpen(false)} onSend={sendChat} />
                        <div className="pointer-events-auto">
                            <Minimap state={state} size={210} />
                        </div>
                    </div>

                    {/* Abajo al centro */}
                    <div
                        className="absolute bottom-0 left-1/2"
                        style={{ transform: `translateX(-50%) scale(${uiScale})`, transformOrigin: "bottom center" }}
                    >
                        <BottomHud
                            state={state}
                            hud={hud}
                            cooldownLeft={cooldownLeft}
                            cooldownTotal={GLOBAL_COOLDOWN_MS}
                            armedSlot={armedSlot}
                            onCast={castSkill}
                            onLevelUp={levelUp}
                            onUsePotion={(slot) => drinkPotion(slot, false)}
                            onOpenShop={toggleShop}
                        />
                    </div>

                    {toast ? (
                        <div className="absolute bottom-[190px] left-1/2 -translate-x-1/2 rounded border border-[#8a6d2f] bg-[#0a0d14]/90 px-3 py-1 text-sm text-[#e9d8a6] shadow">
                            {toast.text}
                        </div>
                    ) : null}

                    {dead && state.phase === "running" ? (
                        <div className="absolute left-1/2 top-[28%] -translate-x-1/2 rounded border border-red-400/50 bg-black/75 px-6 py-3 text-center">
                            <div className="text-xs uppercase tracking-[0.35em] text-red-300">Has caido</div>
                            <div className="mt-1 text-sm text-stone-200">
                                Reapareces en <span className="font-mono text-2xl text-white">{state.respawnIn}</span> s
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {state && showBoard ? <ScoreBoard state={state} /> : null}

            {trade && trade.mode === "merchant" ? (
                <ShopModal
                    trade={trade}
                    gold={state?.me.gold ?? hud?.gold ?? 0}
                    onBuy={(slot, amount) => setBuyRequest((c) => ({ slot, amount, token: next(c) }))}
                    onClose={closeShop}
                />
            ) : null}

            {state?.phase === "ended" ? (
                <EndScreen state={state} onLobby={() => void leave(lobbyHref)} onHome={() => void leave("/moba")} />
            ) : null}

            {failure ? (
                <CenterMessage
                    title="No se pudo entrar a la partida"
                    detail={`${failure}. Volviendo al lobby...`}
                    action={
                        <button
                            type="button"
                            onClick={() => router.replace(lobbyHref)}
                            className="rounded border border-[#c8aa6e] px-4 py-1.5 text-sm text-[#e9d8a6] hover:bg-white/10"
                        >
                            Volver al lobby
                        </button>
                    }
                />
            ) : !ready && roomId ? (
                <CenterMessage
                    title="Entrando a la partida"
                    detail={conn.phase === "loading" ? "Preparando tu heroe..." : "Cargando el mapa..."}
                    action={
                        <div className="h-1 w-48 overflow-hidden rounded bg-white/10">
                            <div className="h-full w-1/3 animate-pulse bg-[#c8aa6e]" />
                        </div>
                    }
                />
            ) : null}

        </div>
    );
}

function HudButton({
    children,
    onClick,
    title,
    danger = false,
}: {
    children: React.ReactNode;
    onClick: () => void;
    title: string;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`rounded border px-2.5 py-1 text-[11px] shadow ${
                danger
                    ? "border-red-400 bg-red-900/70 text-red-100"
                    : "border-[#8a6d2f]/80 bg-[#0a0d14]/85 text-[#e9d8a6] hover:bg-[#1a1608]"
            }`}
        >
            {children}
        </button>
    );
}
