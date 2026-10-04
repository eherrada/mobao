"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Crown, LogOut } from "lucide-react";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import {
    type ArenaRoomDetails,
    type ArenaRoomMemberView,
} from "@/lib/arenas";
import {
    getMobaRoom,
    joinMobaRoom,
    leaveMobaRoom,
    startMobaMatch,
    updateMobaLobby,
} from "@/lib/mobaApi";
import {
    getChampion,
    getRace,
    MOBA_CHAMPIONS,
    MOBA_TEAMS,
    type MobaTeam,
} from "@/lib/mobaChampions";
import ChampionDetail, {
    ChampionGrid,
    ChampionPortrait,
} from "@/components/moba/lobby/ChampionParts";
import MobaScreen, {
    LoadingScreen,
    SectionTitle,
} from "@/components/moba/shell/MobaScreen";

const POLL_MS = 1500;
const TEAM_SIZE = 3;

function SlotCard({
    member,
    team,
    isMe,
    canJoin,
    onJoin,
}: {
    member: ArenaRoomMemberView | null;
    team: MobaTeam;
    isMe: boolean;
    canJoin: boolean;
    onJoin: () => void;
}) {
    const color = MOBA_TEAMS[team].color;

    if (!member) {
        return (
            <button
                type="button"
                disabled={!canJoin}
                onClick={onJoin}
                className="flex h-[76px] w-full items-center justify-center rounded border border-dashed border-white/15 text-xs uppercase tracking-[0.2em] text-slate-500 transition enabled:hover:border-white/40 enabled:hover:text-slate-200 disabled:cursor-default"
            >
                {canJoin ? "Pasarme a este equipo" : "Vacío"}
            </button>
        );
    }

    const champion = getChampion(member.templateId);
    const race = getRace(member.raceId);

    return (
        <div
            className={`flex h-[76px] items-center gap-3 rounded border px-2.5 ${
                isMe ? "bg-white/[0.07]" : "bg-white/[0.03]"
            }`}
            style={{ borderColor: isMe ? color : "rgba(255,255,255,0.1)" }}
        >
            {champion ? (
                <ChampionPortrait
                    champion={champion}
                    raceId={member.raceId ?? 1}
                    mode="head"
                    scale={2}
                    className="h-14 w-14"
                />
            ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-white/10 bg-black/30 text-xl text-slate-600">
                    ?
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-100">
                    {member.isOwner ? (
                        <Crown className="h-3.5 w-3.5 shrink-0 text-[#e6c987]" />
                    ) : null}
                    <span className="truncate">{member.name}</span>
                </p>
                <p className="truncate text-xs text-slate-400">
                    {champion ? `${champion.name} · ${race.name}` : "Eligiendo campeón..."}
                </p>
            </div>
            <span
                className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    member.ready
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/5 text-slate-500"
                }`}
            >
                {member.ready ? "Listo" : "Esperando"}
            </span>
        </div>
    );
}

function LobbyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = searchParams.get("room")?.trim() || "";
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [room, setRoom] = useState<ArenaRoomDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fatal, setFatal] = useState<string | null>(null);
    const [viewId, setViewId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);
    const [starting, setStarting] = useState(false);
    const mutationSeq = useRef(0);
    const navigated = useRef(false);
    const triedJoin = useRef(false);

    const goPlay = useCallback(() => {
        if (navigated.current) return;
        navigated.current = true;
        router.push(`/moba/play?room=${encodeURIComponent(roomId)}`);
    }, [roomId, router]);

    // Polling del estado de la sala.
    useEffect(() => {
        if (!session || !roomId) return;

        let cancelled = false;

        const tick = async () => {
            const seq = mutationSeq.current;

            try {
                let details = await getMobaRoom(roomId);

                if (!details.member && !triedJoin.current) {
                    triedJoin.current = true;
                    details = await joinMobaRoom(roomId);
                }

                if (cancelled || seq !== mutationSeq.current) return;

                if (!details.member) {
                    setFatal("No estás en esta sala.");
                    return;
                }

                setRoom(details);
                setError(null);
            } catch (failure) {
                if (cancelled) return;

                const status = (failure as { status?: number }).status;

                if (status === 404) {
                    setFatal("La sala ya no existe.");
                } else if (!room) {
                    setFatal(
                        failure instanceof Error
                            ? failure.message
                            : "No se pudo abrir la sala.",
                    );
                }
            }
        };

        void tick();
        const timer = window.setInterval(() => void tick(), POLL_MS);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
        // room solo se usa para decidir el mensaje de error inicial.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, session]);

    const myTemplate = room?.member?.selectedPvpTemplateId ?? null;

    // Cuando el dueño inicia la partida, todos los que ya eligieron campeón entran al juego.
    useEffect(() => {
        if (room?.launching && myTemplate !== null) {
            goPlay();
        }
    }, [goPlay, myTemplate, room?.launching]);

    const mutate = async (
        patch: Parameters<typeof updateMobaLobby>[1],
    ): Promise<void> => {
        mutationSeq.current++;
        setError(null);

        try {
            setRoom(await updateMobaLobby(roomId, patch));
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : "No se pudo actualizar el lobby",
            );
        }
    };

    if (!roomId) {
        return (
            <MobaScreen>
                <div className="py-16 text-center">
                    <p className="text-sm text-slate-300">No elegiste ninguna sala.</p>
                    <button
                        type="button"
                        onClick={() => router.push("/moba")}
                        className="mt-4 rounded border border-[#c8aa6e]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#e6c987]"
                    >
                        Ir al inicio
                    </button>
                </div>
            </MobaScreen>
        );
    }

    if (fatal) {
        return (
            <MobaScreen>
                <div className="py-16 text-center">
                    <p className="text-sm text-red-300">{fatal}</p>
                    <button
                        type="button"
                        onClick={() => router.push("/moba")}
                        className="mt-4 rounded border border-[#c8aa6e]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#e6c987]"
                    >
                        Volver al inicio
                    </button>
                </div>
            </MobaScreen>
        );
    }

    if (loading || !session || !room || !room.member) {
        return <LoadingScreen text="Abriendo sala..." />;
    }

    const members = room.members ?? [];
    const me = members.find((entry) => entry.accountId === session.account._id);
    const myRace = room.member.selectedPvpRaceId ?? 1;
    const myTeam: MobaTeam = (room.member.team ?? me?.team ?? "blue") as MobaTeam;
    const myReady = Boolean(room.member.ready);
    const shownChampion =
        getChampion(viewId ?? myTemplate) ?? MOBA_CHAMPIONS[0];
    const shareLink =
        typeof window === "undefined"
            ? ""
            : `${window.location.origin}/moba/unirse/${room.joinToken}`;
    const readyCount = members.filter((entry) => entry.ready).length;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareLink);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setError("No se pudo copiar el link; copialo a mano.");
        }
    };

    const chooseChampion = (id: number) => {
        setViewId(id);
        void mutate({ templateId: id, raceId: myRace, ready: false });
    };

    const chooseRace = (raceId: number) => {
        void mutate({ raceId, templateId: myTemplate ?? shownChampion.id });
    };

    const start = async () => {
        setStarting(true);
        setError(null);

        try {
            await startMobaMatch(roomId);
            goPlay();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : "No se pudo iniciar la partida",
            );
            setStarting(false);
        }
    };

    const leave = async () => {
        navigated.current = true;

        try {
            await leaveMobaRoom(roomId);
        } finally {
            router.push("/moba");
        }
    };

    return (
        <MobaScreen>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-[#c8aa6e]">
                        Lobby · MOBA 3v3 · {room.isPublic ? "Sala pública" : "Sala privada"}
                    </p>
                    <h1 className="text-2xl font-black uppercase tracking-[0.06em] text-slate-50">
                        {room.name}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void copyLink()}
                        className="inline-flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs text-slate-300 transition hover:border-white/40 hover:text-white"
                    >
                        {copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                        ) : (
                            <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Link copiado" : "Copiar link"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void leave()}
                        className="inline-flex items-center gap-1.5 rounded border border-white/15 px-3 py-2 text-xs text-slate-300 transition hover:border-red-400/60 hover:text-red-200"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Salir
                    </button>
                </div>
            </div>

            {error ? (
                <p className="mb-4 rounded border border-red-400/40 bg-red-950/40 px-4 py-2 text-sm text-red-200">
                    {error}
                </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
                <section>
                    <div className="grid grid-cols-2 gap-4">
                        {(["blue", "red"] as MobaTeam[]).map((team) => {
                            const teamMembers = members.filter(
                                (entry) => entry.team === team,
                            );
                            const isFull = teamMembers.length >= TEAM_SIZE;

                            return (
                                <div key={team}>
                                    <div
                                        className="mb-2 border-b-2 pb-1.5 text-xs font-black uppercase tracking-[0.3em]"
                                        style={{
                                            color: MOBA_TEAMS[team].color,
                                            borderColor: MOBA_TEAMS[team].color,
                                        }}
                                    >
                                        Equipo {MOBA_TEAMS[team].label}
                                        <span className="ml-2 font-normal text-slate-500">
                                            {teamMembers.length}/{TEAM_SIZE}
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {Array.from({ length: TEAM_SIZE }, (_, index) => {
                                            const member = teamMembers[index] ?? null;

                                            return (
                                                <SlotCard
                                                    key={member?.accountId ?? `empty-${index}`}
                                                    member={member}
                                                    team={team}
                                                    isMe={member?.accountId === session.account._id}
                                                    canJoin={team !== myTeam && !isFull}
                                                    onJoin={() => void mutate({ team })}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            disabled={myTemplate === null}
                            onClick={() => void mutate({ ready: !myReady })}
                            className={`rounded border-2 px-8 py-3 text-sm font-black uppercase tracking-[0.24em] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                myReady
                                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                                    : "border-[#e6c987] bg-[linear-gradient(180deg,#c8aa6e,#8a6b2c)] text-[#1a1307] hover:brightness-110"
                            }`}
                        >
                            {myReady ? "Listo ✓" : "Listo"}
                        </button>

                        {room.isOwner ? (
                            <button
                                type="button"
                                disabled={starting || myTemplate === null}
                                onClick={() => void start()}
                                className="rounded border-2 border-sky-400/70 bg-sky-500/10 px-8 py-3 text-sm font-black uppercase tracking-[0.24em] text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {starting ? "Iniciando..." : "Iniciar partida"}
                            </button>
                        ) : (
                            <span className="text-xs text-slate-500">
                                Esperando a que {room.owner.name} inicie la partida
                            </span>
                        )}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        {readyCount}/{members.length} listos.{" "}
                        {myTemplate === null
                            ? "Elegí un campeón para poder marcarte listo. "
                            : ""}
                        {room.isOwner
                            ? "Podés iniciar con slots vacíos: se juega con los que haya."
                            : ""}
                    </p>
                </section>

                <section className="space-y-4">
                    <div>
                        <SectionTitle>Elegí tu campeón</SectionTitle>
                        <ChampionGrid
                            champions={MOBA_CHAMPIONS}
                            selectedId={myTemplate}
                            raceId={myRace}
                            onSelect={chooseChampion}
                        />
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/25 p-4">
                        <ChampionDetail
                            champion={shownChampion}
                            raceId={myRace}
                            onRaceChange={chooseRace}
                        />
                    </div>
                </section>
            </div>
        </MobaScreen>
    );
}

export default function MobaLobbyPage() {
    return (
        <Suspense fallback={<LoadingScreen text="Abriendo sala..." />}>
            <LobbyContent />
        </Suspense>
    );
}
