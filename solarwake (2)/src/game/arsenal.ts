import { CONFIG } from './config'

/**
 * The hangar's rule book: weapons, hulls, prices and the purchases that move between them. Pure
 * data and pure functions — no three.js, no DOM — so the shop, the save file and the unit tests all
 * read the same numbers the flight model uses.
 *
 * Every weapon scales with its level (1..5) along its own curve instead of one generic multiplier:
 * the driver grows a second barrel, the cloud adds pellets, the lance adds penetrations, the pods
 * add missiles and the slug adds punch and splash.
 */
export type WeaponId = 'pulse' | 'scatter' | 'lance' | 'swarm' | 'rail'
export type ShipId = 'heliospur' | 'vesper' | 'bastion' | 'kite'

export const WEAPON_IDS: readonly WeaponId[] = ['pulse', 'scatter', 'lance', 'swarm', 'rail']
export const SHIP_IDS: readonly ShipId[] = ['heliospur', 'vesper', 'bastion', 'kite']
export const MAX_LEVEL = 5

export const DEFAULT_WEAPON: WeaponId = 'pulse'
export const DEFAULT_SHIP: ShipId = 'heliospur'

/** Shot shapes: the flight model and the renderer both switch on these. */
export type ShotKind = 'bolt' | 'pellet' | 'lance' | 'missile' | 'slug'

/** Everything the trigger needs for one pull, already scaled by the weapon's level. */
export type WeaponStats = {
  /** Damage per projectile. */
  damage: number
  /** Trigger pulls per second. */
  rate: number
  /** Muzzle speed (units/s). */
  speed: number
  /** Seconds of travel before the projectile expires. */
  life: number
  /** Projectiles per pull. */
  count: number
  /** Cone half-angle for multi-shot weapons (radians). */
  spread: number
  /** Extra enemies a projectile passes through (0 = stops on the first). */
  pierce: number
  /** Turn rate towards the nearest hostile (radians/s); 0 = dumb fire. */
  homing: number
  /** Blast radius on impact (0 = none). */
  splash: number
  /** Damage dealt inside `splash`, as a fraction of the direct hit. */
  splashRatio: number
  /** Camera kick per pull, in the impact-toolkit's units. */
  kick: number
  /** Visual radius of the projectile. */
  size: number
  color: string
  glow: string
  kind: ShotKind
  /** Sound-effect name registered in `audio-content.ts`. */
  sfx: string
}

export type WeaponDef = {
  id: WeaponId
  nameKey: string
  descKey: string
  tagKey: string
  /** Credits to unlock. 0 = comes with the ship. */
  price: number
  /** Credits to go from level N to N+1, for N = 1..MAX_LEVEL-1. */
  upgrades: readonly number[]
  stats(level: number): WeaponStats
}

/** Linear growth helper: `base` at level 1, `per` extra per level after that. */
const grow = (base: number, per: number, level: number) => base * (1 + per * (level - 1))
const clampLevel = (level: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(level)))

