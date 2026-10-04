"use client";

import Link from "next/link";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import MobaScreen, {
    LoadingScreen,
    SectionTitle,
} from "@/components/moba/shell/MobaScreen";

const CONTROLS: Array<[string, string]> = [
    ["A S D W", "Mover a tu campeón (como en Argentum Online)."],
    ["Mouse + click", "Apuntar y lanzar el hechizo o la habilidad seleccionada."],
    ["Espacio", "Ataque básico (cuerpo a cuerpo o arco)."],
    ["Barra de macros", "Grabá una habilidad en la tecla que quieras; los controles son configurables."],
    ["/recall o /b", "Volver a la base: 8 segundos quieto y sin recibir daño."],
    ["E o doble click", "Equipar un objeto del inventario (comprar no equipa solo)."],
];

const SECTIONS: Array<{ title: string; body: string }> = [
    {
        title: "El objetivo",
        body: "Destruí el nexo del equipo rival. Las estructuras caen en orden: torre exterior, interior y de base de cada carril; recién entonces el nexo es vulnerable. Al caer el nexo termina la partida y se reinicia sola.",
    },
    {
        title: "Carriles y minions",
        body: "Hay tres carriles (arriba, medio y abajo). Cada 40 segundos salen oleadas de minions desde las barracas y avanzan por el carril. Las torres les disparan primero a los minions: usalos para acercarte.",
    },
    {
        title: "Jungla y objetivos",
        body: "Entre los carriles hay campamentos de monstruos que dan oro y experiencia y reaparecen a los 45 segundos. Los mejores otorgan bendiciones: Centinela Azul (hechizos y maná), Zarza Roja (daño físico y vida), Dragón del Río y Rey Demonio (bendición para todo el equipo).",
    },
    {
        title: "Niebla de guerra",
        body: "Solo ves lo que ven tu equipo, tus minions y tus torres. Los enemigos fuera de visión no existen para tu cliente: el minimapa te muestra el terreno que controlás.",
    },
    {
        title: "Niveles, habilidades y oro",
        body: "Subís del nivel 1 al 18. Cada nivel da un punto para mejorar una habilidad (la definitiva se desbloquea en el nivel 6). Ganás oro con minions, monstruos, torres y kills, y lo gastás en el mercader de tu base para mejorar arma, armadura, escudo y casco.",
    },
    {
        title: "Razas",
        body: "Además del campeón elegís raza en el lobby: cambia tus atributos (por ejemplo, el enano tiene más vida y poco maná; el gnomo, mucho maná y poca vida).",
    },
];

export default function MobaHelpPage() {
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });

    if (loading || !session) {
        return <LoadingScreen />;
    }

    return (
        <MobaScreen>
            <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-[#c8aa6e]">
                Guía rápida
            </p>
            <h1 className="mb-6 text-3xl font-black uppercase tracking-[0.06em] text-slate-50">
                Cómo jugar
            </h1>

            <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
                <section>
                    <SectionTitle>Controles</SectionTitle>
                    <dl className="space-y-2">
                        {CONTROLS.map(([keys, description]) => (
                            <div
                                key={keys}
                                className="flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2.5"
                            >
                                <dt className="w-32 shrink-0 text-xs font-bold uppercase tracking-wider text-[#e6c987]">
                                    {keys}
                                </dt>
                                <dd className="text-xs leading-relaxed text-slate-300">
                                    {description}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <Link
                        href="/moba"
                        className="mt-5 inline-block rounded border border-[#c8aa6e] bg-[linear-gradient(180deg,#2a2112,#171108)] px-6 py-2.5 text-sm font-bold uppercase tracking-[0.18em] text-[#e6c987] transition hover:bg-[#c8aa6e]/20"
                    >
                        Ir a jugar
                    </Link>
                </section>

                <section className="space-y-4">
                    {SECTIONS.map((section) => (
                        <article key={section.title}>
                            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c8aa6e]">
                                {section.title}
                            </h2>
                            <p className="mt-1 text-sm leading-relaxed text-slate-300">
                                {section.body}
                            </p>
                        </article>
                    ))}
                </section>
            </div>
        </MobaScreen>
    );
}
