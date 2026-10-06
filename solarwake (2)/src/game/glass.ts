import * as THREE from 'three'

/**
 * The Continuous Loop's glass ribbon: one long, transparent, refractive band that hangs in
 * zero gravity inside the ship's frame (rig space), so a fixed camera always sees it framed.
 * It undulates and slowly twists in the vertex shader and the caustics travel along it in UV
 * space, which is what sells the motion — nothing here scrolls the world or moves the camera.
 */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vBand;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  /** Layered, very slow waves: the whole ribbon breathes over ~30-90 s per cycle. */
  float height(float x, float z, float t) {
    return sin(z * 0.021 + t * 0.11) * 1.45
         + sin(z * 0.0095 - t * 0.063 + x * 0.035) * 1.05
         + sin(z * 0.052 + t * 0.19 + x * 0.09) * 0.38;
  }

  void main() {
    vBand = uv;
    vec3 p = position;
    // Slow twist around the length axis: the band rolls like a strip of film in zero gravity.
    float roll = sin(p.z * 0.012 - uTime * 0.08) * 0.55 + sin(p.z * 0.004 + uTime * 0.05) * 0.30;
    float ca = cos(roll);
    float sa = sin(roll);
    vec3 q = vec3(p.x * ca, p.x * sa, p.z);
    q.y += height(q.x, q.z, uTime) * uAmp;
    // Height-field normal by finite differences, then rolled with the band.
    float e = 1.5;
    float hx = (height(q.x + e, q.z, uTime) - height(q.x - e, q.z, uTime)) * uAmp / (2.0 * e);
    float hz = (height(q.x, q.z + e, uTime) - height(q.x, q.z - e, uTime)) * uAmp / (2.0 * e);
    vec3 n = normalize(vec3(-hx, 1.0, -hz));
    n = vec3(n.x * ca - n.y * sa, n.x * sa + n.y * ca, n.z);
    vec4 wp = modelMatrix * vec4(q, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vBand;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  float caustic(vec2 p) {
    float v = sin(p.x) * sin(p.y * 1.2);
    v += sin(p.x * 1.7 + 1.3) * sin(p.y * 1.9 - 0.7);
    v += sin(p.x * 2.3 - 0.4) * sin(p.y * 2.7 + 2.1);
    return clamp(0.5 + v * 0.16667, 0.0, 1.0);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
    // Per-channel fresnel: the rim disperses into colour, the middle stays clear glass.
    float fr = pow(1.0 - ndv, 2.4);
    float fg = pow(1.0 - ndv, 2.9);
    float fb = pow(1.0 - ndv, 3.5);
    // Caustics travelling along the band, plus a slower cross-flow.
    vec2 q = vec2(vBand.y * 34.0 - uTime * 0.30, vBand.x * 6.0 + sin(vBand.y * 5.0 + uTime * 0.15) * 0.8);
    float c = pow(caustic(q), 3.0);
    vec2 q2 = vBand * vec2(9.0, 21.0) + vec2(uTime * 0.05, -uTime * 0.11);
    float c2 = pow(caustic(q2), 4.0);
    // Fade both ends so the band dissolves instead of ending.
    float fade = smoothstep(0.0, 0.12, vBand.y) * smoothstep(1.0, 0.78, vBand.y);
    vec3 rim = vec3(fr, fg, fb) * vec3(0.46, 0.62, 1.0) * (0.9 + c * 0.6);
    vec3 body = vec3(0.34, 0.52, 0.72) * (0.16 + c * 0.42 + c2 * 0.30);
    vec3 col = rim + body + vec3(0.85, 0.95, 1.0) * c2 * 0.45;
    // The two long edges catch light like the lip of a sheet of glass.
    float edge = smoothstep(0.94, 1.0, max(vBand.x, 1.0 - vBand.x));
    col += vec3(0.62, 0.88, 1.0) * edge * (0.35 + c * 0.5);
    float alpha = (0.09 + (fr + fg + fb) * 0.24 + c * 0.16 + edge * 0.34) * fade * uOpacity;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }`

export type GlassOptions = {
  /** Width of the band across its length axis (units). */
  width?: number
  /** Length of the band (units). */
  length?: number
  /** Where the band's centre sits inside the ship's frame (rig space). */
  offset?: [number, number, number]
  /** Yaw / pitch / roll of the band in rig space, radians. */
  pose?: [number, number, number]
  /** Undulation amplitude multiplier. */
  amplitude?: number
}

export class GlassRibbon {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private readonly group = new THREE.Group()
  private fade = 0
  private target = 0

  constructor(detail: number, opts: GlassOptions = {}) {
    const width = opts.width ?? 40
    const length = opts.length ?? 400
    const cols = Math.max(4, Math.round(6 * detail))
    const rows = Math.max(60, Math.round(190 * detail))
    const positions = new Float32Array((rows + 1) * (cols + 1) * 3)
    const uvs = new Float32Array((rows + 1) * (cols + 1) * 2)
    let v = 0
    let t = 0
    for (let j = 0; j <= rows; j += 1) {
      const fz = j / rows
      const z = (fz - 0.5) * length
      for (let i = 0; i <= cols; i += 1) {
        const fx = i / cols
        positions[v++] = (fx - 0.5) * width
        positions[v++] = 0
        positions[v++] = z
        uvs[t++] = fx
        uvs[t++] = fz
      }
    }
    const indices: number[] = []
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const a = j * (cols + 1) + i
        const b = a + 1
        const c = a + (cols + 1)
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeBoundingSphere()

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uAmp: { value: (opts.amplitude ?? 1) * 2.0 },
      },
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
    // The band runs along its local Z; yawed across the flight axis it reads as a sheet of glass
    // crossing the frame, and the slight pitch/roll keeps its face visible from the tripod.
    const [yaw, pitch, roll] = opts.pose ?? [Math.PI * 0.5, -0.02, 0.62]
    const [ox, oy, oz] = opts.offset ?? [-6, 12, -100]
    this.group.rotation.order = 'YXZ'
    this.group.rotation.set(pitch, yaw, roll)
    this.group.position.set(ox, oy, oz)
    this.group.add(this.mesh)
    // Parked until a theme asks for it, so other stages pay nothing.
    this.group.visible = false
  }

  /** Add to the ship's frame (rig), not to the world. */
  get object(): THREE.Object3D {
    return this.group
  }

  /** 0 = hidden, 1 = fully present. Fades in/out so theme swaps read as a dissolve. */
  setEnabled(on: boolean): void {
    this.target = on ? 1 : 0
    if (on) this.group.visible = true
  }

  get enabled(): boolean {
    return this.target > 0.5
  }

  /** Smoothed presence, used by the stage to drive post-processing. */
  get level(): number {
    return this.fade
  }

  update(simSeconds: number, dt: number): void {
    this.fade += (this.target - this.fade) * (1 - Math.exp(-dt * 1.1))
    this.material.uniforms.uTime.value = simSeconds
    this.material.uniforms.uOpacity.value = this.fade
    this.group.visible = this.fade > 0.004
  }
}
