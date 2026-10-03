export {};
const vars = require("./vars");

// Dimensiones por mapa. Los mapas de AO son 100x100; un mapa puede declarar otro
// tamaño en terrain.json (width/height) y loadMaps las guarda en vars.mapData[map].
const LEGACY_MAP_SIZE = 100;

function mapW(map: number): number {
    return vars.mapData[map]?.width ?? LEGACY_MAP_SIZE;
}

function mapH(map: number): number {
    return vars.mapData[map]?.height ?? LEGACY_MAP_SIZE;
}

module.exports = { mapW, mapH, LEGACY_MAP_SIZE };
