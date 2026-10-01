import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { getWorld, mutate, useWorld } from '../../state/store'
import { ISLANDS } from '../layout'
import { MAT, colorMat } from '../kit'
import { Crate, Lamp, Room } from './common'
import { sfx } from '../../audio/sfx'

const STRIPE_A = colorMat('#fff4e0')
const STRIPE_B = colorMat('#ff8f70')

function Airship() {
  const ship = useRef<THREE.Group>(null)
  const prop = useRef<THREE.Mesh>(null)
  const lantern = useRef<THREE.MeshStandardMaterial>(null)
  const cargo = useRef<THREE.Mesh>(null)
  useFrame(({ clock }, dt) => {
    const g = ship.current
    if (!g) return
    const s = getWorld()
    const t = clock.elapsedTime
    const shipPending = Object.values(s.approvals).some((a) => a.status === 'pending' && a.kind === 'ship')
    const anyPending = Object.values(s.approvals).some((a) => a.status === 'pending')
    const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
    const since = p?.status === 'done' && p.finishedAt ? (Date.now() - p.finishedAt) / 1000 : 999
    // Delivered: sail away over the horizon, then drift back home.
    let x = 2.4
    let y = 1.5 + Math.sin(t * 1.1) * 0.12
    let z = 2.3
    if (since < 22) {
      const k = since < 11 ? since / 11 : 1 - (since - 11) / 11
      const e = k * k * (3 - 2 * k)
      x += e * 22
      y += e * 7
      z += e * 6
    }
    g.position.set(x, y, z)
    g.rotation.z = Math.sin(t * 0.8) * 0.04
    if (prop.current) prop.current.rotation.x += dt * (since < 22 ? 30 : 6)
    if (lantern.current) lantern.current.emissiveIntensity = anyPending ? 2 + Math.sin(t * 6) * 1.2 : 0.4
    if (cargo.current) cargo.current.visible = shipPending || (since < 11 && since >= 0)
  })
  return (
    <group ref={ship}>
      <mesh scale={[1.7, 0.74, 0.74]} castShadow material={STRIPE_A}>
        <sphereGeometry args={[1, 28, 18]} />
      </mesh>
      {[-0.9, -0.3, 0.3, 0.9].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={STRIPE_B}>
          <torusGeometry args={[0.745 * Math.sqrt(1 - (x / 1.7) ** 2), 0.06, 8, 36]} />
        </mesh>
      ))}
      {[0.35, -0.35].map((z) => (
        <mesh key={z} position={[-1.55, 0.1, z]} rotation={[z > 0 ? 0.5 : -0.5, 0, 0]} material={STRIPE_B}>
          <boxGeometry args={[0.4, 0.05, 0.35]} />
        </mesh>
      ))}
      <group position={[0, -0.95, 0]}>
        <mesh castShadow material={MAT.wood}>
          <boxGeometry args={[1.1, 0.34, 0.5]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={MAT.woodDark}>
          <boxGeometry args={[1.18, 0.06, 0.56]} />
        </mesh>
        <mesh ref={cargo} position={[0.2, 0.34, 0]} castShadow>
          <boxGeometry args={[0.32, 0.26, 0.28]} />
          <meshStandardMaterial color="#e9c58d" />
        </mesh>
        <mesh position={[-0.45, 0.35, 0.22]}>
          <sphereGeometry args={[0.08, 12, 10]} />
          <meshStandardMaterial ref={lantern} color="#ff9f43" emissive="#ff7b1c" emissiveIntensity={0.4} />
        </mesh>
        <mesh ref={prop} position={[-0.65, 0, 0]}>
          <boxGeometry args={[0.04, 0.5, 0.08]} />
          <meshStandardMaterial color="#6b4a2f" />
        </mesh>
      </group>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} position={[x, -0.5, 0]} material={MAT.rope}>
          <cylinderGeometry args={[0.012, 0.012, 0.6, 4]} />
        </mesh>
      ))}
    </group>
  )
}

