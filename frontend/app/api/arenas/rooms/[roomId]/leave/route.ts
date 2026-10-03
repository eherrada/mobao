import { forwardArenaRequest } from "../../../shared";

type Context = {
    params: Promise<{
        roomId: string;
    }>;
};

export async function POST(_request: Request, context: Context) {
    const { roomId } = await context.params;

    return forwardArenaRequest(`/arenas/rooms/${roomId}/leave`, {
        method: "POST",
    });
}
