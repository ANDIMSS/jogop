import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n, resolveLocale } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game } from './game/game'
import { buyShip, buyWeapon, equipShip, equipWeapon, loadoutOf, rewardsFor, type Loadout, type ShipId, type WeaponId } from './game/arsenal'
import { isStageId, stageInfo } from './game/stages'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n(resolveLocale(save.data.locale, navigator.languages))
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let lockLostAt = 0

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) game.reducedMotion = d.reducedMotion
  }
  const enterRun = () => {
    ui.show('hud')
    loop.resetAccumulator()
    input.endFrame()
    input.lockPointer()
  }
  const startRun = (stage?: string) => {
    if (!game) return
    audio.unlock()
    const id = stageInfo(isStageId(stage) ? stage : save.data.stage).id
    if (isStageId(stage) && stage !== save.data.stage) save.update({ stage })
    // The first-flight tutorial belongs to the ring stage only; any other stage skips it.
    const tutorial = !save.data.tutorialDone && id === 'ring'
    ui.clearHudFx()
    game.start(tutorial, id)
    enterRun()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
    input.endFrame()
    input.lockPointer()
  }
  /** Write a loadout back into the save (only the shop fields ever change here). */
  const persist = (l: Loadout) => save.update({ credits: l.credits, weapons: l.weapons, weapon: l.weapon, ships: l.ships, ship: l.ship })
  const ui = new Ui(i18n, save, audio, input, {
    play: stage => startRun(stage),
    shop: (kind, id) => {
      const l = loadoutOf(save.data)
      if (kind === 'weapon') {
        const id2 = id as WeaponId
        const { loadout, result } = buyWeapon(l, id2)
        persist(result === 'equipped' ? equipWeapon(loadout, id2) : loadout)
      } else {
        const id2 = id as ShipId
        const { loadout, result } = buyShip(l, id2)
        // Buying and re-clicking an owned hull both end with it equipped, like the weapons do.
        persist(result === 'bought' || result === 'max' ? equipShip(loadout, id2) : loadout)
      }
      game?.setLoadout(loadoutOf(save.data))
    },
    restart: () => startRun(),
    checkpoint: () => {
      if (!game) return
      ui.clearHudFx()
      if (game.startFromCheckpoint()) enterRun()
      else startRun()
    },
    resume,
    quit: () => {
      ui.clearHudFx()
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (patch.locale) i18n.set(patch.locale)
      if (qualityChanged) game?.setQuality(save.data.quality)
    },
  })
  ui.show('boot')
  applySettings(save.data)

  // three.js, Rapier (WASM) and the game load as a separate chunk behind the progress bar.
  let loaded = 0
  const track = <T>(p: Promise<T>): Promise<T> => p.then(v => (ui.setBootProgress(0.1 + (++loaded / 4) * 0.9), v))
  ui.setBootProgress(0.1)
  const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
    track(import('./game/game')),
    track(import('./engine/renderer')),
    track(import('./engine/physics')),
    track(document.fonts.ready),
  ])
  await physics.initPhysics()
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, {
    popup: (text, at, kind) => ui.popup(text, at, kind),
    hurt: kind => ui.hurt(kind),
    hint: key => ui.hint(key),
    banner: (key, sub, style) => ui.banner(key, sub, style),
    letterbox: on => ui.letterbox(on),
    warning: on => ui.warning(on),
    bossBar: on => ui.bossBar(on),
    cue: key => ui.cue(key),
    tutorialDone: () => save.update({ tutorialDone: true }),
    end: (run, info) => {
      input.unlockPointer()
      const fromCheckpoint = g.usedCheckpointRun
      // The run pays into the hangar wallet: a fifth of the score, win or lose.
      const earned = rewardsFor(run.score)
      save.update({ credits: save.data.credits + earned })
      window.setTimeout(() => ui.showResults(run, info.grade, { checkpoint: info.checkpoint, fromCheckpoint, stage: g.stageId, credits: earned }), run.phase === 'won' ? 1600 : 700)
    },
  })
  game.reducedMotion = save.data.reducedMotion
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([
      import('../scripts/manus-tuning/adapter.js'), import('./game/tuning'),
    ])
    await registerGameTuning(tuning)
  }
  const g = game
  g.setLoadout(loadoutOf(save.data))
  // The hangar's 3D preview is created here so the UI bundle stays free of three.js.
  const previewCanvas = document.querySelector<HTMLCanvasElement>('[data-el="preview"]')
  if (previewCanvas) {
    const { Showroom } = await import('./game/showroom')
    const showroom = new Showroom(previewCanvas)
    ui.onHangarPreview = id => {
      if (!id) {
        showroom.stop()
        return
      }
      showroom.show(id as ShipId)
      showroom.start()
    }
    window.addEventListener('resize', () => showroom.resize())
  }

  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds, simSeconds) => {
      input.update()
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (g.mode === 'playing') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      ui.frame(frameSeconds)
      loop.paused = g.mode === 'paused'
      g.render(alpha, frameSeconds, simSeconds)
      loop.timeScale = g.timeScale
      if (g.mode !== 'title') ui.updateHud(g.hud())
    },
  })
  loop.start()
  g.setStage(stageInfo(save.data.stage).id)
  g.toTitle()

  // Browsers only allow audio after a gesture: unlock on the first input and start the title theme.
  const unlock = () => {
    audio.unlock()
    if (g.mode === 'title' && !g.music.playing) g.setMusic('title')
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })

  document.addEventListener('pointerlockchange', () => {
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && g.mode === 'playing' && input.method === 'keyboard') {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  canvas.addEventListener('click', () => {
    if (g.mode === 'playing') input.lockPointer()
  })
  new TouchControls(document.getElementById('ui')!, input, () => g.mode === 'playing')
  window.setTimeout(() => ui.show('title'), 300)
  // Debug/test hook: QA scripts drive and inspect the run through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, loop }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) {
    el.innerHTML = `<div class="fatal"><div><p>Launch error / 启动错误</p><button type="button" data-retry>Retry / 重试</button></div></div>`
    el.querySelector('[data-retry]')?.addEventListener('click', () => window.location.reload())
  }
})
