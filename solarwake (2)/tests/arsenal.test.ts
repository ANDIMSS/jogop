import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import { parseSave, defaultSave } from '../src/engine/save'
import {
  DEFAULT_SHIP, DEFAULT_WEAPON, MAX_LEVEL, SHIP_IDS, WEAPON_IDS, buyShip, buyWeapon, earn,
  equipShip, equipWeapon, loadoutOf, nextWeaponCost, ownsShip, ownsWeapon, rewardsFor, shipRules,
  shipSpec, weaponDef, weaponLevel, weaponStats, type Loadout,
} from '../src/game/arsenal'
import { CONFIG } from '../src/game/config'
import { createRun, hurt } from '../src/game/rules'

const DICT: Record<string, string>[] = [en as Record<string, string>, zh as Record<string, string>]

/** A wallet with plenty of credits, the starter kit included. */
const rich = (credits = 500000): Loadout => ({ ...loadoutOf(), credits })

describe('weapon catalogue', () => {
  it('lists five weapons and four hulls with unique ids', () => {
    expect(WEAPON_IDS).toHaveLength(5)
    expect(SHIP_IDS).toHaveLength(4)
    expect(new Set(WEAPON_IDS).size).toBe(WEAPON_IDS.length)
    expect(new Set(SHIP_IDS).size).toBe(SHIP_IDS.length)
    expect(WEAPON_IDS).toContain(DEFAULT_WEAPON)
    expect(SHIP_IDS).toContain(DEFAULT_SHIP)
  })

  it('every weapon scales up with its level and stays inside the price ladder', () => {
    for (const id of WEAPON_IDS) {
      const def = weaponDef(id)
      expect(def.upgrades).toHaveLength(MAX_LEVEL - 1)
      expect(def.upgrades.every(c => c > 0)).toBe(true)
      expect(def.price).toBeGreaterThanOrEqual(0)
      // The starter trigger is the free one.
      if (id === DEFAULT_WEAPON) expect(def.price).toBe(0)
      else expect(def.price).toBeGreaterThan(0)
      for (let level = 1; level <= MAX_LEVEL; level += 1) {
        const a = weaponStats(id, level)
        const b = weaponStats(id, Math.min(MAX_LEVEL, level + 1))
        expect(a.damage).toBeGreaterThan(0)
        expect(a.rate).toBeGreaterThan(0)
        expect(a.speed).toBeGreaterThan(0)
        expect(a.life).toBeGreaterThan(0)
        expect(a.count).toBeGreaterThanOrEqual(1)
        if (level < MAX_LEVEL) {
          expect(b.damage).toBeGreaterThan(a.damage)
          expect(b.rate).toBeGreaterThan(a.rate)
          expect(b.count).toBeGreaterThanOrEqual(a.count)
        }
      }
      // Levels clamp instead of throwing.
      expect(weaponStats(id, 0)).toEqual(weaponStats(id, 1))
      expect(weaponStats(id, 99)).toEqual(weaponStats(id, MAX_LEVEL))
    }
  })

  it('gives each weapon a distinct behaviour: spread, pierce, homing or splash', () => {
    expect(weaponStats('pulse', 1).count).toBe(1)
    expect(weaponStats('pulse', MAX_LEVEL).count).toBe(2)
    expect(weaponStats('scatter', 1).count).toBeGreaterThan(4)
    expect(weaponStats('scatter', 1).spread).toBeGreaterThan(0.1)
    expect(weaponStats('lance', 1).pierce).toBeGreaterThan(0)
    expect(weaponStats('lance', MAX_LEVEL).pierce).toBeGreaterThan(weaponStats('lance', 1).pierce)
    expect(weaponStats('swarm', 1).homing).toBeGreaterThan(0)
    expect(weaponStats('rail', 1).splash).toBeGreaterThan(0)
    expect(weaponStats('rail', 1).damage).toBeGreaterThan(weaponStats('pulse', 1).damage * 5)
    // Every trigger has its own voice and its own palette.
    expect(new Set(WEAPON_IDS.map(id => weaponStats(id, 3).sfx)).size).toBe(WEAPON_IDS.length)
    expect(new Set(WEAPON_IDS.map(id => weaponStats(id, 3).kind)).size).toBe(WEAPON_IDS.length)
  })

  it('keeps every weapon and hull string in both languages', () => {
    for (const id of WEAPON_IDS) {
      const def = weaponDef(id)
      for (const key of [def.nameKey, def.descKey, def.tagKey]) {
        for (const dict of DICT) expect(dict[key], `missing i18n key ${key}`).toBeTypeOf('string')
      }
    }
    for (const id of SHIP_IDS) {
      const spec = shipSpec(id)
      for (const key of [spec.nameKey, spec.descKey, spec.tagKey]) {
        for (const dict of DICT) expect(dict[key], `missing i18n key ${key}`).toBeTypeOf('string')
      }
    }
  })
})

