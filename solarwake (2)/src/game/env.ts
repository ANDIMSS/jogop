import * as THREE from 'three'
import type { StageTheme } from './director'
import { buildRock, buildStation } from './models'
import type { Rail } from './rail'
import { glowTexture } from './textures'

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize()
/** Gameplay key light: the sun's light bounced so faces toward the camera stay readable. */
const KEY_DIR = new THREE.Vector3(-0.5, 0.7, 0.5).normalize()

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`

const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uAtmoDir;
  uniform float uTime;
  uniform float uAlarm;
  uniform float uNebula;
  uniform float uStars;
  uniform float uAtmo;
  uniform float uCaustic;
  uniform float uSunGlow;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  /** Slow, soft interference pattern: light refracted through moving glass. */
  float caustic(vec2 p) {
    float v = sin(p.x) * sin(p.y * 1.2);
    v += sin(p.x * 1.7 + 1.3) * sin(p.y * 1.9 - 0.7);
    v += sin(p.x * 2.3 - 0.4) * sin(p.y * 2.7 + 2.1);
    return clamp(0.5 + v * 0.16667, 0.0, 1.0);
  }
  void main() {
    vec3 d = normalize(vDir);
    float n = fbm(d * 2.6 + vec3(0.0, 0.0, uTime * 0.004));
    float n2 = fbm(d * 5.5 + 3.1);
    float band = exp(-pow(dot(d, normalize(vec3(0.25, 1.0, 0.35))) * 2.4, 2.0));
    // Deep space: colder and cleaner in orbit, warmer inside the nebula.
    vec3 baseDeep = mix(vec3(0.006, 0.010, 0.028), vec3(0.010, 0.018, 0.046), d.y * 0.5 + 0.5);
    vec3 baseNeb = mix(vec3(0.012, 0.012, 0.045), vec3(0.03, 0.02, 0.08), d.y * 0.5 + 0.5);
    vec3 base = mix(baseDeep, baseNeb, uNebula);
    vec3 neb = mix(vec3(0.34, 0.06, 0.32), vec3(0.03, 0.26, 0.34), smoothstep(0.35, 0.7, n2));
    vec3 col = base + neb * smoothstep(0.42, 0.85, n) * (0.35 + band * 0.9) * uNebula;
    col += vec3(0.5, 0.18, 0.08) * pow(max(dot(d, uSun), 0.0), 6.0) * 0.55 * uSunGlow;
    col += vec3(1.0, 0.75, 0.5) * pow(max(dot(d, uSun), 0.0), 90.0) * 1.2 * uSunGlow;
    // Stars: sparse hashed cells (denser where there is no nebula).
    vec3 cell = floor(d * 220.0);
    float h = hash(cell);
    float star = step(uStars, h) * smoothstep(0.5, 0.0, length(fract(d * 220.0) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * star * (0.6 + 0.4 * sin(uTime * 3.0 + h * 50.0));
    // Grazing the atmosphere: cool limb glow plus a hot band where the hull burns.
    float down = max(dot(d, uAtmoDir), 0.0);
    col += vec3(0.30, 0.55, 1.0) * uAtmo * pow(down, 3.0) * 0.85;
    col += vec3(1.0, 0.52, 0.22) * uAtmo * pow(down, 9.0) * 0.9;
    col += vec3(1.0, 0.55, 0.26) * uAtmo * pow(max(dot(d, uSun), 0.0), 3.0) * 0.35;
    // Obsidian void: a whisper of refracted light below the horizon. Kept deliberately faint —
    // any stronger and the dome stops reading as emptiness and starts reading as terrain.
    if (uCaustic > 0.001) {
      vec2 q = d.xz * 1.6 + vec2(uTime * 0.011, uTime * 0.017);
      float c = caustic(q);
      col += vec3(0.24, 0.42, 0.62) * uCaustic * pow(c, 4.0) * 0.20 * smoothstep(0.82, -0.18, d.y);
    }
    col = mix(col, col * vec3(1.6, 0.45, 0.45) + vec3(0.06, 0.0, 0.0), uAlarm);
    gl_FragColor = vec4(col, 1.0);
  }`

