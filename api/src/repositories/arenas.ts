import crypto from "crypto";
import { z } from "zod";
import pool from "../db";
import { hashPassword, verifyPassword } from "../lib/passwords";
import type {
  AccountRecord,
  ArenaRoomDetails,
  ArenaRoomMemberRecord,
  ArenaRoomMemberView,
  ArenaRoomRecord,
  ArenaRoomSummary,
  AuthSessionRecord,
  GameTicketResponse,
  PvpBuild,
} from "../types";

const ARENA_GAME_TICKET_TTL_MS = 1000 * 60;
const ARENA_ROOM_INACTIVITY_TTL_MS = 1000 * 60 * 10;
const DEFAULT_ARENA_MAP_ID = 272;
const DEFAULT_ROOM_CAPACITY = 50;
const MIN_ROOM_CAPACITY = 2;
const MAX_ROOM_CAPACITY = 250;
const MAX_PVP_TEMPLATE_ID = 7;
const MOBA_ARENA_MAP_ID = 600;
const MOBA_ROOM_CAPACITY = 6;
const MOBA_TEAM_SIZE = 3;
const MOBA_LAUNCH_WINDOW_MS = 1000 * 30;

const createRoomSchema = z.object({
  name: z.string().trim().min(3).max(40),
  isPublic: z.boolean(),
  password: z.string().trim().min(1).max(100).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(MIN_ROOM_CAPACITY).max(MAX_ROOM_CAPACITY).optional(),
  mode: z.enum(["arena", "moba"]).optional(),
}).superRefine((value, ctx) => {
  if (!value.isPublic && !value.password?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La sala privada requiere password",
      path: ["password"],
    });
  }
});

const joinRoomSchema = z.object({
  password: z.string().trim().max(100).optional(),
});

const buildId = z.string().trim().min(1).max(48);

const pvpBuildSchema = z.object({
  abilities: z.array(buildId).length(4),
  ult: buildId,
  spec: buildId,
  kit: buildId,
});

const lobbyUpdateSchema = z.object({
  team: z.enum(["blue", "red"]).optional(),
  ready: z.boolean().optional(),
  templateId: z.coerce.number().int().min(0).max(MAX_PVP_TEMPLATE_ID).optional(),
  raceId: z.coerce.number().int().min(1).max(5).optional(),
  // null = volver al build por defecto. Solo se valida la forma; los ids los valida el servidor de juego.
  build: pvpBuildSchema.nullable().optional(),
});

const selectTemplateSchema = z.object({
  templateId: z.coerce.number().int().min(0).max(MAX_PVP_TEMPLATE_ID),
  raceId: z.coerce.number().int().min(1).max(5).optional(),
});

function createOpaqueTicket(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function createJoinToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function getSessionRecord(token: string): Promise<AuthSessionRecord | null> {
  const sessionResult = await pool.query<AuthSessionRecord>(
    `
      SELECT token, account_id, selected_character_id, created_at, expires_at
      FROM auth_sessions
      WHERE token = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
    [token],
  );

  return sessionResult.rows[0] ?? null;
}

async function getAccountById(accountId: string): Promise<AccountRecord | null> {
  const accountResult = await pool.query<AccountRecord>(
    `
      SELECT *
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
    [accountId],
  );

  return accountResult.rows[0] ?? null;
}

async function getRoomRecord(roomId: string): Promise<ArenaRoomRecord | null> {
  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE id = $1
      LIMIT 1
    `,
    [roomId],
  );

  return roomResult.rows[0] ?? null;
}

async function getRoomRecordByJoinToken(joinToken: string): Promise<ArenaRoomRecord | null> {
  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE join_token = $1
      LIMIT 1
    `,
    [joinToken],
  );

  return roomResult.rows[0] ?? null;
}

async function getMemberRecord(roomId: string, accountId: string): Promise<ArenaRoomMemberRecord | null> {
  const memberResult = await pool.query<ArenaRoomMemberRecord>(
    `
      SELECT room_id, account_id, selected_pvp_template_id, selected_pvp_race_id, pvp_build, team, ready, connected, joined_at, updated_at
      FROM arena_room_members
      WHERE room_id = $1
        AND account_id = $2
      LIMIT 1
    `,
    [roomId, accountId],
  );

  return memberResult.rows[0] ?? null;
}

