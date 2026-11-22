# makefun-auto-best-heist-game-20261122-0559-entri

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/rioxbt/makefun-auto-best-heist-game-20261122-0559-entri/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/rioxbt/makefun-auto-best-heist-game-20261122-0559-entri/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**Velvet Vault** — a top-down stealth heist for the desktop browser, entered in
[make.fun's "Make the best heist game" bounty](https://make.fun/bounty/best-heist-game-20261122-0559).

Three rooms, one masked thief, and a building full of eyes. Every guard walks a beat you can read
and every camera sweeps an arc you can time. Walls, crates, pillars and puffs of smoke break the
line of sight; step into a cone and the alarm meter starts filling, and the room is blown the moment
it reads full. Lift every piece of loot in the room, then walk out through the green EXIT with the
meter as low as you can keep it: the quieter the room, the faster you leave and the fewer charges
you burn, the more the job pays.

| | |
|---|---|
| **Room 1 — The Atrium** | one hall, one night guard, one lens, two easy pieces |
| **Room 2 — The Vault Floor** | three corridors joined at the waist, two guards, two lenses, three pieces |
| **Room 3 — The Executive Wing** | a walled vault room inside a ring of patrols, three guards, two lenses |

Two tools, issued in limited numbers per room: an **EMP charge** that leaves the camera it hits dark
for a few seconds, and a **smoke canister** that flies to where the mouse points and breaks the line
of sight for anything looking through it. Both cost the room's allowance and the payout.

Controls: **WASD** or the arrow keys to move, hold **SHIFT** to sneak (slower, quieter, harder to
pick out), **mouse** to aim, **left click** to spend the selected tool, **1**/**2** to pick a tool,
**P** to pause, **R** to retry a room, **M** to mute.

The game is static files under `game/` with no build step: `game/index.html` opens in desktop Chrome
and plays with no network request. Every script, sound and image it uses is a file under `game/` or
a `data:` URI — the sound is synthesised in the browser, so no audio files ship at all. The art is
drawn with canvas primitives and no third-party engine.

The rules live in `game/src/` split one job to a file: `sim.js` (the rules and the alarm), `level.js`
(the three room plans and collision), `guards.js` (patrols, cones and the alarm's sense), `player.js`,
`tools.js`, `render.js`, `hud.js`, `shots.js` (the repeatable screenshot scenes), `main.js` (boot and
loop). `test/sim.test.mjs` runs the whole simulation headless under Node and checks the plans, the
cones, the cover, the tools and that every room can be walked out.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080, then open it in Chrome
node test/sim.test.mjs # the headless rules check
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # write out/ the way the grader does
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
