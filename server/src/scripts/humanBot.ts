/**
 * Bot que juega como un humano: ve solo lo que ve su equipo (/debug/view, con fog), camina con pasos de 200 ms por
 * un camino A* sobre el terreno, pega a mano (apunta y ataca), lanza hechizos, sube habilidades, compra items y
 * vuelve a la base cuando esta bajo de vida. Sirve para probar partidas 3v3 completas.
 */
import fs from "fs";
import path from "path";
import { Bot, DIR, debugMatches, debugState, sleep } from "./botClient";

type Pt = { x: number; y: number };
type Ent = {
    id: number;
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    team: string | null;
    isNpc: boolean;
    kind: string | null;
    structure: string | null;
    lane: string | null;
    tier: number | null;
    invulnerable: boolean;
    dead: boolean;
};
type View = {
    me: {
        id: number;
        x: number;
        y: number;
        hp: number;
        maxHp: number;
        mana: number;
        maxMana: number;
        gold: number;
        level: number;
        dead: boolean;
        team: string;
        points: number;
        recalling: boolean;
        skills: Array<{ slot: number; rank: number; ult: boolean; canLevel: boolean; spell: number }>;
        inv: Array<{ slot: number; item: number; qty: number; equipped: boolean }>;
    };
    entities: Ent[];
};

const HOST = "http://127.0.0.1:7666";
const STEP_MS = 205;
const MELEE_MS = 1050;
const SPELL_MS = 1100;
const CASTER_TEMPLATES = new Set([0, 1, 3, 4, 5, 6]);
const RANGED_BOW = 7;

let walkable: boolean[][] | null = null;
let moba: { lanes: Record<string, Pt[]>; spawn: { blue: Pt; red: Pt } } | null = null;

async function loadWorld() {
    if (!walkable) {
        const res = await fetch(`${HOST}/debug/walkable`);
        const { rows } = (await res.json()) as { rows: string[] };
        walkable = rows.map((row) => Array.from(row).map((c) => c === "."));
    }

    if (!moba) {
        moba = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../mapas_source/mapa_600/moba.json"), "utf8"));
    }
}

const free = (x: number, y: number) => y >= 1 && y <= 255 && x >= 1 && x <= 255 && walkable![y - 1][x - 1];
const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const DIRS: Array<[number, number, number]> = [
    [0, -1, DIR.up],
    [0, 1, DIR.down],
    [1, 0, DIR.right],
    [-1, 0, DIR.left],
];

/** BFS desde el origen hasta estar a `reach` tiles del destino; devuelve el primer paso (direccion) o null. */
function firstStep(from: Pt, goal: Pt, reach: number, blocked: Set<number>): { dir: number; remaining: number } | null {
    if (dist(from, goal) <= reach) return { dir: 0, remaining: 0 };

    const key = (x: number, y: number) => y * 256 + x;
    const seen = new Map<number, number>(); // tile -> direccion del primer paso
    const queue: Array<[number, number, number]> = [];

    for (const [dx, dy, dir] of DIRS) {
        const nx = from.x + dx;
        const ny = from.y + dy;

        if (free(nx, ny) && !blocked.has(key(nx, ny))) {
            seen.set(key(nx, ny), dir);
            queue.push([nx, ny, dir]);
        }
    }

    // El orden de la cola da el camino mas corto; se corta al llegar a distancia `reach`.
    let head = 0;
    let best: { dir: number; remaining: number } | null = null;
    let bestGap = Infinity;
    let expanded = 0;

    while (head < queue.length && expanded < 70000) {
        const [x, y, dir] = queue[head++];
        expanded++;
        const gap = dist({ x, y }, goal);

        if (gap <= reach) return { dir, remaining: head };

        if (gap < bestGap) {
            bestGap = gap;
            best = { dir, remaining: head };
        }

        for (const [dx, dy] of DIRS) {
            const nx = x + dx;
            const ny = y + dy;
            const k = key(nx, ny);

            if (!seen.has(k) && free(nx, ny) && !blocked.has(k)) {
                seen.set(k, dir);
                queue.push([nx, ny, dir]);
            }
        }
    }

    return best;
}

/** Distancia recorrida a lo largo de la polilinea por el punto de ella mas cercano a pt. */
function progress(path: Pt[], pt: Pt): number {
    let walked = 0;
    let best = Infinity;
    let bestAt = 0;

    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / (len * len)));
        const gap = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));

        if (gap < best) {
            best = gap;
            bestAt = walked + t * len;
        }

        walked += len;
    }

    return bestAt;
}

