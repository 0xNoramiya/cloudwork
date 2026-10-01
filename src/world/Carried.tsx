import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { RoleId } from '../engine/types'
import { useWorld } from '../state/store'
import { CREW } from '../engine/crew'

/** The item a crew member is visibly carrying: hand-off parcels, approval letters, memory orbs, QA stamps. */
export function Carried({ role }: { role: RoleId }) {
  const item = useWorld((s) => (s.ui.replay ? null : s.agents[role].carrying))
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.position.y = 0.78 + Math.sin(t * 4 + role.length) * 0.03
    ref.current.rotation.y = Math.sin(t * 1.5) * 0.3
  })
  if (!item) return null
  return (
    <group ref={ref} position={[0, 0.78, 0.36]}>
      {item === 'parcel' && (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.2, 0.2]} />
            <meshStandardMaterial color="#e9c58d" roughness={0.8} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.27, 0.21, 0.05]} />
            <meshStandardMaterial color={CREW[role].color} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.05, 0.21, 0.21]} />
            <meshStandardMaterial color={CREW[role].color} />
          </mesh>
        </group>
      )}
      {item === 'letter' && (
        <group rotation={[0.2, 0, 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.2, 0.02]} />
            <meshStandardMaterial color="#fffaf0" />
          </mesh>
          <mesh position={[0, 0, 0.015]}>
            <cylinderGeometry args={[0.04, 0.04, 0.01, 12]} />
            <meshStandardMaterial color="#d23c3c" />
          </mesh>
        </group>
      )}
      {item === 'orb' && (
        <mesh>
          <sphereGeometry args={[0.11, 20, 16]} />
          <meshStandardMaterial color="#b8fff4" emissive="#4fe3d0" emissiveIntensity={2.4} />
        </mesh>
      )}
      {(item === 'stamp-ok' || item === 'stamp-bad') && (
        <group rotation={[Math.PI / 2 - 0.3, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.13, 0.13, 0.03, 24]} />
            <meshStandardMaterial color={item === 'stamp-ok' ? '#3fbf7f' : '#e5534b'} emissive={item === 'stamp-ok' ? '#1f8f55' : '#a32a24'} emissiveIntensity={0.6} />
          </mesh>
        </group>
      )}
    </group>
  )
}
