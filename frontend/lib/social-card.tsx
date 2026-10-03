import { readFile } from "node:fs/promises";
import path from "node:path";

export const socialImageSize = {
    width: 1200,
    height: 630,
};

export const socialImageContentType = "image/png";

type SocialCardProps = {
    eyebrow: string;
    title: string;
    description: string;
    bullets: string[];
    accent: string;
    logoSrc: string;
};

let logoPromise: Promise<string> | null = null;

export async function getSocialLogoSrc(): Promise<string> {
    if (!logoPromise) {
        const logoPath = path.join(
            process.cwd(),
            "public",
            "static",
            "imgs",
            "logo-aoweb.png",
        );

        logoPromise = readFile(logoPath).then(
            (buffer) => `data:image/png;base64,${buffer.toString("base64")}`,
        );
    }

    return logoPromise;
}

export function SocialCard({ eyebrow, title, accent }: SocialCardProps) {
    return (
        <div
            style={{
                height: "100%",
                width: "100%",
                display: "flex",
                position: "relative",
                overflow: "hidden",
                background:
                    "linear-gradient(135deg, #06111f 0%, #0f172a 45%, #1c1917 100%)",
                color: "#f5f5f4",
                fontFamily: "sans-serif",
                padding: "54px",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(circle at top left, rgba(34, 211, 238, 0.25), transparent 34%), radial-gradient(circle at bottom right, rgba(251, 191, 36, 0.2), transparent 30%)",
                }}
            />

            <div
                style={{
                    position: "absolute",
                    top: "-120px",
                    right: "-80px",
                    width: "360px",
                    height: "360px",
                    borderRadius: "999px",
                    background: `${accent}22`,
                }}
            />

            <div
                style={{
                    position: "relative",
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    gap: "36px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        width: "68%",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                alignSelf: "flex-start",
                                border: `1px solid ${accent}`,
                                borderRadius: "999px",
                                padding: "10px 18px",
                                fontSize: 20,
                                letterSpacing: "0.28em",
                                textTransform: "uppercase",
                                color: accent,
                            }}
                        >
                            {eyebrow}
                        </div>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                marginTop: "26px",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    fontSize: 64,
                                    fontWeight: 800,
                                    lineHeight: 1.05,
                                }}
                            >
                                {title}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
