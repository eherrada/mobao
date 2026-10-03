import { NextResponse } from "next/server";
import { fetchApi, proxyJsonResponse } from "../auth/shared";

export async function GET(): Promise<NextResponse> {
    const response = await fetchApi("/runtime-config", {
        cache: "no-store",
    });

    return proxyJsonResponse(response);
}
