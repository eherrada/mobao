export {};
/**
 * API HTTP de depuracion para tests automaticos del MOBA.
 * Solo existe con NODE_ENV=development y solo responde a conexiones locales.
 *
 *   GET  /debug/state?map=600       -> jugadores y NPCs del mapa
 *   POST /debug/npc-hp?id=..&hp=..  -> fija la vida de un NPC (para probar destruccion)
 */
const vars = require("../vars");

function isLocal(request: any): boolean {
    const ip = String(request.socket?.remoteAddress ?? "");
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function json(response: any, status: number, body: unknown) {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
}

function snapshotEntity(entity: any) {
    return {
        id: entity.id,
        name: entity.nameCharacter,
        isNpc: Boolean(entity.isNpc),
        map: entity.map,
        x: entity.pos?.x,
        y: entity.pos?.y,
        hp: entity.hp,
        maxHp: entity.maxHp,
        team: entity.team ?? entity.mobaTeam ?? null,
        structure: entity.structure ?? null,
        lane: entity.lane ?? null,
        kind: entity.minionKind || null,
        tier: entity.tier ?? null,
        invulnerable: Boolean(entity.invulnerable),
        str: entity.attrFuerza ?? null,
        weapon: entity.idItemWeapon ?? null,
        inv: entity.inv
            ? Object.entries(entity.inv).map(([slot, it]: [string, any]) => [Number(slot), it.idItem, it.cant, it.equipped])
            : null,
        level: entity.mobaLevel ?? null,
        aoLevel: entity.level ?? null,
        xp: entity.mobaXp ?? null,
        xpNext: entity.expNextLevel ?? null,
        gold: entity.gold ?? null,
        mana: entity.mana ?? null,
        points: entity.mobaSkillPoints ?? null,
        ranks: entity.mobaRanks ?? null,
        race: entity.idRaza ?? null,
        head: entity.idHead ?? null,
        body: entity.idBody ?? null,
        maxMana: entity.maxMana ?? null,
        armorItem: entity.idItemBody ? (entity.inv?.[entity.idItemBody]?.idItem ?? null) : null,
        campIndex: entity.campIndex ?? null,
        buffId: entity.buffId || null,
        buffs: entity.mobaBuffs ? Object.keys(entity.mobaBuffs).filter((k) => entity.mobaBuffs[k].until > Date.now()) : null,
        physMult: entity.mobaPhysMult ?? null,
        spellMult: entity.mobaSpellMult ?? null,
        campSlot: entity.campSlot ?? null,
        matchId: entity.mobaMatchId ?? null,
        respawnAt: entity.mobaRespawnAt ?? 0,
        npcTemplate: entity.templateNpcIndex ?? null,
        dead: Boolean(entity.dead),
    };
}

/** Devuelve true si la peticion fue atendida. */
function handleDebugRequest(request: any, response: any): boolean {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (!url.pathname.startsWith("/debug/")) {
        return false;
    }

    if (process.env.NODE_ENV !== "development" || !isLocal(request)) {
        json(response, 404, { error: "Not found" });
        return true;
    }

    if (url.pathname === "/debug/state") {
        const map = Number(url.searchParams.get("map") ?? 0);
        const players = Object.values(vars.personajes)
            .filter((entity: any) => entity && !entity.cerrado && (!map || entity.map === map))
            .map(snapshotEntity);
        const npcs = Object.values(vars.npcs)
            .filter((entity: any) => entity && (!map || entity.map === map))
            .map(snapshotEntity);
        json(response, 200, { players, npcs });
        return true;
    }

    // Entidades de la partida que el espectador NO puede ver ahora mismo (verdad del servidor).
    if (url.pathname === "/debug/fog") {
        const fog = require("./fog");
        const viewerId = String(url.searchParams.get("viewer"));
        const viewer = vars.personajes[viewerId];
        const hidden: number[] = [];

        if (viewer?.mobaMatchId) {
            for (const entity of [...Object.values(vars.personajes), ...Object.values(vars.npcs)] as any[]) {
                if (entity && entity.mobaMatchId === viewer.mobaMatchId && fog.isHiddenEntityFor(viewerId, entity)) {
                    hidden.push(entity.id);
                }
            }
        }

        json(response, 200, { hidden });
        return true;
    }

    if (url.pathname === "/debug/perf") {
        const match = require("./match");
        const report = match.perfReport();
        if (url.searchParams.get("reset")) match.resetPerf();
        json(response, 200, report);
        return true;
    }

    // Lee o ajusta en vivo los multiplicadores de balance (solo desarrollo; los usa tuneBalance.ts).
    if (url.pathname === "/debug/balance") {
        const stats = require("./heroes").STATS;
        const hero = url.searchParams.get("hero");

        if (hero !== null && request.method === "POST" && stats[hero]) {
            for (const key of ["hp", "phys", "spell"]) {
                const value = Number(url.searchParams.get(key));
                if (Number.isFinite(value) && value > 0) stats[hero][key] = value;
            }
        }

        json(response, 200, stats);
        return true;
    }

    // Escalera de equipo de una clase/raza con nombres y precios (para revisar el balance de la tienda).
    if (url.pathname === "/debug/gear") {
        const gear = require("./gear");
        const classId = Number(url.searchParams.get("class") ?? 3);
        const race = Number(url.searchParams.get("race") ?? 1);
        const ladder = gear.ladderFor(classId, race);
        const describe = (id: number) => {
            const o = vars.datObj[id];
            return o ? { id, name: o.name, price: o.valor, hit: `${o.minHit}-${o.maxHit}`, def: `${o.minDef}-${o.maxDef}` } : null;
        };
        const out: Record<string, unknown> = {};
        for (const slot of Object.keys(ladder)) out[slot] = ladder[slot].map(describe);
        json(response, 200, out);
        return true;
    }

    // Da oro a un heroe (para tests de la tienda).
    if (url.pathname === "/debug/gold" && request.method === "POST") {
        const hero = vars.personajes[String(url.searchParams.get("id"))];

        if (!hero) {
            json(response, 404, { error: "hero not found" });
            return true;
        }

        require("./progression").grantGold(hero, Number(url.searchParams.get("amount") ?? 0));
        json(response, 200, snapshotEntity(hero));
        return true;
    }

    // Lo que la tienda le ofrece a un heroe: [indice, id, nombre, precio].
    if (url.pathname === "/debug/shop") {
        const hero = vars.personajes[String(url.searchParams.get("viewer"))];
        const shop = (Object.values(vars.npcs) as any[]).find(
            (n) => n && n.structure === "shop" && n.mobaMatchId === hero?.mobaMatchId && n.team === hero?.mobaTeam,
        );

        if (!hero || !shop) {
            json(response, 404, { error: "no shop" });
            return true;
        }

        const offered = require("./gear").offeredTo(hero);
        const items = (shop.objs as Array<{ item: number }>)
            .map((entry, index) => ({ index, id: entry.item, name: vars.datObj[entry.item]?.name, price: vars.datObj[entry.item]?.valor }))
            .filter((entry) => offered.has(entry.id));
        json(response, 200, { shop: { id: shop.id, x: shop.pos.x, y: shop.pos.y }, items });
        return true;
    }

    // Mapa de tiles caminables (solo terreno) como filas de '.' (libre) y '#' (bloqueado).
    if (url.pathname === "/debug/walkable") {
        const game = require("../game");
        const rows: string[] = [];

        for (let y = 1; y <= 255; y++) {
            let row = "";

            for (let x = 1; x <= 255; x++) {
                row += game.legalPos(x, y, 600, false) ? "." : "#";
            }

            rows.push(row);
        }

        json(response, 200, { rows });
        return true;
    }

    // Vista de un heroe: su estado y las entidades que su equipo puede ver (fog incluido).
    if (url.pathname === "/debug/view") {
        const fog = require("./fog");
        const skills = require("./skills");
        const progression = require("./progression");
        const viewerId = String(url.searchParams.get("viewer"));
        const me = vars.personajes[viewerId];

        if (!me?.mobaMatchId) {
            json(response, 404, { error: "viewer not in a match" });
            return true;
        }

        const near = (e: any) => Math.abs(e.pos.x - me.pos.x) + Math.abs(e.pos.y - me.pos.y) <= 16;
        const visible = (e: any) => {
            if (!e || e.mobaMatchId !== me.mobaMatchId || e.cerrado || e.id === me.id) return false;
            if (fog.isHiddenEntityFor(viewerId, e)) return false;
            // Lo neutral (jungla) solo se ve si esta dentro de la vision del equipo.
            if (!e.mobaTeam && !e.team) return fog.isVisibleToTeam(me.mobaMatchId, me.mobaTeam, e.pos);
            return true;
        };
        const view = (e: any) => ({
            id: e.id,
            name: e.nameCharacter,
            x: e.pos.x,
            y: e.pos.y,
            hp: e.hp,
            maxHp: e.maxHp,
            team: e.team ?? e.mobaTeam ?? null,
            isNpc: Boolean(e.isNpc),
            kind: e.minionKind || e.structure || null,
            structure: e.structure ?? null,
            lane: e.lane ?? null,
            tier: e.tier ?? null,
            invulnerable: Boolean(e.invulnerable),
            dead: Boolean(e.dead),
            level: e.mobaLevel ?? null,
            buff: e.buffId ?? null,
        });
        const entities = ([...Object.values(vars.personajes), ...Object.values(vars.npcs)] as any[]).filter(
            (e) => visible(e) && (near(e) || (e.team ?? e.mobaTeam) === me.mobaTeam || e.structure === "tower" || e.structure === "nexus" || e.structure === "shop" || e.structure === "barracks"),
        );

        json(response, 200, {
            me: {
                id: me.id,
                name: me.nameCharacter,
                x: me.pos.x,
                y: me.pos.y,
                heading: me.heading,
                hp: me.hp,
                maxHp: me.maxHp,
                mana: me.mana,
                maxMana: me.maxMana,
                gold: me.gold,
                level: me.mobaLevel,
                xp: me.mobaXp,
                xpNext: progression.xpToNext(me.mobaLevel ?? 1),
                dead: Boolean(me.dead),
                team: me.mobaTeam,
                classId: me.idClase,
                templateId: me.mobaTemplateId,
                raceId: me.idRaza,
                points: skills.availablePoints(me),
                skills: skills.describe(me),
                inv: Object.entries(me.inv ?? {}).map(([slot, it]: [string, any]) => ({ slot: Number(slot), item: it.idItem, qty: it.cant, equipped: Boolean(it.equipped) })),
                recalling: Boolean(me.mobaRecall),
            },
            entities: entities.map(view),
            match: require("./match").describe().find((m: any) => m.id === me.mobaMatchId) ?? null,
        });
        return true;
    }

    if (url.pathname === "/debug/matches") {
        json(response, 200, require("./match").describe());
        return true;
    }

    if (url.pathname === "/debug/npc-hp" && request.method === "POST") {
        const npc = vars.npcs[String(url.searchParams.get("id"))];

        if (!npc) {
            json(response, 404, { error: "npc not found" });
            return true;
        }

        npc.hp = Number(url.searchParams.get("hp") ?? npc.hp);
        json(response, 200, snapshotEntity(npc));
        return true;
    }

    // Da experiencia o fija el nivel de un heroe (para tests).
    if (url.pathname === "/debug/xp" && request.method === "POST") {
        const hero = vars.personajes[String(url.searchParams.get("id"))];

        if (!hero) {
            json(response, 404, { error: "hero not found" });
            return true;
        }

        const progression = require("./progression");
        const level = url.searchParams.get("level");

        if (level) progression.setLevel(hero, Number(level));
        const amount = Number(url.searchParams.get("amount") ?? 0);
        if (amount > 0) progression.grantXp(hero, amount);

        json(response, 200, snapshotEntity(hero));
        return true;
    }

    if (url.pathname === "/debug/hero-hp" && request.method === "POST") {
        const hero = vars.personajes[String(url.searchParams.get("id"))];

        if (!hero) {
            json(response, 404, { error: "hero not found" });
            return true;
        }

        hero.hp = Number(url.searchParams.get("hp") ?? hero.hp);
        json(response, 200, snapshotEntity(hero));
        return true;
    }

    // Destruye un NPC por el mismo camino que una muerte real (hp 0 + muereNpc).
    if (url.pathname === "/debug/destroy" && request.method === "POST") {
        const npc = vars.npcs[String(url.searchParams.get("id"))];

        if (!npc) {
            json(response, 404, { error: "npc not found" });
            return true;
        }

        npc.hp = 0;
        npc.deathProcessed = true;
        require("../npcs").muereNpc(npc.id);
        json(response, 200, { destroyed: true });
        return true;
    }

    json(response, 404, { error: "unknown debug route" });
    return true;
}

module.exports = { handleDebugRequest };
