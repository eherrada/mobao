"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Lock, RefreshCw, Users } from "lucide-react";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import type { ArenaRoomSummary } from "@/lib/arenas";
import {
    createMobaRoom,
    extractJoinToken,
    joinMobaRoom,
    joinMobaRoomByToken,
    listMobaRooms,
} from "@/lib/mobaApi";
import MobaScreen, {
    LoadingScreen,
    SectionTitle,
} from "@/components/moba/shell/MobaScreen";

const ROOM_POLL_MS = 4000;
const INPUT_CLASS =
    "w-full rounded border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#c8aa6e]/70";
const GOLD_BUTTON =
    "rounded border border-[#c8aa6e] bg-[linear-gradient(180deg,#2a2112,#171108)] px-4 py-2 text-sm font-bold uppercase tracking-[0.16em] text-[#e6c987] transition hover:bg-[#c8aa6e]/20 disabled:cursor-not-allowed disabled:opacity-50";

export default function MobaHomePage() {
    const router = useRouter();
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [rooms, setRooms] = useState<ArenaRoomSummary[]>([]);
    const [roomsLoaded, setRoomsLoaded] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [createName, setCreateName] = useState("");
    const [createPublic, setCreatePublic] = useState(true);
    const [createPassword, setCreatePassword] = useState("");
    const [joinInput, setJoinInput] = useState("");

    const refresh = useCallback(async () => {
        try {
            setRooms(await listMobaRooms());
            setRoomsLoaded(true);
        } catch {
            // Un fallo de red aislado no debe tapar la pantalla: se reintenta en el próximo ciclo.
        }
    }, []);

    useEffect(() => {
        if (!session) return;

        void refresh();
        const timer = window.setInterval(() => void refresh(), ROOM_POLL_MS);
        return () => window.clearInterval(timer);
    }, [refresh, session]);

    const run = async (key: string, action: () => Promise<string>) => {
        setError(null);
        setBusy(key);

        try {
            const roomId = await action();
            router.push(`/moba/lobby?room=${encodeURIComponent(roomId)}`);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : "No se pudo completar la acción",
            );
            setBusy(null);
        }
    };

    if (loading || !session) {
        return <LoadingScreen />;
    }

    const playNow = () =>
        run("play", async () => {
            const room = await createMobaRoom({
                name: `Sala de ${session.account.name}`.slice(0, 40),
                isPublic: true,
            });
            return room.id;
        });

    return (
        <MobaScreen>
            <section className="relative overflow-hidden rounded-lg border border-[#c8aa6e]/30 bg-[radial-gradient(ellipse_at_30%_20%,#1c3358_0%,transparent_60%),linear-gradient(135deg,#0c1424,#120d08)] px-6 py-10 sm:px-12">
                <p className="text-xs font-bold uppercase tracking-[0.4em] text-[#c8aa6e]">
                    MOBA 3 vs 3
                </p>
                <h1 className="mt-2 text-4xl font-black uppercase tracking-[0.08em] text-slate-50 sm:text-5xl">
                    Destruí el nexo enemigo
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
                    Tres carriles, jungla, niebla de guerra y combate manual con
                    ASDW al estilo Argentum Online. Elegí tu campeón y entrá a
                    la grieta con tu equipo.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={playNow}
                        disabled={busy !== null}
                        className="rounded border-2 border-[#e6c987] bg-[linear-gradient(180deg,#c8aa6e,#8a6b2c)] px-12 py-3.5 text-xl font-black uppercase tracking-[0.3em] text-[#1a1307] shadow-[0_0_30px_rgba(200,170,110,0.35)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                    >
                        {busy === "play" ? "Creando sala..." : "Jugar"}
                    </button>
                    <Link
                        href="/moba/campeones"
                        className="rounded border border-white/15 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/40 hover:text-white"
                    >
                        Ver campeones
                    </Link>
                </div>
            </section>

            {error ? (
                <p className="mt-4 rounded border border-red-400/40 bg-red-950/40 px-4 py-2 text-sm text-red-200">
                    {error}
                </p>
            ) : null}

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
                <section>
                    <SectionTitle
                        aside={
                            <button
                                type="button"
                                onClick={() => void refresh()}
                                className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-100"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Actualizar
                            </button>
                        }
                    >
                        Salas públicas
                    </SectionTitle>

                    {!roomsLoaded ? (
                        <p className="py-8 text-center text-sm text-slate-500">
                            Buscando salas...
                        </p>
                    ) : rooms.length === 0 ? (
                        <div className="rounded border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
                            No hay salas abiertas. Creá una con el botón Jugar.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {rooms.map((room) => {
                                const players = room.memberCount ?? room.connectedPlayers;
                                const full = players >= room.capacity;

                                return (
                                    <li
                                        key={room.id}
                                        className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.03] px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-slate-100">
                                                {room.name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Creada por {room.owner.name}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
                                                <Users className="h-4 w-4 text-[#c8aa6e]" />
                                                {players}/{room.capacity}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={busy !== null || full}
                                                onClick={() =>
                                                    run(room.id, async () => {
                                                        const joined = await joinMobaRoom(room.id);
                                                        return joined.id;
                                                    })
                                                }
                                                className={GOLD_BUTTON}
                                            >
                                                {full ? "Llena" : busy === room.id ? "..." : "Unirse"}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <aside className="space-y-8">
                    <section>
                        <SectionTitle>Crear sala</SectionTitle>
                        <form
                            className="space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void run("create", async () => {
                                    const room = await createMobaRoom({
                                        name: createName,
                                        isPublic: createPublic,
                                        password: createPassword,
                                    });
                                    return room.id;
                                });
                            }}
                        >
                            <input
                                value={createName}
                                onChange={(event) => setCreateName(event.target.value)}
                                placeholder="Nombre de la sala"
                                minLength={3}
                                maxLength={40}
                                required
                                className={INPUT_CLASS}
                            />
                            <div className="flex gap-2 text-xs font-semibold uppercase tracking-wider">
                                {[true, false].map((isPublic) => (
                                    <button
                                        key={String(isPublic)}
                                        type="button"
                                        onClick={() => setCreatePublic(isPublic)}
                                        className={`flex-1 rounded border px-3 py-2 transition ${
                                            createPublic === isPublic
                                                ? "border-[#c8aa6e] bg-[#c8aa6e]/15 text-[#e6c987]"
                                                : "border-white/10 text-slate-400 hover:text-slate-100"
                                        }`}
                                    >
                                        {isPublic ? "Pública" : (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Lock className="h-3 w-3" /> Privada
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {!createPublic ? (
                                <input
                                    value={createPassword}
                                    onChange={(event) => setCreatePassword(event.target.value)}
                                    placeholder="Clave de la sala"
                                    required
                                    className={INPUT_CLASS}
                                />
                            ) : null}
                            <button
                                type="submit"
                                disabled={busy !== null}
                                className={`${GOLD_BUTTON} w-full`}
                            >
                                {busy === "create" ? "Creando..." : "Crear sala"}
                            </button>
                        </form>
                    </section>

                    <section>
                        <SectionTitle>Unirse con link o código</SectionTitle>
                        <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const token = extractJoinToken(joinInput);

                                if (!token) {
                                    setError("Pegá el link o código de la sala.");
                                    return;
                                }

                                void run("token", async () => {
                                    const joined = await joinMobaRoomByToken(token);
                                    return joined.id;
                                });
                            }}
                        >
                            <input
                                value={joinInput}
                                onChange={(event) => setJoinInput(event.target.value)}
                                placeholder="Link o código de sala"
                                className={INPUT_CLASS}
                            />
                            <button
                                type="submit"
                                disabled={busy !== null}
                                className={GOLD_BUTTON}
                            >
                                Entrar
                            </button>
                        </form>
                    </section>
                </aside>
            </div>
        </MobaScreen>
    );
}
