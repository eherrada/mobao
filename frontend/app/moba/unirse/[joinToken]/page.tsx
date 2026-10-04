"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { joinMobaRoomByToken } from "@/lib/mobaApi";
import MobaScreen from "@/components/moba/shell/MobaScreen";

/** Link de invitación: entra a la sala por su código y va al lobby. */
export default function MobaJoinPage() {
    const router = useRouter();
    const params = useParams<{ joinToken: string }>();
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session || !params.joinToken) return;

        let cancelled = false;

        joinMobaRoomByToken(params.joinToken)
            .then((room) => {
                if (!cancelled) {
                    router.replace(`/moba/lobby?room=${encodeURIComponent(room.id)}`);
                }
            })
            .catch((failure) => {
                if (!cancelled) {
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : "No se pudo entrar a la sala",
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [params.joinToken, router, session]);

    return (
        <MobaScreen>
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
                <p className="text-sm uppercase tracking-[0.3em] text-[#c8aa6e]/80">
                    {error
                        ? "No se pudo entrar"
                        : loading
                          ? "Verificando sesión..."
                          : "Entrando a la sala..."}
                </p>
                {error ? (
                    <>
                        <p className="text-sm text-red-300">{error}</p>
                        <button
                            type="button"
                            onClick={() => router.push("/moba")}
                            className="rounded border border-[#c8aa6e]/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#e6c987]"
                        >
                            Volver al inicio
                        </button>
                    </>
                ) : null}
            </div>
        </MobaScreen>
    );
}
