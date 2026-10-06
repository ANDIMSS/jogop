import type { TimelineBuilder } from '../engine/timeline'
import type { Director } from './director'
import type { FirePattern } from './enemies'

/**
 * Formation fragments shared by every stage: small functions that insert a readable enemy pattern
 * at the timeline cursor. They only use Director verbs, so a stage can be re-paced (or a new stage
 * authored) without touching gameplay code.
 */
export type B = TimelineBuilder<Director>

/** A line of drones that snakes in from one side, crosses the lane and leaves the other way. */
export const snake = (side: number, fire: FirePattern = 'none', count = 6, y = 4) => (b: B) =>
  b.every(0.3, count, d =>
    d.spawn({ kind: 'mite', motion: 'swoop', p0: [side * 38, y, -78], p1: [-side * 4, y - 7, -44], p2: [-side * 42, y + 3, -34], duration: 5.4, fire, fireDelay: 1.4 + Math.random(), heat: 0.85 }),
  )

/** Five drones in a V that pushes straight at the player. */
export const vee = (cx: number, cy: number, fire: FirePattern = 'none') => (b: B) =>
  b.call(d => {
    const off = [[-6, 3], [-3, 1.5], [0, 0], [3, 1.5], [6, 3]]
    for (const [i, [dx, dy]] of off.entries()) {
      d.spawn({ kind: 'mite', motion: 'swoop', p0: [cx + dx, cy + dy + 16, -135], p1: [cx + dx * 1.3, cy + dy, -44], p2: [cx + dx * 3.2, cy + dy - 26, 6], duration: 5.8 + i * 0.05, fire, fireDelay: 1.2 + i * 0.25, heat: 0.9 })
    }
  })

/** Eight drones released around a circle, curling inward and back out. */
export const spiral = (fire: FirePattern = 'none') => (b: B) =>
  b.every(0.18, 8, (d, i) => {
    const a = (i / 8) * Math.PI * 2
    d.spawn({ kind: 'mite', motion: 'swoop', p0: [Math.cos(a) * 32, Math.sin(a) * 20, -92], p1: [Math.cos(a + 1.3) * 7, Math.sin(a + 1.3) * 4, -42], p2: [Math.cos(a + 2.7) * 38, Math.sin(a + 2.7) * 24, -22], duration: 5.2, fire, fireDelay: 1.5 })
  })

/** Drones that overtake the player from behind, weaving as they pass. */
export const overtake = (fire: FirePattern = 'none', count = 6) => (b: B) =>
  b.every(0.22, count, (d, i) => {
    const side = i % 2 ? 1 : -1
    const x = side * (3 + (i % 3) * 2.2)
    const y = -2 + (i % 3) * 2
    d.spawn({ kind: 'mite', motion: 'swoop', p0: [x * 1.6, y - 3, 18], p1: [x * 0.7, y + 1, -26], p2: [x * 2.4, y + 8, -118], duration: 5, fire, fireDelay: 1.6 })
  })

/** A heavy cutter that flies in, holds its station and fires. */
export const chisel = (x: number, y: number, fire: FirePattern, hold = 4.5, drop = false) => (d: Director) =>
  d.spawn({ kind: 'chisel', motion: 'hold', p0: [x * 3, y + 20, -115], p1: [x, y, -46], p2: [x * 4, y + 26, -85], hold, fire, fireDelay: 0.3, drop })

/** A gunship that parks behind the lane and cycles its pattern. */
export const lantern = (x: number, y: number, fire: FirePattern = 'spiral', hold = 7) => (d: Director) =>
  d.spawn({ kind: 'lantern', motion: 'hold', p0: [x, y + 32, -125], p1: [x, y, -56], p2: [x, y - 40, -95], hold, fire, fireDelay: 0.2, drop: true })
