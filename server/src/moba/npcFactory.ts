export {};
const vars = require("../vars");
const login = require("../login");
const npcs = require("../npcs");
const handleProtocol = require("../handleProtocol");
const socket = require("../socket");
const teams = require("./teams");
const _ = require("lodash");

type SpawnOptions = {
    templateId: number;
    mapId: number;
    x: number;
    y: number;
    team?: "blue" | "red";
    matchId: string;
    campIndex?: number;
    campSlot?: number;
    lane?: string;
    tier?: number;
    waypoints?: Array<{ x: number; y: number }>;
};

/** Crea un NPC del MOBA a partir de su plantilla (DB) en una instancia de partida. Devuelve el NPC. */
function spawnMobaNpc(opts: SpawnOptions): any | null {
    const datNpc = vars.datNpc[opts.templateId];

    if (!datNpc || !vars.mapData[opts.mapId]) {
        return null;
    }

    const npc = _.cloneDeep(npcs.createNpc());

    npc.id = login.createId();
    npc.templateNpcIndex = opts.templateId;
    npc.map = opts.mapId;
    npc.pos.x = opts.x;
    npc.pos.y = opts.y;
    npc.nameCharacter = datNpc.name;
    npc.color = opts.team ? teams.teamColor(opts.team) : "#d9b86c";
    npc.isNpc = true;
    npc.idBody = datNpc.idBody;
    npc.idHead = datNpc.idHead;
    npc.movement = Number(datNpc.movement);
    npc.npcType = Number(datNpc.npcType);
    npc.exp = datNpc.exp ?? 0;
    npc.gold = datNpc.gold ?? 0;
    npc.hp = datNpc.hp;
    npc.maxHp = datNpc.maxHp;
    npc.minHit = datNpc.minHit ?? 0;
    npc.maxHit = datNpc.maxHit ?? 0;
    npc.def = datNpc.def ?? 0;
    npc.defM = datNpc.defM ?? datNpc.magicDef ?? 0;
    npc.magicDef = datNpc.magicDef ?? datNpc.defM ?? 0;
    npc.magicResistance = datNpc.magicResistance ?? 0;
    npc.poderAtaque = datNpc.poderAtaque ?? 0;
    npc.poderEvasion = datNpc.poderEvasion ?? 0;
    npc.aguaValida = datNpc.aguaValida ?? 0;
    npc.tierraInvalida = datNpc.tierraInvalida ?? 0;
    npc.desc = datNpc.desc ?? "";
    npc.drop = [];
    npc.cooldownAtaque = Date.now();

    // Campos del MOBA.
    npc.team = opts.team;
    npc.leash = Number(datNpc.leash ?? 12);
    npc.buff = Number(datNpc.buff ?? 0);
    npc.mobaMatchId = opts.matchId;
    npc.structure = String(datNpc.structure ?? "");
    npc.stationary = Number(datNpc.stationary ?? 0);
    npc.noRespawn = 1;
    npc.lane = opts.lane;
    npc.tier = opts.tier;
    npc.attackRange = Number(datNpc.attackRange ?? 1);
    npc.attackIntervalMs = Number(datNpc.attackIntervalMs ?? 1500);
    npc.moveIntervalMs = Number(datNpc.moveIntervalMs ?? 400);
    npc.aggroRange = Number(datNpc.aggroRange ?? 7);
    npc.projectileSpell = Number(datNpc.projectileSpell ?? 0);
    npc.nextAttackAt = 0;
    npc.nextMoveAt = 0;
    npc.waypoints = opts.waypoints;
    npc.campIndex = opts.campIndex;
    npc.campSlot = opts.campSlot;
    npc.homePos = { x: opts.x, y: opts.y };
    npc.wpIndex = 1;
    npc.invulnerable = Boolean(datNpc.invulnerable);
    npc.spawnedAt = Date.now();
    npc.objs = Array.isArray(datNpc.objs) ? datNpc.objs : [];

    vars.npcs[npc.id] = npc;
    vars.areaNpc[npc.id] = [];
    vars.mapData[opts.mapId][opts.y][opts.x].id = npc.id;

    // Avisar a los jugadores que ya estan en el area.
    npcs.loopArea(npc.id, (target: any) => {
        const client = vars.clients[target.id];

        if (!client) {
            return;
        }

        handleProtocol.sendNpc(npc, client);
        socket.send(client);
    });

    return npc;
}

module.exports = { spawnMobaNpc };
