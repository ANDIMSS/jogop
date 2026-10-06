import * as THREE from 'three'
import { InstancedBatch, ObjectPool } from '../engine/pool'
import { glowTexture } from './textures'
import { CONFIG } from './config'

export const BULLET_COLORS = {
  magenta: '#ff3d8e',
  orange: '#ff8a2a',
  violet: '#b46bff',
  red: '#ff3344',
  hot: '#ffd9a0',
  cyan: '#4fe3ff',
} as const
export type BulletColor = keyof typeof BULLET_COLORS

export type BulletOpts = {
  color?: BulletColor
  radius?: number
  /** Stretched along velocity. */
  needle?: boolean
  damage?: number
  /** Speed multiplier per second (1 = constant). */
  accel?: number
  /** Rotates velocity around the rail axis (radians per second) for curving streams. */
  curve?: number
  delay?: number
}

export type EnemyBullet = {
  pos: THREE.Vector3
  vel: THREE.Vector3
  radius: number
  color: THREE.Color
  needle: boolean
  damage: number
  accel: number
  curve: number
  life: number
  grazed: boolean
  delay: number
}

const tmpD = new THREE.Vector3()
const tmpU = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const tmpW = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Orthonormal basis around direction d (u right, v up). */
function basis(d: THREE.Vector3): void {
  tmpU.crossVectors(d, WORLD_UP)
  if (tmpU.lengthSq() < 1e-6) tmpU.set(1, 0, 0)
  tmpU.normalize()
  tmpV.crossVectors(tmpU, d).normalize()
}

/**
 * Enemy bullets in rig-local space. Pattern emitters (`fan`, `ring`) build classic bullet-hell
 * shapes in 3D: bullets travel towards the player's plane while spreading outward. Two
 * instanced draw calls (hot cores + coloured halos) regardless of count.
 */
export class EnemyBullets {
  readonly group = new THREE.Group()
  readonly pool: ObjectPool<EnemyBullet>
  private readonly core: InstancedBatch
  private readonly halo: InstancedBatch
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly c = new THREE.Color()
  private readonly z = new THREE.Vector3(0, 0, 1)
  readonly camQuat = new THREE.Quaternion()
  /** Global speed multiplier (difficulty / desperation). */
  speedScale = 1

