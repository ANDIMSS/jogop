import { Eases, TimelineBuilder, type Timeline } from '../engine/timeline'
import type { Director } from './director'
import { chisel, lantern, overtake, snake, spiral, vee, type B } from './formations'

/**
 * Stage 2 "Earth Orbit". Same engine, different planet: the whole backdrop is swapped through the
 * Director (`setTheme`), the debris belt skips the gas giant for a real Kessler field, and the
 * middle act grazes the atmosphere (`atmosphere`) before a blockade finale instead of a boss.
 * Nothing here knows how the scene renders any of it.
 */

/** A wall of orbital platforms: two cutters that hold their line and fire downward. */
const platforms = (fire: 'ring' | 'fan5' | 'burst' = 'ring') => (d: Director) => {
  d.spawn({ kind: 'chisel', motion: 'hold', p0: [-26, 12, -120], p1: [-9, 3.5, -52], p2: [-30, 16, -96], hold: 5, fire, fireDelay: 0.4, drop: true })
  d.spawn({ kind: 'chisel', motion: 'hold', p0: [26, -12, -120], p1: [9, -3.5, -52], p2: [30, -16, -96], hold: 5, fire, fireDelay: 0.4, drop: true })
}

/** A vertical dragnet of mines that the player has to thread. */
const dragnet = (count = 5, gap = 0) => (b: B) =>
  b.every(0.34, count, (d, i) => {
    const side = i % 2 ? 1 : -1
    d.spawn({ kind: 'mine', motion: 'drift', p0: [side * (5 - i) + gap, side * (2 + i * 0.7), -150], vel: [0, 0, 26], duration: 6 })
  })

/** Junk thrown from the planet below: debris that climbs up through the lane. */
const updraft = (count = 6) => (b: B) =>
  b.every(0.16, count, d => d.rock(false, Math.random() < 0.35 ? 'player' : 'random'))

