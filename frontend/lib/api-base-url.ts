const DEFAULT_API_BASE_URL = "http://host.docker.internal/api";

export function getApiBaseUrl(): string {
    return (
        process.env.API_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
        DEFAULT_API_BASE_URL
    );
}

export function getApiBaseUrlCandidates(): string[] {
    return [
        process.env.API_BASE_URL?.trim(),
        process.env.NEXT_PUBLIC_API_BASE_URL?.trim(),
        DEFAULT_API_BASE_URL,
    ].filter((value, index, values): value is string => {
        if (!value) {
            return false;
        }

        return values.indexOf(value) === index;
    });
}
