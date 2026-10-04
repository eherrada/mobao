# MobAO — MOBA 3v3 sobre Argentum Online web

MobAO es un MOBA estilo League of Legends construido sobre [aoweb](https://github.com/dcatanzaro/aoweb)
(servidor WebSocket Node/TS + cliente Next.js/PixiJS + API Express/Postgres).
Mantiene las mecánicas de AO: **movés con ASDW, apuntás con el mouse y hacés click**, las habilidades son
macros asignables a la tecla que quieras, y todos los controles son configurables.

> Aviso de licencia: el repositorio original no declara licencia y usa assets originales de Argentum Online.
> Este fork es para desarrollo y pruebas privadas; no lo publiques sin resolver eso.

## Cómo es una partida

- **Mundo único de 255×255 tiles, sin saltos de mapa** (mapa id `600`). Tres carriles (top, mid, bot),
  río en la diagonal, jungla con 14 campamentos y dos bases en esquinas opuestas.
- **3v3**. Equipos azul y rojo. Cada partida es una *instancia* del mapa (ids `60000+`), así que varias
  partidas conviven y se reinician solas.
- Cada equipo tiene **8 torres** (exterior → interior → base) y un **nexo**. Las estructuras se desbloquean en
  orden: la torre interior solo es vulnerable cuando cae la exterior de su carril, las de base cuando cae alguna
  interior, y el nexo cuando caen las dos torres de base. Cae el nexo → gana el otro equipo y la partida se
  reinicia a los 15 s.
- **Minions** en oleadas cada 30 s (3 por carril y equipo). Siguen el carril, pelean con lo que encuentran y las
  torres les disparan primero a ellos.
- **Jungla**: monstruos neutrales que solo atacan a quien los golpea, vuelven a su campamento si los dejás y
  reaparecen a los 45 s. El Ogro grande da una bendición (+fuerza, +agilidad, 30 % de vida).
- **Fog of war por equipo**, autoritativo en el servidor: los enemigos fuera de visión no se envían al cliente.
  Radios: héroe 8, minion 5, torre 10, nexo 8 (torres y nexos son siempre visibles).
- **Progresión y economía**: niveles 1–18, puntos de habilidad, oro y un **mercader** en cada base (ver más abajo).
  Los héroes se curan rápido cerca de su fuente y regeneran vida y maná de a poco.
- **Muerte**: sin pérdida de items; reaparecés en tu base (más tarde cuanto más nivel).
- HUD: marcador (torres, kills, reloj, nexos), tabla de héroes (K/D/minions), oro, minimapa con visión de equipo,
  cuenta regresiva de respawn y pantalla de victoria/derrota.

## Héroes

Los héroes son las 8 clases de AO (plantillas PvP, nivel 50, sin persistencia). Los kits solo aplican en el MOBA
(`server/src/moba/heroes.ts`).

| Héroe | Rol | Kit |
|---|---|---|
| Mago | Daño en ráfaga | Apocalipsis, Descarga Eléctrica, Tormenta de Fuego, Inmovilizar, Proyectil Mágico, Celeridad |
| Clérigo | Sanador | Curar Graves/Leves, Remover Parálisis, Paralizar, Inmovilizar, Fuerza, Celeridad, Tormenta de Fuego |
| Guerrero | Tanque | Más vida y golpes cuerpo a cuerpo (sin mana) |
| Asesino | Emboscada | Invisibilidad, Celeridad, Fuerza, Proyectil Mágico, Inmovilizar (+ apuñalar) |
| Bardo | Apoyo | Curar, Fuerza y Celeridad para el equipo, Inmovilizar, Tormenta de Fuego |
| Druida | Control | Paralizar, Inmovilizar, Curar Graves, Tormenta de Fuego, Proyectil Mágico, Fuerza |
| Paladín | Combatiente | Curar, Remover Parálisis, Inmovilizar, Proyectil Mágico, Fuerza |
| Cazador | Tirador | Arco a distancia (sin mana) |

## Progresión, habilidades, equipo y razas

**Niveles 1–18.** Los héroes empiezan en nivel 1 y suben con experiencia, como en LoL:
- Un minion da 55 XP, un lobo 40, el Ogro 110, una torre 250 y matar a un héroe 90 + 30 por su nivel. La XP se reparte
  entre los aliados cercanos (14 tiles) con un pequeño bono por grupo.
- El nivel MOBA se mapea a un "nivel AO" efectivo entre 8 y 50 (`server/src/moba/progression.ts`) para reutilizar las
  fórmulas de AO de vida, maná y golpe. El panel izquierdo muestra ese nivel AO; la insignia **Nv** del HUD muestra el
  nivel MOBA y su barra de experiencia.
- Se reaparece en 6 s + 1,5 s por nivel (de 6 s a ~31 s).

**Puntos de habilidad (estilo LoL).** Cada nivel da 1 punto que se gasta en el panel de habilidades (botón "+"):
- Una habilidad sin puntos no se puede lanzar. Las comunes llegan a rango 5 (el rango r pide nivel 2r−1) y la
  **definitiva** de cada héroe a rango 3 (niveles 6, 11 y 16).
- El rango escala el daño y la curación: 75 % en el rango 1 hasta 100 % en el máximo.
- Guerrero y Cazador pelean con armas y no usan puntos.

**Razas.** En el lobby se elige raza además de clase. Los modificadores salen de `balanceRazas` de AO:

| Raza | Modificadores | Efecto en el MOBA |
|---|---|---|
| Humano | +1 Fuerza, +1 Agilidad, +2 Constitución | equilibrado y resistente |
| Elfo | +2 Agilidad, +2 Inteligencia, +1 Constitución, +1 Carisma | más maná, algo menos de vida |
| Elfo Drow | +2 Fuerza, +1 Agilidad, +1 Inteligencia, +1 Constitución | fuerza y maná equilibrados |
| Enano | +3 Fuerza, +3 Constitución, −3 Inteligencia | el más resistente, poco maná |
| Gnomo | +4 Inteligencia, +3 Agilidad, −2 Fuerza | mucho maná, poca vida |

Cada raza tiene sus cabezas, y enanos y gnomos usan armaduras propias (`server/src/moba/races.ts`).

**Oro y tienda.** Empezás con 600 de oro; ganás oro pasivo (3/s), por minions (60), monstruos (75 / 270 el Ogro), torres
(250 a todo el equipo) y kills (300). El mercader de cada base (doble click) ofrece **solo lo que tu clase y raza pueden
usar**: 3 mejoras de arma, armadura, escudo y casco, más pociones (y flechas para el Cazador). El equipo se genera solo
desde el catálogo de AO (`server/src/moba/gear.ts`): el inicial es básico y cada mejora sube de rango de precio
(450 / 1800 / 4800 / 12000). Comprar no equipa: hay que equiparlo (E o doble click en el inventario).

**Escalado de la presión.** Cada oleada de minions es un 4 % más fuerte (hasta +120 %) y las torres pegan un 5 % más por
minuto (hasta +150 %), para que crezcan junto con los héroes.

## Balance

Los multiplicadores por héroe (vida, daño físico, daño de hechizos) están en `server/src/moba/heroes.ts` (`STATS`) y
salieron de simular duelos 1v1 con bots entre todos los héroes a los niveles 1, 6, 12 y 18 con el equipo de cada nivel:

```bash
devdb/restart-server.ps1 -NoMinions -NoWatch            # sin oleadas ni reinicios
cd server && npx tsx src/scripts/duelMatrix.ts 1 1 18    # raza, repeticiones, nivel -> winrate y tiempo para matar
cd server && npx tsx src/scripts/tuneBalance.ts 1 6 1    # afina los multiplicadores en vivo y los imprime
```

Estado: las medias de victoria quedaron entre ~40 % y ~65 % y los duelos duran 5–20 s (`MOBA_HP_SCALE=2` los alarga;
`MOBA_HEAL_SCALE=3` escala las curaciones). Limitaciones conocidas: las políticas de los bots son simples (el Mago, que
depende de su maná, es el más sensible al nivel) y las razas se miden aparte (`duelMatrix.ts <raza>`). Conviene reafinar
con partidas reales.

## Cómo correrlo (Windows, sin Docker)

Requisitos: Node 22+. pnpm se usa vía `npx pnpm@latest`.

```bash
# 1) Postgres embebido (restaura database/aoweb.sql la primera vez; queda corriendo)
cd devdb && npm install && node start-db.mjs

# 2) Variables de entorno (una vez): copiá los .env.example
#    api/.env, server/.env y frontend/.env.local (NEXT_PUBLIC_WS_URL=ws://localhost:7666)

# 3) Datos del MOBA (una vez, o cada vez que cambie el generador)
cd server && npx tsx src/scripts/generateMobaMap.ts      # genera mapas_source/mapa_600
cd server && npx tsx src/scripts/exportFrontendOptimizedMaps.ts --maps=600
cd api    && npx pnpm exec tsx src/scripts/seedMobaNpcs.ts   # plantillas de torres, minions, jungla y tienda

# 4) Servicios
cd api      && npx pnpm dev                        # :3001
powershell -File devdb/restart-server.ps1          # servidor de juego :7666 (agregar -Fast para tiempos de test)
cd frontend && npx pnpm dev                        # :3000
```

**Jungla y objetivos:** Centinela Azul y Zarza Roja (bendiciones de heroe, 2 min), Tortuga del Rio, Dragon del Rio
(acumulable, de equipo) y Rey Demonio (de equipo, 2.5 min). **Volver a la base:** `/recall` o `/b` (8 s quieto).
**Probar con bots:** `cd server && npx tsx src/scripts/playMatch.ts 10`.

Para jugar: registrate en `http://localhost:3000`, andá a **Arenas → Crear sala → MOBA 3v3**, elegí un héroe y
entrá. Una segunda sala/cuenta para el equipo contrario (o bots, ver tests).

## Tests automáticos

`devdb/restart-server.ps1 -Fast` acorta oleadas, respawn y reinicio. Después:

```bash
cd server && npm run test:moba
```

| Test | Qué verifica |
|---|---|
| `testMatch` | equipos, instancia, spawn, minions, torres solo contra el enemigo, orden de destrucción, muerte/respawn, victoria, reinicio y limpieza |
| `testFog` | los enemigos fuera de visión **nunca llegan al cliente** (se buscan sus ids en los paquetes), aparecen al entrar en visión y se ocultan al salir |
| `testHeroes` | curación a aliados, daño a enemigos, fuego amigo bloqueado |
| `testRaces` | cada raza cambia vida/maná, cabeza y (enanos/gnomos) armadura |
| `testProgression` | nivel 1 al empezar, XP y oro por kills reales, subida de nivel, nivel 18 = nivel AO 50 |
| `testSkills` | sin puntos no se lanza, el paquete gasta el punto, rangos y requisito de nivel de la definitiva |
| `testShop` | equipo inicial básico, la tienda filtra por clase, comprar descuenta oro y equipar mejora el arma |
| `testJungle` | monstruos solo contra el agresor, buff, reaparición |
| `testMinions` | los minions de ambos equipos se encuentran y pelean |
| `testLoad` | carga: N partidas simultáneas y costo del tick (`/debug/perf`) |

Los tests usan bots (`typeGame=3`, solo desde localhost) y una API de depuración HTTP
(`server/src/moba/debugApi.ts`) que **solo existe con `NODE_ENV=development`** y responde solo a localhost.

## Arquitectura

```
server/src/moba/
  config.ts      constantes, tiempos (variables de entorno MOBA_*), plantillas, moba.json del mapa
  teams.ts       equipos, aliados/enemigos, colores
  npcFactory.ts  crea NPCs del MOBA desde las plantillas de la base de datos
  ai.ts          minions, torres y jungla; índice espacial por celdas para buscar objetivos
  match.ts       ciclo de la partida: instancia, oleadas, respawn, oro, regeneración, victoria, estado del HUD
  fog.ts         visión por equipo y filtros dentro de handleProtocol
  heroes.ts      kits de hechizos por héroe y multiplicadores de balance
  progression.ts niveles, XP compartida, oro y reaparición por nivel
  skills.ts      puntos de habilidad: rangos, requisitos y multiplicador de daño
  races.ts       razas: cabeza, modificadores y armaduras de enano/gnomo
  gear.ts        escaleras de equipo por clase y raza, inventario inicial y catálogo de la tienda
  debugApi.ts    API de depuración (solo desarrollo)
server/src/scripts/generateMobaMap.ts   genera el mapa 600 y moba.json (carriles, estructuras, campamentos)
frontend/components/moba/MobaHud.tsx    HUD (marcador, minimapa, avisos) vía el paquete `mobaState`
frontend/components/game/rendering/fogOverlay.ts   oscuridad visual del fog (luces suaves que siguen a cada aliado)
frontend/components/game/rendering/chunkStreamer.ts  carga del mapa por zonas (solo mapas grandes)
```

Puntos de enganche en el código de aoweb (todos mínimos): `isArenaCombat` y `getCombatRelation` (equipos),
`userDmgNpc`/`userSpellNpc` (fuego amigo e invulnerabilidad), `selectNpcTarget` (NPCs ignoran aliados),
`putBodyAndHeadDead`/`tirarItemsUser`/`revivirUsuario` (muerte sin pérdidas), `login.connect` (unión a la
partida desde las salas), `socket`/`server` (salida inmediata del héroe) y el tick principal.

### Variables de entorno del servidor

`MOBA_WAVE_MS` (30000), `MOBA_FIRST_WAVE_MS` (10000), `MOBA_MINIONS_PER_WAVE` (3), `MOBA_RESPAWN_MS` (8000),
`MOBA_RESET_MS` (15000), `MOBA_TEAM_SIZE` (3), `MOBA_PASSIVE_GOLD` (8), `MOBA_JUNGLE_RESPAWN_MS` (45000).

## Decisiones de diseño

**Mapa único, sin cruces.** La partida ocurre en un solo mapa; no hay `exits`. El tamaño es 255×255 porque el
protocolo de aoweb ya manda las coordenadas como un byte (1..255): entra sin tocar nada. Cruzar un carril
(~400 tiles a 5 tiles/s para un héroe) lleva ~80 s, un ritmo razonable para un MOBA.

**Posición: se midió antes de rediseñar.** Se evaluó cambiar la fuente de la posición (índice de tile, arrays
tipados, chunks) en lugar de agregar conversores de bytes. Con el MOBA funcionando se midió el costo real
(`/debug/perf`, `testLoad`):

- Crear una partida: ~16 ms (el terreno se comparte; solo se crea la ocupación).
- 2 partidas 3v3 con oleadas **5× más rápidas que las reales**: tick promedio 7 ms (p95 14 ms) sobre 50 ms de
  presupuesto.
- 6 partidas simultáneas, también aceleradas (~1800 NPCs de partida): tick promedio 29 ms.

El único cuello de botella real era la búsqueda de objetivos (cuadrática por partida); se resolvió con un
índice espacial por celdas derivado en cada tick de IA (`ai.ts`). Con esos números, reescribir el almacenamiento
de tiles de todo el servidor (≈140 puntos de lectura) no aporta una mejora medible hoy y sí riesgo. Si el mapa o
la cantidad de partidas crecen, el camino es: (1) posiciones de 16 bits en el protocolo (≈19 escrituras y 3
lecturas en servidor, 16 lecturas y 3 escrituras en cliente) y (2) *streaming* de chunks de sprites en el cliente,
que hoy crea un sprite por tile (~100–130 mil a 255×255) y es el límite práctico de tamaño.

**Capacidad estimada**: ~4–6 partidas simultáneas por proceso de servidor con oleadas normales.

## Rendimiento del cliente

- **Carga por zonas**: en mapas grandes (>150×150) solo existen los sprites de los chunks de 16×16 tiles cercanos al
  jugador (5×5 chunks); al alejarse se destruyen. Medido: ~3 mil objetos en pantalla en lugar de ~100 mil que
  creaba el cliente al cargar el mapa completo. Los mapas de 100×100 siguen cargándose enteros.
- **Fog suave**: la oscuridad se pinta en una textura y cada fuente de visión la borra con una luz de degradé que
  se mueve fluido (antes eran bloques por tile que saltaban).
- En desarrollo, `window.__aoEngine` expone el motor para medir desde la consola del navegador.
- Idea pendiente: renderer Three.js (cámara cenital como ahora) en paralelo al de PixiJS.

## Limitaciones conocidas / próximos pasos

- Sprites provisorios: torres, nexo, minions y monstruos reutilizan cuerpos de NPCs de AO.
- Combate al estilo AO: hechizos por tile con hitscan y cooldown global (no hay skillshots ni cooldown por
  habilidad). Es el siguiente gran paso si se quiere sentir más "MOBA".
- La tienda vende equipo; no hay objetos activos ni efectos especiales (anillos, pasivas) todavía.
- La visión compartida del equipo se refleja en el minimapa, pero los enemigos que ve un aliado lejano (fuera
  del área de 31×31 del cliente) no se envían como entidades.
- Sin arbustos ni wards, sin matchmaking (las salas del lobby arman las partidas), sin reconexión.
- Los datos de ejemplo del repo (`database/aoweb.sql`) son los de aoweb original.
