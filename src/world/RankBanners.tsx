import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../engine/crew'
import { rankFor } from '../engine/game/defs'
import type { RoleId } from '../engine/types'
import { useWorld } from '../state/store'
import { ISLANDS, PLAZA_CENTER, localToWorld } from './layout'
import { MAT } from './kit'

const GOLD = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.8, roughness: 0.3, emissive: '#a86b00', emissiveIntensity: 0.25 })

/** Room upgrades earned by the resident: a pennant that gains stars per rank, and a gold crest from Master up. */
function Banner({ role, pos, rank }: { role: RoleId; pos: THREE.Vector3; rank: number }) {
  const flag = useRef<THREE.Group>(null)
  const crest = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: CREW[role].color, roughness: 0.7, side: THREE.DoubleSide }), [role])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (flag.current) flag.current.rotation.y = Math.sin(t * 1.7 + pos.x) * 0.18
    if (crest.current) crest.current.rotation.y = t * 0.8
  })
  const stars = rank + 1
  return (
    <group position={pos}>
      <mesh position={[0, 0.9, 0]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.035, 0.045, 1.8, 6]} />
      </mesh>
      <group ref={flag} position={[0, 1.55, 0]}>
        <mesh position={[0.32, 0, 0]} material={mat} castShadow>
          <planeGeometry args={[0.62, 0.42]} />
        </mesh>
        {Array.from({ length: stars }, (_, i) => (
          <mesh key={i} position={[0.12 + i * 0.1, -0.12 + (i % 2) * 0.05, 0.01]} rotation={[0, 0, Math.PI / 4]} material={GOLD}>
            <boxGeometry args={[0.055, 0.055, 0.02]} />
          </mesh>
        ))}
      </group>
      {rank >= 3 && (
        <mesh ref={crest} position={[0, 1.98, 0]} material={GOLD}>
          <octahedronGeometry args={[0.1, 0]} />
        </mesh>
      )}
    </group>
  )
}

export function RankBanners() {
  const ranks = useWorld(
    useShallow((s) => (['planner', 'researcher', 'coder', 'writer', 'designer', 'analyst', 'qa', 'archivist'] as RoleId[]).map((r) => rankFor(s.agents[r].xp).index)),
  )
  const spots = useMemo(() => {
    const out: { role: RoleId; pos: THREE.Vector3 }[] = [{ role: 'planner', pos: localToWorld(PLAZA_CENTER, 3.9, -3.2) }]
    for (const role of ['researcher', 'coder', 'writer', 'designer', 'analyst', 'qa', 'archivist'] as RoleId[]) {
      const isl = ISLANDS[role as Exclude<RoleId, 'planner'>]
      // Beside the bridge landing, where every visitor walks past it.
      const side = new THREE.Vector3(isl.dir.z, 0, -isl.dir.x).multiplyScalar(0.75)
      out.push({ role, pos: isl.door.clone().addScaledVector(isl.dir, 0.35).add(side).setY(isl.center.y) })
    }
    return out
  }, [])
  return (
    <group>
      {spots.map((s, i) => (
        <Banner key={s.role} role={s.role} pos={s.pos} rank={ranks[i]} />
      ))}
    </group>
  )
}