async function countConnectedMembers(roomId: string): Promise<number> {
  const countResult = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM arena_room_members
      WHERE room_id = $1
        AND connected = TRUE
    `,
    [roomId],
  );

  return Number(countResult.rows[0]?.count ?? 0);
}

async function countMembers(roomId: string): Promise<number> {
  const countResult = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM arena_room_members
      WHERE room_id = $1
    `,
    [roomId],
  );

  return Number(countResult.rows[0]?.count ?? 0);
}

/** Miembros de la sala con su equipo; a quien todavia no tiene equipo se le asigna el menos poblado. */
async function listRoomMembers(room: ArenaRoomRecord): Promise<ArenaRoomMemberView[]> {
  const result = await pool.query<{
    account_id: string;
    name: string;
    selected_pvp_template_id: number | null;
    selected_pvp_race_id: number | null;
    pvp_build: PvpBuild | null;
    team: string | null;
    ready: boolean;
    connected: boolean;
  }>(
    `
      SELECT member.account_id, account.name, member.selected_pvp_template_id, member.selected_pvp_race_id,
             member.pvp_build, member.team, member.ready, member.connected
      FROM arena_room_members member
      JOIN accounts account ON account.id = member.account_id
      WHERE member.room_id = $1
      ORDER BY member.joined_at ASC, member.account_id ASC
    `,
    [room.id],
  );

  const counts = { blue: 0, red: 0 };

  for (const row of result.rows) {
    if (row.team === "blue" || row.team === "red") counts[row.team]++;
  }

  for (const row of result.rows) {
    if (row.team === "blue" || row.team === "red") continue;

    const assigned: "blue" | "red" = counts.blue <= counts.red ? "blue" : "red";
    row.team = assigned;
    counts[assigned]++;
    await pool.query(
      `UPDATE arena_room_members SET team = $3 WHERE room_id = $1 AND account_id = $2 AND team IS NULL`,
      [room.id, row.account_id, assigned],
    );
  }

  return result.rows.map((row) => ({
    accountId: row.account_id,
    name: row.name,
    isOwner: row.account_id === room.owner_account_id,
    templateId: row.selected_pvp_template_id,
    raceId: row.selected_pvp_race_id,
    build: row.pvp_build ?? null,
    team: row.team === "red" ? "red" : "blue",
    ready: row.ready,
    connected: row.connected,
  }));
}

async function buildRoomSummary(room: ArenaRoomRecord): Promise<ArenaRoomSummary> {
  const [owner, connectedPlayers, memberCount] = await Promise.all([
    getAccountById(room.owner_account_id),
    countConnectedMembers(room.id),
    countMembers(room.id),
  ]);

  return {
    id: room.id,
    name: room.name,
    isPublic: room.is_public,
    joinToken: room.join_token,
    mapId: room.map_id,
    capacity: room.capacity,
    connectedPlayers,
    memberCount,
    owner: {
      _id: owner?.id ?? room.owner_account_id,
      name: owner?.name ?? "Cuenta",
    },
  };
}

async function buildRoomDetails(room: ArenaRoomRecord, accountId: string): Promise<ArenaRoomDetails> {
  const [summary, member, members] = await Promise.all([
    buildRoomSummary(room),
    getMemberRecord(room.id, accountId),
    listRoomMembers(room),
  ]);
  const own = members.find((entry) => entry.accountId === accountId);

  return {
    ...summary,
    isOwner: room.owner_account_id === accountId,
    member: member
      ? {
          selectedPvpTemplateId: member.selected_pvp_template_id,
          selectedPvpRaceId: member.selected_pvp_race_id,
          build: member.pvp_build ?? null,
          connected: member.connected,
          team: own?.team ?? member.team ?? null,
          ready: Boolean(member.ready),
        }
      : null,
    members,
    launching:
      room.started_at != null && Date.now() - new Date(room.started_at).getTime() < MOBA_LAUNCH_WINDOW_MS,
  };
}

