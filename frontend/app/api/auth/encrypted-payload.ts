import crypto from "crypto";

type EncryptedAuthPayload = {
    v?: unknown;
    n?: unknown;
    d?: unknown;
};

const AUTH_PAYLOAD_CHANNEL_KEY = "aoweb:auth:v1:credentials-channel";

function fromBase64Url(value: string): Buffer {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
    );

    return Buffer.from(padded, "base64");
}

function getAuthPayloadCryptoKey(): Buffer {
    return crypto
        .createHash("sha256")
        .update(AUTH_PAYLOAD_CHANNEL_KEY)
        .digest();
}

function decryptPayloadEnvelope(payload: EncryptedAuthPayload): unknown {
    if (
        payload.v !== "c1" ||
        typeof payload.n !== "string" ||
        typeof payload.d !== "string"
    ) {
        return null;
    }

    try {
        const iv = fromBase64Url(payload.n);
        const encrypted = fromBase64Url(payload.d);
        const tag = encrypted.subarray(encrypted.length - 16);
        const ciphertext = encrypted.subarray(0, encrypted.length - 16);
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            getAuthPayloadCryptoKey(),
            iv,
        );

        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]).toString("utf8");

        return JSON.parse(decrypted) as unknown;
    } catch {
        return null;
    }
}

export async function readEncryptedAuthPayload(
    request: Request,
): Promise<unknown | null> {
    const rawPayload = (await request
        .json()
        .catch(() => null)) as EncryptedAuthPayload | null;

    if (!rawPayload || typeof rawPayload !== "object") {
        return null;
    }

    if (rawPayload.v === "c1") {
        return decryptPayloadEnvelope(rawPayload);
    }

    return process.env.NODE_ENV !== "production" ? rawPayload : null;
}
