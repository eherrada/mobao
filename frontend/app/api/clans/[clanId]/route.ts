import { forwardSessionJsonRequest } from "../../auth/shared";

export async function GET(
    request: Request,
    context: { params: Promise<{ clanId: string }> },
) {
    const { clanId } = await context.params;

    if (!clanId) {
        return Response.json({ error: "clanId es requerido" }, { status: 400 });
    }

    return forwardSessionJsonRequest(
        `/auth/clans/${encodeURIComponent(clanId)}`,
        {
            method: "GET",
        },
        request,
    );
}
