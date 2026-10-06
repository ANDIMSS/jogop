import * as THREE from 'three'
import { CONFIG } from './config'
import { DEFAULT_SHIP, shipSpec, type ShipId, type ShipSpec } from './arsenal'
import { buildShip } from './models'
import { glowTexture } from './textures'

const TRAIL = 14

class Trail {
  readonly mesh: THREE.Mesh
  private readonly pts: THREE.Vector3[] = []
  private readonly geo = new THREE.BufferGeometry()
  private readonly colors: Float32Array
  constructor(color: string) {
    for (let i = 0; i < TRAIL; i += 1) this.pts.push(new THREE.Vector3())
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage))
    this.colors = new Float32Array(TRAIL * 2 * 3)
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.setColor(color)
    const idx: number[] = []
    for (let i = 0; i < TRAIL - 1; i += 1) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo.setIndex(idx)
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }))
    this.mesh.frustumCulled = false
  }
  /** Re-tint the ribbon in place (a new hull re-colours its trails without new geometry). */
  setColor(color: string): void {
    const c = new THREE.Color(color)
    for (let i = 0; i < TRAIL; i += 1) {
      const f = Math.pow(1 - i / (TRAIL - 1), 1.6)
      this.colors.set([c.r * f, c.g * f, c.b * f, c.r * f, c.g * f, c.b * f], i * 6)
    }
    const attr = this.geo.getAttribute('color')
    if (attr) attr.needsUpdate = true
  }

  reset(p: THREE.Vector3): void {
    for (const q of this.pts) q.copy(p)
  }
  step(head: THREE.Vector3, drift: number): void {
    for (let i = TRAIL - 1; i > 0; i -= 1) {
      this.pts[i].copy(this.pts[i - 1])
      this.pts[i].z += drift
    }
    this.pts[0].copy(head)
  }
  render(head: THREE.Vector3, width: number): void {
    const arr = (this.geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    for (let i = 0; i < TRAIL; i += 1) {
      const p = i === 0 ? head : this.pts[i]
      const w = width * (1 - i / TRAIL)
      arr.set([p.x, p.y + w, p.z, p.x, p.y - w, p.z], i * 6)
    }
    this.geo.getAttribute('position').needsUpdate = true
  }
}

/**
 * The HELIOSPUR interceptor. Movement is in rig space inside CONFIG.ship bounds. Mouse aim steers
 * by following a target point; sticks/keys/touch steer by velocity. A roll is a short sideways
 * dash with invulnerability and a full barrel spin.
 */
export class Ship {
  readonly group = new THREE.Group()
  readonly model = new THREE.Group()
  readonly pos = new THREE.Vector3(0, -0.6, 0)
  readonly prev = new THREE.Vector3(0, -0.6, 0)
  readonly vel = new THREE.Vector3()
  alive = true
  /** Roll state. */
  rollTime = 0
  rollCooldown = 0
  private rollDir = 1
  private rollAngle = 0
  private bank = 0
  private pitch = 0
  private yaw = 0
  private readonly flames: THREE.Mesh[] = []
  private readonly flameGlow: THREE.Sprite
  private readonly trails: [Trail, Trail]
  private readonly shieldMesh: THREE.Mesh
  private shieldFlash = 0
  private hitFlash = 0
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly tip = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly render = new THREE.Vector3()
  /** 0..1, flame length boost (speed-up sections). */
  thrust = 0
  /** Visual yaw/pitch toward the reticle target. */
  readonly aimDir = new THREE.Vector3(0, 0, -1)
  /** The hull currently flown: hull/shield maxima, steering and colours all come from it. */
  private spec: ShipSpec = shipSpec(DEFAULT_SHIP)
  private readonly bodyMesh: THREE.Mesh
  private readonly glowMesh: THREE.Mesh
  private readonly flameMat: THREE.MeshBasicMaterial

