import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FRONT_DIRECTION = "2";
const OUTPUT_PATH = path.resolve(
    process.cwd(),
    "public/init/headswithfile.json",
);

function pickHeadGraphicId(headData) {
    return (
        headData?.[FRONT_DIRECTION] ??
        headData?.["1"] ??
        Object.values(headData ?? {})[0] ??
        null
    );
}

function resolveGraphicFrame(graphicsDB, graphicId) {
    if (!graphicId) {
        return null;
    }

    const graphic = graphicsDB[String(graphicId)];
    if (!graphic) {
        return null;
    }

    if (graphic.numFile) {
        return graphic;
    }

    const frameId =
        graphic.frames?.[FRONT_DIRECTION] ??
        graphic.frames?.["1"] ??
        Object.values(graphic.frames ?? {})[0] ??
        null;

    if (!frameId) {
        return null;
    }

    return graphicsDB[String(frameId)] ?? null;
}

async function fetchJson(pathname) {
    const filePath = path.join(process.cwd(), "public", pathname);
    return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
    const [headsDB, graphicsDB] = await Promise.all([
        fetchJson("/init/heads.json"),
        fetchJson("/init/graficos.json"),
    ]);

    const output = Object.fromEntries(
        Object.entries(headsDB)
            .sort(([left], [right]) => Number(left) - Number(right))
            .flatMap(([headId, headData]) => {
                const graphic = resolveGraphicFrame(
                    graphicsDB,
                    pickHeadGraphicId(headData),
                );

                if (!graphic) {
                    return [];
                }

                return [
                    [
                        headId,
                        [
                            String(graphic.numFile),
                            graphic.sX,
                            graphic.sY,
                            graphic.width,
                            graphic.height,
                        ],
                    ],
                ];
            }),
    );

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(output), "utf8");

    console.log(`Generado ${OUTPUT_PATH}`);
    console.log(`Heads procesadas: ${Object.keys(output).length}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
