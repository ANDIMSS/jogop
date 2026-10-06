import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_RUN'
type Boundary = 'run'
type Section = 'ship' | 'roll' | 'weapon' | 'rail'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string; default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const bindings: Binding[] = []
function number(section: Section, key: string, label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as unknown as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as unknown as Record<string, number>
  const category = section === 'ship' ? 'Flight' : section === 'roll' ? 'Evasion' : section === 'weapon' ? 'Weapons' : 'Rail'
  bindings.push({
    control: Object.freeze({
      id: `${section}.${key}`, type: 'number', category, label,
      description: boundary ? 'Applies at the beginning of the next run.' : 'Updates this preview immediately.',
      unit, default: defaults[key], min, max, step,
      applyMode: boundary ? 'NEXT_RUN' : 'LIVE', integrity: 'GAMEPLAY',
    }),
    boundary,
    read: () => values[key],
    write: value => { values[key] = value },
  })
}

number('ship', 'speed', 'Flight speed', 8, 28, 1, 'u/s')
number('ship', 'accel', 'Steering acceleration', 30, 150, 5, 'u/s²')
number('ship', 'followRate', 'Reticle response', 2, 16, 0.5, '')
number('roll', 'cooldown', 'Roll cooldown', 0.2, 2, 0.1, 's')
number('weapon', 'rate', 'Fire rate', 6, 20, 1, 'shots/s')
number('rail', 'speed', 'Cruise speed', 20, 55, 1, 'u/s', 'run')
number('rail', 'boost', 'Boost speed', 40, 85, 1, 'u/s', 'run')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default])) as Record<string, number>
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    requested = { ...requested, ...patch } as Record<string, number>
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    // A new run is eligible only when all active values match the shipped defaults.
    unranked = gameplayModified()
  },
}
