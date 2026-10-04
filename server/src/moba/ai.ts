export {};
const vars = require("../vars");
const game = require("../game");
const npcs = require("../npcs");
const funct = require("../functions");
const teams = require("./teams");

type Pt = { x: number; y: number };

const manhattan = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

type Target = {
    entity: any;
    isNpc: boolean;
    dist: number;
    score: number;
};

/** Heroes vivos de la partida (jugadores conectados con mobaMatchId). */
function aliveHeroes(matchId: string): any[] {
    const result: any[] = [];

    for (const id in vars.personajes) {
        const hero = vars.personajes[id];

        if (hero && hero.mobaMatchId === matchId && !hero.cerrado && !hero.dead && hero.hp > 0) {
            result.push(hero);
        }
    }

    return result;
}

/** Candidatos enemigos en rango, ordenados por prioridad (minions > heroes > estructuras). */
function findTargets(npc: any, matchNpcs: any[], heroes: any[], range: number): Target[] {
    const targets: Target[] = [];

    for (const other of matchNpcs) {
        if (other.id === npc.id || other.hp <= 0 || other.deathProcessed || other.invulnerable) continue;
        if (!teams.areEnemies(npc, other)) continue;
        const dist = manhattan(npc.pos, other.pos);
        if (dist > range) continue;
        const penalty = other.structure === "minion" ? 0 : 5;
        targets.push({ entity: other, isNpc: true, dist, score: dist + penalty });
    }

    for (const hero of heroes) {
        if (!teams.areEnemies(npc, hero)) continue;
        const dist = manhattan(npc.pos, hero.pos);
        if (dist > range) continue;
        targets.push({ entity: hero, isNpc: false, dist, score: dist + 2 });
    }

    return targets.sort((a, b) => a.score - b.score);
}

function setHeadingToward(npc: any, target: Pt) {
    const dx = target.x - npc.pos.x;
    const dy = target.y - npc.pos.y;
    npc.heading =
        Math.abs(dx) >= Math.abs(dy)
            ? dx > 0
                ? vars.direcciones.right
                : vars.direcciones.left
            : dy > 0
              ? vars.direcciones.down
              : vars.direcciones.up;
}

/** Un paso (4 direcciones) hacia la meta, rodeando obstaculos y evitando retroceder. */
function stepToward(npc: any, goal: Pt): boolean {
    const dx = goal.x - npc.pos.x;
    const dy = goal.y - npc.pos.y;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const primary: Array<[number, number]> = [];

    if (Math.abs(dx) >= Math.abs(dy)) {
        if (sx) primary.push([sx, 0]);
        if (sy) primary.push([0, sy]);
    } else {
        if (sy) primary.push([0, sy]);
        if (sx) primary.push([sx, 0]);
    }

    const side: Array<[number, number]> = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
    ]
        .filter(([ax, ay]) => !primary.some(([bx, by]) => bx === ax && by === ay))
        .sort(() => Math.random() - 0.5) as Array<[number, number]>;

    const last = npc.lastChasePos as Pt | undefined;
    const ordered = [...primary, ...side];
    const forward = ordered.filter(([ax, ay]) => !(last && npc.pos.x + ax === last.x && npc.pos.y + ay === last.y));
    const backward = ordered.filter((c) => !forward.includes(c));

    for (const [ax, ay] of [...forward, ...backward]) {
        const pos = { x: npc.pos.x + ax, y: npc.pos.y + ay };

        if (game.legalPosNpc(pos.x, pos.y, npc.map, false, false)) {
            npcs.moveNpcByPos(npc.id, pos);
            return npc.pos.x === pos.x && npc.pos.y === pos.y;
        }
    }

    return false;
}

function rollDamage(npc: any): number {
    return funct.randomIntFromInterval(Number(npc.minHit ?? 1), Math.max(Number(npc.minHit ?? 1), Number(npc.maxHit ?? 1)));
}

function strike(attacker: any, target: Target) {
    setHeadingToward(attacker, target.entity.pos);
    const damage = rollDamage(attacker);

    if (target.isNpc) {
        npcs.dealDamageToNpc(attacker, target.entity, damage);
    } else {
        npcs.dealDamageToUser(attacker, target.entity, damage, attacker.structure === "tower");
    }
}

