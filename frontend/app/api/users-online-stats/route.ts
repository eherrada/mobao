import { NextResponse } from "next/server";
import { normalizeErrorPayload } from "../../../lib/api-errors";
import { fetchApi } from "../auth/shared";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const hours = searchParams.get("hours")?.trim() || "24";

    const response = await fetchApi(
        `/user-online-stats?hours=${encodeURIComponent(hours)}`,
        {
            cache: "no-store",
        },
    );

    const result = normalizeErrorPayload(await response.json());
    return NextResponse.json(result, { status: response.status });
}