export function buildOrbitStage(): Timeline<Director> {
  const b = new TimelineBuilder<Director>()

  b.label('intro')
    .call(d => {
      d.setTheme('orbit')
      d.setMusic('orbit')
      d.setRail('cruise')
      d.letterbox(true)
      d.cinematic('launch')
      d.banner('stage2.title', 'stage2.sub', 'phase')
    })
    .wait(3.6)
    .call(d => {
      d.letterbox(false)
      d.cinematic('none')
      d.tutorialFinished()
    })
    .wait(1.4)

  b.label('wake')
    .call(d => d.cue('cue.orbit'))
    .use(snake(-1))
    .wait(2.0)
    .use(snake(1))
    .wait(2.6)
    .use(vee(0, 2, 'aimed'))
    .wait(3.2)
    .call(platforms('burst'))
    .wait(3.4)
    .call(lantern(0, 6, 'fan3', 5))
    .wait(1.2)
    .use(spiral('aimed'))
    .wait(3.0)
    .gate(d => d.hostiles() === 0, 9)
    .wait(0.8)

  b.label('kessler')
    .call(d => {
      d.banner('kessler.title', 'kessler.sub', 'warning')
      d.setRail('boost')
      d.setMusic('debris')
    })
    .wait(1.2)
  const junkStart = b.time
  b.every(0.24, 44, (d, i) => {
    d.rock(i % 8 === 3, i % 5 === 0 ? 'player' : 'random')
    if (i % 2) d.rock(false)
    if (i % 10 === 4) d.mine()
  })
  const junkEnd = b.time
  // Harmless drift formations layered over the field: free chain fuel.
  b.at(junkStart + 4)
    .use(snake(-1, 'none', 6, 6))
    .wait(3.2)
    .use(vee(11, -2, 'none'))
    .at(junkEnd + 1.4)
    .call(d => d.setRail('cruise'))
    .wait(2.0)

  b.label('skip')
    .call(d => {
      d.banner('skip.title', 'skip.sub', 'warning')
      d.setRail('boost')
      d.setMusic('skip')
      d.cue('cue.atmo')
    })
    .wait(0.8)
  // The burn in: the sky warms up over nine seconds while the lane keeps fighting back.
  const skipStart = b.time
  b.tween(6.4, (d, t) => d.atmosphere(1 - t * 0.55), { ease: Eases.inQuad, advance: true })
    .tween(2.6, (d, t) => d.atmosphere(0.45 * (1 - t)), { ease: Eases.outQuad, advance: true })
  b.at(skipStart + 1.0)
    .use(spiral('none'))
    .at(skipStart + 3.8)
    .call(chisel(-8, 4, 'fan3'))
    .call(chisel(8, -3, 'fan3'))
    .at(skipStart + 4.6)
    .call(lantern(-11, 2, 'spiral', 5))
    .at(skipStart + 9.0)
    .call(d => {
      d.setRail('cruise')
      d.banner('blockade.title', 'blockade.sub', 'phase')
      d.setMusic('battle')
    })
    .wait(1.6)

  b.label('blockade')
    .call(platforms('ring'))
    .wait(3.0)
    .call(lantern(0, 1, 'ring', 7))
    .use(dragnet(4, 3))
    .wait(3.4)
    .use(overtake('burst', 8))
    .wait(3.2)
    .use(spiral('aimed'))
    .use(updraft(5))
    .wait(3.6)
    .call(lantern(-10, 4, 'spiral', 6))
    .call(lantern(10, -3, 'fan5', 6))
    .wait(3.0)
    .use(snake(-1, 'aimed', 7, 5))
    .wait(1.2)
    .use(snake(1, 'aimed', 7, -4))
    .wait(3.0)
    .call(chisel(-7, -2, 'burst'))
    .call(chisel(7, 5, 'burst', 5, true))
    .call(d => d.cue('cue.roll'))
    .wait(3.6)
    .gate(d => d.hostiles() === 0, 20)
    .wait(1.2)

  b.label('finale')
    .call(d => {
      d.checkpointHere('finale')
      d.setRail('cruise')
      d.setMusic('none')
      d.warning(true)
      d.banner('warning.title', 'warning.sub', 'warning')
    })
    .wait(3.6)
    .call(d => {
      d.warning(false)
      d.banner('finale.title', 'finale.sub', 'phase')
      d.setMusic('meltdown')
    })
    .wait(1.6)
    // Wave A: the sky fills with scouts.
    .use(snake(-1, 'aimed', 7, 6))
    .wait(1.0)
    .use(snake(1, 'aimed', 7, -4))
    .wait(1.2)
    .use(vee(0, 3, 'fan3'))
    .wait(4.0)
    // Wave B: the platforms come back, heavier.
    .call(platforms('fan5'))
    .call(lantern(0, 0, 'spiral', 7))
    .wait(2.0)
    .call(chisel(0, 7, 'ring', 5, true))
    .wait(3.4)
    // Wave C: mines, junk and a spiral at once.
    .use(dragnet(5))
    .use(spiral('burst'))
    .use(updraft(4))
    .wait(4.2)
    .use(overtake('aimed', 10))
    .wait(3.4)
    // Wave D: everything the blockade has left.
    .call(lantern(-11, 4, 'ring', 6))
    .call(lantern(11, -2, 'spiral', 6))
    .wait(1.0)
    .use(vee(0, 7, 'aimed'))
    .wait(0.8)
    .use(vee(0, -6, 'ring'))
    .wait(4.6)
    .gate(d => d.hostiles() === 0, 26)
    .wait(1.0)

  // Escape burn: the lane opens and the interceptor rides the atmosphere out.
  b.label('breakout')
    .call(d => {
      d.banner('breakout.title', 'breakout.sub', 'clear')
      d.setMusic('victory')
      d.setRail('boost')
      d.letterbox(true)
      d.atmosphere(0.35)
      d.cue('cue.breakout')
    })
    .wait(0.6)
  const outStart = b.time
  b.tween(4.4, (d, t) => d.atmosphere(0.35 * (1 - t)), { ease: Eases.outQuad, advance: true })
  b.at(outStart + 0.4)
    .use(snake(-1, 'none', 5, 7))
    .at(outStart + 1.6)
    .use(snake(1, 'none', 5, -6))
    .at(outStart + 4.4)
    .wait(1.4)
    .call(d => {
      d.letterbox(false)
      d.clear()
    })
    .label('clear')
  return b.build()
}
