# SOLARWAKE · 日冕尾迹 — Solar Ring Pursuit

An original 3D on-rails shooter for the browser (three.js + Rapier, TypeScript, Vite).
Fly the SOLARWAKE interceptor through a shattered planetary ring at full burn, chain kills for a
score multiplier, roll through bullet walls, and bring down **BOREWARDEN**, an autonomous
deep-core mining platform, across three phases.

```bash
pnpm install
pnpm dev      # dev server
pnpm build    # typecheck + production build + bundle budget
pnpm test     # unit tests (rules, timeline, impact toolkit, save, i18n)
pnpm smoke    # after build: headless playthrough of all three stages → screenshots in shots/
```

`pnpm smoke` drives a real headless Chromium through the menus and all three missions and fails on
any console error. It uses Playwright's bundled browser; where that download is blocked, run
`node scripts/headless-browser.mjs` once and launch with the environment it prints
(`CHROMIUM_PATH`, `CHROMIUM_ARGS`, `CHROMIUM_LD_LIBRARY_PATH`, and a larger `SMOKE_TIMEOUT` on
software GL).

## Controls

| Action | Keyboard & mouse | Gamepad | Touch (landscape) |
| --- | --- | --- | --- |
| Fly | Mouse steers (ship follows the reticle) or WASD | Left stick | Left floating stick |
| Aim | Mouse | Right stick | Reticle rides ahead of the ship, with aim assist |
| Fire | Left button or J | RT | FIRE button |
| Roll dodge (i-frames) | Space or K | LT | ROLL button |
| Pause | Esc | Start | Pause button |

## The missions

Three stages ship today, each one a single engine timeline that only talks to the scene through
`Director` verbs (`src/game/stages.ts` is the registry; `src/game/director.ts` is the vocabulary).

### Stage 1 · The Shattered Ring (`src/game/level.ts`)

1. **Launch** cinematic, then a short first-flight tutorial (first play only).
2. **Wave 1 — scout screen**: MITE drones and CHISEL cutters in readable formations.
3. **Asteroid storm**: boost section with speed lines, star stretch and destructible rocks.
4. **Wave 2 — mining convoy**: LANTERN gunships, mines and mixed formations.
5. **BOREWARDEN** (checkpoint): warning band, reveal cinematic, then
   - **I · GRIND** — grinder arms are the weak points; sweeping spark streams, drill spirals, ore lobs.
   - **II · EXCAVATE** — drill petals open to expose the auger core; laser sweeps, ore showers, gapped rings.
   - **III · MELTDOWN** — armour sheds; nova spirals, drill lunge with a shock ring, laser pinwheel.

### Stage 2 · Earth Orbit (`src/game/stage-orbit.ts`)

1. **Insertion** cinematic over the planet, then a fast scouting lane (`setTheme('orbit')` swaps the
   sky, planet, fog, lighting and clutter for Earth: oceans, drifting clouds, city lights on the night side).
2. **Kessler cascade**: a tighter, faster debris field than the ring storm — junk, mines and free chain fuel.
3. **Atmospheric skip**: nine seconds of full burn through the upper atmosphere, driven by the
   `atmosphere()` verb (sky glow, orange post tint, heat in the speed lines).
4. **Orbital blockade**: platforms, dragnets of mines and gunships above the terminator.
5. **Break the blockade** (checkpoint): four escalating waves with no boss — the stage ends on
   `clear()` instead of a boss kill, then an **Orbital Breakout** escape run.

### Stage 3 · Continuous Loop (`src/game/stage-loop.ts`)

An endless, meditative stage: no boss, no clear, no finish line. The timeline is built with
`build({ loop: true })`, so the `cycle` label re-fires forever and the run only ends when the ship
goes down. `setTheme('prism')` drops the sky, planet, belt and warm sun halo and leaves an obsidian
void with rare stars, faint caustics and a slab of glossy stone far below; `setCamera('glass')`
locks the camera onto a fixed tripod inside the ship's rig, where `GlassRibbon`
(`src/game/glass.ts`) hangs: one transparent, refractive band that undulates and slowly twists in
zero gravity, with per-channel fresnel rims and travelling caustics. The composition keeps most of
the frame empty for the HUD, and the ship's edge-only chromatic dispersion
(`renderer.ts` → `post.aberrationEdge`) fades in with the ribbon.