async function touchRoomActivity(roomId: string): Promise<void> {
  await pool.query(
    `
      UPDATE arena_rooms
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [roomId],
  );
}

async function ensureRoomCanAcceptConnectedPlayer(room: ArenaRoomRecord, accountId: string): Promise<void> {
  const member = await getMemberRecord(room.id, accountId);

  if (member?.connected) {
    return;
  }

  const connectedMembers = await countConnectedMembers(room.id);

  if (connectedMembers >= room.capacity) {
    throw new Error("La sala alcanzo su capacidad maxima");
  }
}

async function upsertRoomMember(roomId: string, accountId: string): Promise<void> {
  // Equipo inicial: el menos poblado (azul si empatan).
  await pool.query(
    `
      INSERT INTO arena_room_members (room_id, account_id, connected, team)
      VALUES (
        $1,
        $2,
        FALSE,
        CASE
          WHEN (SELECT COUNT(*) FROM arena_room_members WHERE room_id = $1 AND team = 'blue')
             <= (SELECT COUNT(*) FROM arena_room_members WHERE room_id = $1 AND team = 'red')
          THEN 'blue' ELSE 'red'
        END
      )
      ON CONFLICT (room_id, account_id)
      DO UPDATE SET updated_at = NOW()
    `,
    [roomId, accountId],
  );
}

async function ensureRoomHasMemberSlot(room: ArenaRoomRecord, accountId: string): Promise<void> {
  if (room.map_id !== MOBA_ARENA_MAP_ID) return;
  if (await getMemberRecord(room.id, accountId)) return;

  if ((await countMembers(room.id)) >= room.capacity) {
    throw new Error("La sala esta llena");
  }
}

/** Si se fue el duenio, la sala pasa al miembro mas antiguo (para que alguien pueda iniciar la partida). */
async function transferOwnershipIfNeeded(roomId: string, leavingAccountId: string): Promise<void> {
  await pool.query(
    `
      UPDATE arena_rooms
      SET owner_account_id = next_owner.account_id
      FROM (
        SELECT account_id FROM arena_room_members WHERE room_id = $1 ORDER BY joined_at ASC LIMIT 1
      ) next_owner
      WHERE arena_rooms.id = $1
        AND arena_rooms.owner_account_id = $2
    `,
    [roomId, leavingAccountId],
  );
}

async function removeAccountFromOtherRooms(accountId: string, keepRoomId?: string): Promise<void> {
  const removedRoomsResult = keepRoomId
    ? await pool.query<{ room_id: string }>(
        `
          DELETE FROM arena_room_members
          WHERE account_id = $1
            AND room_id <> $2
          RETURNING room_id
        `,
        [accountId, keepRoomId],
      )
    : await pool.query<{ room_id: string }>(
        `
          DELETE FROM arena_room_members
          WHERE account_id = $1
          RETURNING room_id
        `,
        [accountId],
      );

  for (const row of removedRoomsResult.rows) {
    await transferOwnershipIfNeeded(row.room_id, accountId);
  }

  if (removedRoomsResult.rows.length > 0) {
    await pool.query(
      `
        UPDATE arena_rooms
        SET updated_at = NOW()
        WHERE id = ANY($1::uuid[])
      `,
      [removedRoomsResult.rows.map((row) => row.room_id)],
    );
  }

  await cleanupEmptyRooms();
}

export async function listPublicArenaRooms(token: string): Promise<ArenaRoomSummary[] | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const roomsResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE is_public = TRUE
      ORDER BY created_at DESC
    `,
  );

  return Promise.all(roomsResult.rows.map((room) => buildRoomSummary(room)));
}

