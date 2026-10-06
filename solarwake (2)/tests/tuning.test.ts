import { describe, expect, it } from 'vitest'
import { CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const reset = () => {
  const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))
  tuning.apply(defaults)
  tuning.activate('run')
}

describe('Solarwake tuning', () => {
  it('validates values and commits live flight changes atomically', () => {
    reset()
    const before = tuning.read()
    expect(() => tuning.apply({ 'ship.speed': 999 })).toThrow()
    expect(tuning.read()).toEqual(before)
    tuning.apply({ 'ship.speed': 20, 'weapon.rate': 15 })
    expect(CONFIG.ship.speed).toBe(20)
    expect(CONFIG.weapon.rate).toBe(15)
    expect(tuning.unranked).toBe(true)
  })

  it('applies rail pacing only at the next run boundary', () => {
    reset()
    const baseline = CONFIG.rail.speed
    tuning.apply({ 'rail.speed': 51 })
    expect(CONFIG.rail.speed).toBe(baseline)
    tuning.activate('run')
    expect(CONFIG.rail.speed).toBe(51)
    expect(tuning.unranked).toBe(true)
    reset()
  })
})
