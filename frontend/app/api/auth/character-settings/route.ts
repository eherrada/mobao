import { NextResponse } from "next/server";
import {
    fetchApi,
    getSessionTokenFromCookie,
    proxyJsonResponse,
} from "../shared";

export async function GET() {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const response = await fetchApi("/auth/character-settings", {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}

export async function PUT(request: Request) {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const body = await request.json();

    const response = await fetchApi("/auth/character-settings", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}
