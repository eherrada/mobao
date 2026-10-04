import { Bot, debugMatches, debugState, sleep } from "./botClient";
(async () => {
  const room = process.argv[2];
  const st0 = await debugMatches();
  const m = st0.find((x) => x.id === room);
  if (!m) { console.log("no match", st0); process.exit(1); }
  let st = await debugState(m.mapId as number);
  const me = st.players.find((p) => p.name === "MobDev")!;
  console.log("me", me.x, me.y, "team", me.team);
  const bot = new Bot({ name: "Dummy", templateId: 2, matchId: room, team: me.team === "blue" ? "red" : "blue", x: me.x, y: me.y + 1 });
  await bot.connect();
  await sleep(1000);
  st = await debugState(m.mapId as number);
  const d = st.players.find((p) => p.name === "Dummy")!;
  console.log("dummy at", d.x, d.y, "hp", d.hp, "/", d.maxHp);
  // wait for user to hit via browser
  await sleep(20000);
  st = await debugState(m.mapId as number);
  const d2 = st.players.find((p) => p.name === "Dummy")!;
  console.log("dummy hp after", d2.hp);
  bot.close(); process.exit(0);
})();
