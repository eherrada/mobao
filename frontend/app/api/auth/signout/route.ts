import { forwardLogout, getSessionTokenFromCookie } from "../shared";

export async function POST(request: Request) {
    const token = await getSessionTokenFromCookie();
    return forwardLogout(token, request);
}