export async function createArenaRoom(token: string, payload: unknown): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const data = createRoomSchema.parse(payload);
  const password = data.password?.trim() || null;
  const passwordHash = password ? await hashPassword(password) : null;
  const joinToken = createJoinToken();

  await removeAccountFromOtherRooms(session.account_id);

  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      INSERT INTO arena_rooms (
        owner_account_id,
        name,
        is_public,
        password_hash,
        join_token,
        map_id,
        capacity
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      RETURNING *
    `,
    [
      session.account_id,
      data.name,
      data.isPublic,
      passwordHash,
      joinToken,
      data.mode === "moba" ? MOBA_ARENA_MAP_ID : DEFAULT_ARENA_MAP_ID,
      data.mode === "moba" ? MOBA_ROOM_CAPACITY : (data.capacity ?? DEFAULT_ROOM_CAPACITY),
    ],
  );

  const room = roomResult.rows[0];

  await upsertRoomMember(room.id, session.account_id);

  return buildRoomDetails(room, session.account_id);
}

export async function joinArenaRoom(token: string, roomId: string, payload: unknown): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const { password } = joinRoomSchema.parse(payload);

  if (!room.is_public) {
    if (!password?.trim()) {
      throw new Error("La sala privada requiere password");
    }

    const isValid = await verifyPassword(password.trim(), room.password_hash ?? "");

    if (!isValid) {
      throw new Error("Password invalida");
    }
  }

  await ensureRoomHasMemberSlot(room, session.account_id);
  await removeAccountFromOtherRooms(session.account_id, room.id);
  await upsertRoomMember(room.id, session.account_id);
  await touchRoomActivity(room.id);

  return buildRoomDetails(room, session.account_id);
}

export async function joinArenaRoomByLink(token: string, joinToken: string): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecordByJoinToken(joinToken);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  await ensureRoomHasMemberSlot(room, session.account_id);
  await removeAccountFromOtherRooms(session.account_id, room.id);
  await upsertRoomMember(room.id, session.account_id);
  await touchRoomActivity(room.id);

  return buildRoomDetails(room, session.account_id);
}

export async function getArenaRoom(token: string, roomId: string): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    return null;
  }

  // El lobby consulta la sala cada uno o dos segundos: eso cuenta como actividad (evita que la limpieza la borre).
  if (await getMemberRecord(room.id, session.account_id)) {
    await pool.query(
      `UPDATE arena_room_members SET updated_at = NOW() WHERE room_id = $1 AND account_id = $2`,
      [room.id, session.account_id],
    );
  }

  return buildRoomDetails(room, session.account_id);
}

/** Lobby: guarda campeon, raza, equipo y estado "listo" sin entrar a jugar. */
export async function updateArenaLobby(token: string, roomId: string, payload: unknown): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const member = await getMemberRecord(room.id, session.account_id);

  if (!member) {
    throw new Error("Primero debes unirte a la sala");
  }

  const data = lobbyUpdateSchema.parse(payload);

  if (data.team && data.team !== member.team) {
    const taken = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM arena_room_members WHERE room_id = $1 AND team = $2 AND account_id <> $3`,
      [room.id, data.team, session.account_id],
    );

    if (Number(taken.rows[0]?.count ?? 0) >= MOBA_TEAM_SIZE) {
      throw new Error("Ese equipo esta completo");
    }
  }

  // Si cambia de campeon sin mandar build, el anterior ya no sirve: se vuelve al default.
  const changedChampion =
    data.templateId !== undefined && data.templateId !== member.selected_pvp_template_id;
  const writeBuild = data.build !== undefined || changedChampion;

  await pool.query(
    `
      UPDATE arena_room_members
      SET team = COALESCE($3, team),
          ready = COALESCE($4, ready),
          selected_pvp_template_id = COALESCE($5, selected_pvp_template_id),
          selected_pvp_race_id = COALESCE($6, selected_pvp_race_id),
          pvp_build = CASE WHEN $7::boolean THEN $8::jsonb ELSE pvp_build END,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [
      room.id,
      session.account_id,
      data.team ?? null,
      data.ready ?? null,
      data.templateId ?? null,
      data.raceId ?? null,
      writeBuild,
      data.build ? JSON.stringify(data.build) : null,
    ],
  );

  await touchRoomActivity(room.id);

  return buildRoomDetails((await getRoomRecord(room.id)) ?? room, session.account_id);
}

/** Solo el duenio: marca la sala como iniciada y los lobbies de todos redirigen al juego. */
export async function startArenaMatch(token: string, roomId: string): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  if (room.owner_account_id !== session.account_id) {
    throw new Error("Solo el creador de la sala puede iniciar la partida");
  }

  await pool.query(`UPDATE arena_rooms SET started_at = NOW(), updated_at = NOW() WHERE id = $1`, [room.id]);

  return buildRoomDetails((await getRoomRecord(room.id)) ?? room, session.account_id);
}

export async function leaveArenaRoom(token: string, roomId: string): Promise<{ ok: true } | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  await leaveArenaRoomByAccount(roomId, session.account_id);
  return { ok: true };
}

export async function createArenaGameTicket(token: string, roomId: string, payload: unknown): Promise<GameTicketResponse | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const member = await getMemberRecord(room.id, session.account_id);

  if (!member) {
    throw new Error("Primero debes unirte a la sala");
  }

  await ensureRoomCanAcceptConnectedPlayer(room, session.account_id);

  const { templateId, raceId: requestedRaceId } = selectTemplateSchema.parse(payload);
  const raceId = requestedRaceId ?? member.selected_pvp_race_id ?? 1;
  const ticket = createOpaqueTicket();
  // El build guardado solo vale para el campeon con el que se guardo; si cambia, el servidor usa el default.
  const ticketBuild =
    member.pvp_build && member.selected_pvp_template_id === templateId ? JSON.stringify(member.pvp_build) : null;

  await pool.query(
    `
      UPDATE arena_room_members
      SET selected_pvp_template_id = $3,
          selected_pvp_race_id = $4,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [room.id, session.account_id, templateId, raceId],
  );

  await touchRoomActivity(room.id);

  const result = await pool.query<{ expires_at: Date }>(
    `
      INSERT INTO game_tickets (
        ticket,
        auth_token,
        account_id,
        character_id,
        mode,
        arena_room_id,
        pvp_template_id,
        pvp_race_id,
        pvp_team,
        pvp_build,
        expires_at
      )
      VALUES ($1, $2, $3, NULL, 'arena', $4, $5, $7, $8, $9::jsonb, NOW() + ($6 * INTERVAL '1 millisecond'))
      RETURNING expires_at
    `,
    [ticket, token, session.account_id, room.id, templateId, ARENA_GAME_TICKET_TTL_MS, raceId, member.team ?? null, ticketBuild],
  );

  return {
    ticket,
    expiresAt: result.rows[0].expires_at,
  };
}

