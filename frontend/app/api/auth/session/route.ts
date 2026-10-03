import { readSessionFromApi } from "../shared";

export async function GET(request: Request) {
    return readSessionFromApi(request);
}