/**
 * One planet shader with two looks: `uMode` 0 is the ring's banded gas giant, 1 is Earth (oceans,
 * continents, a drifting cloud deck, city lights on the night side and a blue atmospheric limb).
 */
const PLANET_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uMode;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vP;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  vec3 gasGiant(vec3 n, float l) {
    float lat = n.y;
    float bands = sin(lat * 22.0 + sin(lat * 7.0 + n.x * 3.0) * 1.3) * 0.5 + 0.5;
    vec3 a = vec3(0.55, 0.28, 0.22), b = vec3(0.86, 0.6, 0.4), c = vec3(0.32, 0.18, 0.36);
    vec3 col = mix(mix(c, a, bands), b, smoothstep(0.7, 1.0, bands) * 0.6);
    return col * (0.05 + l * 1.1);
  }
  vec3 planetEarth(vec3 n, float l, float term) {
    float land = smoothstep(0.50, 0.57, fbm(n * 3.1 + 12.0));
    vec3 ocean = mix(vec3(0.015, 0.06, 0.20), vec3(0.05, 0.24, 0.42), fbm(n * 6.0 + 2.0));
    vec3 soil = mix(vec3(0.16, 0.32, 0.11), vec3(0.44, 0.37, 0.19), fbm(n * 7.0 + 4.0));
    vec3 col = mix(ocean, soil, land);
    float ice = smoothstep(0.70, 0.90, abs(n.y) + fbm(n * 9.0) * 0.12);
    col = mix(col, vec3(0.90, 0.94, 0.98), ice * 0.92);
    float cloud = smoothstep(0.52, 0.74, fbm(n * 2.3 + vec3(uTime * 0.008, 0.0, uTime * 0.005)));
    col = mix(col, vec3(1.0), cloud * 0.6);
    vec3 lit = col * (0.03 + l * 1.18);
    // City lights: only on land, only on the night side.
    float city = smoothstep(0.55, 0.85, fbm(n * 26.0 + 7.0));
    lit += vec3(1.0, 0.72, 0.36) * (1.0 - term) * land * city * 0.55;
    lit += vec3(1.0, 0.45, 0.22) * smoothstep(0.18, 0.0, abs(dot(n, uSun))) * 0.10;
    return lit;
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 view = normalize(cameraPosition - vP);
    float l = max(dot(n, uSun), 0.0);
    float term = smoothstep(-0.10, 0.25, dot(n, uSun));
    vec3 col = mix(gasGiant(n, l), planetEarth(n, l, term), uMode);
    float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
    vec3 rimCol = mix(vec3(1.0, 0.45, 0.35) * 0.9, vec3(0.30, 0.55, 1.0) * 1.25, uMode);
    col += rimCol * rim * (0.2 + l) * (1.0 - uMode * 0.15);
    gl_FragColor = vec4(col, 1.0);
  }`

const PLANET_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`

const RING_FRAG = /* glsl */ `
  varying vec2 vUv2;
  void main() {
    float r = vUv2.x;
    float bands = sin(r * 90.0) * 0.5 + 0.5;
    bands *= sin(r * 31.0 + 1.2) * 0.3 + 0.7;
    float edge = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);
    vec3 col = mix(vec3(0.55, 0.42, 0.5), vec3(0.95, 0.75, 0.6), bands);
    gl_FragColor = vec4(col * 0.8, edge * (0.25 + bands * 0.45));
  }`

const RING_VERT = /* glsl */ `
  attribute float aR;
  varying vec2 vUv2;
  void main() { vUv2 = vec2(aR, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const FLOOR_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`

