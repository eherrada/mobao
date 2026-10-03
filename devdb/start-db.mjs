// Postgres embebido para desarrollo local (sin Docker ni instalacion).
// Uso: node start-db.mjs   (queda corriendo; Ctrl+C para detener)
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const databaseDir = path.join(here, "data");
const dumpFile = path.join(here, "..", "database", "aoweb.sql");
const PORT = 5432;
const DB = "aoweb";
const isFresh = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));

const server = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
});

if (isFresh) await server.initialise();
await server.start();

if (isFresh) {
    await server.createDatabase(DB);
    // El dump trae metacomandos de psql (\restrict / \unrestrict) que pg no entiende.
    const sql = fs
        .readFileSync(dumpFile, "utf8")
        .split(/\r?\n/)
        .filter((line) => !line.startsWith("\\"))
        .join("\n");
    const client = new pg.Client({
        host: "localhost",
        port: PORT,
        user: "postgres",
        password: "postgres",
        database: DB,
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log(`[devdb] dump restaurado en "${DB}"`);
}

console.log(`[devdb] listo: postgresql://postgres:postgres@localhost:${PORT}/${DB}`);

const stop = async () => {
    await server.stop();
    process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