describe('hangar purchases', () => {
  it('unlocks a locked weapon, deducts the price and equips it', () => {
    const l = rich(10000)
    const { loadout, result } = buyWeapon(l, 'scatter')
    expect(result).toBe('bought')
    expect(loadout.credits).toBe(10000 - weaponDef('scatter').price)
    expect(weaponLevel(loadout, 'scatter')).toBe(1)
    expect(loadout.weapon).toBe('scatter')
  })

  it('refuses a purchase the wallet cannot cover, leaving the kit untouched', () => {
    const l: Loadout = { ...loadoutOf(), credits: 10 }
    const { loadout, result } = buyWeapon(l, 'rail')
    expect(result).toBe('poor')
    expect(loadout).toBe(l)
    expect(ownsWeapon(loadout, 'rail')).toBe(false)
  })

  it('walks a weapon up the ladder to the top level and then stops', () => {
    let l = rich()
    const costs: number[] = []
    // One unlock plus MAX_LEVEL - 1 upgrades reaches the top of the ladder.
    for (let i = 0; i < MAX_LEVEL; i += 1) {
      const cost = nextWeaponCost(l, 'lance')
      costs.push(cost!)
      const { loadout, result } = buyWeapon(l, 'lance')
      expect(result).toBe(i === 0 ? 'bought' : 'upgraded')
      l = loadout
    }
    expect(weaponLevel(l, 'lance')).toBe(MAX_LEVEL)
    expect(nextWeaponCost(l, 'lance')).toBeNull()
    // The unlock is the expensive step; the upgrade steps after it only go up.
    expect(costs[0]).toBe(weaponDef('lance').price)
    expect(costs.slice(1)).toEqual([...costs.slice(1)].sort((a, b) => a - b))
    expect(costs.slice(1)).toEqual([...weaponDef('lance').upgrades])
    const spent = costs.reduce((a, b) => a + b, 0)
    expect(spent).toBe(weaponDef('lance').price + weaponDef('lance').upgrades.reduce((a, b) => a + b, 0))
    expect(l.credits).toBe(rich().credits - spent)
    // A maxed weapon can still be re-equipped, but never charges again.
    const again = buyWeapon(equipWeapon(l, 'pulse'), 'lance')
    expect(again.result).toBe('equipped')
    expect(again.loadout.credits).toBe(l.credits)
  })

  it('sells hulls once, then only equips them', () => {
    const l = rich(30000)
    const bought = buyShip(l, 'kite')
    expect(bought.loadout.credits).toBe(30000 - shipSpec('kite').price)
    expect(ownsShip(bought.loadout, 'kite')).toBe(true)
    // Buying it again is refused, but equipping it works.
    expect(buyShip(bought.loadout, 'kite').result).toBe('max')
    expect(equipShip(bought.loadout, 'kite').ship).toBe('kite')
    // The starter hull is owned from the first launch, costs nothing and can never be bought twice.
    expect(ownsShip(l, DEFAULT_SHIP)).toBe(true)
    const starter = buyShip(l, DEFAULT_SHIP)
    expect(starter.result).toBe('max')
    expect(starter.loadout.credits).toBe(l.credits)
  })

  it('never equips something that is not owned', () => {
    const l = loadoutOf()
    expect(equipWeapon(l, 'rail').weapon).toBe(DEFAULT_WEAPON)
    expect(equipShip(l, 'bastion').ship).toBe(DEFAULT_SHIP)
  })

  it('pays a run into the wallet at a fifth of the score', () => {
    expect(rewardsFor(0)).toBe(0)
    expect(rewardsFor(86_320)).toBe(17_264)
    expect(earn(loadoutOf(), 1000).credits).toBe(200)
    expect(earn({ ...loadoutOf(), credits: 500 }, 1000).credits).toBe(700)
  })
})