export async function leaveArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM arena_room_members
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await transferOwnershipIfNeeded(roomId, accountId);
  await touchRoomActivity(roomId);

  await cleanupEmptyRooms();
}

export async function disconnectArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  await pool.query(
    `
      UPDATE arena_room_members
      SET connected = FALSE,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await touchRoomActivity(roomId);

  await cleanupEmptyRooms();
}

export async function connectArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const member = await getMemberRecord(roomId, accountId);

  if (!member) {
    throw new Error("Primero debes unirte a la sala");
  }

  await ensureRoomCanAcceptConnectedPlayer(room, accountId);

  await pool.query(
    `
      UPDATE arena_room_members
      SET connected = TRUE,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await touchRoomActivity(roomId);
}

export async function resetAllArenaRoomMembersConnectedStatus(): Promise<number> {
  const result = await pool.query(
    `
      UPDATE arena_room_members
      SET connected = FALSE,
          updated_at = NOW()
      WHERE connected = TRUE
    `,
  );

  return result.rowCount ?? 0;
}

export async function cleanupEmptyRooms(): Promise<void> {
  await pool.query(
    `
      DELETE FROM arena_rooms
      WHERE id IN (
        SELECT room.id
        FROM arena_rooms room
        LEFT JOIN arena_room_members member ON member.room_id = room.id
       GROUP BY room.id
        HAVING COUNT(*) FILTER (WHERE member.connected = TRUE) = 0
           AND COALESCE(MAX(member.updated_at), room.updated_at) < NOW() - ($1 * INTERVAL '1 millisecond')
      )
    `,
    [ARENA_ROOM_INACTIVITY_TTL_MS],
  );
}