/** Obsidian slab far below the lane: matte black with slow light caustics gliding over it. */
const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uCaustic;
  uniform vec3 uCamera;
  varying vec3 vWorld;
  float caustic(vec2 p) {
    float v = sin(p.x) * sin(p.y * 1.2);
    v += sin(p.x * 1.7 + 1.3) * sin(p.y * 1.9 - 0.7);
    v += sin(p.x * 2.3 - 0.4) * sin(p.y * 2.7 + 2.1);
    return clamp(0.5 + v * 0.16667, 0.0, 1.0);
  }
  void main() {
    vec2 p = vWorld.xz * 0.028;
    float c = caustic(p + vec2(uTime * 0.013, uTime * 0.019));
    float glow = pow(c, 3.0);
    float fade = smoothstep(2600.0, 340.0, length(vWorld.xz - uCamera.xz));
    vec3 col = vec3(0.004, 0.006, 0.012) + vec3(0.20, 0.38, 0.62) * glow * 0.22 * uCaustic;
    // A faint warm fringe keeps the glints from reading as plain blue light.
    col += vec3(0.26, 0.09, 0.24) * pow(c, 6.0) * uCaustic * 0.16;
    gl_FragColor = vec4(col, (0.12 + glow * 0.55) * fade);
  }`

type Rock = { variant: number; s: number; ox: number; oy: number; scale: number; pos: THREE.Vector3; q: THREE.Quaternion; spin: THREE.Quaternion }
type Station = { group: THREE.Group; s: number; offset: THREE.Vector3; spin: THREE.Vector3 }

/** Everything that changes when the stage changes planet. */
type ThemeLook = {
  nebula: number
  stars: number
  fog: [string, number]
  background: string
  planet: { mode: number; scale: number; dir: THREE.Vector3; dist: number; ring: boolean; visible: boolean }
  hemi: [string, string, number]
  key: [string, number]
  rim: [string, number]
  rockTint: string
  sun: [string, number]
  /** Strength of the sky's sun halo. 0 keeps the void obsidian, with no warm bloom. */
  sunGlow: number
  stations: boolean
  /** Sparse debris belt (off = open void, all negative space). */
  belt: boolean
  /** Obsidian floor plane with caustics far below the lane. */
  floor: boolean
  caustic: number
}

const LOOKS: Record<StageTheme, ThemeLook> = {
  ring: {
    nebula: 1,
    stars: 0.9965,
    fog: ['#0d0a22', 0.0042],
    background: '#05040f',
    planet: { mode: 0, scale: 1, dir: new THREE.Vector3(0.62, -0.18, -0.76).normalize(), dist: 1150, ring: true, visible: true },
    hemi: ['#9a8cff', '#3a1a3a', 1.35],
    key: ['#ffd2a6', 3.0],
    rim: ['#ff9ad0', 1.6],
    rockTint: '#ffffff',
    sun: ['#ffc58a', 360],
    sunGlow: 1,
    stations: false,
    belt: true,
    floor: false,
    caustic: 0,
  },
  orbit: {
    nebula: 0.08,
    stars: 0.9935,
    fog: ['#0b1526', 0.0032],
    background: '#04070f',
    planet: { mode: 1, scale: 3.1, dir: new THREE.Vector3(0.30, -0.72, -0.62).normalize(), dist: 2650, ring: false, visible: true },
    hemi: ['#9dc4ff', '#071a2e', 1.1],
    key: ['#fff2dd', 3.3],
    rim: ['#6fa8ff', 1.9],
    rockTint: '#9fb0c8',
    sun: ['#fff0d0', 300],
    sunGlow: 1,
    stations: true,
    belt: true,
    floor: false,
    caustic: 0,
  },
  // Stage 3 "Continuous Loop": an obsidian void, one glass ribbon, almost nothing else.
  prism: {
    nebula: 0.02,
    stars: 0.9997,
    fog: ['#04060b', 0.0030],
    background: '#010204',
    planet: { mode: 1, scale: 1, dir: new THREE.Vector3(0, -1, 0), dist: 6000, ring: false, visible: false },
    hemi: ['#6f8fb0', '#04070d', 0.5],
    key: ['#dceaff', 1.3],
    rim: ['#8fe8ff', 2.3],
    rockTint: '#93a9c4',
    sun: ['#cfe8ff', 170],
    sunGlow: 0.10,
    stations: false,
    belt: false,
    floor: true,
    caustic: 0.6,
  },
}

/**
 * Background: sky dome, a planet, the sun, fog and world-space clutter (asteroid belt / orbital
 * debris and stations) that recycles ahead of the rail. `setTheme` swaps the whole look in one go.
 */
export class Environment {
  readonly group = new THREE.Group()
  readonly sky: THREE.Mesh
  theme: StageTheme = 'ring'
  /** Target atmospheric-grazing level (0..1); `atmo` follows it for smooth transitions. */
  atmosphere = 0
  private atmo = 0

  /** Smoothed atmospheric-grazing level actually on screen (drives tint and speed lines). */
  get atmoLevel(): number {
    return this.atmo
  }
  private readonly skyMat: THREE.ShaderMaterial
  private readonly planet: THREE.Group
  private readonly planetRing: THREE.Mesh
  private readonly planetMat: THREE.ShaderMaterial
  private readonly sun: THREE.Sprite
  private readonly floor: THREE.Mesh
  private readonly floorMat: THREE.ShaderMaterial
  private readonly hemi: THREE.HemisphereLight
  private readonly rocks: Rock[] = []
  private readonly rockMeshes: THREE.InstancedMesh[] = []
  private readonly rockMat: THREE.MeshStandardMaterial
  private readonly stations: Station[] = []
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpV = new THREE.Vector3()
  private readonly stationPos = new THREE.Vector3()
  private readonly stationQuat = new THREE.Quaternion()
  private readonly m = new THREE.Matrix4()
  private readonly s3 = new THREE.Vector3()
  alarm = 0
  /** Radial clearance around the rail kept free of rocks (widened for the boss arena). */
  corridor = 0
  private corridorNow = 0

  constructor(scene: THREE.Scene, private readonly rail: Rail, detail: number) {
    scene.add(this.group)
    scene.fog = new THREE.FogExp2(LOOKS.ring.fog[0], LOOKS.ring.fog[1])
    scene.background = new THREE.Color(LOOKS.ring.background)
    this.scene = scene

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uSun: { value: SUN_DIR },
        uAtmoDir: { value: LOOKS.ring.planet.dir.clone() },
        uTime: { value: 0 },
        uAlarm: { value: 0 },
        uNebula: { value: LOOKS.ring.nebula },
        uStars: { value: LOOKS.ring.stars },
        uAtmo: { value: 0 },
        uCaustic: { value: LOOKS.ring.caustic },
        uSunGlow: { value: LOOKS.ring.sunGlow },
      },
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -10
    this.group.add(this.sky)

    this.planet = new THREE.Group()
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, fog: false,
      uniforms: { uSun: { value: SUN_DIR }, uMode: { value: 0 }, uTime: { value: 0 } },
    })
    this.planet.add(new THREE.Mesh(new THREE.IcosahedronGeometry(300, 4), this.planetMat))
    const ringGeo = new THREE.RingGeometry(380, 620, 96, 1)
    const pos = ringGeo.getAttribute('position')
    const aR = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i += 1) aR[i] = (Math.hypot(pos.getX(i), pos.getY(i)) - 380) / 240
    ringGeo.setAttribute('aR', new THREE.BufferAttribute(aR, 1))
    this.planetRing = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }))
    this.planetRing.rotation.set(-1.25, 0.25, 0.1)
    this.planet.add(this.planetRing)
    this.planet.rotation.set(0.2, 0, 0.35)
    this.group.add(this.planet)

    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: LOOKS.ring.sun[0], blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }))
    this.sun.scale.setScalar(LOOKS.ring.sun[1])
    this.group.add(this.sun)

    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCaustic: { value: 0 }, uCamera: { value: new THREE.Vector3() } },
    })
    const floorGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1)
    floorGeo.rotateX(-Math.PI / 2)
    this.floor = new THREE.Mesh(floorGeo, this.floorMat)
    this.floor.position.y = -46
    this.floor.visible = false
    this.floor.frustumCulled = false
    this.group.add(this.floor)

    this.hemi = new THREE.HemisphereLight(LOOKS.ring.hemi[0], LOOKS.ring.hemi[1], LOOKS.ring.hemi[2])
    const key = new THREE.DirectionalLight(LOOKS.ring.key[0], LOOKS.ring.key[1])
    key.position.copy(SUN_DIR).multiplyScalar(100)
    const rim = new THREE.DirectionalLight(LOOKS.ring.rim[0], LOOKS.ring.rim[1])
    rim.position.set(0.6, -0.3, 0.8).multiplyScalar(100)
    scene.add(this.hemi, key, rim, key.target, rim.target)
    // Lights are directional: keep them attached to the camera rig so shading is stable.
    this.keyLight = key
    this.rimLight = rim

    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05 })
    const perVariant = Math.round(95 * detail)
    for (let v = 0; v < 3; v += 1) {
      const mesh = new THREE.InstancedMesh(buildRock(v + 1, v === 2 ? 0 : 1, v === 1 ? '#9a7a64' : '#8a7288'), this.rockMat, perVariant)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      this.rockMeshes.push(mesh)
      this.group.add(mesh)
      for (let i = 0; i < perVariant; i += 1) {
        const rock: Rock = { variant: v, s: 0, ox: 0, oy: 0, scale: 1, pos: new THREE.Vector3(), q: new THREE.Quaternion().random(), spin: new THREE.Quaternion() }
        this.place(rock, rail.s - 40 + Math.random() * 760)
        this.rocks.push(rock)
      }
    }

    // Orbital stations: distant, slow-turning landmarks for the Earth-orbit stage.
    const stationParts = buildStation()
    const stationMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.45 })
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    for (let i = 0; i < Math.max(1, Math.round(2 * detail)); i += 1) {
      const group = new THREE.Group()
      group.add(new THREE.Mesh(stationParts.body, stationMat), new THREE.Mesh(stationParts.glow, glowMat))
      group.visible = false
      this.group.add(group)
      const station: Station = { group, s: 0, offset: new THREE.Vector3(), spin: new THREE.Vector3() }
      this.placeStation(station, rail.s + 200 + i * 420)
      this.stations.push(station)
    }
  }

  private readonly scene: THREE.Scene
  readonly keyLight: THREE.DirectionalLight
  readonly rimLight: THREE.DirectionalLight

  /** Swap the backdrop (sky, planet, fog, lighting, clutter) for a stage theme. */
  setTheme(theme: StageTheme): void {
    this.theme = theme
    const look = LOOKS[theme]
    this.skyMat.uniforms.uNebula.value = look.nebula
    this.skyMat.uniforms.uStars.value = look.stars
    this.skyMat.uniforms.uCaustic.value = look.caustic
    this.skyMat.uniforms.uSunGlow.value = look.sunGlow
    this.floorMat.uniforms.uCaustic.value = look.caustic
    this.floor.visible = look.floor
    this.planet.visible = look.planet.visible
    this.skyMat.uniforms.uAtmoDir.value.copy(look.planet.dir)
    this.planetMat.uniforms.uMode.value = look.planet.mode
    this.planet.scale.setScalar(look.planet.scale)
    this.planetRing.visible = look.planet.ring
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.set(look.fog[0])
    fog.density = look.fog[1]
    ;(this.scene.background as THREE.Color).set(look.background)
    this.hemi.color.set(look.hemi[0])
    this.hemi.groundColor.set(look.hemi[1])
    this.hemi.intensity = look.hemi[2]
    this.keyLight.color.set(look.key[0])
    this.keyLight.intensity = look.key[1]
    this.rimLight.color.set(look.rim[0])
    this.rimLight.intensity = look.rim[1]
    this.rockMat.color.set(look.rockTint)
    this.sun.material.color.set(look.sun[0])
    this.sun.scale.setScalar(look.sun[1])
    for (const station of this.stations) station.group.visible = look.stations
  }

  /** Re-seed clutter around the current rail position (restart). */
  reset(): void {
    for (const r of this.rocks) this.place(r, this.rail.s - 40 + Math.random() * 760)
    for (const [i, station] of this.stations.entries()) this.placeStation(station, this.rail.s + 200 + i * 420)
    this.atmo = this.atmosphere = 0
  }

  private place(r: Rock, s: number): void {
    r.s = s
    const a = Math.random() * Math.PI * 2
    const near = Math.random() < 0.55
    const dist = near ? 15 + Math.random() * 30 : 45 + Math.random() * 90
    r.ox = Math.cos(a) * dist * 1.25
    r.oy = Math.sin(a) * dist * 0.8
    r.scale = near ? 0.9 + Math.random() * 2.6 : 3 + Math.random() * 11
    this.rail.frame(s, r.pos, this.tmpQ)
    r.pos.add(this.tmpV.set(r.ox, r.oy, 0).applyQuaternion(this.tmpQ))
    r.spin.setFromAxisAngle(this.tmpV.randomDirection(), (Math.random() - 0.5) * 0.02)
  }

  private placeStation(station: Station, s: number): void {
    station.s = s
    const a = Math.random() * Math.PI * 2
    const dist = 70 + Math.random() * 90
    station.offset.set(Math.cos(a) * dist * 1.3, Math.sin(a) * dist * 0.75, 0)
    this.rail.frame(s, this.stationPos, this.stationQuat)
    this.stationPos.add(this.tmpV.copy(station.offset).applyQuaternion(this.stationQuat))
    station.group.position.copy(this.stationPos)
    station.group.quaternion.copy(this.stationQuat)
    station.group.rotateZ(Math.random() * Math.PI)
    station.group.scale.setScalar(0.8 + Math.random() * 0.6)
    station.spin.set(0.02 + Math.random() * 0.04, 0.05 + Math.random() * 0.06, (Math.random() - 0.5) * 0.03)
  }

  update(cameraWorld: THREE.Vector3, frameSeconds: number, time: number): void {
    const look = LOOKS[this.theme]
    this.atmo += (this.atmosphere - this.atmo) * (1 - Math.exp(-frameSeconds * 1.4))
    this.sky.position.copy(cameraWorld)
    this.skyMat.uniforms.uTime.value = time
    this.skyMat.uniforms.uAlarm.value = this.alarm
    this.skyMat.uniforms.uAtmo.value = this.atmo
    this.planetMat.uniforms.uTime.value = time
    this.planet.position.copy(cameraWorld).addScaledVector(this.tmpV.copy(look.planet.dir), look.planet.dist)
    this.planet.rotation.y += frameSeconds * (this.theme === 'orbit' ? 0.0045 : 0.008)
    this.sun.position.copy(cameraWorld).addScaledVector(SUN_DIR, 1300)
    this.keyLight.position.copy(cameraWorld).addScaledVector(KEY_DIR, 100)
    this.keyLight.target.position.copy(cameraWorld)
    this.rimLight.position.copy(cameraWorld).addScaledVector(SUN_DIR, 100)
    this.rimLight.target.position.copy(cameraWorld)
    if (look.floor) {
      this.floor.position.set(cameraWorld.x, -46, cameraWorld.z)
      this.floorMat.uniforms.uTime.value = time
      this.floorMat.uniforms.uCamera.value.copy(cameraWorld)
    }
    this.corridorNow += (this.corridor - this.corridorNow) * (1 - Math.exp(-frameSeconds * 1.5))
    const counts = [0, 0, 0]
    const spinSteps = Math.min(4, frameSeconds * 60)
    // A void theme keeps the belt parked at zero instances: the emptiness is the point.
    if (look.belt) for (const r of this.rocks) {
      if (r.s < this.rail.s - 45) this.place(r, this.rail.s + 620 + Math.random() * 140)
      for (let i = 0; i < spinSteps; i += 1) r.q.multiply(r.spin)
      const radial = Math.hypot(r.ox / 1.25, r.oy / 0.8)
      const keep = THREE.MathUtils.clamp((radial - this.corridorNow) / 10, 0, 1)
      if (keep <= 0.01) continue
      this.m.compose(r.pos, r.q, this.s3.setScalar(r.scale * keep))
      this.rockMeshes[r.variant].setMatrixAt(counts[r.variant]++, this.m)
    }
    for (let v = 0; v < 3; v += 1) {
      this.rockMeshes[v].count = counts[v]
      this.rockMeshes[v].instanceMatrix.needsUpdate = true
    }
    if (look.stations) {
      for (const station of this.stations) {
        if (station.s < this.rail.s - 60) this.placeStation(station, this.rail.s + 900 + Math.random() * 500)
        station.group.rotateX(station.spin.x * frameSeconds)
        station.group.rotateY(station.spin.y * frameSeconds)
        station.group.rotateZ(station.spin.z * frameSeconds)
      }
    }
  }
}

/**
 * Speed feel in rig space: star streaks whose tails stretch with speed, plus bright speed lines
 * near the screen edges while boosting. One LineSegments draw call each.
 */
export class SpeedField {
  readonly group = new THREE.Group()
  private readonly stars: THREE.LineSegments
  private readonly lines: THREE.LineSegments
  private readonly starData: Float32Array
  private readonly lineData: Float32Array
  private readonly starCount: number
  private readonly lineCount: number
  /** 0..1 extra stretch and speed-line intensity. */
  boost = 0

  constructor(detail: number) {
    this.starCount = Math.round(900 * detail)
    this.lineCount = 64
    this.starData = new Float32Array(this.starCount * 3)
    this.lineData = new Float32Array(this.lineCount * 4)
    this.stars = this.makeLines(this.starCount, '#dfe8ff')
    this.lines = this.makeLines(this.lineCount, '#bff4ff')
    for (let i = 0; i < this.starCount; i += 1) this.seedStar(i, -500 + Math.random() * 530)
    for (let i = 0; i < this.lineCount; i += 1) this.seedLine(i, -160 + Math.random() * 170)
    this.group.add(this.stars, this.lines)
  }

  private makeLines(count: number, color: string): THREE.LineSegments {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage))
    const col = new Float32Array(count * 6)
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i += 1) {
      col.set([c.r, c.g, c.b, 0, 0, 0], i * 6)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    const l = new THREE.LineSegments(g, m)
    l.frustumCulled = false
    return l
  }

  private seedStar(i: number, z: number): void {
    const a = Math.random() * Math.PI * 2
    const r = 4 + Math.pow(Math.random(), 0.7) * 80
    this.starData.set([Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.85, z], i * 3)
  }

  private seedLine(i: number, z: number): void {
    const a = Math.random() * Math.PI * 2
    const r = 7 + Math.random() * 9
    this.lineData.set([Math.cos(a) * r * 1.5, Math.sin(a) * r * 0.9, z, 0.5 + Math.random() * 0.5], i * 4)
  }

  update(dt: number, speed: number): void {
    const move = speed * 1.15 * dt
    const tail = 0.3 + speed * (0.028 + this.boost * 0.07)
    const sp = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = sp.array as Float32Array
    for (let i = 0; i < this.starCount; i += 1) {
      let z = this.starData[i * 3 + 2] + move
      if (z > 30) {
        this.seedStar(i, -500 + Math.random() * 40)
        z = this.starData[i * 3 + 2]
      }
      this.starData[i * 3 + 2] = z
      const x = this.starData[i * 3]
      const y = this.starData[i * 3 + 1]
      arr[i * 6] = x
      arr[i * 6 + 1] = y
      arr[i * 6 + 2] = z
      arr[i * 6 + 3] = x
      arr[i * 6 + 4] = y
      arr[i * 6 + 5] = z - tail
    }
    sp.needsUpdate = true
    const lp = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    const la = lp.array as Float32Array
    const lineMove = speed * 2.4 * dt
    const lineTail = 6 + speed * 0.25
    for (let i = 0; i < this.lineCount; i += 1) {
      let z = this.lineData[i * 4 + 2] + lineMove
      if (z > 12) {
        this.seedLine(i, -170 + Math.random() * 20)
        z = this.lineData[i * 4 + 2]
      }
      this.lineData[i * 4 + 2] = z
      const x = this.lineData[i * 4]
      const y = this.lineData[i * 4 + 1]
      la.set([x, y, z, x, y, z - lineTail * this.lineData[i * 4 + 3]], i * 6)
    }
    lp.needsUpdate = true
    ;(this.lines.material as THREE.LineBasicMaterial).opacity = 0.05 + this.boost * 0.85
    ;(this.stars.material as THREE.LineBasicMaterial).opacity = 0.75 + this.boost * 0.25
  }
}
