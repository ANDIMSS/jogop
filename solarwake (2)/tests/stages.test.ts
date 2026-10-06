import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import { SOUNDTRACK } from '../src/game/audio-content'
import type { CameraMode, Director, StageTheme } from '../src/game/director'
import { STAGES, STAGE_INFO, buildStage, isStageId, stageInfo } from '../src/game/stages'
import { Eases } from '../src/engine/timeline'

const DICT: Record<string, string>[] = [en as Record<string, string>, zh as Record<string, string>]

type Log = {
  banners: string[]
  hints: string[]
  cues: string[]
  themes: StageTheme[]
  atmosphere: number[]
  music: string[]
  rails: string[]
  cameras: CameraMode[]
  checkpoints: string[]
  bossStarts: number
  cleared: number
  tutorialDone: number
}

/** A Director that only records what the timeline asked for. No scene, no renderer, no DOM. */
function recorder(log: Log): Director {
  return {
    spawn: () => undefined,
    rock: () => undefined,
    mine: () => undefined,
    banner: (key, sub) => void log.banners.push(key, sub),
    hint: key => void (key && log.hints.push(key)),
    cue: key => void log.cues.push(key),
    setRail: kind => void log.rails.push(kind),
    setCamera: mode => void log.cameras.push(mode),
    setMusic: section => void log.music.push(section),
    setTheme: theme => void log.themes.push(theme),
    atmosphere: level => void log.atmosphere.push(level),
    hostiles: () => 0,
    warning: () => undefined,
    letterbox: () => undefined,
    cinematic: () => undefined,
    startBoss: () => void (log.bossStarts += 1),
    bossDefeated: () => false,
    checkpointHere: label => void log.checkpoints.push(label ?? ''),
    clear: () => void (log.cleared += 1),
    tutorialFinished: () => void (log.tutorialDone += 1),
    tutorial: false,
  }
}

const emptyLog = (): Log => ({ banners: [], hints: [], cues: [], themes: [], atmosphere: [], music: [], rails: [], cameras: [], checkpoints: [], bossStarts: 0, cleared: 0, tutorialDone: 0 })

/** Fly a whole stage headless: 15 script minutes at the fixed 60 Hz step. */
function fly(stageId: (typeof STAGES)[number]['id']) {
  const tl = buildStage(stageId)
  const log = emptyLog()
  const director = recorder(log)
  const dt = 1 / 60
  for (let t = 0; t < 900 && !tl.done; t += dt) tl.update(dt, director)
  return { tl, log }
}

describe('stage registry', () => {
  it('lists unique, resolvable stages in order', () => {
    expect(STAGES.length).toBeGreaterThanOrEqual(2)
    expect(new Set(STAGES.map(s => s.id)).size).toBe(STAGES.length)
    expect(STAGES.map(s => s.order)).toEqual([...STAGES].map(s => s.order).sort((a, b) => a - b))
    expect(new Set(STAGES.map(s => s.checkpoint)).size).toBe(STAGES.length)
    for (const stage of STAGES) {
      expect(isStageId(stage.id)).toBe(true)
      expect(stageInfo(stage.id)).toBe(stage)
      expect(STAGE_INFO[stage.id]).toBe(stage)
    }
  })

  it('falls back to the first stage for unknown or foreign ids', () => {
    expect(isStageId('orbit')).toBe(true)
    expect(isStageId('boss')).toBe(false)
    expect(isStageId(7)).toBe(false)
    expect(isStageId(undefined)).toBe(false)
    expect(stageInfo('<script>')).toBe(STAGES[0])
    expect(stageInfo(undefined)).toBe(STAGES[0])
  })
})

