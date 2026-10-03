import { forwardArenaRequest } from "../shared";

export async function GET() {
    return forwardArenaRequest("/arenas/rooms");
}

export async function POST(request: Request) {
    const body = await request.json();

    return forwardArenaRequest("/arenas/rooms", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}
