"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Swords, Shield, BookOpen, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuthErrorResponse, AuthSession } from "@/lib/auth";

type AppChromeProps = {
    children: React.ReactNode;
};

// Navegación de MobAO. Las páginas del AO clásico (personajes, ranking, wiki...) siguen existiendo pero sin enlaces.
const navItems = [
    { href: "/moba", label: "Jugar", icon: Swords },
    { href: "/moba/campeones", label: "Campeones", icon: Shield },
    { href: "/moba/ayuda", label: "Cómo jugar", icon: BookOpen },
];

function isActivePath(pathname: string, href: string) {
    if (href === "/moba") {
        return pathname === "/moba" || pathname.startsWith("/moba/lobby");
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppChrome({ children }: AppChromeProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [session, setSession] = useState<AuthSession | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch("/api/auth/me", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }

                const result = (await response.json()) as
                    | AuthSession
                    | AuthErrorResponse;
                if ("error" in result) {
                    return null;
                }

                return result;
            })
            .then((result) => {
                if (!cancelled) {
                    setSession(result);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSession(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [pathname]);

    // Pantallas de juego: sin barra superior.
    if (pathname === "/play" || pathname.startsWith("/moba/play")) {
        return <>{children}</>;
    }

    return (
        <>
            <header className="sticky top-0 z-50 border-b border-[#c8aa6e]/20 bg-[#060a12]/95 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
                    <Link href="/moba" className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[#c8aa6e]/60 bg-[linear-gradient(180deg,#1b2433,#0a0f18)] text-sm font-black tracking-tight text-[#e6c987]">
                            M
                        </div>
                        <span className="text-2xl font-bold uppercase tracking-[0.22em] text-[#e6c987]">
                            MobAO
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-1 md:flex">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActivePath(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition ${
                                        active
                                            ? "border-[#c8aa6e] text-[#e6c987]"
                                            : "border-transparent text-slate-400 hover:text-slate-100"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-3">
                        {session ? (
                            <>
                                <span className="hidden text-sm text-slate-200 sm:inline">
                                    {session.account.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await fetch("/api/auth/signout", {
                                            method: "POST",
                                        });
                                        setSession(null);
                                        router.push("/login");
                                        router.refresh();
                                    }}
                                    className="inline-flex items-center justify-center rounded-full p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
                                    aria-label="Cerrar sesión"
                                    title="Cerrar sesión"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 rounded-md border border-[#c8aa6e]/40 px-4 py-2 text-sm text-[#e6c987] transition hover:bg-[#c8aa6e]/10"
                            >
                                <LogIn className="h-4 w-4" />
                                Ingresar
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="border-b border-[#c8aa6e]/15 bg-[#060a12]/95 px-4 py-2 backdrop-blur-xl md:hidden">
                <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActivePath(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                                    active
                                        ? "bg-[#c8aa6e]/12 text-[#e6c987]"
                                        : "text-slate-400 hover:text-slate-100"
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {children}
        </>
    );
}
