import { forwardArenaRequest } from "../../../shared";

type Context = {
    params: Promise<{
        roomId: string;
    }>;
};

export async function POST(request: Request, context: Context) {
    const { roomId } = await context.params;
    const body = await request.json();

    return forwardArenaRequest(`/arenas/rooms/${roomId}/join`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}
