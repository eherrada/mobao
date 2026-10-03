import { fetchApi, proxyJsonResponse } from "../../shared";

type RouteContext = {
    params: Promise<{
        token: string;
    }>;
};

export async function GET(_request: Request, context: RouteContext) {
    const { token } = await context.params;
    const response = await fetchApi(
        `/auth/password-reset/${encodeURIComponent(token)}`,
        {
            cache: "no-store",
        },
    );

    return proxyJsonResponse(response);
}
