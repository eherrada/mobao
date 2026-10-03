import { forwardArenaRequest } from "../../shared";

type Context = {
    params: Promise<{
        joinToken: string;
    }>;
};

export async function POST(_request: Request, context: Context) {
    const { joinToken } = await context.params;

    return forwardArenaRequest(`/arenas/join/${joinToken}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
    });
}