  constructor(capacity = 1600) {
    this.pool = new ObjectPool<EnemyBullet>(
      () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: 0.4, color: new THREE.Color(), needle: false, damage: 8, accel: 1, curve: 0, life: 0, grazed: false, delay: 0 }),
      capacity,
      capacity,
    )
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false })
    this.core = new InstancedBatch(new THREE.IcosahedronGeometry(1, 1), coreMat, capacity, { colors: true })
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false })
    this.halo = new InstancedBatch(new THREE.PlaneGeometry(1, 1), haloMat, capacity, { colors: true })
    this.core.mesh.renderOrder = 7
    this.halo.mesh.renderOrder = 8
    this.group.add(this.core.mesh, this.halo.mesh)
  }

  get count(): number {
    return this.pool.size
  }

  clear(): void {
    this.pool.releaseAll()
  }

  shoot(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, o: BulletOpts = {}): EnemyBullet | undefined {
    const b = this.pool.acquire()
    if (!b) return undefined
    b.pos.copy(origin)
    b.vel.copy(dir).normalize().multiplyScalar(speed * this.speedScale)
    b.radius = o.radius ?? 0.42
    b.color.set(BULLET_COLORS[o.color ?? 'magenta'])
    b.needle = o.needle ?? false
    b.damage = o.damage ?? CONFIG.damage.bullet
    b.accel = o.accel ?? 1
    b.curve = o.curve ?? 0
    b.life = 9
    b.grazed = false
    b.delay = o.delay ?? 0
    return b
  }

  /** `count` bullets spread across `spread` radians (horizontal fan) aimed at `target`. */
  fan(origin: THREE.Vector3, target: THREE.Vector3, speed: number, count: number, spread: number, o: BulletOpts = {}, tilt = 0): void {
    tmpD.subVectors(target, origin).normalize()
    basis(tmpD)
    for (let i = 0; i < count; i += 1) {
      const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1)
      const cx = Math.cos(tilt)
      const sx = Math.sin(tilt)
      tmpW.copy(tmpD).multiplyScalar(Math.cos(a)).addScaledVector(tmpU, Math.sin(a) * cx).addScaledVector(tmpV, Math.sin(a) * sx)
      this.shoot(origin, tmpW, speed, o)
    }
  }

  /**
   * Ring: bullets head towards `target` at `speed` while expanding outwards at `radial` units/s.
   * `phase` rotates the ring (spirals are rings with a changing phase).
   */
  ring(origin: THREE.Vector3, target: THREE.Vector3, speed: number, count: number, radial: number, phase = 0, o: BulletOpts = {}, gap = -1): void {
    tmpD.subVectors(target, origin).normalize()
    basis(tmpD)
    for (let i = 0; i < count; i += 1) {
      if (gap >= 0 && Math.abs(i - gap) <= 1) continue
      const a = phase + (i / count) * Math.PI * 2
      tmpW.copy(tmpD).multiplyScalar(speed).addScaledVector(tmpU, Math.cos(a) * radial).addScaledVector(tmpV, Math.sin(a) * radial)
      const speedTotal = tmpW.length()
      this.shoot(origin, tmpW, speedTotal, o)
    }
  }

  /**
   * Advance bullets and test them against the player sphere. `onHit` fires once per bullet that
   * touches the hull; `onGraze` once per bullet that passes within the graze radius.
   */
  update(dt: number, player: THREE.Vector3, hitRadius: number, grazeRadius: number, onHit: (b: EnemyBullet) => boolean, onGraze: (b: EnemyBullet) => void): void {
    this.pool.update(b => {
      if (b.delay > 0) {
        b.delay -= dt
        return true
      }
      b.life -= dt
      if (b.accel !== 1) b.vel.multiplyScalar(Math.pow(b.accel, dt))
      if (b.curve !== 0) {
        const a = b.curve * dt
        const x = b.vel.x
        b.vel.x = x * Math.cos(a) - b.vel.y * Math.sin(a)
        b.vel.y = x * Math.sin(a) + b.vel.y * Math.cos(a)
      }
      const pz = b.pos.z
      b.pos.addScaledVector(b.vel, dt)
      // Continuous test near the player plane so fast bullets cannot tunnel.
      if ((pz <= player.z + 1.5 && b.pos.z >= player.z - 1.5) || Math.abs(b.pos.z - player.z) < 2.5) {
        const dx = b.pos.x - player.x
        const dy = b.pos.y - player.y
        const dz = Math.max(0, Math.abs(b.pos.z - player.z) - Math.abs(b.vel.z) * dt * 0.5)
        const d2 = dx * dx + dy * dy + dz * dz
        const hr = hitRadius + b.radius * 0.8
        if (d2 < hr * hr) {
          if (onHit(b)) return false
        } else if (!b.grazed && d2 < (grazeRadius + b.radius) * (grazeRadius + b.radius)) {
          b.grazed = true
          onGraze(b)
        }
      }
      return b.life > 0 && b.pos.z < 14 && b.pos.z > -400 && Math.abs(b.pos.x) < 80 && Math.abs(b.pos.y) < 60
    })
  }

  /** Convert every bullet into a callback (score sparkle) and clear them: phase-change cancel. */
  cancelAll(each: (pos: THREE.Vector3, color: THREE.Color) => void): void {
    for (const b of this.pool.active) each(b.pos, b.color)
    this.pool.releaseAll()
  }

  render(time: number): void {
    this.core.begin()
    this.halo.begin()
    for (const b of this.pool.active) {
      if (b.delay > 0) continue
      const pulse = 1 + Math.sin(time * 18 + b.pos.x) * 0.08
      if (b.needle) {
        this.q.setFromUnitVectors(this.z, tmpD.copy(b.vel).normalize())
        this.s.set(b.radius * 0.45, b.radius * 0.45, b.radius * 2.4)
      } else {
        this.q.identity()
        this.s.setScalar(b.radius * 0.62)
      }
      this.c.copy(b.color).lerp(WHITE, 0.72)
      this.core.push(b.pos, this.q, this.s, this.c)
      this.c.copy(b.color).multiplyScalar(1.4)
      this.halo.push(b.pos, this.camQuat, b.radius * 4.2 * pulse, this.c)
    }
    this.core.end()
    this.halo.end()
  }
}

const WHITE = new THREE.Color('#ffffff')

/** Projectile shape: rods stretch along their velocity, orbs stay round. */
export type ShotKind = 'bolt' | 'pellet' | 'lance' | 'missile' | 'slug'

export type Shot = {
  pos: THREE.Vector3
  prev: THREE.Vector3
  vel: THREE.Vector3
  life: number
  damage: number
  /** Enemies this projectile can still pass through. */
  pierce: number
  /** Steering towards the nearest hostile (radians/s). */
  homing: number
  /** Blast radius on impact (0 = none). */
  splash: number
  splashtRatio: number
  size: number
  kind: ShotKind
  color: THREE.Color
  glow: THREE.Color
}

/** Trigger data the shot needs (the rest of `WeaponStats` is the game's business). */
export type ShotSpec = {
  damage: number
  life: number
  pierce: number
  homing: number
  splash: number
  splashRatio: number
  size: number
  kind: ShotKind
  color: string
  glow: string
}

/**
 * Player projectiles in rig space. One instanced draw call per shape family (rods, orbs, glow)
 * regardless of count, so a five-weapon arsenal costs the same three batches the old single
 * weapon did. Behaviour (pierce, homing, splash) lives on the shot and is resolved by the scene,
 * which owns the physics queries.
 */
