import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../../../lib/auth-session";
import { fetchApi, proxyJsonResponse } from "../../shared";

function shouldUseSecureCookies(request: Request): boolean {
    const forwardedProto = request.headers
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim();

    if (forwardedProto) {
        return forwardedProto === "https";
    }

    return new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
    const body = await request.json();

    const response = await fetchApi("/auth/password-reset/confirm", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    const nextResponse = await proxyJsonResponse(response);

    if (!response.ok) {
        return nextResponse;
    }

    const clearedResponse = NextResponse.json(await nextResponse.json(), {
        status: nextResponse.status,
        headers: nextResponse.headers,
    });

    clearedResponse.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureCookies(request),
        path: "/",
        maxAge: 0,
    });

    return clearedResponse;
}
