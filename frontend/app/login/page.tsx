"use client";

import AuthCard from "../../components/AuthCard";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";

export default function LoginPage() {
    const { loading } = useAuthRedirect({
        redirectTo: "/",
        when: "authenticated",
    });

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#1f2937,transparent_35%),radial-gradient(circle_at_bottom,#0f766e33,transparent_30%),linear-gradient(180deg,#0c0a09,#111827)] px-4 py-12 text-stone-100">
                <div className="rounded-[28px] border border-white/8 bg-stone-950/82 px-6 py-5 text-sm text-stone-300 shadow-2xl backdrop-blur-md">
                    Cargando acceso...
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#1f2937,transparent_35%),radial-gradient(circle_at_bottom,#0f766e33,transparent_30%),linear-gradient(180deg,#0c0a09,#111827)] px-4 py-12 text-stone-100">
            <div className="w-full max-w-5xl">
                <AuthCard mode="login" />
            </div>
        </main>
    );
}