export class PlayerShots {
  readonly group = new THREE.Group()
  readonly pool = new ObjectPool<Shot>(
    () => ({
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
      life: 0, damage: 1, pierce: 0, homing: 0, splash: 0, splashtRatio: 0, size: 0.16,
      kind: 'bolt' as ShotKind, color: new THREE.Color(), glow: new THREE.Color(),
    }),
    320,
    320,
  )
  private readonly rod: InstancedBatch
  private readonly orb: InstancedBatch
  private readonly glow: InstancedBatch
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly d = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly axis = new THREE.Vector3()
  private readonly z = new THREE.Vector3(0, 0, 1)
  readonly camQuat = new THREE.Quaternion()

  constructor() {
    const rodMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    this.rod = new InstancedBatch(new THREE.BoxGeometry(1, 1, 1), rodMat, 320, { colors: true })
    const orbMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false })
    this.orb = new InstancedBatch(new THREE.IcosahedronGeometry(1, 1), orbMat, 320, { colors: true })
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffffff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false })
    this.glow = new InstancedBatch(new THREE.PlaneGeometry(1, 1), glowMat, 320, { colors: true })
    this.rod.mesh.renderOrder = 7
    this.orb.mesh.renderOrder = 7
    this.glow.mesh.renderOrder = 8
    this.group.add(this.rod.mesh, this.orb.mesh, this.glow.mesh)
  }

  get count(): number {
    return this.pool.size
  }

  fire(from: THREE.Vector3, dir: THREE.Vector3, speed: number, spec: ShotSpec): Shot | undefined {
    const s = this.pool.acquire()
    if (!s) return undefined
    s.pos.copy(from)
    s.prev.copy(from)
    s.vel.copy(dir).normalize().multiplyScalar(speed)
    s.life = spec.life
    s.damage = spec.damage
    s.pierce = spec.pierce
    s.homing = spec.homing
    s.splash = spec.splash
    s.splashtRatio = spec.splashRatio
    s.size = spec.size
    s.kind = spec.kind
    s.color.set(spec.color)
    s.glow.set(spec.glow)
    return s
  }

  clear(): void {
    this.pool.releaseAll()
  }

  /**
   * Integrate one projectile. Homing steers the velocity towards `target` (rig space) with a
   * capped turn rate, so seekers curve instead of snapping; the rail slug and bolts are unaffected.
   */
  advance(s: Shot, dt: number, target: THREE.Vector3 | null): void {
    s.prev.copy(s.pos)
    if (s.homing > 0 && target) {
      this.dir.copy(target).sub(s.pos)
      const dist = this.dir.length()
      if (dist > 0.5) {
        this.dir.divideScalar(dist)
        this.up.copy(s.vel).normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(this.up.dot(this.dir), -1, 1))
        const step = Math.min(angle, s.homing * dt)
        // Rotate the velocity around the axis perpendicular to both, by `step`.
        this.axis.crossVectors(this.up, this.dir)
        if (this.axis.lengthSq() > 1e-8) {
          this.axis.normalize()
          s.vel.applyAxisAngle(this.axis, step)
        } else {
          s.vel.copy(this.dir).multiplyScalar(s.vel.length())
        }
      }
    }
    s.pos.addScaledVector(s.vel, dt)
    s.life -= dt
  }

  /** A projectile punched through: skip it past the impact so it cannot hit the same hull twice. */
  skip(s: Shot, distance: number): void {
    this.dir.copy(s.vel).normalize()
    s.pos.addScaledVector(this.dir, distance)
    s.prev.copy(s.pos)
  }

  render(alpha: number): void {
    this.rod.begin()
    this.orb.begin()
    this.glow.begin()
    for (const s of this.pool.active) {
      this.d.lerpVectors(s.prev, s.pos, alpha)
      this.q.setFromUnitVectors(this.z, this.dir.copy(s.vel).normalize())
      switch (s.kind) {
        case 'lance':
          this.s.set(s.size * 0.5, s.size * 0.5, s.size * 46)
          break
        case 'slug':
          this.s.set(s.size, s.size, s.size * 9)
          break
        case 'pellet':
          this.s.setScalar(s.size * 0.85)
          break
        case 'missile':
          this.s.set(s.size * 1.15, s.size * 1.15, s.size * 2.2)
          break
        default:
          this.s.set(s.size, s.size, s.size * 26)
      }
      if (s.kind === 'pellet' || s.kind === 'missile') this.orb.push(this.d, this.q, this.s, s.color)
      else this.rod.push(this.d, this.q, this.s, s.color)
      this.glow.push(this.d, this.camQuat, s.size * (s.kind === 'slug' ? 26 : 13), s.glow)
    }
    this.rod.end()
    this.orb.end()
    this.glow.end()
  }
}