/** Punto a una fraccion de la longitud (en tiles) de la polilinea. */
function pointAt(path: Pt[], frac: number): Pt {
    const lengths = path.slice(1).map((p, i) => dist(path[i], p));
    const total = lengths.reduce((a, b) => a + b, 0);
    let left = total * frac;

    for (let i = 0; i < lengths.length; i++) {
        if (left <= lengths[i]) {
            const t = lengths[i] === 0 ? 0 : left / lengths[i];
            return { x: Math.round(path[i].x + (path[i + 1].x - path[i].x) * t), y: Math.round(path[i].y + (path[i + 1].y - path[i].y) * t) };
        }

        left -= lengths[i];
    }

    return path[path.length - 1];
}

export type BotStats = {
    name: string;
    team: string;
    lane: string;
    kills: number;
    towerHits: number;
    spells: number;
    melee: number;
    recalls: number;
    purchases: number;
    stuckTicks: number;
    maxLevel: number;
    gold: number;
    deaths: number;
};

export class HumanBot {
    bot: Bot;
    id = 0;
    stats: BotStats;
    private running = false;
    private lastStep = 0;
    private lastMelee = 0;
    private lastSpell = 0;
    private lastPos: Pt = { x: 0, y: 0 };
    private samePos = 0;
    private wasDead = false;
    private lastShop = 0;
    private laneIndex = 0;
    private recallAt = 0;
    decision = "";

    constructor(
        public name: string,
        public templateId: number,
        public team: "blue" | "red",
        public lane: string,
        public matchId: string,
        private race = 1,
    ) {
        this.bot = new Bot({ name, templateId, matchId, team, race });
        this.stats = {
            name,
            team,
            lane,
            kills: 0,
            towerHits: 0,
            spells: 0,
            melee: 0,
            recalls: 0,
            purchases: 0,
            stuckTicks: 0,
            maxLevel: 1,
            gold: 0,
            deaths: 0,
        };
    }

    async start() {
        await loadWorld();
        await this.bot.connect();
        const mapId = (await debugMatches()).find((m) => m.id === this.matchId)!.mapId as number;
        const me = (await debugState(mapId)).players.find((p) => p.name === this.name)!;
        this.id = me.id as number;
        this.running = true;
        void this.loop();
    }

    stop() {
        this.running = false;
        this.bot.close();
    }

    private async view(): Promise<View | null> {
        try {
            const res = await fetch(`${HOST}/debug/view?viewer=${this.id}`);
            return res.ok ? ((await res.json()) as View) : null;
        } catch {
            return null;
        }
    }

    /** Carril en el sentido en que avanza este equipo (el json esta escrito de azul a rojo). */
    private path(): Pt[] {
        const lane = moba!.lanes[this.lane];
        return this.team === "blue" ? lane : [...lane].reverse();
    }

    private async loop() {
        while (this.running) {
            const started = Date.now();

            try {
                const v = await this.view();

                if (v) await this.think(v);
            } catch (err) {
                console.error(`[${this.name}]`, (err as Error).message);
            }

            await sleep(Math.max(20, 100 - (Date.now() - started)));
        }
    }

