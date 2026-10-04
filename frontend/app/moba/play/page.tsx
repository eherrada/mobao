import type { Metadata } from "next";
import { Suspense } from "react";

import MobaPlay from "./MobaPlay";

export const metadata: Metadata = {
    title: "MobAO · Partida",
    robots: { index: false, follow: false },
};

export default function MobaPlayPage() {
    return (
        <Suspense fallback={<div className="fixed inset-0 bg-[#05070b]" />}>
            <MobaPlay />
        </Suspense>
    );
}
