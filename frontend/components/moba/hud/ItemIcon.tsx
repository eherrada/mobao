"use client";

import { useEffect, useState } from "react";

import type { GraphicData } from "../../../types/game";
import { getTexturePath, loadGraphicsDB } from "../../../utils/gameLoader";

type GraphicsDB = Record<string, GraphicData>;

let graphicsPromise: Promise<GraphicsDB> | null = null;

/** Base de graficos de AO (se descarga una sola vez y se comparte entre iconos). */
export function useGraphicsDB(): GraphicsDB | null {
    const [db, setDb] = useState<GraphicsDB | null>(null);

    useEffect(() => {
        let active = true;

        graphicsPromise ??= loadGraphicsDB().catch(() => ({}) as GraphicsDB);
        void graphicsPromise.then((data) => {
            if (active) setDb(data);
        });

        return () => {
            active = false;
        };
    }, []);

    return db;
}

/** Icono de un objeto de AO (grhIndex) escalado a `size` px. */
export function ItemIcon({
    grhIndex,
    db,
    size = 40,
    title,
}: {
    grhIndex: number;
    db: GraphicsDB | null;
    size?: number;
    title?: string;
}) {
    const graphic = db?.[String(grhIndex)];

    if (!graphic?.numFile) {
        return <div style={{ width: size, height: size }} className="rounded bg-white/5" />;
    }

    const scale = Math.min(size / Math.max(graphic.width, graphic.height, 1), 2);

    return (
        <div className="relative overflow-hidden" style={{ width: size, height: size }} title={title}>
            <div
                className="absolute left-1/2 top-1/2 bg-no-repeat"
                style={{
                    width: graphic.width,
                    height: graphic.height,
                    backgroundImage: `url(${getTexturePath(graphic)})`,
                    backgroundPosition: `-${graphic.sX}px -${graphic.sY}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center",
                    imageRendering: "pixelated",
                }}
            />
        </div>
    );
}