describe('hull stats', () => {
  it('trades armour, shields and speed between hulls', () => {
    const base = shipSpec(DEFAULT_SHIP)
    const vesper = shipSpec('vesper')
    const bastion = shipSpec('bastion')
    const kite = shipSpec('kite')
    expect(vesper.speed).toBeGreaterThan(base.speed)
    expect(vesper.hull).toBeLessThan(base.hull)
    expect(bastion.hull).toBeGreaterThan(base.hull * 1.5)
    expect(bastion.speed).toBeLessThan(base.speed)
    expect(kite.shield).toBeGreaterThan(base.shield * 1.5)
    expect(kite.grazeRadius).toBeGreaterThan(base.grazeRadius)
    for (const id of SHIP_IDS) {
      const spec = shipSpec(id)
      expect(spec.scale).toBeGreaterThan(0)
      expect(spec.hitRadius).toBeGreaterThan(0)
      // Cheaper hulls are never strictly better than the one you start with.
      if (id !== DEFAULT_SHIP) expect(spec.price).toBeGreaterThan(0)
    }
  })

  it('builds run rules from the hull without touching the rest of the config', () => {
    const rules = shipRules('bastion')
    expect(rules.hull.max).toBe(shipSpec('bastion').hull)
    expect(rules.shield.max).toBe(shipSpec('bastion').shield)
    expect(rules.score).toEqual(CONFIG.score)
    expect(rules.combo).toEqual(CONFIG.combo)
    expect(CONFIG.hull.max).toBe(100) // the shared config is never mutated
    // A run created with those rules starts with the hull's own pools and takes damage in them.
    const run = createRun(rules)
    expect(run.hull).toBe(shipSpec('bastion').hull)
    expect(run.shield).toBe(shipSpec('bastion').shield)
    // The same hit kills the starter hull and leaves the heavy one flying: the maxima are in force.
    const bare = { ...createRun(shipRules(DEFAULT_SHIP)), shield: 0 }
    expect(hurt(bare, 100, shipRules(DEFAULT_SHIP)).state.phase).toBe('lost')
    const tough = hurt({ ...run, shield: 0 }, 100, rules)
    expect(tough.state.phase).toBe('playing')
    expect(tough.state.hull).toBe(shipSpec('bastion').hull - 100)
  })
})

describe('loadout coercion', () => {
  it('always keeps the starter kit, even on junk input', () => {
    const l = loadoutOf({ credits: -50, weapons: { pulse: 0, bogus: 3, rail: 99 }, weapon: 'bogus', ships: ['nope'], ship: 'nope' })
    expect(l.credits).toBe(0)
    expect(weaponLevel(l, DEFAULT_WEAPON)).toBe(1)
    expect(weaponLevel(l, 'pulse')).toBe(1)
    expect(weaponLevel(l, 'rail')).toBe(MAX_LEVEL)
    expect(l.weapon).toBe(DEFAULT_WEAPON)
    expect(l.ships).toEqual([DEFAULT_SHIP])
    expect(l.ship).toBe(DEFAULT_SHIP)
  })

  it('keeps a valid kit and only equips what is owned', () => {
    const l = loadoutOf({ credits: 4200, weapons: { pulse: 3, swarm: 2 }, weapon: 'swarm', ships: ['vesper'], ship: 'vesper' })
    expect(l.credits).toBe(4200)
    expect(weaponLevel(l, 'pulse')).toBe(3)
    expect(weaponLevel(l, 'swarm')).toBe(2)
    expect(l.weapon).toBe('swarm')
    expect(l.ship).toBe('vesper')
    expect(l.ships).toEqual([DEFAULT_SHIP, 'vesper'])
    // Equipping an owned-but-locked weapon falls back to the default.
    expect(loadoutOf({ weapons: { pulse: 1 }, weapon: 'rail' }).weapon).toBe(DEFAULT_WEAPON)
  })

  it('round-trips the shop fields through the save parser', () => {
    const stored = JSON.stringify({ ...defaultSave(), credits: 12_345, weapons: { pulse: 4, lance: 2 }, weapon: 'lance', ships: ['vesper', 'kite'], ship: 'kite' })
    const data = parseSave(stored)
    expect(data.credits).toBe(12_345)
    expect(data.weapons).toEqual({ pulse: 4, lance: 2 })
    expect(data.weapon).toBe('lance')
    expect(data.ships).toEqual(['vesper', 'kite'])
    expect(data.ship).toBe('kite')
    // Junk is dropped rather than trusted.
    const dirty = parseSave(JSON.stringify({ ...defaultSave(), credits: -3, weapons: { pulse: 'lots' }, ships: ['BAD ID', 'vesper'], ship: '../etc' }))
    expect(dirty.credits).toBe(0)
    expect(dirty.weapons).toEqual({})
    expect(dirty.ships).toEqual(['vesper'])
    expect(dirty.ship).toBe('')
    expect(loadoutOf(dirty).ship).toBe(DEFAULT_SHIP)
  })

  it('hands out the default kit on a fresh save', () => {
    const l = loadoutOf(defaultSave())
    expect(l.credits).toBe(0)
    expect(weaponLevel(l, DEFAULT_WEAPON)).toBe(1)
    expect(l.weapon).toBe(DEFAULT_WEAPON)
    expect(l.ship).toBe(DEFAULT_SHIP)
    expect(WEAPON_IDS.filter(id => ownsWeapon(l, id))).toEqual([DEFAULT_WEAPON])
    // Default hull, default weapon: the numbers the game shipped with.
    expect(shipSpec(DEFAULT_SHIP).hull).toBe(CONFIG.hull.max)
    expect(shipSpec(DEFAULT_SHIP).shield).toBe(CONFIG.shield.max)
    expect(weaponStats(DEFAULT_WEAPON, 1).rate).toBe(CONFIG.weapon.rate)
    expect(weaponStats(DEFAULT_WEAPON, 1).damage).toBe(CONFIG.weapon.damage)
  })
})
