# AGENTS.md — guía para agentes (y humanos) que trabajen en MobAO

MobAO es un **MOBA 3v3 de mapa único** construido sobre [aoweb](https://github.com/dcatanzaro/aoweb)
(Argentum Online en la web). Este archivo resume qué se hizo, por qué, cómo correr y testear, las trampas
conocidas y lo que falta. La documentación de producto está en [MOBAO.md](MOBAO.md); acá está el contexto de trabajo.

## 1. Visión y reglas del usuario (no re-discutir)

- Un MOBA estilo League of Legends con mecánicas de **AO**: movimiento manual con **ASDW**, apuntar con el mouse y
  click, ataque manual (espacio). **No** click-to-move ni A*. Todos los controles son configurables y las
  habilidades son **macros grabables por tecla** (barra de macros existente), no un QWER fijo.
- **Un solo mapa entero, sin saltos/cruces de mapa** (estilo Argentum United). Hoy 255×255 (id 600). Si hace falta
  más grande se refactoriza (ver "Camino de crecimiento").
- Héroes = las clases de AO (plantillas PvP); minions, torres y nexo = NPCs.
- Alcance acordado: **3v3, 3 carriles**, jungla, fog of war por equipo.
- El usuario rechazó "helpers/conversores de bytes" para las coordenadas y pidió repensar cómo se posiciona. Se
  midió antes de rediseñar (ver §6) y se documentó la decisión.
- Prefiere que el agente avance con autonomía hasta terminar; pregunta solo lo que cambia el rumbo.
- Idioma de trabajo: **español** (código y comentarios en español, identificadores en inglés/español mezclados
  siguiendo el estilo de aoweb).

## 2. Estado actual (2026-10-03)

Prototipo **completo y con tests verdes** (`cd server && npm run test:moba`).

Hecho:
- Mapa 600 (255×255): 3 carriles, río en la diagonal, 14 campamentos de jungla, 2 bases, generado por
  `server/src/scripts/generateMobaMap.ts` (determinístico, semilla 600). El mapa base **no tiene NPCs**; cada partida
  crea los suyos desde `moba.json`.
- Partidas como **instancias** (ids `60000+`, el cliente resuelve el mapa base 600 por la fórmula
  `30000 + 50*base + n`). El terreno se comparte (solo lectura); solo la ocupación es por partida. Crear una
  partida tarda ~16 ms.
- Equipos azul/rojo, combate consciente de equipos (fuego amigo bloqueado, NPCs ignoran aliados).
- Torres (exterior → interior → base) y nexo con **invulnerabilidad escalonada**, victoria, reinicio automático.
- Minions por oleadas (30 s), IA de carril, torres que priorizan minions.
- Jungla neutral con correa/regreso/regeneración, reaparición (45 s) y buff del Ogro.
- **Fog de guerra autoritativo en el servidor** (los enemigos no visibles nunca se envían) + capa visual suave en el
  cliente.
- Economía: oro pasivo, oro por kills, mercader en cada base (usa el comercio de AO). Fuente de curación en la base.
- Héroes con kits por rol (`server/src/moba/heroes.ts`), lobby con roles, muerte sin pérdida de items, respawn.
- HUD: marcador, reloj, tabla de héroes, oro, minimapa, avisos (paquete `mobaState`).
- Carga del mapa por zonas (chunks) en el cliente para mapas grandes.
- Entorno de desarrollo sin Docker (Postgres embebido), bots y API de depuración para tests automáticos.

## 3. Mapa del código

```
server/src/moba/                 TODO el MOBA del servidor
  config.ts      constantes y tiempos (MOBA_*), ids de plantillas, lectura de mapas_source/mapa_600/moba.json
  teams.ts       equipos, aliados/enemigos, colores
  npcFactory.ts  crea NPCs del MOBA desde las plantillas (DB) y los anuncia a los clientes
  ai.ts          IA de minions, torres y jungla + índice espacial por celdas (findTargets)
  match.ts       ciclo de partida: instancia, oleadas, respawn, oro, regeneración, victoria, estado del HUD, perf
  fog.ts         visión por equipo y filtros sobre handleProtocol; sync de visibilidad por tick
  heroes.ts      kits de hechizos por héroe (solo en MOBA)
  debugApi.ts    API HTTP de depuración (SOLO NODE_ENV=development y localhost)
server/src/scripts/              generateMobaMap, botClient (+tests testMatch/testFog/testHeroes/testJungle/testMinions/testLoad)
api/src/scripts/seedMobaNpcs.ts  plantillas de NPC del MOBA en la base (ids 9601-9609)
frontend/components/moba/MobaHud.tsx   HUD (escucha el evento de ventana "mobao:state")
frontend/components/game/rendering/fogOverlay.ts      oscuridad visual del fog
frontend/components/game/rendering/chunkStreamer.ts   carga del mapa por chunks (mapas > 150×150)
devdb/                           Postgres embebido, scripts de reinicio y consultas
```

Puntos donde se tocó código de aoweb (todos mínimos y marcados):
`game.ts` (`isArenaCombat`, guardas de `userDmgNpc`/`userSpellNpc`, muerte/revivir sin pérdidas, límites por mapa),
`challengeManager.getCombatRelation`, `npcs.ts` (selección de objetivo, `dealDamageTo*`, hook en `muereNpc`),
`login.ts` (`createId` con contador, unión a partida, opciones `moba`), `socket.ts`/`server.ts` (salida inmediata,
tick, filtros), `protocol.ts`/`handleProtocol.ts`/`package.ts` (paquete `mobaState`=82, `sendNpc(npc, client)`),
`respawn.ts` (contadores y buff de jungla), `loadMaps.ts` (tamaño por mapa, mapa 600), `mapBounds.ts` (nuevo:
`mapW/mapH` reemplazan los `100` fijos).

Flujo de red: aoweb usa WebSocket binario; ids de entidad = double LE de 8 bytes; coordenadas = 1 byte (1..255).

## 4. Cómo correr y testear (Windows, sin Docker)

```bash
cd devdb && node start-db.mjs                              # Postgres :5432 (restaura el dump la primera vez)
cd api && npx pnpm dev                                      # :3001
powershell -File devdb/restart-server.ps1 [-Fast]           # servidor de juego :7666
cd frontend && npx pnpm dev                                 # :3000
```
- `-Fast` acorta oleadas/respawn/reinicio/jungla (para tests). **Para jugar usar el modo normal**; con `-Fast` los
  minions se acumulan 5× más rápido.
- Tras tocar plantillas: `cd api && npx pnpm exec tsx src/scripts/seedMobaNpcs.ts` y reiniciar el servidor.
- Tras tocar el generador: `cd server && npx tsx src/scripts/generateMobaMap.ts` y
  `npx tsx src/scripts/exportFrontendOptimizedMaps.ts --maps=600` (el cliente lee `public/maps_optimized`).
- Tests: `devdb/restart-server.ps1 -Fast` y luego `cd server && npm run test:moba`.
  `testFog` es el más importante: busca los ids de los enemigos ocultos dentro de los paquetes que recibe el cliente.
- Typecheck: `npx tsc --noEmit -p .` en `server`, `api` y `frontend` (los tres deben quedar limpios).
- Consultas a la base: `node devdb/q.mjs "<sql>"`. Credenciales de prueba en `devdb/dev-credentials.md` (ignorado por git).
- Entrar al juego desde el navegador: `/arenas` → crear sala **MOBA 3v3** → elegir héroe → `/play?mode=arena&room=…&ticket=…`.
  El ticket dura 60 s; la primera carga de `/play` es lenta (Next compila en dev), conviene "calentar" la página antes.

## 5. Trampas conocidas (leer antes de tocar)

- El id del mapa **debe ser 600**, no 5xx: el cliente trata 500-599 como mapas locales estáticos con otro formato.
- Si la API se reinicia a la vez que el servidor de juego, el servidor se cae (no reintenta) y `tsx watch` queda vivo
  sin escuchar: usar `restart-server.ps1`, que mata todos los watchers.
- El servidor depende de la API/DB al arrancar (plantillas de NPC, objetos, balance).
- AO deja conectado 10 s a quien se desconecta en zona insegura; para héroes MOBA se anuló (salida inmediata).
- `pvpChar` = personaje de plantilla, nunca persiste. Las plantillas PvP (`vars.charactersPvP`) tienen 8 héroes;
  el cliente ya lista los 8 (había un desajuste previo: faltaba el Druida).
- Las muertes/revive de héroes: `putBodyAndHeadDead` desequipa; `revivirUsuario` re-equipa en el servidor pero hay que
  reenviar el inventario al cliente (`sendMyCharacter`), o el cliente ignora la tecla de ataque (ya corregido).
- `movement === 3` es la IA hostil clásica de AO; los NPCs del MOBA usan `movement 20` y su propia IA.
- Una entidad por tile (`mapData[y][x].id`): las oleadas se bloquean entre sí en carriles angostos.
- En el panel de navegador de Claude el juego corre a pocos FPS (render por software) y, si el panel está oculto,
  se frena la página: para verificar visualmente conviene tenerlo visible.
- `window.__aoEngine` expone el motor del cliente solo en desarrollo (para medir desde la consola).

## 6. Decisiones de diseño y medición

- **255×255**: entra en 1 byte de coordenada (sin tocar el protocolo). Cruzar un carril (~400 tiles) lleva ~80 s.
- **Posición**: se evaluó índice de tile + arrays tipados + chunks. Con el MOBA funcionando se midió
  (`/debug/perf`, `testLoad`): 2 partidas 3v3 con oleadas 5× aceleradas = tick promedio 7 ms (p95 14 ms) de 50 ms;
  6 partidas = 29 ms. El cuello de botella real era la búsqueda de objetivos (cuadrática) → grid espacial en `ai.ts`.
  Reescribir el almacenamiento de tiles (~140 puntos) no aporta mejora medible hoy. **Capacidad estimada: 4-6
  partidas por proceso.**
- **Fog**: filtros dentro de `handleProtocol` (por entidad+cliente) y máquina de estados por tick que solo borra lo que el
  cliente llegó a ver (evita filtrar ids). Radios de visión: héroe 8, minion 5, torre 10, nexo 8 (sincronizar
  `server/src/moba/fog.ts` con `fogOverlay.ts`).
- **Cliente**: PixiJS v8. El fog visual se pinta en una textura y las luces siguen a los aliados con movimiento fluido.
  Los mapas grandes se cargan por chunks de 16×16 (5×5 alrededor del jugador); antes se creaba un sprite por tile.

## 7. Qué queremos hacer (roadmap)

Prioridad alta:
1. **Renderer Three.js en paralelo al de PixiJS** (decisión del usuario): cámara **cenital como ahora**, terreno por
   chunks con instancias, personajes/NPCs como billboards con los sprites de AO, fog con luz suave/volumen. Se activa con
   un parámetro de URL y convive con el actual; recién después de comparar se decide si reemplaza a PixiJS. El
   usuario pidió **primero** arreglar PixiJS (hecho: fog suave + chunks) y luego el prototipo.
2. **Verificar con humanos reales** (dos navegadores): sensación de caminar, fog, golpes, lobby 3v3 completo.
3. Pulido de balance (daño de torres, vida de héroes, oro) con partidas reales.

Prioridad media:
4. Sprites propios para torres, nexo, minions y monstruos (hoy reutilizan cuerpos de NPCs de AO).
5. Combate más "MOBA": skillshots (línea/área/cono de tiles), cooldown por habilidad, efectos nuevos (stun, escudo,
   dash). Hoy los hechizos son por tile, hitscan, con cooldown global.
6. Niveles/XP dentro de la partida y tienda con objetos que cambien habilidades; arbustos y wards.
7. Matchmaking/cola en vez de armar salas a mano; reconexión; spectator.
8. Quitar ruido del cliente en mundo único: `prefetchNearbyMaps` pide mapas vecinos inexistentes (404 inofensivos),
   minimapa de mundo antiguo (`imgs_maps/600.png`).

Camino de crecimiento del mapa/escala:
- Para > 255: coordenadas de 16 bits (≈19 escrituras y 3 lecturas en el servidor, 16 lecturas y 3 escrituras en el
  cliente, despliegue conjunto) y/o posición por índice de tile + almacenamiento tipado (≈140 sitios).
- El cliente ya hace streaming de chunks de sprites; el siguiente límite sería la memoria del mapa de datos completo.

## 8. Convenciones de trabajo

- Cambios en código de aoweb: **mínimos y localizados**; lo nuevo va en `server/src/moba/` o `frontend/components/moba/`.
- Todo cambio de servidor se valida con `test:moba` (modo `-Fast`) y los tres `tsc` limpios.
- Los tests son de caja negra con bots (`typeGame=3`, solo localhost); la API de depuración solo existe en desarrollo.
- No publicar el repo: aoweb original **no tiene licencia** y usa assets originales de Argentum Online (uso privado).
- Commits en español/inglés con el trailer `Co-Authored-By` indicado por el entorno; no hay remoto configurado todavía.

## 9. Estructura de memoria del agente

El agente de Claude Code guarda notas persistentes en `C:\Users\emili\.claude\projects\F--src-mobAO\memory\`
(`mobao-project-decisions.md`, `aoweb-architecture-notes.md`). Este archivo y `MOBAO.md` son la fuente de verdad
versionada; si algo contradice a la memoria, manda lo versionado.
