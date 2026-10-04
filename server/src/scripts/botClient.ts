/**
 * Cliente bot minimo para tests automaticos (no renderiza nada).
 * Se conecta como bot de plantilla (typeGame=3), igual que login.ts espera.
 */
import WebSocket from "ws";

export const PACKET = {
    changeHeading: 175,
    position: 176,
    connectCharacter: 212,
    attackMele: 229,
    attackSpell: 243,
    attackRange: 236,
} as const;

export const DIR = { up: 1, down: 2, right: 3, left: 4 } as const;

class Writer {
    private bytes: number[] = [];

    constructor(id: number) {
        this.byte(id);
    }

    byte(v: number) {
        this.bytes.push(v & 0xff);
        return this;
    }

    int(v: number) {
        this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
        return this;
    }

    string(v: string) {
        const encoded = Buffer.from(v, "utf8");
        this.bytes.push(Array.from(v).length & 0xff, (Array.from(v).length >> 8) & 0xff);
        for (const b of encoded) this.bytes.push(b);
        return this;
    }

    buffer() {
        return Buffer.from(this.bytes);
    }
}

export type BotOptions = {
    url?: string;
    secret?: string;
    name: string;
    templateId: number;
    mapId?: number;
    x?: number;
    y?: number;
    matchId?: string;
    team?: "blue" | "red";
    race?: number;
    exactMana?: boolean;
    level?: number;
    autoSkills?: boolean;
    gearTier?: number;
};

export class Bot {
    private ws!: WebSocket;
    private moveId = 1;
    packets = 0;
    private frames: Buffer[] = [];

    constructor(private opts: BotOptions) {}

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.opts.url ?? "ws://127.0.0.1:7666");
            this.ws.binaryType = "nodebuffer";
            this.ws.on("message", (data: Buffer) => {
                this.packets++;
                this.frames.push(Buffer.from(data));
            });
            this.ws.on("error", reject);
            this.ws.on("open", () => {
                const ticket = JSON.stringify({
                    kind: "loadbot",
                    secret: this.opts.secret ?? "changeme",
                    name: this.opts.name,
                    templateId: this.opts.templateId,
                    mapId: this.opts.mapId,
                    x: this.opts.x,
                    y: this.opts.y,
                    matchId: this.opts.matchId,
                    team: this.opts.team,
                    race: this.opts.race,
                    exactMana: this.opts.exactMana,
                    level: this.opts.level,
                    autoSkills: this.opts.autoSkills,
                    gearTier: this.opts.gearTier,
                });
                this.send(new Writer(PACKET.connectCharacter).string(ticket).byte(3).byte(this.opts.templateId).buffer());
                setTimeout(resolve, 800);
            });
        });
    }

    private send(buf: Buffer) {
        this.ws.send(buf);
    }

    heading(dir: number) {
        this.send(new Writer(PACKET.changeHeading).byte(dir).buffer());
    }

    step(dir: number) {
        this.send(new Writer(PACKET.position).byte(dir).int(this.moveId++).buffer());
    }

    melee() {
        this.send(new Writer(PACKET.attackMele).buffer());
    }

    /** Chat / comandos (ej. "/recall"). */
    say(text: string) {
        this.send(new Writer(221).string(text).buffer());
    }

    /** Gasta un punto de habilidad en el hechizo del slot (paquete mobaSkill). */
    skill(slot: number) {
        this.send(new Writer(250).byte(slot).buffer());
    }

    /** Click en un tile (abre el comercio de un NPC). */
    click(x: number, y: number, button = 0) {
        this.send(new Writer(183).byte(x).byte(y).byte(button).buffer());
    }

    /** Compra en el comercio abierto: indice del objeto y cantidad. */
    buy(index: number, amount = 1) {
        const w = new Writer(214).byte(index);
        w.byte(amount & 0xff).byte((amount >> 8) & 0xff);
        this.send(w.buffer());
    }

    /** Equipa el objeto del slot de inventario. */
    equip(slot: number) {
        this.send(new Writer(210).int(slot).buffer());
    }

    range(x: number, y: number) {
        this.send(new Writer(PACKET.attackRange).byte(x).byte(y).buffer());
    }

    spell(slot: number, x: number, y: number) {
        this.send(new Writer(PACKET.attackSpell).byte(slot).byte(x).byte(y).byte(0).buffer());
    }

    /** True si algun paquete recibido contiene el id de la entidad (los ids viajan como double LE de 8 bytes). */
    sawEntity(id: number): boolean {
        const needle = Buffer.alloc(8);
        needle.writeDoubleLE(id);
        return this.frames.some((frame) => frame.indexOf(needle) >= 0);
    }

    clearFrames() {
        this.frames = [];
    }

    close() {
        this.ws.close();
    }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function debugState(map = 600) {
    const res = await fetch(`http://127.0.0.1:7666/debug/state?map=${map}`);
    return (await res.json()) as {
        players: Array<Record<string, any>>;
        npcs: Array<Record<string, any>>;
    };
}

export async function debugPost(path: string) {
    const res = await fetch(`http://127.0.0.1:7666${path}`, { method: "POST" });
    return res.json();
}

export async function debugMatches() {
    const res = await fetch("http://127.0.0.1:7666/debug/matches");
    return (await res.json()) as Array<Record<string, any>>;
}