/** A little scout balloon launches for every approved web request (and drifts back). */
function Balloons() {
  const n = useWorld((s) => s.game.counters.balloons ?? 0)
  const launched = useRef<{ at: number; seed: number }[]>([])
  const seen = useRef(n)
  const group = useRef<THREE.Group>(null)
  useEffect(() => {
    for (let i = seen.current; i < n; i++) launched.current.push({ at: performance.now() / 1000, seed: Math.random() })
    seen.current = n
  }, [n])
  useFrame(() => {
    const now = performance.now() / 1000
    launched.current = launched.current.filter((b) => now - b.at < 9)
    const g = group.current
    if (!g) return
    g.children.forEach((c, i) => {
      const b = launched.current[i]
      c.visible = Boolean(b)
      if (!b) return
      const k = (now - b.at) / 9
      const up = k < 0.5 ? k * 2 : 2 - k * 2
      c.position.set(-0.6 + Math.sin(k * 8 + b.seed * 6) * 0.3 + up * 3 * (b.seed - 0.5), 0.5 + up * 6, -0.8 - up * 2)
    })
  })
  return (
    <group ref={group}>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} visible={false}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <sphereGeometry args={[0.22, 16, 12]} />
            <meshStandardMaterial color={['#ff8fb1', '#7fd4ff', '#ffd43b', '#9b7bff', '#7cf5c8'][i]} />
          </mesh>
          <mesh position={[0, 0.02, 0]} material={MAT.wood}>
            <boxGeometry args={[0.1, 0.08, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function ApprovalDesk() {
  const pending = useWorld((s) => Object.values(s.approvals).filter((a) => a.status === 'pending').length)
  const flag = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.z = pending ? Math.sin(clock.elapsedTime * 5) * 0.2 : 0
  })
  return (
    <group
      position={[-1.45, 0, -0.35]}
      rotation={[0, 0.5, 0]}
      onClick={(e) => {
        e.stopPropagation()
        sfx('click')
        mutate((s) => {
          const first = Object.values(s.approvals).find((a) => a.status === 'pending')
          s.ui.selection = first ? { kind: 'approval', id: first.id } : { kind: null, id: null }
        })
      }}
    >
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow material={MAT.woodLight}>
        <boxGeometry args={[1.0, 0.08, 0.6]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={MAT.woodDark}>
        <boxGeometry args={[0.9, 0.5, 0.5]} />
      </mesh>
      {Array.from({ length: Math.min(5, pending) }, (_, i) => (
        <mesh key={i} position={[-0.2 + i * 0.02, 0.56 + i * 0.02, 0.05]} rotation={[0, i * 0.2, 0]} material={MAT.paper}>
          <boxGeometry args={[0.32, 0.015, 0.22]} />
        </mesh>
      ))}
      <mesh position={[0.3, 0.62, 0.05]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.16, 12]} />
        <meshStandardMaterial color="#d23c3c" />
      </mesh>
      <group ref={flag} position={[0.45, 0.54, -0.2]}>
        <mesh position={[0, 0.35, 0]} material={MAT.dark}>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
        </mesh>
        <mesh position={[0.15, 0.6, 0]}>
          <planeGeometry args={[0.3, 0.2]} />
          <meshStandardMaterial color={pending ? '#ff5a52' : '#8a8fa3'} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

export function SkyDock() {
  return (
    <Room center={ISLANDS.dock.center}>
      <mesh position={[0.1, 0.03, 0.3]} receiveShadow castShadow material={MAT.plank}>
        <boxGeometry args={[3.4, 0.08, 2.6]} />
      </mesh>
      <mesh position={[0.9, 0.03, 3.1]} receiveShadow castShadow material={MAT.plank}>
        <boxGeometry args={[1.1, 0.08, 3.2]} />
      </mesh>
      {[1.9, 3.1, 4.3].map((z) =>
        [0.4, 1.4].map((x) => (
          <mesh key={`${x}${z}`} position={[x, -0.7, z]} castShadow material={MAT.woodDark}>
            <cylinderGeometry args={[0.07, 0.07, 1.6, 6]} />
          </mesh>
        )),
      )}
      {[
        [-1.5, 1.5],
        [1.7, 1.5],
        [0.4, 4.6],
        [1.4, 4.6],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.35, z]} castShadow material={MAT.woodDark}>
          <cylinderGeometry args={[0.07, 0.08, 0.7, 6]} />
        </mesh>
      ))}
      <ApprovalDesk />
      <Lamp position={[-1.5, 0, 1.5]} height={1.3} color="#ffb870" />
      <Lamp position={[1.7, 0, 1.5]} height={1.3} color="#ffb870" />
      <Crate position={[1.5, 0, -0.9]} size={0.42} rot={0.2} />
      <Crate position={[1.2, 0.42, -1.0]} size={0.3} rot={0.7} />
      <Balloons />
      <Airship />
    </Room>
  )
}