function thinkMinion(npc: any, now: number, matchNpcs: any[], heroes: any[]) {
    if (npc.paralizado || npc.inmovilizado) return;

    if (now < npc.nextMoveAt) return;
    npc.nextMoveAt = now + npc.moveIntervalMs;

    const targets = findTargets(npc, matchNpcs, heroes, npc.aggroRange);
    const target = targets[0];

    if (target) {
        if (target.dist <= 1) {
            if (now >= npc.nextAttackAt) {
                npc.nextAttackAt = now + npc.attackIntervalMs;
                strike(npc, target);
            }
            return;
        }

        stepToward(npc, target.entity.pos);
        return;
    }

    const waypoints: Pt[] = npc.waypoints ?? [];
    const goal = waypoints[Math.min(npc.wpIndex, waypoints.length - 1)];

    if (!goal) return;

    if (manhattan(npc.pos, goal) <= 3 && npc.wpIndex < waypoints.length - 1) {
        npc.wpIndex++;
    }

    stepToward(npc, goal);
}

/** Monstruo neutral: ataca solo a quien lo golpeo, respeta la correa y vuelve a su campamento regenerandose. */
function thinkJungle(npc: any, now: number) {
    if (npc.paralizado || npc.inmovilizado) return;
    if (now < npc.nextMoveAt) return;
    npc.nextMoveAt = now + npc.moveIntervalMs;

    const home: Pt = npc.homePos;
    const aggressor = npc.lastAggressorId ? vars.personajes[npc.lastAggressorId] : undefined;
    const engaged =
        aggressor &&
        aggressor.mobaMatchId === npc.mobaMatchId &&
        !aggressor.dead &&
        !aggressor.cerrado &&
        aggressor.hp > 0 &&
        now - Number(npc.lastAggressedAt ?? 0) < 8000 &&
        manhattan(aggressor.pos, home) <= npc.leash;

    if (engaged) {
        if (manhattan(npc.pos, aggressor.pos) <= 1) {
            if (now >= npc.nextAttackAt) {
                npc.nextAttackAt = now + npc.attackIntervalMs;
                setHeadingToward(npc, aggressor.pos);
                npcs.dealDamageToUser(npc, aggressor, rollDamage(npc), false);
            }
        } else {
            stepToward(npc, aggressor.pos);
        }
        return;
    }

    // Sin objetivo: vuelve a casa y se regenera.
    npc.lastAggressorId = 0;

    if (manhattan(npc.pos, home) > 0) {
        stepToward(npc, home);
        return;
    }

    if (npc.hp < npc.maxHp) {
        npc.hp = Math.min(npc.maxHp, npc.hp + Math.ceil(npc.maxHp * 0.08));
        npcs.broadcastNpcVitals(npc);
    }
}

function thinkTower(npc: any, now: number, matchNpcs: any[], heroes: any[]) {
    if (now < npc.nextAttackAt) return;

    const targets = findTargets(npc, matchNpcs, heroes, npc.attackRange);
    const target = targets[0];

    if (!target) return;

    npc.nextAttackAt = now + npc.attackIntervalMs;
    setHeadingToward(npc, target.entity.pos);

    if (npc.projectileSpell > 0) {
        npcs.sendNpcProjectile(npc, target.entity, npc.projectileSpell);
    }

    strike(npc, target);
}

/** Un tick de IA para todos los NPCs de la partida. */
function thinkAll(matchId: string, now: number, matchNpcs: any[]) {
    const heroes = aliveHeroes(matchId);

    for (const npc of matchNpcs) {
        if (npc.hp <= 0 || npc.deathProcessed) continue;

        if (npc.structure === "minion") {
            thinkMinion(npc, now, matchNpcs, heroes);
        } else if (npc.structure === "tower") {
            thinkTower(npc, now, matchNpcs, heroes);
        } else if (npc.structure === "jungle") {
            thinkJungle(npc, now);
        }
    }
}

module.exports = { thinkAll, aliveHeroes };
