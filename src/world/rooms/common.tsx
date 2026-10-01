import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { getWorld } from '../../state/store'
import type { RoleId } from '../../engine/types'
import { SCREEN_YAW } from '../layout'
import { MAT } from '../kit'

/** Group positioned at an island center, rotated into the screen-aligned room frame. */
export function Room({ center, children }: { center: THREE.Vector3; children: ReactNode }) {
  return (
    <group position={center} rotation={[0, SCREEN_YAW, 0]}>
      {children}
    </group>
  )
}

export function isBusy(role: RoleId): boolean {
  const a = getWorld().agents[role].activity
  return a === 'working' || a === 'thinking' || a === 'tool' || a === 'memory'
}

export function Lamp({ position, height = 1.5, color = '#ffe4a3' }: { position: [number, number, number]; height?: number; color?: string }) {
  const light = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (!light.current) return
    const night = getWorld().game.theme === 'theme-starlight'
    light.current.emissiveIntensity = night ? 3 : 0.6
  })
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow material={MAT.dark}>
        <cylinderGeometry args={[0.04, 0.06, height, 8]} />
      </mesh>
      <mesh position={[0, height + 0.08, 0]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial ref={light} color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, height + 0.22, 0]} material={MAT.dark}>
        <coneGeometry args={[0.16, 0.14, 8]} />
      </mesh>
    </group>
  )
}

export function Crate({ position, size = 0.4, rot = 0 }: { position: [number, number, number]; size?: number; rot?: number }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh position={[0, size / 2, 0]} castShadow receiveShadow material={MAT.woodLight}>
        <boxGeometry args={[size, size, size]} />
      </mesh>
      <mesh position={[0, size / 2, 0]} material={MAT.woodDark}>
        <boxGeometry args={[size * 1.02, size * 0.12, size * 1.02]} />
      </mesh>
    </group>
  )
}

export function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.14, 0]} castShadow material={MAT.roofRed}>
        <cylinderGeometry args={[0.16, 0.12, 0.28, 10]} />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow material={MAT.leaf}>
        <icosahedronGeometry args={[0.24, 0]} />
      </mesh>
      <mesh position={[0.1, 0.6, 0.05]} castShadow material={MAT.leafLight}>
        <icosahedronGeometry args={[0.15, 0]} />
      </mesh>
    </group>
  )
}

export function Rug({ position, radius = 0.9, color = '#e8b4c8' }: { position: [number, number, number]; radius?: number; color?: string }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 1 }), [color])
  return (
    <mesh position={[position[0], position[1] + 0.012, position[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat}>
      <circleGeometry args={[radius, 32]} />
    </mesh>
  )
}
