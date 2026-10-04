import type { Engine } from "../engine/Engine";
import {
    removeObjectSprite,
    removeRoofSpritesForTile,
    removeSceneLayerSprite,
} from "./sceneRenderer";

/**
 * Carga del mapa por zonas (chunks) alrededor del jugador.
 *
 * Los mapas grandes (como el 255x255 del MOBA) tienen decenas de miles de tiles; crear un sprite por tile de
 * todo el mapa al entrar satura la memoria y produce tirones. Aca solo existen los sprites de los chunks
 * cercanos: se crean al acercarse y se destruyen al alejarse.
 */
export const CHUNK_SIZE = 16;
const LOAD_RADIUS = 2; // chunks (5x5 = 80x80 tiles alrededor del jugador)
const UNLOAD_RADIUS = 3;

/** Los mapas de 100x100 (o menos) siguen cargandose completos como siempre. */
export function shouldStreamMap(width: number, height: number): boolean {
    return width * height > 150 * 150;
}

type RenderChunk = (bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}) => Promise<void>;

export class ChunkStreamer {
    private loaded = new Set<string>();
    private loading = false;
    private lastCenter = "";
    private dirty = true;

    constructor(
        private engine: Engine,
        private renderChunk: RenderChunk,
    ) {}

    /** Llamar una vez por frame: es barato si el jugador no cambio de chunk. */
    update(tileX: number, tileY: number): void {
        const cx = Math.floor((tileX - 1) / CHUNK_SIZE);
        const cy = Math.floor((tileY - 1) / CHUNK_SIZE);
        const center = `${cx},${cy}`;

        if (center !== this.lastCenter) {
            this.lastCenter = center;
            this.dirty = true;
        }

        if (!this.dirty || this.loading) return;

        this.dirty = false;
        void this.sync(cx, cy);
    }

    private async sync(cx: number, cy: number): Promise<void> {
        this.loading = true;

        try {
            this.unloadFar(cx, cy);

            const pending: Array<{ x: number; y: number; dist: number }> = [];

            for (let y = cy - LOAD_RADIUS; y <= cy + LOAD_RADIUS; y++) {
                for (let x = cx - LOAD_RADIUS; x <= cx + LOAD_RADIUS; x++) {
                    if (!this.isValidChunk(x, y) || this.loaded.has(`${x},${y}`)) continue;
                    pending.push({ x, y, dist: Math.max(Math.abs(x - cx), Math.abs(y - cy)) });
                }
            }

            // Primero los mas cercanos al jugador.
            pending.sort((a, b) => a.dist - b.dist);

            for (const chunk of pending) {
                if (this.engine.isDestroyed) return;

                // Si el jugador ya se fue a otra zona, se reevalua antes de seguir.
                if (this.lastCenter !== `${cx},${cy}`) {
                    this.dirty = true;
                    return;
                }

                await this.renderChunk(this.boundsOf(chunk.x, chunk.y));
                this.loaded.add(`${chunk.x},${chunk.y}`);
                this.engine.cullingDirty = true;
            }
        } finally {
            this.loading = false;
        }
    }

    private isValidChunk(x: number, y: number): boolean {
        const { width, height } = this.engine.mapDimensions;
        return x >= 0 && y >= 0 && x * CHUNK_SIZE < width && y * CHUNK_SIZE < height;
    }

    private boundsOf(cx: number, cy: number) {
        const { width, height } = this.engine.mapDimensions;
        return {
            minX: cx * CHUNK_SIZE + 1,
            maxX: Math.min(width, (cx + 1) * CHUNK_SIZE),
            minY: cy * CHUNK_SIZE + 1,
            maxY: Math.min(height, (cy + 1) * CHUNK_SIZE),
        };
    }

    private unloadFar(cx: number, cy: number): void {
        for (const key of [...this.loaded]) {
            const [x, y] = key.split(",").map(Number);

            if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= UNLOAD_RADIUS) continue;

            this.unloadChunk(x, y);
            this.loaded.delete(key);
        }
    }

    private unloadChunk(cx: number, cy: number): void {
        const b = this.boundsOf(cx, cy);

        for (let y = b.minY; y <= b.maxY; y++) {
            for (let x = b.minX; x <= b.maxX; x++) {
                const tileKey = `${x},${y}`;
                removeSceneLayerSprite(this.engine, `layer1:${tileKey}`);
                removeSceneLayerSprite(this.engine, `layer2:${tileKey}`);
                removeSceneLayerSprite(this.engine, `layer3:${tileKey}`, tileKey);
                removeRoofSpritesForTile(this.engine, tileKey);
                removeObjectSprite(this.engine, tileKey);
            }
        }

        this.engine.cullingDirty = true;
    }
}
