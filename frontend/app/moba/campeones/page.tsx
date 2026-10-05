"use client";

import { useState } from "react";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { MOBA_CHAMPIONS, getChampion } from "@/lib/mobaChampions";
import ChampionDetail, {
    ChampionGrid,
} from "@/components/moba/lobby/ChampionParts";
import MobaScreen, {
    LoadingScreen,
    SectionTitle,
} from "@/components/moba/shell/MobaScreen";

export default function MobaChampionsPage() {
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [selectedId, setSelectedId] = useState(0);
    const [raceId, setRaceId] = useState(1);

    if (loading || !session) {
        return <LoadingScreen />;
    }

    const champion = getChampion(selectedId) ?? MOBA_CHAMPIONS[0];

    return (
        <MobaScreen>
            <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-[#c8aa6e]">
                Galería
            </p>
            <h1 className="mb-6 text-3xl font-black uppercase tracking-[0.06em] text-slate-50">
                Campeones
            </h1>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
                <section>
                    <SectionTitle>Elegí para ver el detalle</SectionTitle>
                    <ChampionGrid
                        champions={MOBA_CHAMPIONS}
                        selectedId={selectedId}
                        raceId={raceId}
                        onSelect={setSelectedId}
                    />
                    <p className="mt-4 text-xs leading-relaxed text-slate-500">
                        Los ocho campeones son las clases de Argentum Online.
                        Cada uno tiene su propio papel en el equipo; la raza
                        cambia tus atributos y se elige en el lobby antes de la
                        partida.
                    </p>
                </section>

                <section className="rounded-md border border-white/10 bg-black/25 p-4">
                    <ChampionDetail
                        champion={champion}
                        raceId={raceId}
                        onRaceChange={setRaceId}
                        buildReadOnly
                    />
                </section>
            </div>
        </MobaScreen>
    );
}