    private async think(v: View) {
        const me = v.me;
        const now = Date.now();
        const myPos = { x: me.x, y: me.y };

        this.stats.maxLevel = Math.max(this.stats.maxLevel, me.level);
        this.stats.gold = me.gold;

        this.decision = "";

        if (me.dead) {
            if (!this.wasDead) this.stats.deaths++;
            this.wasDead = true;
            return;
        }

        this.wasDead = false;

        // Detector de atasco: mismo tile durante mucho tiempo sin pelear ni estar en la base.
        if (myPos.x === this.lastPos.x && myPos.y === this.lastPos.y) this.samePos++;
        else this.samePos = 0;

        this.lastPos = myPos;

        // --- 1. Habilidades ---------------------------------------------------------------
        if (me.points > 0) {
            const pick = me.skills.find((s) => s.ult && s.canLevel) ?? me.skills.find((s) => s.canLevel);

            if (pick) this.bot.skill(pick.slot);
        }

        const enemies = v.entities.filter(
            (e) => e.team && e.team !== this.team && !e.dead && !e.invulnerable && e.structure !== "dummy" && e.structure !== "shop" && e.structure !== "barracks",
        );
        const allies = v.entities.filter((e) => e.team === this.team && !e.dead);
        const spawn = moba!.spawn[this.team];
        const hpFrac = me.hp / me.maxHp;
        const nearestEnemyHero = enemies
            .filter((e) => !e.isNpc)
            .sort((a, b) => dist(a, myPos) - dist(b, myPos))[0];

        // --- 2. En la base: comprar y curarse ----------------------------------------------------------
        const atBase = dist(myPos, spawn) <= 14;

        if (atBase) {
            if (me.gold >= 250 && now - this.lastShop > 6000) {
                const shopPos = v.entities.find((e) => e.structure === "shop" && e.team === this.team);

                // Hay que estar al lado del mercader.
                if (shopPos && dist(shopPos, myPos) > 2) {
                    this.walk(myPos, shopPos, 1, v);
                    return;
                }

                this.lastShop = now;
                await this.shop(v);
            }

            if (hpFrac < 0.9 || me.mana < me.maxMana * 0.7) {
                if (dist(myPos, spawn) > 3) this.walk(myPos, spawn, 2, v);

                this.decision = "heal";
                return; // la fuente cura
            }
        }

        // --- 3. Retirada ----------------------------------------------------------------
        const lowHp = hpFrac < 0.32;
        const inDanger = enemies.some((e) => dist(e, myPos) <= 8);

        if (lowHp || (me.gold >= 1500 && !inDanger && !atBase && hpFrac < 0.7)) {
            if (!inDanger && !me.recalling && now - this.recallAt > 15000) {
                this.recallAt = now;
                this.stats.recalls++;
                this.bot.say("/recall");
            }

            this.decision = "retreat";

            if (!me.recalling) this.walk(myPos, spawn, 1, v);

            return;
        }

        // --- 3b. No meterse bajo una torre enemiga sin minions aliados cerca ---------------------------
        const dangerousTower = v.entities.find(
            (e) => e.structure === "tower" && e.team !== this.team && !e.dead && dist(e, myPos) <= 9,
        );

        if (dangerousTower && allies.filter((a) => a.isNpc && dist(a, dangerousTower) <= 7).length < 2) {
            this.decision = "avoid-tower";
            this.walk(myPos, pointAt(this.path(), 0.4), 2, v);
            return;
        }

        // --- 4. Combate ----------------------------------------------------------------
        const target = this.pickTarget(myPos, enemies, allies);

        if (target) {
            this.decision = `fight ${target.name}`;
            await this.fight(v, myPos, target);
            return;
        }

        // --- 5. Avanzar por el carril ----------------------------------------------------------
        if (me.recalling) {
            this.decision = "recall";
            return;
        }

        this.decision = "advance";
        this.advance(v, myPos, allies);
    }

    private pickTarget(myPos: Pt, enemies: Ent[], allies: Ent[]): Ent | null {
        const reach = 7;
        const near = enemies.filter((e) => dist(e, myPos) <= reach + 3);

        if (near.length === 0) return null;

        // Torres solo con minions aliados cerca (si no, la torre se concentra en el heroe).
        const supported = (tower: Ent) => allies.filter((a) => a.isNpc && dist(a, tower) <= 7).length >= 2;
        const candidates = near.filter((e) => e.structure !== "tower" || supported(e));

        if (candidates.length === 0) return null;

        const hero = candidates.filter((e) => !e.isNpc).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

        if (hero && dist(hero, myPos) <= reach) return hero;

        // Si no, el que tenga menos vida (last-hit) entre los mas cercanos.
        return candidates.sort((a, b) => dist(a, myPos) - dist(b, myPos) || a.hp - b.hp)[0];
    }

