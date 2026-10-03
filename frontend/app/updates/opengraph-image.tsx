import { ImageResponse } from "next/og";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";
import {
    SocialCard,
    getSocialLogoSrc,
    socialImageContentType,
    socialImageSize,
} from "@/lib/social-card";

export const alt = "Updates de AOWeb";
export const size = socialImageSize;
export const contentType = socialImageContentType;

export default async function UpdatesOpenGraphImage() {
    const latestChangelog = changelogEntries[0]?.features ?? [];
    const firstRoadmap = roadmapEntries[0];
    const logoSrc = await getSocialLogoSrc();

    return new ImageResponse(
        <SocialCard
            eyebrow="Updates"
            title="Changelog y roadmap de AOWeb"
            description={`Ultimo update: ${latestChangelog[0] ?? "Nuevas mejoras en progreso"}. Proximo foco: ${firstRoadmap?.title ?? "roadmap activo"}.`}
            bullets={[
                ...latestChangelog.slice(0, 2),
                firstRoadmap?.items[0] ??
                    "Seguimiento publico de proximas funciones",
            ]}
            accent="#fbbf24"
            logoSrc={logoSrc}
        />,
        size,
    );
}
