import { Application, Container, Graphics } from "pixi.js";

import { TILE_SIZE } from "../../../lib/viewport";

/**
 * Capa de "fog of war" del modo MOBA (solo visual: el servidor ya no envia lo que el equipo no ve).
 * Oscurece toda la pantalla salvo el area que ven el heroe local y sus aliados.
 * Se activa sola cuando el color del jugador es el de un equipo del MOBA.
 */
export const MOBA_TEAM_COLORS = ["#4aa3ff", "#ff5a4a"];

// Mantener sincronizado con server/src/moba/fog.ts
const HERO_RADIUS = 8;
const MINION_RADIUS = 5;
const TOWER_RADIUS = 10;
const NEXUS_RADIUS = 8;
const DIM_ALPHA = 0.62;

type FogEntity = {
    pos?: { x: number; y: number };
    color?: string;
    isNpc?: boolean;
    nameCharacter?: string;
    dead?: boolean;
    hp?: number;
};

type FogEngine = {
    app: Application | null;
    mapContainer: Container | null;
    user: (FogEntity & { id?: number }) | null;
    personajes: Record<number, FogEntity>;
};

function radiusFor(entity: FogEntity): number {
    if (!entity.isNpc) return HERO_RADIUS;

    const name = entity.nameCharacter ?? "";

    if (name.startsWith("Torre")) return TOWER_RADIUS;
    if (name.startsWith("Nexo")) return NEXUS_RADIUS;
    return MINION_RADIUS;
}

export class FogOverlay {
    private graphics = new Graphics();
    private lastSignature = "";

    constructor(app: Application) {
        this.graphics.eventMode = "none";
        app.stage.addChild(this.graphics);
    }

    update(engine: FogEngine): void {
        const app = engine.app;
        const user = engine.user;
        const map = engine.mapContainer;

        if (!app || !user?.pos || !map) return;

        const teamColor = user.color;

        if (!teamColor || !MOBA_TEAM_COLORS.includes(teamColor)) {
            if (this.graphics.visible) {
                this.graphics.clear();
                this.graphics.visible = false;
                this.lastSignature = "";
            }
            return;
        }

        this.graphics.visible = true;

        const w = app.screen.width;
        const h = app.screen.height;

        // Fuentes de vision en coordenadas de tile. El heroe local ve con radio de heroe.
        const sources: Array<{ x: number; y: number; r2: number; edge2: number }> = [];
        const addSource = (x: number, y: number, r: number) =>
            sources.push({ x, y, r2: r * r, edge2: (r + 1.5) * (r + 1.5) });

        addSource(user.pos.x, user.pos.y, HERO_RADIUS);

        for (const entity of Object.values(engine.personajes)) {
            if (!entity?.pos || entity === user || entity.color !== teamColor) continue;
            if (entity.dead || (entity.hp !== undefined && entity.hp <= 0)) continue;

            addSource(entity.pos.x, entity.pos.y, radiusFor(entity));
        }

        const firstTileX = Math.floor(-map.x / TILE_SIZE) + 1;
        const firstTileY = Math.floor(-map.y / TILE_SIZE) + 1;
        const tilesW = Math.ceil(w / TILE_SIZE) + 2;
        const tilesH = Math.ceil(h / TILE_SIZE) + 2;
        const signature = `${firstTileX},${firstTileY},${tilesW},${tilesH}|${sources.map((c) => `${c.x},${c.y},${c.r2}`).join(";")}`;

        // El mapa se desplaza suave; solo se redibuja cuando cambian las fuentes o la ventana de tiles.
        this.graphics.x = map.x;
        this.graphics.y = map.y;

        if (signature === this.lastSignature) return;
        this.lastSignature = signature;

        const g = this.graphics;
        g.clear();

        const classify = (tx: number, ty: number): 0 | 1 | 2 => {
            let nearEdge = false;

            for (const s of sources) {
                const d2 = (s.x - tx) * (s.x - tx) + (s.y - ty) * (s.y - ty);
                if (d2 <= s.r2) return 0; // visible
                if (d2 <= s.edge2) nearEdge = true;
            }

            return nearEdge ? 1 : 2; // 1 = penumbra, 2 = oscuro
        };

        const runs: Array<Array<{ x: number; y: number; n: number }>> = [[], []];

        for (let j = 0; j < tilesH; j++) {
            const ty = firstTileY + j;
            let runStart = -1;
            let runKind: 0 | 1 | 2 = 0;

            const flush = (endIndex: number) => {
                if (runStart >= 0 && runKind !== 0) {
                    runs[runKind - 1].push({ x: firstTileX + runStart, y: ty, n: endIndex - runStart });
                }
            };

            for (let i = 0; i < tilesW; i++) {
                const kind = classify(firstTileX + i, ty);

                if (kind !== runKind || runStart < 0) {
                    flush(i);
                    runStart = i;
                    runKind = kind;
                }
            }

            flush(tilesW);
        }

        const drawRuns = (list: Array<{ x: number; y: number; n: number }>, alpha: number) => {
            if (list.length === 0) return;
            for (const run of list) {
                g.rect((run.x - 1) * TILE_SIZE, (run.y - 1) * TILE_SIZE, run.n * TILE_SIZE, TILE_SIZE);
            }
            g.fill({ color: 0x000000, alpha });
        };

        drawRuns(runs[0], DIM_ALPHA * 0.5);
        drawRuns(runs[1], DIM_ALPHA);
    }

    destroy(): void {
        this.graphics.destroy();
    }
}
