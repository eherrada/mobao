import type { Metadata } from "next";

const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://aoweb.app";

const normalizedSiteUrl = rawSiteUrl.startsWith("http")
    ? rawSiteUrl
    : `https://${rawSiteUrl}`;

export const siteUrl = normalizedSiteUrl.replace(/\/+$/, "");
export const siteName = "AOWeb";
export const siteTitle = "AOWeb Beta";
export const siteDescription =
    "";
export const siteKeywords = [
    "AOWeb",
    "AO Web",
    "MMORPG web",
    "AOWeb beta",
    "changelog AOWeb",
    "roadmap AOWeb",
];

export function absoluteUrl(path = "/"): string {
    return new URL(path, `${siteUrl}/`).toString();
}

type PageMetadataInput = {
    title: string;
    description: string;
    path: string;
    keywords?: string[];
    imagePath?: string;
    twitterImagePath?: string;
};

export function buildPageMetadata({
    title,
    description,
    path,
    keywords = [],
    imagePath = "/opengraph-image",
    twitterImagePath = imagePath,
}: PageMetadataInput): Metadata {
    return {
        title,
        description,
        keywords: [...siteKeywords, ...keywords],
        alternates: {
            canonical: path,
        },
        openGraph: {
            type: "website",
            locale: "es_AR",
            url: absoluteUrl(path),
            siteName,
            title,
            description,
            images: [
                {
                    url: absoluteUrl(imagePath),
                    width: 1200,
                    height: 630,
                    alt: title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            creator: "@DamianCatanzaro",
            title,
            description,
            images: [absoluteUrl(twitterImagePath)],
        },
    };
}
