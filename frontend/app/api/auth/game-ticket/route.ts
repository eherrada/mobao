import { NextResponse } from "next/server";
import {
    fetchApi,
    getSessionTokenFromCookie,
    proxyJsonResponse,
} from "../shared";

export async function POST() {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const response = await fetchApi("/auth/game-ticket", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}