describe('stage timelines', () => {
  it.each(STAGES.map(s => [s.id, s] as const))('%s flies its whole script and sets its own theme', (_id, stage) => {
    const { tl, log } = fly(stage.id)
    expect(tl.hasLabel('intro')).toBe(true)
    expect(tl.hasLabel(stage.checkpoint)).toBe(true)
    expect(tl.elapsed).toBeGreaterThan(30)
    expect(log.themes[0]).toBe(stage.theme)
    // A finite stage retries from its own checkpoint, never a hard-coded one.
    if (!stage.endless) {
      expect(tl.hasLabel('clear')).toBe(true)
      expect(new Set(log.checkpoints)).toEqual(new Set([stage.checkpoint]))
    }
    expect(log.tutorialDone).toBeGreaterThan(0)
    for (const level of log.atmosphere) {
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
    }
    if (stage.id === 'orbit') expect(tl.done).toBe(true)
    // The endless Loop never finishes: it comes back around instead.
    else if (stage.endless) {
      expect(tl.done).toBe(false)
      expect(log.cleared).toBe(0)
      expect(log.bossStarts).toBe(0)
      expect(new Set(log.cameras)).toEqual(new Set(['glass']))
    }
    // The ring stage parks on its boss gate until the boss actually dies.
    else {
      expect(tl.waiting).toBe(true)
      expect(tl.label).toBe('boss')
    }
  })

  it('ends the ring stage on the boss and the orbit stage on a clear', () => {
    const ring = fly('ring')
    expect(ring.log.bossStarts).toBe(1)
    expect(ring.log.cleared).toBe(0)
    const orbit = fly('orbit')
    expect(orbit.log.bossStarts).toBe(0)
    expect(orbit.log.cleared).toBe(1)
    // The orbit stage is the one that actually grazes the atmosphere.
    expect(Math.max(...orbit.log.atmosphere)).toBeGreaterThan(0.97)
    expect(ring.log.atmosphere).toEqual([])
  })

  it('wraps the endless Loop stage around instead of ending it', () => {
    const { tl, log } = fly('loop')
    expect(tl.done).toBe(false)
    // It survived a full cycle and kept going: both moods came back around.
    expect(log.music.filter(m => m === 'loopTide').length).toBeGreaterThan(1)
    expect(log.banners.filter(b => b === 'loop.cycle.title')).toEqual(['loop.cycle.title'])
    expect(log.rails).toEqual(['cruise'])
    expect(log.themes).toEqual(['prism'])
  })

  it('only uses i18n keys that exist in every language', () => {
    const keys = new Set<string>()
    for (const stage of STAGES) {
      const { log } = fly(stage.id)
      for (const key of [...log.banners, ...log.hints, ...log.cues]) keys.add(key)
    }
    expect(keys.size).toBeGreaterThan(10)
    for (const key of keys) {
      for (const dict of DICT) expect(dict[key], `missing i18n key ${key}`).toBeTypeOf('string')
    }
  })

  it('only plays soundtrack sections the sequencer knows', () => {
    const sections = new Set(Object.keys(SOUNDTRACK.sections))
    for (const stage of STAGES) {
      const { log } = fly(stage.id)
      for (const section of log.music) {
        if (section === 'none') continue
        expect(sections.has(section), `unknown music section ${section}`).toBe(true)
      }
      expect(log.music.length).toBeGreaterThan(0)
      expect(log.rails.every(kind => ['cruise', 'boost', 'boss'].includes(kind))).toBe(true)
    }
  })

  it('reaches its checkpoint label by seeking, like a retry does', () => {
    for (const stage of STAGES) {
      const tl = buildStage(stage.id)
      const director = recorder(emptyLog())
      expect(tl.hasLabel(stage.checkpoint)).toBe(true)
      if (stage.endless) continue // no stored checkpoint: nothing to seek back to
      expect(tl.seek(stage.checkpoint)).toBe(true)
      // The label is entered on the first step after the jump.
      tl.update(1 / 60, director)
      expect(tl.label).toBe(stage.checkpoint)
    }
    // Eases stay exported for stage tweens.
    expect(Eases.inQuad(1)).toBe(1)
  })
})
