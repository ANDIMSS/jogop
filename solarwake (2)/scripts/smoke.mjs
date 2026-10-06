// End-to-end smoke test: builds must already exist in dist/ (`pnpm build`).
// Serves dist/, boots HELIOSPUR in headless Chromium, flies a few seconds, walks the menus,
// forces a boss clear through the real damage rules to reach Results, checks English/Chinese
// and a phone-landscape HUD, fails on any console error, and writes screenshots to ./shots/.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: false })
let browser
// Software GL (SwiftShader) can run the simulation far slower than real time; SMOKE_TIMEOUT (ms)
// gives such sandboxes room without making a hung run wait forever.
const guard = setTimeout(() => fail('timed out'), Number(process.env.SMOKE_TIMEOUT ?? 240_000))

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

async function openGame(context, errors) {
  const page = await context.newPage()
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 60_000 })
  await page.waitForTimeout(900)
  return page
}

const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game.ship.pos
  return { mode: game.mode, run: game.run, pos: { x: p.x, y: p.y }, cam: game['camMode'] }
})

try {
  await waitForServer()
  // Prefer Playwright's bundled Chromium; fall back to an installed Google Chrome.
  const args = ['--ignore-gpu-blocklist', ...(process.env.CHROMIUM_ARGS?.split(/\s+/).filter(Boolean) ?? [])]
  // CHROMIUM_PATH lets CI or a sandbox point at an already-installed browser binary; a hand-built
  // browser usually also needs its own shared libraries, hence CHROMIUM_LD_LIBRARY_PATH.
  const exe = process.env.CHROMIUM_PATH
  const env = { ...process.env, ...(process.env.CHROMIUM_LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.CHROMIUM_LD_LIBRARY_PATH } : {}) }
  browser = await chromium.launch({ args, env, ...(exe ? { executablePath: exe } : {}) }).catch(() => chromium.launch({ args, channel: 'chrome' }))
  const errors = []

  const en = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' })
  const page = await openGame(en, errors)
  await page.screenshot({ path: `${out}/01-title-en.png` })

  await page.click('[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  // Wait out the launch cinematic, then steer with the keyboard.
  await page.waitForFunction(() => window.__game.game['camMode'] === 'play', null, { timeout: 90_000 })
  const before = await state(page)
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(2_500)
  await page.keyboard.press('Space')
  await page.waitForTimeout(900)
  await page.keyboard.up('KeyD')
  await page.keyboard.down('KeyJ')
  await page.waitForTimeout(1_600)
  await page.keyboard.up('KeyJ')
  await page.screenshot({ path: `${out}/02-gameplay.png` })
  const after = await state(page)
  if (after.mode !== 'playing') throw new Error(`expected playing, got ${after.mode}`)
  if (!(after.run.elapsed > before.run.elapsed)) throw new Error('run clock did not advance')
  if (!(after.run.shots > before.run.shots)) throw new Error('fire (J) did not shoot')
  const moved = Math.abs(after.pos.x - before.pos.x)
  if (moved < 1) throw new Error(`ship barely moved (${moved.toFixed(2)})`)
  console.log(`smoke: steered ${moved.toFixed(1)} units, ${after.run.shots} shots fired`)

  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/03-pause.png` })
  await page.click('[data-screen="pause"] [data-action="settings"]')
  await page.waitForSelector('[data-screen="settings"].is-active')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/04-settings.png` })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await page.waitForTimeout(300)
  if ((await state(page)).mode !== 'paused') throw new Error('leaving Settings with Escape resumed the run')

  // Results: jump to the boss and break every weak point through the real damage path.
  await page.evaluate(() => {
    const { game } = window.__game
    game.resume()
    game.debug.invincible = true
    game.debugSkip('boss')
    window.__smokeTimer = setInterval(() => {
      const boss = game.boss
      if (!boss.fighting) return
      for (const part of boss['parts']) boss.damage(part, 60, boss.partPos(part.name))
    }, 250)
  })
  await page.waitForSelector('[data-screen="results"].is-active', { timeout: 150_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/05-results.png` })
  const done = await state(page)
  if (done.run.phase !== 'won') throw new Error(`expected a won run, got ${done.run.phase}`)

  // Mission select: the second stage swaps the whole backdrop and ends without a boss.
  await page.click('[data-screen="results"] [data-action="quit"]')
  await page.waitForSelector('[data-screen="title"].is-active')
  await page.click('[data-action="stages"]')
  await page.waitForSelector('[data-screen="stages"].is-active')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/06-missions.png` })
  await page.click('[data-screen="stages"] [data-stage="orbit"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.waitForFunction(() => window.__game.game['camMode'] === 'play', null, { timeout: 90_000 })
  const orbit = await page.evaluate(() => ({
    id: window.__game.game.stageId,
    theme: window.__game.game.env.theme,
    boss: window.__game.game.boss.active,
  }))
  if (orbit.id !== 'orbit') throw new Error(`expected the orbit stage, got ${orbit.id}`)
  if (orbit.theme !== 'orbit') throw new Error(`expected the orbit theme, got ${orbit.theme}`)
  if (orbit.boss) throw new Error('the orbit stage started a boss')
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${out}/07-orbit.png` })
  // The retry checkpoint of this stage is its finale, not the ring boss.
  await page.evaluate(() => window.__game.game.debugSkip('finale'))
  await page.waitForTimeout(700)
  const finale = await page.evaluate(() => ({ label: window.__game.game['stage'].label, checkpoint: window.__game.game.hasCheckpoint }))
  if (finale.label !== 'finale') throw new Error(`orbit checkpoint seek landed on ${finale.label}`)
  if (!finale.checkpoint) throw new Error('the orbit finale did not store a checkpoint')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-screen="pause"].is-active', { timeout: 30_000 })
  await page.click('[data-screen="pause"] [data-action="quit"]')
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })

  // Third stage: an endless meditation piece — locked camera, obsidian theme, no boss and no clear.
  await page.click('[data-action="stages"]')
  await page.waitForSelector('[data-screen="stages"].is-active')
  await page.click('[data-screen="stages"] [data-stage="loop"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  await page.waitForFunction(() => window.__game.game['camMode'] === 'glass', null, { timeout: 60_000 })
  await page.waitForFunction(() => window.__game.game.glass.level > 0.5, null, { timeout: 60_000 })
  const loop = await page.evaluate(() => {
    const { game } = window.__game
    return {
      id: game.stageId, theme: game.env.theme, boss: game.boss.active,
      checkpoint: game.hasCheckpoint, label: game['stage'].label, done: game['stage'].done,
      ribbon: game.glass.enabled, floor: game.env['floor'].visible, planet: game.env['planet'].visible,
    }
  })
  if (loop.id !== 'loop') throw new Error(`expected the loop stage, got ${loop.id}`)
  if (loop.theme !== 'prism') throw new Error(`expected the prism theme, got ${loop.theme}`)
  if (loop.boss) throw new Error('the loop stage started a boss')
  if (loop.checkpoint) throw new Error('the loop stage stored a checkpoint for an endless run')
  if (!loop.ribbon) throw new Error('the glass ribbon never faded in')
  if (!loop.floor) throw new Error('the obsidian floor is missing from the prism theme')
  if (loop.planet) throw new Error('the prism theme should not show a planet')
  await page.screenshot({ path: `${out}/08-loop-ribbon.png` })
  // Back to the start of the cycle: the script must still be running, not finished.
  await page.evaluate(() => window.__game.game.debugSkip('cycle'))
  await page.waitForTimeout(2500)
  const loopLater = await page.evaluate(() => {
    const { game } = window.__game
    return { done: game['stage'].done, mode: game.mode, theme: game.env.theme, camera: game['camMode'] }
  })
  if (loopLater.done) throw new Error('the endless loop stage finished')
  if (loopLater.mode !== 'playing') throw new Error(`loop run left play mode (${loopLater.mode})`)
  if (loopLater.camera !== 'glass') throw new Error(`loop camera drifted to ${loopLater.camera}`)
  await en.close()

  const zh = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' })
  const zhPage = await openGame(zh, errors)
  const lang = await zhPage.evaluate(() => document.documentElement.lang)
  if (lang !== 'zh-CN') throw new Error(`browser language not detected (lang=${lang})`)
  await zhPage.screenshot({ path: `${out}/09-title-zh.png` })
  await zh.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' })
  const phonePage = await openGame(phone, errors)
  await phonePage.tap('[data-action="play"]')
  await phonePage.waitForSelector('[data-screen="hud"].is-active')
  await phonePage.waitForTimeout(1200)
  await phonePage.screenshot({ path: `${out}/10-phone-hud.png` })
  await phone.close()

  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — screenshots in ${out}/`)
} catch (err) {
  await fail(err?.message ?? String(err))
}