const WEAPONS: Record<WeaponId, WeaponDef> = {
  // Twin-linked baseline driver: the most reliable trigger in the hangar, and the cheapest to max.
  pulse: {
    id: 'pulse',
    nameKey: 'weapon.pulse.name',
    descKey: 'weapon.pulse.desc',
    tagKey: 'weapon.pulse.tag',
    price: 0,
    upgrades: [1200, 2600, 5200, 9000],
    stats: level => {
      const l = clampLevel(level)
      return {
        damage: grow(1, 0.09, l),
        rate: grow(CONFIG.weapon.rate, 0.03, l),
        speed: CONFIG.weapon.speed,
        life: CONFIG.weapon.range / CONFIG.weapon.speed,
        count: l >= MAX_LEVEL ? 2 : 1,
        spread: 0.014,
        pierce: 0,
        homing: 0,
        splash: 0,
        splashRatio: 0,
        kick: 0.012,
        size: 0.16,
        color: '#ffe3a0',
        glow: '#ff9a3a',
        kind: 'bolt',
        sfx: 'shoot',
      }
    },
  },
  // Shotgun: a wide cloud of hot pellets. Devastating point-blank, useless at range.
  scatter: {
    id: 'scatter',
    nameKey: 'weapon.scatter.name',
    descKey: 'weapon.scatter.desc',
    tagKey: 'weapon.scatter.tag',
    price: 3500,
    upgrades: [2000, 4000, 7500, 12000],
    stats: level => {
      const l = clampLevel(level)
      return {
        damage: grow(0.55, 0.22, l),
        rate: grow(2.6, 0.09, l),
        speed: 210,
        life: 0.55,
        count: 5 + l,
        spread: 0.3,
        pierce: 0,
        homing: 0,
        splash: 0,
        splashRatio: 0,
        kick: 0.05,
        size: 0.13,
        color: '#ffd08a',
        glow: '#ff8a2a',
        kind: 'pellet',
        sfx: 'shootScatter',
      }
    },
  },
  // Needle beam: thin, fast and it goes straight through a line of hulls.
  lance: {
    id: 'lance',
    nameKey: 'weapon.lance.name',
    descKey: 'weapon.lance.desc',
    tagKey: 'weapon.lance.tag',
    price: 6000,
    upgrades: [2800, 5200, 9000, 15000],
    stats: level => {
      const l = clampLevel(level)
      return {
        damage: grow(2.2, 0.33, l),
        rate: grow(3.4, 0.06, l),
        speed: 420,
        life: 0.75,
        count: 1,
        spread: 0,
        pierce: [1, 2, 2, 3, 4][l - 1],
        homing: 0,
        splash: 0,
        splashRatio: 0,
        kick: 0.022,
        size: 0.1,
        color: '#9df4ff',
        glow: '#4fe3ff',
        kind: 'lance',
        sfx: 'shootLance',
      }
    },
  },
  // Pods that empty a volley of seekers: low damage, but they rarely miss.
  swarm: {
    id: 'swarm',
    nameKey: 'weapon.swarm.name',
    descKey: 'weapon.swarm.desc',
    tagKey: 'weapon.swarm.tag',
    price: 8000,
    upgrades: [3200, 6000, 10000, 16000],
    stats: level => {
      const l = clampLevel(level)
      return {
        damage: grow(0.7, 0.19, l),
        rate: grow(2.2, 0.09, l),
        speed: 150,
        life: 2.6,
        count: 2 + l,
        spread: 0.55,
        pierce: 0,
        homing: grow(2.6, 0.09, l),
        splash: 0,
        splashRatio: 0,
        kick: 0.018,
        size: 0.14,
        color: '#ffb0e0',
        glow: '#ff3d8e',
        kind: 'missile',
        sfx: 'shootSwarm',
      }
    },
  },
  // Charged slug: slow, enormous single hit with a blast around the impact.
  rail: {
    id: 'rail',
    nameKey: 'weapon.rail.name',
    descKey: 'weapon.rail.desc',
    tagKey: 'weapon.rail.tag',
    price: 14000,
    upgrades: [4500, 8000, 13000, 20000],
    stats: level => {
      const l = clampLevel(level)
      const damage = grow(9, 0.3, l)
      return {
        damage,
        rate: grow(0.85, 0.11, l),
        speed: 520,
        life: 1.2,
        count: 1,
        spread: 0,
        pierce: l >= 4 ? 1 : 0,
        homing: 0,
        splash: 3.2 + 0.5 * (l - 1),
        splashRatio: 0.45,
        kick: 0.09,
        size: 0.3,
        color: '#fff0c0',
        glow: '#ffd35c',
        kind: 'slug',
        sfx: 'shootRail',
      }
    },
  },
}

export type ShipSpec = {
  id: ShipId
  nameKey: string
  descKey: string
  tagKey: string
  /** Credits to buy. 0 = the ship you start with. */
  price: number
  /** Hull and shield the run starts with. */
  hull: number
  shield: number
  /** Steering: top speed, acceleration and how hard mouse aim drags the hull. */
  speed: number
  accel: number
  followRate: number
  /** Roll cooldown on top of CONFIG.roll.duration. */
  rollCooldown: number
  hitRadius: number
  grazeRadius: number
  /** Lateral offset of the gun muzzles. */
  gunOffset: number
  /** Visual scale of the model. */
  scale: number
  /** Wingtip trail colours (left, right) and the engine flame tint. */
  trail: [string, string]
  flame: string
}

