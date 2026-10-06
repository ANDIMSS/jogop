import type { SpawnSpec } from './enemies'

/** Visual identity of a stage: which sky, planet, lighting and props the environment builds. */
export type StageTheme = 'ring' | 'orbit' | 'prism'

/** How the camera frames the action. 'glass' is the locked, tripod-like view of the Loop. */
export type CameraMode = 'play' | 'glass'

/**
 * The Director (the scene) exposes only verbs; every beat of pacing lives in the stage timelines as
 * data, so re-pacing never touches gameplay code. Each stage is one `Timeline<Director>`.
 */
export interface Director {
  spawn(spec: SpawnSpec): void
  rock(big: boolean, lane?: 'player' | 'random'): void
  mine(): void
  banner(key: string, sub: string, style: 'phase' | 'warning' | 'clear'): void
  hint(key: string | null): void
  /** One-line call-out (dodge this, watch that). */
  cue(key: string): void
  setRail(kind: 'cruise' | 'boost' | 'boss'): void
  /** Lock the camera to a fixed framing (cinematics still override it, then restore it). */
  setCamera(mode: CameraMode): void
  setMusic(section: string): void
  /** Swap the whole backdrop (sky, planet, fog, lighting) in one call. */
  setTheme(theme: StageTheme): void
  /** 0 = vacuum, 1 = grazing the atmosphere: warms the sky, fog and post tint. */
  atmosphere(level: number): void
  hostiles(): number
  warning(on: boolean): void
  letterbox(on: boolean): void
  cinematic(name: 'launch' | 'boss' | 'none'): void
  startBoss(): void
  bossDefeated(): boolean
  /** Store a retry point. `label` is the timeline label "retry" jumps back to (default 'boss'). */
  checkpointHere(label?: string): void
  /** Finish the stage in victory without a boss (stages that end on a gauntlet). */
  clear(): void
  tutorialFinished(): void
  readonly tutorial: boolean
}
