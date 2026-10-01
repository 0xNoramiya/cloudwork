import { QuadraticBezierLine } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../engine/crew'
import type { RoleId } from '../engine/types'
import { getWorld, useWorld } from '../state/store'
import { agentPositions } from './Agent'
import { ISLANDS, PLAZA_CENTER, home, localToWorld } from './layout'
import { rng } from './kit'

function arcPoint(a: THREE.Vector3, b: THREE.Vector3, k: number, lift: number, out: THREE.Vector3) {
  out.lerpVectors(a, b, k)
  out.y += Math.sin(k * Math.PI) * lift
  return out
}

/** Live data-flow: arcs between islands for hand-offs in transit and for inputs feeding running tasks. */
export function DataFlows() {
  const flows = useWorld(
    useShallow((s) => {
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (!p || s.ui.replay) return [] as string[]
      const out: string[] = []
      for (const id of p.taskIds) {
        const t = s.tasks[id]
        if (!t || !['handoff', 'running'].includes(t.status)) continue
        for (const d of t.dependsOn) {
          const dep = s.tasks[d]
          if (!dep) continue
          const from = dep.kind === 'review' ? 'qa' : dep.role
          if (from === t.role) continue
          out.push(`${t.status}|${from}|${t.role}|${t.id}`)
        }
      }
      return out
    }),
  )
  return (
    <group>
      {flows.map((f) => {
        const [status, from, to, id] = f.split('|')
        return <Flow key={f} status={status} from={from as RoleId} to={to as RoleId} taskId={id} />
      })}
    </group>
  )
}

function Flow({ status, from, to, taskId }: { status: string; from: RoleId; to: RoleId; taskId: string }) {
  const a = useMemo(() => home(from).pos.clone().add(new THREE.Vector3(0, 0.6, 0)), [from])
  const b = useMemo(() => home(to).pos.clone().add(new THREE.Vector3(0, 0.6, 0)), [to])
  const mid = useMemo(() => a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 3.2, 0)), [a, b])
  const parcel = useRef<THREE.Mesh>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(a, mid, b), [a, mid, b])
  useFrame(({ clock }) => {
    if (!parcel.current) return
    const t = getWorld().tasks[taskId]
    let k: number
    if (status === 'handoff' && t?.handoffUntil) k = THREE.MathUtils.clamp(1 - (t.handoffUntil - Date.now()) / 3400, 0, 1)
    else k = (clock.elapsedTime * 0.35) % 1
    curve.getPoint(k, tmp)
    parcel.current.position.copy(tmp)
    parcel.current.rotation.y = clock.elapsedTime * 3
  })
  const color = CREW[from].color
  const handoff = status === 'handoff'
  return (
    <group>
      <QuadraticBezierLine start={a} end={b} mid={mid} color={color} lineWidth={handoff ? 3 : 1.5} dashed={!handoff} dashScale={4} transparent opacity={handoff ? 0.95 : 0.45} />
      <mesh ref={parcel}>
        {handoff ? <boxGeometry args={[0.22, 0.18, 0.18]} /> : <sphereGeometry args={[0.07, 10, 8]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={handoff ? 0.8 : 1.6} />
      </mesh>
    </group>
  )
}

/** A glowing orb flies from Moss into the Memory Tree whenever memories are filed. */
export function MemoryFlight() {
  const orb = useRef<THREE.Mesh>(null)
  const state = useRef({ last: 0, start: 0 })
  const target = useMemo(() => localToWorld(ISLANDS.archivist.center, 0, -0.9, 3.0), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const m = orb.current
    if (!m) return
    const pulse = getWorld().game.counters.memoryPulse ?? 0
    if (pulse !== state.current.last) {
      state.current.last = pulse
      state.current.start = performance.now()
    }
    const k = (performance.now() - state.current.start) / 1400
    m.visible = k >= 0 && k <= 1 && state.current.start > 0
    if (!m.visible) return
    const from = agentPositions.archivist.clone().add(new THREE.Vector3(0, 0.9, 0))
    arcPoint(from, target, k, 1.2, tmp)
    m.position.copy(tmp)
    m.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6)
  })
  return (
    <mesh ref={orb} visible={false}>
      <sphereGeometry args={[0.13, 14, 12]} />
      <meshBasicMaterial color={[1.5, 3, 2.8]} toneMapped={false} />
    </mesh>
  )
}

