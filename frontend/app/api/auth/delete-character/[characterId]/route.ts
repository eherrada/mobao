import { forwardSessionJsonRequest } from "../../shared";

type RouteContext = {
    params: Promise<{
        characterId: string;
    }>;
};

export async function DELETE(request: Request, context: RouteContext) {
    const { characterId } = await context.params;

    return forwardSessionJsonRequest(
        `/auth/characters/${encodeURIComponent(characterId)}`,
        {
            method: "DELETE",
        },
        request,
    );
}
