import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";

import { TILE_SIZE } from "../../../lib/viewport";

/**
 * Fog of war visual del modo MOBA (el servidor ya no envia lo que el equipo no ve).
 *
 * Una capa oscura cubre la pantalla y cada fuente de vision (el heroe local y los aliados) "borra" la
 * oscuridad con una luz de degradé suave. Las luces se mueven fluido junto con las entidades, sin saltos de tile.
 * Se activa sola cuando el color del jugador es el de un equipo del MOBA.
 */
export const MOBA_TEAM_COLORS = ["#4aa3ff", "#ff5a4a"];

// Mantener sincronizado con server/src/moba/fog.ts
const HERO_RADIUS = 8;
const MINION_RADIUS = 5;
const TOWER_RADIUS = 10;
const NEXUS_RADIUS = 8;
const DARKNESS_ALPHA = 0.72;
const LIGHT_FEATHER = 1.5; // tiles de degradé mas alla del radio de vision
const FOLLOW_SPEED = 6; // tiles por segundo con los que la luz de un aliado alcanza su posicion

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
    delta: number;
};

function radiusFor(entity: FogEntity): number {
    if (!entity.isNpc) return HERO_RADIUS;

    const name = entity.nameCharacter ?? "";

    if (name.startsWith("Torre")) return TOWER_RADIUS;
    if (name.startsWith("Nexo")) return NEXUS_RADIUS;
    return MINION_RADIUS;
}

function createLightTexture(): Texture {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Opaco hasta cerca del borde (ahi termina el radio de vision real) y luego se desvanece.
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.78, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return Texture.from(canvas);
}

export class FogOverlay {
    private rt: RenderTexture;
    private sprite: Sprite;
    private scene = new Container();
    private dark = new Graphics();
    private lights: Sprite[] = [];
    private lightTexture = createLightTexture();
    private smoothed = new Map<number, { x: number; y: number }>();
    private width = 0;
    private height = 0;
    private active = false;

    constructor(app: Application) {
        this.rt = RenderTexture.create({ width: 2, height: 2, resolution: app.renderer.resolution });
        this.sprite = new Sprite(this.rt);
        this.sprite.eventMode = "none";
        this.sprite.visible = false;
        this.scene.addChild(this.dark);
        app.stage.addChild(this.sprite);
    }

    private resize(w: number, h: number) {
        if (w === this.width && h === this.height) return;

        this.width = w;
        this.height = h;
        this.rt.resize(w, h);
        this.dark.clear();
        this.dark.rect(0, 0, w, h).fill({ color: 0x000000, alpha: DARKNESS_ALPHA });
        this.sprite.texture = this.rt;
    }

    private light(index: number): Sprite {
        let sprite = this.lights[index];

        if (!sprite) {
            sprite = new Sprite(this.lightTexture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "erase";
            this.lights[index] = sprite;
            this.scene.addChild(sprite);
        }

        sprite.visible = true;
        return sprite;
    }

    update(engine: FogEngine): void {
        const app = engine.app;
        const user = engine.user;
        const map = engine.mapContainer;

        if (!app || !user?.pos || !map) return;

        const teamColor = user.color;

        if (!teamColor || !MOBA_TEAM_COLORS.includes(teamColor)) {
            if (this.active) {
                this.active = false;
                this.sprite.visible = false;
            }
            return;
        }

        this.active = true;
        this.sprite.visible = true;
        this.resize(app.screen.width, app.screen.height);

        let used = 0;
        const place = (x: number, y: number, radiusTiles: number) => {
            const sprite = this.light(used++);
            const diameter = (radiusTiles + LIGHT_FEATHER) * 2 * TILE_SIZE;
            sprite.width = diameter;
            sprite.height = diameter;
            sprite.x = x;
            sprite.y = y;
        };

        // El heroe local siempre esta en el centro de la pantalla.
        place(app.screen.width / 2, app.screen.height / 2, HERO_RADIUS);

        const step = (FOLLOW_SPEED * TILE_SIZE * Math.min(engine.delta, 100)) / 1000;
        const seen = new Set<number>();

        for (const [key, entity] of Object.entries(engine.personajes)) {
            if (!entity?.pos || entity === user || entity.color !== teamColor) continue;
            if (entity.dead || (entity.hp !== undefined && entity.hp <= 0)) continue;

            const id = Number(key);
            seen.add(id);

            const targetX = (entity.pos.x - 1) * TILE_SIZE + TILE_SIZE / 2;
            const targetY = (entity.pos.y - 1) * TILE_SIZE + TILE_SIZE / 2;
            let current = this.smoothed.get(id);

            if (!current || Math.abs(current.x - targetX) + Math.abs(current.y - targetY) > TILE_SIZE * 12) {
                current = { x: targetX, y: targetY };
                this.smoothed.set(id, current);
            } else {
                const dx = targetX - current.x;
                const dy = targetY - current.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= step) {
                    current.x = targetX;
                    current.y = targetY;
                } else if (dist > 0) {
                    current.x += (dx / dist) * step;
                    current.y += (dy / dist) * step;
                }
            }

            place(map.x + current.x, map.y + current.y, radiusFor(entity));
        }

        for (const id of this.smoothed.keys()) {
            if (!seen.has(id)) this.smoothed.delete(id);
        }

        for (let i = used; i < this.lights.length; i++) {
            this.lights[i].visible = false;
        }

        app.renderer.render({ container: this.scene, target: this.rt, clear: true });
    }

    destroy(): void {
        this.sprite.destroy();
        this.scene.destroy({ children: true });
        this.rt.destroy(true);
    }
}
