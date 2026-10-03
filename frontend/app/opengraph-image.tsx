import { ImageResponse } from "next/og";
import {
    SocialCard,
    getSocialLogoSrc,
    socialImageContentType,
    socialImageSize,
} from "@/lib/social-card";

export const alt = "AOWeb";
export const size = socialImageSize;
export const contentType = socialImageContentType;

export default async function OpenGraphImage() {
    const logoSrc = await getSocialLogoSrc();

    return new ImageResponse(
        <SocialCard
            eyebrow="AOWeb"
            title="AOWeb"
            description="Beta activa con roadmap abierto, updates frecuentes y una experiencia web pensada para jugar fluido."
            bullets={[
                "MMORPG clasico 100% web",
                "Changelog y roadmap publicos",
                "Seguimiento y mejoras continuas",
            ]}
            accent="#67e8f9"
            logoSrc={logoSrc}
        />,
        size,
    );
}
