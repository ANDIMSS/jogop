import * as THREE from 'three'
import { shipSpec, type ShipId } from './arsenal'
import { buildShip } from './models'

/**
 * The hangar's turntable: a tiny standalone WebGL view of one hull, lit like a showroom and turned
 * slowly. It owns its own renderer and only runs while the shop's hull tab is on screen, so it
 * costs nothing during flight and shares no state with the main renderer.
 */
export class Showroom {
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1.7, 0.1, 80)
  private readonly pivot = new THREE.Group()
  private bodyMesh: THREE.Mesh | null = null
  private glowMesh: THREE.Mesh | null = null
  private frame = 0
  private last = 0
  private running = false
  private current: ShipId | null = null
  private failed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera.position.set(0, 0.9, 8.2)
    this.camera.lookAt(0, 0, 0)
    this.pivot.rotation.set(-0.18, 0.6, 0.06)
    this.scene.add(this.pivot)
    this.scene.add(new THREE.HemisphereLight('#cfe4ff', '#0a1024', 1.6))
    const key = new THREE.DirectionalLight('#ffffff', 2.6)
    key.position.set(3.5, 4.5, 5)
    const rim = new THREE.DirectionalLight('#8fe8ff', 2.4)
    rim.position.set(-4.5, -1.5, -3.5)
    this.scene.add(key, rim)
  }

  /** Put a hull on the turntable. Safe to call before the canvas is visible. */
  show(id: ShipId): void {
    if (this.current === id && this.bodyMesh) return
    this.current = id
    const parts = buildShip(id)
    if (this.bodyMesh && this.glowMesh) {
      this.bodyMesh.geometry.dispose()
      this.glowMesh.geometry.dispose()
      this.bodyMesh.geometry = parts.body
      this.glowMesh.geometry = parts.glow
    } else {
      this.bodyMesh = new THREE.Mesh(parts.body, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45, metalness: 0.3 }))
      this.glowMesh = new THREE.Mesh(parts.glow, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))
      this.pivot.add(this.bodyMesh, this.glowMesh)
    }
    this.pivot.scale.setScalar(shipSpec(id).scale * 1.45)
  }

  start(): void {
    if (this.running || this.failed) return
    try {
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      }
    } catch {
      // No second GL context available (old driver, exhausted contexts): the shop still works.
      this.failed = true
      return
    }
    this.running = true
    this.resize()
    this.last = performance.now()
    const tick = (now: number) => {
      if (!this.running || !this.renderer) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.frame += dt
      this.pivot.rotation.y += dt * 0.45
      this.pivot.position.y = Math.sin(this.frame * 0.9) * 0.12
      this.renderer.render(this.scene, this.camera)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
  }

  /** Match the drawing buffer to the element (called on start and on window resize). */
  resize(): void {
    if (!this.renderer) return
    const w = Math.max(1, this.canvas.clientWidth)
    const h = Math.max(1, this.canvas.clientHeight)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