    private async fight(v: View, myPos: Pt, target: Ent) {
        const now = Date.now();
        const d = dist(target, myPos);
        const aligned = target.x === myPos.x || target.y === myPos.y;
        const ranged = this.templateId === RANGED_BOW;
        const caster = CASTER_TEMPLATES.has(this.templateId);

        // Hechizos primero (el mago y los clerigos castean casi siempre).
        if (caster && d <= 7 && now - this.lastSpell > SPELL_MS && v.me.mana > 30) {
            const castable = v.me.skills.filter((s) => s.rank > 0);

            if (castable.length) {
                const pick = castable[Math.floor(Math.random() * castable.length)];
                this.bot.spell(pick.slot, target.x, target.y);
                this.lastSpell = now;
                this.stats.spells++;
            }
        }

        if (ranged && d <= 7 && now - this.lastMelee > MELEE_MS) {
            this.bot.range(target.x, target.y);
            this.lastMelee = now;
            this.stats.melee++;
            if (target.structure === "tower") this.stats.towerHits++;
            return;
        }

        if (d === 1) {
            // Orientarse hacia el objetivo y pegar.
            const dir = target.x > myPos.x ? DIR.right : target.x < myPos.x ? DIR.left : target.y > myPos.y ? DIR.down : DIR.up;

            if (now - this.lastMelee > MELEE_MS) {
                this.bot.heading(dir);
                this.bot.melee();
                this.lastMelee = now;
                this.stats.melee++;
                if (target.structure === "tower") this.stats.towerHits++;
            }

            return;
        }

        if (ranged && d <= 7 && aligned) return;

        // Acercarse a 1 tile (casters y arqueros se quedan a distancia).
        const stop = ranged ? 5 : caster ? 4 : 1;

        if (d > stop) this.walk(myPos, target, stop, v);
    }

    private advance(v: View, myPos: Pt, allies: Ent[]) {
        const path = this.path();

        // Punto del carril mas cercano al heroe, y la cabeza de la oleada aliada (minion mas avanzado).
        let myIndex = 0;
        let bestGap = Infinity;

        path.forEach((p, i) => {
            const gap = dist(p, myPos);

            if (gap < bestGap) {
                bestGap = gap;
                myIndex = i;
            }
        });

        const indexOf = (pt: Pt) => progress(path, pt);
        const lane = allies.filter((a) => a.isNpc && a.kind && a.lane === this.lane);
        const front = lane.length ? lane.reduce((best, a) => (indexOf(a) > indexOf(best) ? a : best)) : null;
        let goal: Pt;

        if (front) {
            // Acompanar a los minions sin pasarlos.
            goal = { x: front.x, y: front.y };
        } else {
            // Sin minions a la vista: esperar al lado de la torre exterior propia de este carril.
            // Un humano sabe donde se cruzan las oleadas: el punto medio del carril, un poco antes.
            goal = pointAt(path, 0.5 - 0.05);
            this.laneIndex = myIndex;
        }

        this.walk(myPos, goal, front ? 2 : 2, v);
    }

    private walk(myPos: Pt, goal: Pt, reach: number, v: View) {
        const now = Date.now();

        if (now - this.lastStep < STEP_MS) return;

        // Tiles ocupados por otras entidades a la vista.
        const blocked = new Set<number>(v.entities.filter((e) => !e.dead).map((e) => e.y * 256 + e.x));
        let step = firstStep(myPos, goal, reach, blocked);

        if (!step) step = firstStep(myPos, goal, reach, new Set());

        if (!step || step.dir === 0) return;

        this.lastStep = now;
        this.bot.step(step.dir);

        if (this.samePos > 25) this.stats.stuckTicks++;
    }

    private async shop(v: View) {
        const res = await fetch(`${HOST}/debug/shop?viewer=${this.id}`);

        if (!res.ok) return;

        const { shop, items } = (await res.json()) as {
            shop: Pt;
            items: Array<{ index: number; id: number; name: string; price: number }>;
        };

        if (dist(shop, { x: v.me.x, y: v.me.y }) > 6) return;

        this.bot.click(shop.x, shop.y, 0);
        await sleep(250);

        let gold = v.me.gold;
        const owned = new Set(v.me.inv.map((i) => i.item));
        const wanted = items.filter((it) => !owned.has(it.id) && it.price <= gold).sort((a, b) => b.price - a.price);

        for (const it of wanted.slice(0, 3)) {
            if (it.price > gold) continue;

            this.bot.buy(it.index, 1);
            gold -= it.price;
            await sleep(300);
        }

        // Equipar lo nuevo.
        await sleep(300);
        const after = await this.view();

        if (after) this.stats.purchases += after.me.inv.filter((i) => !owned.has(i.item)).length;

        for (const it of after?.me.inv ?? []) {
            if (!it.equipped) {
                this.bot.equip(it.slot);
                await sleep(120);
            }
        }
    }
}
