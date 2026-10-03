"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useAuthRedirect } from "../hooks/useAuthRedirect";

export default function HomePage() {
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });

    if (loading || !session) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 text-stone-100">
                <div className="rounded-[28px] border border-white/8 bg-stone-950/82 px-6 py-5 text-sm text-stone-300 shadow-2xl backdrop-blur-md">
                    Cargando inicio...
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-10 text-stone-100">
            <div className="mx-auto max-w-6xl space-y-6">
                <section className="grid gap-5 lg:grid-cols-2">
                    <Link
                        href="/characters"
                        prefetch={false}
                        className="group rounded-[32px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(34,211,238,0.14),rgba(8,47,73,0.2))] p-6 shadow-2xl transition hover:border-cyan-300/45 hover:bg-[linear-gradient(180deg,rgba(34,211,238,0.18),rgba(8,47,73,0.28))]"
                    >
                        <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">
                            Mundo abierto
                        </p>
                        <div className="mt-6 inline-flex rounded-full border border-cyan-200/30 px-4 py-2 text-sm font-medium text-cyan-100 transition group-hover:border-cyan-200/55 group-hover:bg-cyan-200/10">
                            Ir a personajes
                        </div>
                    </Link>

                    <Link
                        href="/arenas"
                        prefetch={false}
                        className="group rounded-[32px] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(252,211,77,0.14),rgba(120,53,15,0.2))] p-6 shadow-2xl transition hover:border-amber-300/45 hover:bg-[linear-gradient(180deg,rgba(252,211,77,0.18),rgba(120,53,15,0.28))]"
                    >
                        <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/80">
                            Arenas
                        </p>
                        <div className="mt-6 inline-flex rounded-full border border-amber-200/30 px-4 py-2 text-sm font-medium text-amber-100 transition group-hover:border-amber-200/55 group-hover:bg-amber-200/10">
                            Ir a Arenas
                        </div>
                    </Link>
                </section>

                <section className="relative overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,10,9,0.88),rgba(15,23,42,0.92))] p-6 shadow-2xl backdrop-blur-md md:p-8">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent" />
                    <div className="pointer-events-none absolute -right-16 top-8 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />
                    <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-amber-300/10 blur-3xl" />

                    <div className="relative w-full">
                        <div className="flex items-start justify-between gap-4">
                            <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                                De que se trata
                            </p>
                            <a
                                href="https://discord.gg/sf8rWAvgxs"
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Ir a Discord"
                                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-300/45 hover:bg-cyan-300/14 hover:text-cyan-100"
                            >
                                <MessageCircle className="h-5 w-5" />
                                Discord
                            </a>
                        </div>
                        <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
                            AOWeb Beta
                        </h2>
                        <div className="mt-5 space-y-5 rounded-[24px] border border-white/8 bg-black/15 p-5 text-sm leading-7 text-stone-300 md:space-y-6 md:p-6 md:text-[15px]">
                            <p>
                                AOWeb es un proyecto que aun está en Beta, es
                                probable que tenga varios errores y salió de
                                varios años como ex jugador de querer armar un
                                AO pero que funcione 100% en web y fluido, este
                                proyecto lo hice hace unos 12 años pero hoy las
                                tecnologías son otras y se puede tener un AO que
                                ande fluido en web y ese es mi objetivo.
                            </p>

                            <p>
                                Actualmente faltan muchas funciones que las voy
                                a ir agregando día a día hasta que podamos tener
                                un juego solido, vamos a tener sonidos,
                                carpinteria, poder ordenar hechizos/items, todo
                                lo necesario para una mejor jugabilidad.
                            </p>

                            <p>
                                Cualquier tipo de feedback o reporte de bug es
                                bienvenido, me lo pueden mandar a mi Twitter:{" "}
                                <a
                                    href="https://x.com/DamianCatanzaro"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-cyan-300 underline decoration-cyan-300/50 underline-offset-4 transition hover:text-cyan-200 hover:decoration-cyan-200"
                                >
                                    @DamianCatanzaro
                                </a>
                            </p>

                            <p>
                                Tambien pueden ingresar al Discord para recibir
                                novedades:{" "}
                                <a
                                    href="https://discord.gg/sf8rWAvgxs"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-cyan-300 underline decoration-cyan-300/50 underline-offset-4 transition hover:text-cyan-200 hover:decoration-cyan-200"
                                >
                                    unirse al Discord
                                </a>
                            </p>

                            <p>
                                O pueden enviar con mas detalle a este Form de
                                Google:{" "}
                                <a
                                    href="https://forms.gle/Df2cmGExTBjjJhAR8"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-amber-300 underline decoration-amber-300/50 underline-offset-4 transition hover:text-amber-200 hover:decoration-amber-200"
                                >
                                    abrir formulario
                                </a>
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