  constructor() {
    const parts = buildShip(this.spec.id)
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.42, metalness: 0.25, emissive: '#000000' })
    this.bodyMesh = new THREE.Mesh(parts.body, this.bodyMat)
    this.glowMesh = new THREE.Mesh(parts.glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))
    this.model.add(this.bodyMesh, this.glowMesh)
    this.flameMat = new THREE.MeshBasicMaterial({ color: '#4fc8ff', blending: THREE.AdditiveBlending, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false })
    const flameMat = this.flameMat
    for (const x of [-0.55, 0.55, 0]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(x === 0 ? 0.2 : 0.17, 1, 6, 1, true), flameMat)
      f.geometry.translate(0, -0.5, 0)
      f.rotation.x = -Math.PI / 2
      f.position.set(x, x === 0 ? 0 : -0.18, 1.5)
      this.flames.push(f)
      this.model.add(f)
    }
    this.flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#58d6ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }))
    this.flameGlow.position.set(0, -0.1, 1.75)
    this.flameGlow.scale.setScalar(1.3)
    this.model.add(this.flameGlow)
    this.shieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.1, 1),
      new THREE.MeshBasicMaterial({ color: '#4fe3ff', wireframe: true, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    )
    this.shieldMesh.scale.set(1.45, 0.75, 1.2)
    this.group.add(this.model, this.shieldMesh)
    this.trails = [new Trail(this.spec.trail[0]), new Trail(this.spec.trail[1])]
    this.model.scale.setScalar(this.spec.scale)
  }

  /** Switch hulls: rebuilds the geometry, re-tints engines and trails, applies the new handling. */
  configure(id: ShipId): void {
    this.spec = shipSpec(id)
    const parts = buildShip(id)
    this.bodyMesh.geometry.dispose()
    this.glowMesh.geometry.dispose()
    this.bodyMesh.geometry = parts.body
    this.glowMesh.geometry = parts.glow
    this.model.scale.setScalar(this.spec.scale)
    this.flameMat.color.set(this.spec.flame)
    ;(this.flameGlow.material as THREE.SpriteMaterial).color.set(this.spec.flame)
    this.trails[0].setColor(this.spec.trail[0])
    this.trails[1].setColor(this.spec.trail[1])
  }

  get hullId(): ShipId {
    return this.spec.id
  }

  /** Hull and shield the run starts with (read by the rules through `shipRules`). */
  get hitRadius(): number {
    return this.spec.hitRadius
  }

  get grazeRadius(): number {
    return this.spec.grazeRadius
  }

  get speed(): number {
    return this.spec.speed
  }

  /** Full roll cycle for this hull (dash + cooldown), used by the HUD pip. */
  get rollCycle(): number {
    return CONFIG.roll.duration + this.spec.rollCooldown
  }

  /** Trails live beside the ship group (not inside it) so they are not rotated with the model. */
  get trailMeshes(): THREE.Mesh[] {
    return [this.trails[0].mesh, this.trails[1].mesh]
  }

  get rolling(): boolean {
    return this.rollTime > 0
  }

  reset(): void {
    this.pos.set(0, -0.6, 0)
    this.prev.copy(this.pos)
    this.vel.set(0, 0, 0)
    this.rollTime = 0
    this.rollCooldown = 0
    this.rollAngle = 0
    this.alive = true
    this.model.visible = true
    this.trails[0].reset(this.pos)
    this.trails[1].reset(this.pos)
  }

  /** Start a roll; returns false while on cooldown. */
  roll(dirX: number): boolean {
    if (!this.alive || this.rollCooldown > 0) return false
    this.rollDir = dirX !== 0 ? Math.sign(dirX) : this.vel.x !== 0 ? Math.sign(this.vel.x) : 1
    this.rollTime = CONFIG.roll.duration
    this.rollCooldown = CONFIG.roll.duration + this.spec.rollCooldown
    return true
  }

  /**
   * One fixed step. `move` is steering intent (-1..1); `follow` (mouse aim) overrides it with a
   * target point the ship slides toward.
   */
  step(dt: number, move: { x: number; y: number }, follow: THREE.Vector3 | null, speedScale: number, railSpeed: number): void {
    this.prev.copy(this.pos)
    const c = CONFIG.ship
    const speed = this.spec.speed
    const accel = this.spec.accel * dt
    if (this.alive) {
      if (follow) {
        const k = 1 - Math.exp(-this.spec.followRate * dt)
        const tx = THREE.MathUtils.clamp(follow.x, -c.boundsX, c.boundsX)
        const ty = THREE.MathUtils.clamp(follow.y, -c.boundsY, c.boundsY)
        const dvx = ((tx - this.pos.x) * k) / dt
        const dvy = ((ty - this.pos.y) * k) / dt
        const max = speed * 1.35
        this.vel.x = THREE.MathUtils.clamp(dvx, -max, max)
        this.vel.y = THREE.MathUtils.clamp(dvy, -max, max)
      } else {
        const tx = move.x * speed * speedScale
        const ty = move.y * speed * speedScale
        this.vel.x += THREE.MathUtils.clamp(tx - this.vel.x, -accel, accel)
        this.vel.y += THREE.MathUtils.clamp(ty - this.vel.y, -accel, accel)
      }
      if (this.rollTime > 0) {
        const t = this.rollTime / CONFIG.roll.duration
        // Sideways burst that fades out over the roll (~5 units total).
        this.pos.x += this.rollDir * CONFIG.roll.dash * (0.4 + t) * dt
        this.rollTime = Math.max(0, this.rollTime - dt)
      }
      this.rollCooldown = Math.max(0, this.rollCooldown - dt)
      this.pos.x += this.vel.x * dt
      this.pos.y += this.vel.y * dt
      if (Math.abs(this.pos.x) > c.boundsX) {
        this.pos.x = Math.sign(this.pos.x) * c.boundsX
        this.vel.x *= -0.2
      }
      if (Math.abs(this.pos.y) > c.boundsY) {
        this.pos.y = Math.sign(this.pos.y) * c.boundsY
        this.vel.y *= -0.2
      }
    }
    // Wingtip trails stream back with the rail.
    const drift = Math.min(0.5, railSpeed * dt * 0.42)
    this.tipWorld(1, this.tip)
    this.trails[0].step(this.tip, drift)
    this.tipWorld(-1, this.tip)
    this.trails[1].step(this.tip, drift)
  }

  private tipWorld(side: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(2.72 * side * this.spec.scale, -0.46 * this.spec.scale, -0.6).applyQuaternion(this.model.quaternion)
    return out.add(this.pos)
  }

  flashShield(): void {
    this.shieldFlash = 1
  }

  flashHit(): void {
    this.hitFlash = 1
  }

  kill(): void {
    this.alive = false
    this.model.visible = false
  }

  /** Interpolate and animate visuals. */
  draw(alpha: number, frameSeconds: number, time: number, invulnerable: boolean): void {
    this.render.lerpVectors(this.prev, this.pos, alpha)
    this.group.position.copy(this.render)
    const k = 1 - Math.exp(-frameSeconds * 10)
    this.bank += (THREE.MathUtils.clamp(-this.vel.x * 0.05, -0.85, 0.85) - this.bank) * k
    this.pitch += (THREE.MathUtils.clamp(this.vel.y * 0.035, -0.4, 0.4) - this.pitch) * k
    // Yaw/pitch nudged toward the aim direction so the nose "points" at the reticle.
    const aimYaw = THREE.MathUtils.clamp(-this.aimDir.x * 0.9, -0.35, 0.35)
    const aimPitch = THREE.MathUtils.clamp(this.aimDir.y * 0.9, -0.3, 0.3)
    this.yaw += (aimYaw - this.yaw) * k
    if (this.rollTime > 0) {
      const t = 1 - this.rollTime / CONFIG.roll.duration
      const e = 1 - Math.pow(1 - t, 2.2)
      this.rollAngle = -this.rollDir * e * Math.PI * 2
    } else this.rollAngle = 0
    this.model.rotation.set(this.pitch + aimPitch * 0.6, this.yaw, this.bank + this.rollAngle, 'YXZ')
    const flicker = 0.85 + Math.sin(time * 60) * 0.1 + Math.random() * 0.1
    const len = (0.8 + this.thrust * 1.6) * flicker
    for (const f of this.flames) f.scale.set(1, len, 1)
    this.flameGlow.scale.setScalar((1.15 + this.thrust * 1.1) * flicker)
    this.shieldFlash = Math.max(0, this.shieldFlash - frameSeconds * 3.5)
    this.hitFlash = Math.max(0, this.hitFlash - frameSeconds * 5)
    const sm = this.shieldMesh.material as THREE.MeshBasicMaterial
    sm.opacity = this.shieldFlash * 0.85
    this.shieldMesh.rotation.y += frameSeconds * 2
    this.shieldMesh.visible = sm.opacity > 0.01
    this.bodyMat.emissive.setRGB(this.hitFlash * 1.5, this.hitFlash * 0.4, this.hitFlash * 0.3)
    // Blink while invulnerable after a hit (not during rolls, which already read clearly).
    this.model.visible = this.alive && !(invulnerable && !this.rolling && Math.floor(time * 20) % 2 === 0)
    this.tipWorld(1, this.tip).sub(this.pos).add(this.render)
    this.trails[0].render(this.tip, 0.07 + this.thrust * 0.05)
    this.tipWorld(-1, this.tip).sub(this.pos).add(this.render)
    this.trails[1].render(this.tip, 0.07 + this.thrust * 0.05)
    for (const t of this.trails) t.mesh.visible = this.alive
  }

  /** Gun muzzle positions in rig space, offset by the hull's own gun spacing. */
  muzzle(side: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.spec.gunOffset * side * this.spec.scale, -0.3 * this.spec.scale, -1.4).applyQuaternion(this.model.quaternion).add(this.pos)
  }

  get position(): THREE.Vector3 {
    return this.tmp.copy(this.pos)
  }
}
