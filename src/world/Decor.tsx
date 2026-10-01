import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { DECOR_SLOTS } from '../engine/game/defs'
import { getWorld, mutate, useWorld } from '../state/store'
import { ISLANDS, PLAZA_CENTER, localToWorld, type IslandId } from './layout'
import { MAT, colorMat } from './kit'
import { Crate, Plant } from './rooms/common'
import { sfx } from '../audio/sfx'

const GOLD = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.85, roughness: 0.25 })
const PETAL = colorMat('#ffb3d1', { flatShading: true })
const PETAL2 = colorMat('#ff8fbf', { flatShading: true })

function Windmill() {
  const blades = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z += dt * (0.5 + getWorld().game.momentum / 25)
  })
  return (
    <group>
      <mesh position={[0, 0.9, 0]} castShadow material={MAT.white}>
        <cylinderGeometry args={[0.05, 0.1, 1.8, 8]} />
      </mesh>
      <group ref={blades} position={[0, 1.8, 0.1]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]} castShadow material={MAT.white}>
            <boxGeometry args={[0.1, 1.2, 0.03]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Lanterns() {
  return (
    <group>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.7, 0]} castShadow material={MAT.woodDark}>
          <cylinderGeometry args={[0.04, 0.05, 1.4, 6]} />
        </mesh>
      ))}
      {[-0.35, 0, 0.35].map((x, i) => (
        <mesh key={x} position={[x, 1.2 - Math.cos(x * 2) * 0.12, 0]}>
          <sphereGeometry args={[0.13, 12, 10]} />
          <meshStandardMaterial color={['#ff7a7a', '#ffd166', '#ff9fd0'][i]} emissive={['#ff4d4d', '#ffb020', '#ff6fb8'][i]} emissiveIntensity={1.2} />
        </mesh>
      ))}
    </group>
  )
}

function Flowers() {
  return (
    <group>
      <mesh position={[0, 0.08, 0]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.5, 0.5, 0.16, 18]} />
      </mesh>
      <mesh position={[0, 0.17, 0]} material={MAT.dirt}>
        <cylinderGeometry args={[0.45, 0.45, 0.02, 18]} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        const r = i % 3 === 0 ? 0.1 : 0.3
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.3, Math.sin(a) * r]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={['#ff8fb1', '#ffd43b', '#b39bff', '#ffffff'][i % 4]} />
          </mesh>
        )
      })}
    </group>
  )
}

function BlossomTree() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.08, 0.14, 1.2, 8]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} castShadow material={PETAL}>
        <icosahedronGeometry args={[0.6, 1]} />
      </mesh>
      <mesh position={[0.35, 1.25, 0.2]} castShadow material={PETAL2}>
        <icosahedronGeometry args={[0.38, 1]} />
      </mesh>
    </group>
  )
}

function Telescope() {
  return (
    <group>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2]} rotation={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]} material={MAT.woodDark}>
          <cylinderGeometry args={[0.025, 0.025, 0.85, 5]} />
        </mesh>
      ))}
      <mesh position={[0, 0.95, 0]} rotation={[0.3, 0, 0.9]} castShadow material={MAT.brass}>
        <cylinderGeometry args={[0.07, 0.11, 0.9, 12]} />
      </mesh>
    </group>
  )
}

function Statue() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow material={MAT.stone}>
        <boxGeometry args={[0.8, 0.5, 0.8]} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow material={GOLD}>
        <capsuleGeometry args={[0.22, 0.4, 6, 12]} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow material={GOLD}>
        <sphereGeometry args={[0.22, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.7, 0]} rotation={[0, 0, Math.PI / 4]} material={GOLD}>
        <octahedronGeometry args={[0.14, 0]} />
      </mesh>
    </group>
  )
}

function DecorModel({ id }: { id: string }) {
  switch (id) {
    case 'decor-plant':
      return <Plant position={[0, 0, 0]} scale={1.3} />
    case 'decor-crates':
      return (
        <group>
          <Crate position={[0, 0, 0]} size={0.42} />
          <Crate position={[0.4, 0, 0.1]} size={0.34} rot={0.5} />
          <Crate position={[0.15, 0.42, 0.02]} size={0.3} rot={0.2} />
        </group>
      )
    case 'decor-lantern':
      return <Lanterns />
    case 'decor-flowers':
      return <Flowers />
    case 'decor-windmill':
      return <Windmill />
    case 'decor-tree':
      return <BlossomTree />
    case 'decor-telescope':
      return <Telescope />
    case 'decor-statue':
      return <Statue />
    default:
      return null
  }
}

function slotWorld(slot: (typeof DECOR_SLOTS)[number]): THREE.Vector3 {
  const center = slot.island === 'planner' ? PLAZA_CENTER : ISLANDS[slot.island as IslandId].center
  return localToWorld(center, slot.x, slot.z)
}

function SlotMarker({ id, selected }: { id: string; selected: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.08)
  })
  return (
    <mesh
      ref={ref}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.05, 0]}
      onClick={(e) => {
        e.stopPropagation()
        sfx('pop')
        mutate((s) => {
          s.ui.decorSlot = id
        })
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <ringGeometry args={[0.35, 0.5, 32]} />
      <meshBasicMaterial color={selected ? '#ffd43b' : '#ffffff'} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  )
}

export function Decorations() {
  const decor = useWorld((s) => s.game.decor)
  const decorating = useWorld((s) => s.ui.panel === 'decorate')
  const sel = useWorld((s) => s.ui.decorSlot)
  return (
    <group>
      {DECOR_SLOTS.map((slot) => {
        const pos = slotWorld(slot)
        const item = decor[slot.id]
        return (
          <group key={slot.id} position={pos}>
            {item && <DecorModel id={item} />}
            {decorating && <SlotMarker id={slot.id} selected={sel === slot.id} />}
          </group>
        )
      })}
    </group>
  )
}
