import { NextResponse } from "next/server";
import { readEncryptedAuthPayload } from "../encrypted-payload";
import { forwardAuthRequest } from "../shared";

export async function POST(request: Request) {
    const body = await readEncryptedAuthPayload(request);

    if (!body) {
        return NextResponse.json(
            { error: "El payload de autenticacion no es valido." },
            { status: 400 },
        );
    }

    return forwardAuthRequest("/auth/register", body, request);
}
