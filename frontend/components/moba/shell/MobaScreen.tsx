import type { ReactNode } from "react";

/** Fondo y márgenes comunes de las pantallas de MobAO (inicio, lobby, campeones, ayuda). */
export default function MobaScreen({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <main
            className={`min-h-[calc(100vh-57px)] overflow-y-auto bg-[radial-gradient(ellipse_at_top,#14233a_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#2a1c10_0%,transparent_45%),linear-gradient(180deg,#070b13,#05070c)] px-4 py-8 text-slate-100 ${className}`}
        >
            <div className="mx-auto max-w-6xl">{children}</div>
        </main>
    );
}

export function LoadingScreen({ text = "Cargando..." }: { text?: string }) {
    return (
        <MobaScreen>
            <div className="flex min-h-[50vh] items-center justify-center text-sm uppercase tracking-[0.3em] text-[#c8aa6e]/80">
                {text}
            </div>
        </MobaScreen>
    );
}

export function SectionTitle({
    children,
    aside,
}: {
    children: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-[#c8aa6e]/20 pb-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.24em] text-[#c8aa6e]">
                {children}
            </h2>
            {aside}
        </div>
    );
}
