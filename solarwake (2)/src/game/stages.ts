import type { Timeline } from '../engine/timeline'
import type { Director, StageTheme } from './director'
import { buildRingStage } from './level'
import { buildLoopStage } from './stage-loop'
import { buildOrbitStage } from './stage-orbit'

/**
 * Stage registry. A stage is one `Timeline<Director>` plus the metadata the menus and the scene
 * need: its theme (sky, planet, lighting), the label retry jumps back to, and its i18n keys.
 * Adding a stage means adding one entry here and one file next to it.
 */
export type StageId = 'ring' | 'orbit' | 'loop'

export type StageInfo = {
  id: StageId
  /** 1-based order shown in the missions menu. */
  order: number
  nameKey: string
  descKey: string
  tagKey: string
  /** Short label for compact lists (leaderboard rows). */
  shortKey: string
  theme: StageTheme
  /** Label `startFromCheckpoint` seeks back to. */
  checkpoint: string
  /**
   * Endless mode: the timeline loops forever, there is no boss and no clear, and the run ends
   * only when the ship is lost. Endless stages never store a checkpoint.
   */
  endless: true | undefined
  build(): Timeline<Director>
}

export const STAGES: readonly StageInfo[] = [
  {
    id: 'ring',
    order: 1,
    nameKey: 'stage.ring.name',
    descKey: 'stage.ring.desc',
    tagKey: 'stage.ring.tag',
    shortKey: 'stage.ring.short',
    theme: 'ring',
    checkpoint: 'boss',
    endless: undefined,
    build: buildRingStage,
  },
  {
    id: 'orbit',
    order: 2,
    nameKey: 'stage.orbit.name',
    descKey: 'stage.orbit.desc',
    tagKey: 'stage.orbit.tag',
    shortKey: 'stage.orbit.short',
    theme: 'orbit',
    checkpoint: 'finale',
    endless: undefined,
    build: buildOrbitStage,
  },
  {
    id: 'loop',
    order: 3,
    nameKey: 'stage.loop.name',
    descKey: 'stage.loop.desc',
    tagKey: 'stage.loop.tag',
    shortKey: 'stage.loop.short',
    theme: 'prism',
    checkpoint: 'cycle',
    endless: true,
    build: buildLoopStage,
  },
]

export const STAGE_INFO: Record<StageId, StageInfo> = {
  ring: STAGES[0],
  orbit: STAGES[1],
  loop: STAGES[2],
}

export function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && value in STAGE_INFO
}

/** Resolve any stored id to a stage, falling back to the first stage. */
export function stageInfo(id: unknown): StageInfo {
  return isStageId(id) ? STAGE_INFO[id] : STAGES[0]
}

export function buildStage(id: StageId): Timeline<Director> {
  return STAGE_INFO[id].build()
}
