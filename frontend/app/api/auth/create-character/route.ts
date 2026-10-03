import { NextResponse } from "next/server";
import {
    fetchApi,
    getSessionTokenFromCookie,
    proxyJsonResponse,
} from "../shared";

export async function POST(request: Request) {
    const token = await getSessionTokenFromCookie();

    if (!token) {
        return NextResponse.json(
            { error: "Tu sesion no es valida o ya vencio." },
            { status: 401 },
        );
    }

    const body = await request.json();

    const response = await fetchApi("/auth/create-character", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}