## Layout

| Path | Role |
| --- | --- |
| `src/engine/loop.ts` | Fixed 60 Hz simulation, interpolated rendering, global time scale (hit-stop / slow-mo) |
| `src/engine/timeline.ts` | **Timeline event system** — reusable pacing scripts (`wait`, `at`, `call`, `every`, loops) |
| `src/engine/impact.ts` | **Impact toolkit** — hit-stop, slow-mo, trauma shake, directional kick, screen flash, distortion pulse |
| `src/engine/pool.ts` | Allocation-free `ObjectPool` + `InstancedBatch` (one draw call per pooled kind) |
| `src/engine/input.ts` | Keyboard/mouse, dual-stick gamepad and touch unified into one action state |
| `src/engine/physics.ts` | Rapier world, kinematic targets, ray/segment queries for shots and aim |
| `src/engine/renderer.ts` | WebGL renderer, quality tiers, bloom + post (aberration, zoom, tint, vignette) |
| `src/engine/audio.ts`, `music.ts` | Mixer buses, synthesized SFX recipes, step-sequenced procedural music |
| `src/engine/save.ts`, `i18n.ts` | Versioned local save + leaderboard; en / zh-CN with browser detection, saved choice wins |
| `src/game/config.ts` | All tuning numbers (including each stage's clear bonus) |
| `src/game/rules.ts` | Pure hull/shield/combo/score/grade rules (unit tested) |
| `src/game/stages.ts` | Stage registry: ids, themes, checkpoint labels, i18n keys, builders |
| `src/game/director.ts` | The verb vocabulary a stage may use (spawn, banner, theme, atmosphere, clear…) |
| `src/game/formations.ts` | Reusable formation fragments shared by every stage |
| `src/game/level.ts` | Stage 1 "The Shattered Ring" as one timeline script |
| `src/game/stage-orbit.ts` | Stage 2 "Earth Orbit" as one timeline script |
| `src/game/stage-loop.ts` | Stage 3 "Continuous Loop" as one endless timeline script |
| `src/game/glass.ts` | The Loop's transparent glass ribbon (band geometry + refraction shaders) |
| `src/game/boss.ts` | BOREWARDEN: model, parts, phase timelines and attack verbs |
| `src/game/enemies.ts`, `bullets.ts`, `fx.ts` | Pooled + instanced enemies, bullet patterns, particles |
| `src/game/ship.ts`, `rail.ts`, `env.ts`, `models.ts` | Player ship, rail spline + camera frame, sky/asteroids/speed field, procedural low-poly models |
| `src/ui/`, `src/styles/main.css` | HTML/CSS game UI (title, HUD, pause, settings, leaderboard, results) and touch controls |
| `src/i18n/*.json` | All player-facing text (both files, same keys) |

## Rules for changes

- **Simulation in `step()`, visuals in `render()`.** Gameplay state only changes in fixed steps;
  read presses there with `input.consume(action)`.
- **Rules stay pure.** Scoring, damage and grading live in `rules.ts` with tests.
- **Pacing goes through timelines, feel goes through `Impact`.** Neither engine module knows
  about gameplay; the stages and the boss only provide verbs. A new stage is one file exporting a
  `Timeline<Director>` plus one entry in `stages.ts` — never a change to `Game`.
- **Every visible string is an i18n key** in both `en.json` and `zh-CN.json`. Chinese glyphs come
  from the subset font in `public/fonts/`; check new Chinese text renders.
- **UI is HTML/CSS**, keyboard/gamepad navigable (`data-nav` on focusable controls).
- Keep `pnpm build` within budget (`scripts/check-size.mjs`) and `pnpm smoke` green.

## Credits

Solarwake remixes the supplied Heliospur source archive; its complete gameplay, source assets, local systems and original source credits are preserved. Fonts: Sora, Figtree, Noto Sans SC — SIL Open Font License 1.1
(see `public/fonts/*-OFL.txt`). Libraries: three.js (MIT), Rapier (Apache-2.0).
