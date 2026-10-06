import { TimelineBuilder, type Timeline } from '../engine/timeline'
import type { Director } from './director'
import type { FirePattern } from './enemies'
import { kestrels, shardDrift, shards, type B } from './formations'

/**
 * Stage 3 "Continuous Loop". A meditation piece: one glass ribbon undulating in zero gravity over
 * an obsidian void, a locked camera, and very little else. The timeline is authored as a loop and
 * never ends — there is no boss and no clear; the run lasts as long as the pilot does.
 */

/** Slow, wide swoops: drones that cross the ribbon at a drifting pace. */
const drift = (side: number, fire: FirePattern = 'none', count = 5) => (b: B) =>
  b.every(0.44, count, (d, i) =>
    d.spawn({
      kind: 'mite', motion: 'swoop',
      p0: [side * 30, -1.5 + (i % 3) * 1.6, -72],
      p1: [side * 6, -0.5 + (i % 2) * 0.8, -50],
      p2: [-side * 26, 2.2 - (i % 3) * 1.2, -34],
      duration: 7.4, fire, fireDelay: 2.4 + Math.random() * 1.2, heat: 0.78,
    }),
  )

/** A gunship parked in the distance, firing slowly: pressure without noise. */
const sentinel = (x: number, y: number) => (d: Director) =>
  d.spawn({ kind: 'lantern', motion: 'hold', p0: [x, y + 26, -130], p1: [x, y, -62], p2: [x, y - 30, -110], hold: 9, fire: 'fan3', fireDelay: 1.6, heat: 0.8, drop: true })

/** Two cutters holding a wide line across the ribbon. */
const chiselPair = () => (d: Director) => {
  d.spawn({ kind: 'chisel', motion: 'hold', p0: [-24, 8, -120], p1: [-11, 2.5, -58], p2: [-26, 10, -100], hold: 6, fire: 'ring', fireDelay: 1.2, heat: 0.85 })
  d.spawn({ kind: 'chisel', motion: 'hold', p0: [24, -8, -120], p1: [11, -2.5, -58], p2: [26, -10, -100], hold: 6, fire: 'fan3', fireDelay: 1.2, heat: 0.85 })
}

/** A thread of mines that floats up through the ribbon. */
const threads = (count = 5) => (b: B) =>
  b.every(0.62, count, (d, i) =>
    d.spawn({ kind: 'mine', motion: 'drift', p0: [-7 + i * 3.5, -3 + (i % 2) * 2, -160], vel: [0, 0, 17], duration: 8 }),
  )

export function buildLoopStage(): Timeline<Director> {
  const b = new TimelineBuilder<Director>()
  // The whole script rewinds every cycle; these latches keep the opening beat a one-off, and the
  // cycle banner shows once instead of shouting at the pilot on every pass.
  let cycles = 0
  let opened = false

  b.label('intro')
    .call(d => {
      if (opened) return
      opened = true
      d.setTheme('prism')
      d.setCamera('glass')
      d.setMusic('loop')
      d.setRail('cruise')
      d.letterbox(true)
      d.banner('stage3.title', 'stage3.sub', 'phase')
      d.cue('cue.ribbon')
    })
    .wait(5.4)
    .call(d => {
      if (cycles > 0) return
      d.letterbox(false)
      d.cinematic('none')
      d.tutorialFinished()
    })
    .wait(4.6)

  b.label('cycle')
    .call(d => {
      d.setMusic('loop')
      if (cycles++ === 0) d.banner('loop.cycle.title', 'loop.cycle.sub', 'phase')
      else d.cue('cue.ribbon')
    })
    // Long stretches of nothing: the ribbon does the flying.
    .wait(9)
    .call(d => {
      d.setMusic('loopTide')
      d.cue('cue.drift')
    })
    .use(drift(-1, 'none', 6))
    .wait(3)
    .use(drift(1, 'aimed', 5))
    .wait(4)
    .use(shardDrift(3))
    .wait(5)
    .gate(d => d.hostiles() === 0, 16)
    .call(d => d.setMusic('loop'))
    .wait(8)
    .call(d => {
      d.setMusic('loopTide')
      d.cue('cue.sentinel')
    })
    .call(sentinel(-12, 3))
    .call(sentinel(13, -2))
    .wait(5)
    .use(threads(6))
    .wait(4)
    .use(drift(-1, 'fan3', 4))
    .wait(5)
    .gate(d => d.hostiles() === 0, 22)
    .call(d => d.setMusic('loop'))
    .wait(6)
    .call(d => {
      d.setMusic('loopTide')
      d.cue('cue.shard')
    })
    .call(chiselPair())
    .use(shards(4, 'aimed', -1, 2))
    .wait(4)
    .use(shardDrift(4))
    .wait(7)
    .use(drift(1, 'burst', 4))
    .use(kestrels(3, 'burst', -4))
    .wait(8)
    .gate(d => d.hostiles() === 0, 20)
    .call(d => d.setMusic('loop'))
    .wait(5)
    // A last wing crosses in silence, then the void gets its long rest again.
    .call(d => d.setMusic('loopTide'))
    .use(shards(3, 'none', 1, -3))
    .wait(6)
    .use(kestrels(4, 'aimed', 5))
    .wait(9)
    .gate(d => d.hostiles() === 0, 16)
    .call(d => d.setMusic('loop'))
    .wait(5)
    // ...and around again.
  return b.build({ loop: true })
}

