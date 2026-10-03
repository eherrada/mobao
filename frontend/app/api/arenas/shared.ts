import { NextResponse } from "next/server";
import { normalizeErrorPayload } from "../../../lib/api-errors";
import { fetchApi, getSessionTokenFromCookie } from "../auth/shared";

export async function forwardArenaRequest(path: string, init?: RequestInit) {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const response = await fetchApi(path, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    const result = normalizeErrorPayload(await response.json());
    return NextResponse.json(result, { status: response.status });
}
