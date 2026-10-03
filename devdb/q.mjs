import pg from "pg";
const c = new pg.Client({host:"localhost",port:5432,user:"postgres",password:"postgres",database:"aoweb"});
await c.connect();
const sql = process.argv[2];
const r = await c.query(sql);
console.log(JSON.stringify(r.rows.slice(0, +(process.argv[3]||40)), null, 0).replace(/\},\{/g,"},\n{"));
await c.end();