const SHIPS: Record<ShipId, ShipSpec> = {
  heliospur: {
    id: 'heliospur',
    nameKey: 'ship.heliospur.name',
    descKey: 'ship.heliospur.desc',
    tagKey: 'ship.heliospur.tag',
    price: 0,
    hull: 100,
    shield: 60,
    speed: 16,
    accel: 90,
    followRate: 7.5,
    rollCooldown: 0.8,
    hitRadius: 0.55,
    grazeRadius: 1.6,
    gunOffset: 0.95,
    trail: ['#7ff6ff', '#ffb070'],
    flame: '#58d6ff',
    scale: 0.95,
  },
  vesper: {
    id: 'vesper',
    nameKey: 'ship.vesper.name',
    descKey: 'ship.vesper.desc',
    tagKey: 'ship.vesper.tag',
    price: 12000,
    hull: 72,
    shield: 88,
    speed: 21.5,
    accel: 118,
    followRate: 9.4,
    rollCooldown: 0.6,
    hitRadius: 0.5,
    grazeRadius: 1.45,
    gunOffset: 0.85,
    trail: ['#ff9ae8', '#7ff6ff'],
    flame: '#ff9ae8',
    scale: 0.88,
  },
  bastion: {
    id: 'bastion',
    nameKey: 'ship.bastion.name',
    descKey: 'ship.bastion.desc',
    tagKey: 'ship.bastion.tag',
    price: 18000,
    hull: 168,
    shield: 74,
    speed: 12.5,
    accel: 68,
    followRate: 5.6,
    rollCooldown: 1.05,
    hitRadius: 0.75,
    grazeRadius: 1.9,
    gunOffset: 1.35,
    trail: ['#ffc27a', '#ff6a4a'],
    flame: '#ff9a5c',
    scale: 1.22,
  },
  // Skirmisher: a shield far bigger than its hull, built for grazing.
  kite: {
    id: 'kite',
    nameKey: 'ship.kite.name',
    descKey: 'ship.kite.desc',
    tagKey: 'ship.kite.tag',
    price: 26000,
    hull: 92,
    shield: 118,
    speed: 18.5,
    accel: 100,
    followRate: 8.4,
    rollCooldown: 0.7,
    hitRadius: 0.52,
    grazeRadius: 1.95,
    gunOffset: 1.1,
    trail: ['#9dff5c', '#7ff6ff'],
    flame: '#b8ff7a',
    scale: 1,
  },
}

export const isWeaponId = (v: unknown): v is WeaponId => typeof v === 'string' && (WEAPON_IDS as readonly string[]).includes(v)
export const isShipId = (v: unknown): v is ShipId => typeof v === 'string' && (SHIP_IDS as readonly string[]).includes(v)

export const weaponDef = (id: WeaponId): WeaponDef => WEAPONS[id]
export const shipSpec = (id: ShipId): ShipSpec => SHIPS[id]

/** Trigger data for a weapon at a given level (clamped to 1..MAX_LEVEL). */
export const weaponStats = (id: WeaponId, level: number): WeaponStats => WEAPONS[id].stats(clampLevel(level))

/** Credits a finished run pays out: a fifth of the score, win or lose. */
export const rewardsFor = (score: number): number => Math.max(0, Math.round(score * 0.2))

// ─── the player's kit ───────────────────────────────────────────────────────

/** Strict view of the save's shop fields: unknown ids and levels are dropped on the way in. */
export type Loadout = {
  credits: number
  /** Weapon id → level; 0 or missing = locked. */
  weapons: Partial<Record<WeaponId, number>>
  weapon: WeaponId
  ships: ShipId[]
  ship: ShipId
}

export type LoadoutSource = {
  credits?: unknown
  weapons?: unknown
  weapon?: unknown
  ships?: unknown
  ship?: unknown
}

