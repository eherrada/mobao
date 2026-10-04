import type {
    ArenaRoomDetails,
    ArenaRoomSummary,
    ArenaRoomsResponse,
} from "./arenas";
import { MOBA_MAP_ID } from "./arenas";

/** Llamadas del cliente a las rutas /api/arenas (salas MOBA y lobby). */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    let payload: unknown = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    const error =
        payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : null;

    if (!response.ok || error) {
        const failure = new Error(error ?? "No se pudo completar la acción");
        (failure as Error & { status?: number }).status = response.status;
        throw failure;
    }

    return payload as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
}

export async function listMobaRooms(): Promise<ArenaRoomSummary[]> {
    const result = await request<ArenaRoomsResponse>("/api/arenas/rooms");
    return result.rooms.filter((room) => room.mapId === MOBA_MAP_ID);
}

export function createMobaRoom(input: {
    name: string;
    isPublic: boolean;
    password?: string;
}) {
    return post<ArenaRoomDetails>("/api/arenas/rooms", {
        name: input.name,
        isPublic: input.isPublic,
        password: input.isPublic ? undefined : input.password,
        mode: "moba",
    });
}

export function joinMobaRoom(roomId: string, password?: string) {
    return post<ArenaRoomDetails>(`/api/arenas/rooms/${roomId}/join`, {
        password,
    });
}

export function joinMobaRoomByToken(joinToken: string) {
    return post<ArenaRoomDetails>(
        `/api/arenas/join/${encodeURIComponent(joinToken)}`,
    );
}

export function getMobaRoom(roomId: string) {
    return request<ArenaRoomDetails>(`/api/arenas/rooms/${roomId}`);
}

export function updateMobaLobby(
    roomId: string,
    patch: {
        team?: "blue" | "red";
        ready?: boolean;
        templateId?: number;
        raceId?: number;
    },
) {
    return post<ArenaRoomDetails>(`/api/arenas/rooms/${roomId}/lobby`, patch);
}

export function startMobaMatch(roomId: string) {
    return post<ArenaRoomDetails>(`/api/arenas/rooms/${roomId}/start`);
}

export function leaveMobaRoom(roomId: string) {
    return post<{ ok: true }>(`/api/arenas/rooms/${roomId}/leave`);
}

/** Acepta un link completo (…/moba/unirse/TOKEN, …/arenas/join/TOKEN) o solo el código. */
export function extractJoinToken(input: string): string {
    const trimmed = input.trim();

    if (!trimmed) return "";

    try {
        const url = new URL(trimmed);
        const parts = url.pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? "";
    } catch {
        return trimmed.split("/").filter(Boolean).pop() ?? "";
    }
}
