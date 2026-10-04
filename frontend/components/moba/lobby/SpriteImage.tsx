"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import CharacterSpritePreview from "@/components/CharacterSpritePreview";
import type { ChampionSpriteIds } from "@/lib/mobaChampions";

/**
 * Retrato de un campeón: dibuja el sprite real de AO una sola vez (con PixiJS, fuera de pantalla), guarda la imagen
 * y la reutiliza. Así una grilla de 8 campeones y 6 slots no abre 14 contextos WebGL a la vez.
 */
const cache = new Map<string, string>();
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
    if (running < MAX_CONCURRENT) {
        running++;
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        waiting.push(() => {
            running++;
            resolve();
        });
    });
}

function release() {
    running--;
    waiting.shift()?.();
}

type SpriteImageProps = {
    sprite: ChampionSpriteIds;
    mode?: "full" | "head";
    /** Resolución del render (el tamaño visible lo da className). */
    scale?: number;
    className?: string;
    style?: CSSProperties;
    alt?: string;
};

export default function SpriteImage({
    sprite,
    mode = "full",
    scale = 3,
    className,
    style,
    alt = "",
}: SpriteImageProps) {
    const key = `${mode}:${scale}:${sprite.bodyId}:${sprite.headId}:${sprite.weaponId}:${sprite.shieldId}:${sprite.helmetId}`;
    const [url, setUrl] = useState<string | null>(cache.get(key) ?? null);
    const [active, setActive] = useState(false);
    // Libera el cupo de render de la corrida actual (cada corrida del efecto instala la suya).
    const releaseRef = useRef<() => void>(() => {});

    useEffect(() => {
        const cached = cache.get(key);

        if (cached) {
            setUrl(cached);
            setActive(false);
            return;
        }

        setUrl(null);
        let cancelled = false;
        let held = false;
        const releaseHeld = () => {
            if (held) {
                held = false;
                release();
            }
        };
        releaseRef.current = releaseHeld;

        void acquire().then(() => {
            held = true;

            if (cancelled) {
                releaseHeld();
                return;
            }

            const cachedNow = cache.get(key);

            if (cachedNow) {
                setUrl(cachedNow);
                releaseHeld();
                return;
            }

            setActive(true);
        });

        return () => {
            cancelled = true;
            setActive(false);
            releaseHeld();
        };
    }, [key]);

    return (
        <>
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={url}
                    alt={alt}
                    draggable={false}
                    className={className}
                    style={{ imageRendering: "pixelated", ...style }}
                />
            ) : (
                <div className={`${className ?? ""} animate-pulse rounded bg-white/5`} />
            )}
            {active && !url ? (
                <div
                    aria-hidden
                    className="pointer-events-none fixed -left-[9999px] top-0 opacity-0"
                >
                    <CharacterSpritePreview
                        bodyId={sprite.bodyId}
                        headId={sprite.headId}
                        weaponId={sprite.weaponId}
                        shieldId={sprite.shieldId}
                        helmetId={sprite.helmetId}
                        scale={scale}
                        mode={mode}
                        className="!border-0 !bg-none !shadow-none"
                        onSnapshot={(dataUrl) => {
                            cache.set(key, dataUrl);
                            setUrl(dataUrl);
                            setActive(false);
                            releaseRef.current();
                        }}
                    />
                </div>
            ) : null}
        </>
    );
}