/** Confetti burst over the plaza when a project ships. */
export function Confetti() {
  const at = useWorld((s) => s.ui.celebrate?.at ?? 0)
  const ref = useRef<THREE.InstancedMesh>(null)
  const N = 220
  const seeds = useMemo(() => {
    const r = rng(7)
    return Array.from({ length: N }, () => ({ a: r() * Math.PI * 2, v: 3 + r() * 5, up: 6 + r() * 6, spin: r() * 10, c: r() }))
  }, [])
  useFrame(() => {
    const inst = ref.current
    if (!inst) return
    const t = (Date.now() - at) / 1000
    inst.visible = at > 0 && t < 7
    if (!inst.visible) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    seeds.forEach((sd, i) => {
      const x = Math.cos(sd.a) * sd.v * Math.min(t, 1.5)
      const z = Math.sin(sd.a) * sd.v * Math.min(t, 1.5)
      const y = 1 + sd.up * t - 4.9 * t * t * 0.55
      p.set(x, Math.max(y, PLAZA_CENTER.y + 0.02), z)
      e.set(sd.spin * t, sd.spin * t * 0.7, 0)
      q.setFromEuler(e)
      m.compose(p, q, s)
      inst.setMatrixAt(i, m)
    })
    inst.instanceMatrix.needsUpdate = true
  })
  const colors = useMemo(() => {
    const pal = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#f783ac', '#9775fa', '#ffa94d']
    const arr = new Float32Array(N * 3)
    const c = new THREE.Color()
    seeds.forEach((sd, i) => {
      c.set(pal[Math.floor(sd.c * pal.length)])
      arr.set([c.r, c.g, c.b], i * 3)
    })
    return arr
  }, [seeds])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} visible={false}>
      <planeGeometry args={[0.14, 0.2]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </planeGeometry>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/** Puffy clouds: a low layer drifting beneath the islands, and a high ring that circles the edge (never over the plaza). */
export function Clouds({ tint }: { tint: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const puffs = useMemo(() => {
    const r = rng(42)
    const out: { low: boolean; ang: number; rad: number; off: THREE.Vector3; y: number; s: number; speed: number }[] = []
    for (let c = 0; c < 22; c++) {
      const low = c < 15
      const ang = r() * Math.PI * 2
      const rad = low ? 4 + r() * 26 : 24 + r() * 8
      const y = low ? -5.5 - r() * 3 : 1.5 + r() * 4
      const speed = 0.15 + r() * 0.25
      const n = 4 + Math.floor(r() * 4)
      for (let i = 0; i < n; i++) {
        out.push({ low, ang, rad, off: new THREE.Vector3((r() - 0.5) * 4, r() * 0.8, (r() - 0.5) * 3), y, s: (low ? 1.4 : 0.8) + r() * 1.4, speed })
      }
    }
    return out
  }, [])
  useFrame(({ clock }) => {
    const inst = ref.current
    if (!inst) return
    const t = clock.elapsedTime
    const m = new THREE.Matrix4()
    puffs.forEach((p, i) => {
      let x: number
      let z: number
      if (p.low) {
        x = Math.cos(p.ang) * p.rad + p.off.x + t * p.speed
        x = ((((x + 40) % 80) + 80) % 80) - 40
        z = Math.sin(p.ang) * p.rad + p.off.z
      } else {
        const a = p.ang + (t * p.speed) / p.rad
        x = Math.cos(a) * p.rad + p.off.x
        z = Math.sin(a) * p.rad + p.off.z
      }
      m.makeScale(p.s * 1.3, p.s * 0.75, p.s).setPosition(x, p.y + p.off.y + Math.sin(t * 0.3 + i) * 0.1, z)
      inst.setMatrixAt(i, m)
    })
    inst.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, puffs.length]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial color={tint} roughness={1} transparent opacity={0.92} depthWrite={false} />
    </instancedMesh>
  )
}

export function Birds() {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    group.current?.children.forEach((b, i) => {
      const a = t * (0.12 + i * 0.015) + i * 2.1
      const r = 17 + (i % 3) * 3
      b.position.set(Math.cos(a) * r, 6 + Math.sin(t * 0.5 + i) * 1.2 + (i % 2), Math.sin(a) * r)
      b.rotation.y = -a
      const flap = Math.sin(t * 9 + i) * 0.6
      b.children[0].rotation.x = flap
      b.children[1].rotation.x = -flap
    })
  })
  return (
    <group ref={group}>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i}>
          <mesh position={[0, 0, 0.18]}>
            <boxGeometry args={[0.08, 0.02, 0.36]} />
            <meshStandardMaterial color="#5b5670" />
          </mesh>
          <mesh position={[0, 0, -0.18]}>
            <boxGeometry args={[0.08, 0.02, 0.36]} />
            <meshStandardMaterial color="#5b5670" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Night fireflies / spring petals depending on theme. */
export function Particles({ kind }: { kind: 'fireflies' | 'petals' | null }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const N = 80
  const seeds = useMemo(() => {
    const r = rng(99)
    return Array.from({ length: N }, () => ({ x: (r() - 0.5) * 36, y: r() * 6, z: (r() - 0.5) * 36, p: r() * 10 }))
  }, [])
  useFrame(({ clock }) => {
    const inst = ref.current
    if (!inst || !kind) return
    const t = clock.elapsedTime
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    seeds.forEach((s, i) => {
      if (kind === 'fireflies') {
        m.makeScale(1, 1, 1).setPosition(s.x + Math.sin(t * 0.5 + s.p) * 0.8, 0.6 + s.y * 0.4 + Math.sin(t + s.p) * 0.3, s.z + Math.cos(t * 0.4 + s.p) * 0.8)
      } else {
        const y = 8 - ((t * 0.6 + s.p * 3) % 10)
        q.setFromEuler(new THREE.Euler(t + s.p, t * 0.7, 0))
        m.compose(new THREE.Vector3(s.x + Math.sin(t + s.p) * 1.2, y, s.z), q, new THREE.Vector3(1, 1, 1))
      }
      inst.setMatrixAt(i, m)
    })
    inst.instanceMatrix.needsUpdate = true
  })
  if (!kind) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      {kind === 'fireflies' ? <sphereGeometry args={[0.05, 6, 5]} /> : <planeGeometry args={[0.12, 0.09]} />}
      {kind === 'fireflies' ? (
        <meshBasicMaterial color={[3, 2.6, 0.9]} toneMapped={false} />
      ) : (
        <meshStandardMaterial color="#ffc2dd" side={THREE.DoubleSide} />
      )}
    </instancedMesh>
  )
}

export function HotAirBalloon() {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.05
    if (ref.current) ref.current.position.set(Math.cos(t) * 21, 5 + Math.sin(t * 3) * 0.8, Math.sin(t) * 21)
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[1.1, 20, 16]} />
        <meshStandardMaterial color="#ff8fb1" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[1.12, 8, 16]} />
        <meshStandardMaterial color="#ffd43b" wireframe />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.35, 0.5]} />
        <meshStandardMaterial color="#b9814f" />
      </mesh>
    </group>
  )
}

export function Stars({ on }: { on: boolean }) {
  const geo = useMemo(() => {
    const r = rng(5)
    const pts = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      const th = r() * Math.PI * 2
      const ph = Math.acos(r() * 0.9)
      const rad = 70
      pts.set([Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad - 10, Math.sin(ph) * Math.sin(th) * rad], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    return g
  }, [])
  if (!on) return null
  return (
    <points geometry={geo}>
      <pointsMaterial color="#ffffff" size={2} sizeAttenuation={false} transparent opacity={0.85} />
    </points>
  )
}

