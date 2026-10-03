const AUTH_PAYLOAD_CHANNEL_KEY = "aoweb:auth:v1:credentials-channel";

function toBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return window
        .btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function getAuthPayloadCryptoKey(): Promise<CryptoKey> {
    const encodedKey = new TextEncoder().encode(AUTH_PAYLOAD_CHANNEL_KEY);
    const keyHash = await window.crypto.subtle.digest("SHA-256", encodedKey);

    return window.crypto.subtle.importKey(
        "raw",
        keyHash,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
    );
}

export async function encryptAuthPayload(payload: unknown): Promise<string> {
    if (
        process.env.NODE_ENV !== "production" &&
        (!window.isSecureContext || !window.crypto?.subtle)
    ) {
        return JSON.stringify(payload);
    }

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await getAuthPayloadCryptoKey(),
        new TextEncoder().encode(JSON.stringify(payload)),
    );

    return JSON.stringify({
        v: "c1",
        n: toBase64Url(iv.buffer),
        d: toBase64Url(encrypted),
    });
}