/** Coerce loosely-typed save data into a usable loadout: the starter kit is always available. */
export function loadoutOf(source: LoadoutSource = {}): Loadout {
  const credits = typeof source.credits === 'number' && Number.isFinite(source.credits) ? Math.max(0, Math.floor(source.credits)) : 0
  const weapons: Partial<Record<WeaponId, number>> = {}
  const rawWeapons = source.weapons && typeof source.weapons === 'object' ? (source.weapons as Record<string, unknown>) : {}
  for (const id of WEAPON_IDS) {
    const level = rawWeapons[id]
    if (typeof level === 'number' && Number.isFinite(level)) {
      const l = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)))
      if (l > 0) weapons[id] = l
    }
  }
  // The starter driver is never lost, even on a corrupt or foreign save.
  weapons[DEFAULT_WEAPON] = Math.max(1, weapons[DEFAULT_WEAPON] ?? 0)
  const ships = SHIP_IDS.filter(id => (Array.isArray(source.ships) ? (source.ships as unknown[]).includes(id) : id === DEFAULT_SHIP))
  if (!ships.includes(DEFAULT_SHIP)) ships.unshift(DEFAULT_SHIP)
  const weapon = isWeaponId(source.weapon) && (weapons[source.weapon] ?? 0) > 0 ? source.weapon : DEFAULT_WEAPON
  const ship = isShipId(source.ship) && ships.includes(source.ship) ? source.ship : DEFAULT_SHIP
  return { credits, weapons, weapon, ships, ship }
}

export const weaponLevel = (l: Loadout, id: WeaponId): number => l.weapons[id] ?? 0
export const ownsWeapon = (l: Loadout, id: WeaponId): boolean => weaponLevel(l, id) > 0
export const ownsShip = (l: Loadout, id: ShipId): boolean => l.ships.includes(id)

/** Cost of the next level, or null when the weapon is already maxed. */
export function nextWeaponCost(l: Loadout, id: WeaponId): number | null {
  const level = weaponLevel(l, id)
  if (level >= MAX_LEVEL) return null
  const def = WEAPONS[id]
  // Locked weapons pay the unlock price; owned ones pay the upgrade step (level 1 → index 0).
  return level === 0 ? def.price : def.upgrades[level - 1]
}

export type ShopResult = 'bought' | 'upgraded' | 'equipped' | 'poor' | 'max' | 'unknown'

/** Buy or upgrade a weapon, then equip it: the hangar's primary verb. */
export function buyWeapon(l: Loadout, id: WeaponId): { loadout: Loadout; result: ShopResult } {
  if (!isWeaponId(id)) return { loadout: l, result: 'unknown' }
  const cost = nextWeaponCost(l, id)
  if (cost === null) {
    if (l.weapon === id) return { loadout: l, result: 'max' }
    return { loadout: { ...l, weapon: id }, result: 'equipped' }
  }
  if (l.credits < cost) return { loadout: l, result: 'poor' }
  const level = weaponLevel(l, id)
  return {
    loadout: { ...l, credits: l.credits - cost, weapon: id, weapons: { ...l.weapons, [id]: level + 1 } },
    result: level === 0 ? 'bought' : 'upgraded',
  }
}

/** Buy a hull. Owning it does not equip it (the shop's EQUIP button does that separately). */
export function buyShip(l: Loadout, id: ShipId): { loadout: Loadout; result: ShopResult } {
  if (!isShipId(id)) return { loadout: l, result: 'unknown' }
  if (ownsShip(l, id)) return { loadout: l, result: 'max' }
  const spec = SHIPS[id]
  if (l.credits < spec.price) return { loadout: l, result: 'poor' }
  return { loadout: { ...l, credits: l.credits - spec.price, ships: [...l.ships, id] }, result: 'bought' }
}

export function equipWeapon(l: Loadout, id: WeaponId): Loadout {
  return ownsWeapon(l, id) ? { ...l, weapon: id } : l
}

export function equipShip(l: Loadout, id: ShipId): Loadout {
  return ownsShip(l, id) ? { ...l, ship: id } : l
}

/** Credits a run adds to the wallet (never negative, never fractional). */
export const earn = (l: Loadout, score: number): Loadout => ({ ...l, credits: l.credits + rewardsFor(score) })

/** Rules object for one hull: hull/shield maxima come from the ship, everything else from CONFIG. */
export function shipRules(id: ShipId, base: typeof CONFIG = CONFIG): typeof CONFIG {
  const spec = SHIPS[id]
  return { ...base, hull: { max: spec.hull }, shield: { ...base.shield, max: spec.shield } }
}
