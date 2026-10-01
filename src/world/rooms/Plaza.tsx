import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import type { TaskStatus } from '../../engine/types'
import { getWorld, mutate, useWorld } from '../../state/store'
import { pushToast } from '../../engine/game/progression'
import { sfx } from '../../audio/sfx'
import { PLAZA_CENTER } from '../layout'
import { MAT, makeCanvasTexture } from '../kit'
import { Lamp, Room } from './common'

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: '#b8b2a7',
  handoff: '#7fb2ff',
  ready: '#9bc4ff',
  running: '#ffb347',
  awaiting_approval: '#ff7aa2',
  needs_input: '#ff7aa2',
  blocked: '#e5534b',
  done: '#44c07a',
  failed: '#e5534b',
  cancelled: '#8d8a99',
  paused: '#a99fd6',
}

function polar(angleDeg: number, r: number): [number, number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [Math.cos(a) * r, 0, -Math.sin(a) * r]
}

/** Hologram above the planning table: one glowing pip per task in the active project, colored by live status. */
function Hologram() {
  const keys = useWorld(
    useShallow((s) => {
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (!p) return [] as string[]
      return p.taskIds.filter((id) => s.tasks[id]).map((id) => `${id}|${s.tasks[id].status}`)
    }),
  )
  const tasks = keys.map((k) => {
    const [id, status] = k.split('|')
    return { id, status: status as TaskStatus }
  })
  const status = useWorld((s) => (s.activeProjectId ? s.projects[s.activeProjectId]?.status : undefined))
  const ring = useRef<THREE.Group>(null)
  const disc = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }, dt) => {
    if (ring.current) ring.current.rotation.y += dt * (status === 'running' || status === 'planning' ? 0.5 : 0.12)
    if (disc.current) {
      const busy = status === 'running' || status === 'planning' || status === 'delivering'
      disc.current.emissiveIntensity = (busy ? 1.1 : 0.45) + Math.sin(clock.elapsedTime * 3) * 0.15
    }
  })
  const col = status === 'done' ? '#5ff0a8' : status === 'paused' ? '#b4a8ff' : status === 'failed' ? '#ff6b6b' : '#7fd4ff'
  return (
    <group position={[0, 0.95, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 1.25, 48]} />
        <meshStandardMaterial ref={disc} color={col} emissive={col} emissiveIntensity={0.8} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={ring}>
        {tasks.map((t, i) => {
          const a = (i / Math.max(1, tasks.length)) * Math.PI * 2
          const done = t.status === 'done'
          const c = STATUS_COLOR[t.status]
          return (
            <mesh key={t.id} position={[Math.cos(a) * 0.9, done ? 0.55 : t.status === 'running' ? 0.35 : 0.15, Math.sin(a) * 0.9]}>
              <octahedronGeometry args={[t.status === 'running' ? 0.11 : 0.08, 0]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

function PlanningTable() {
  return (
    <group>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow material={MAT.woodLight}>
        <cylinderGeometry args={[1.45, 1.4, 0.12, 40]} />
      </mesh>
      <mesh position={[0, 0.66, 0]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[1.5, 1.5, 0.05, 40]} />
      </mesh>
      <mesh position={[0, 0.79, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.paper}>
        <circleGeometry args={[1.05, 36]} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.28, 0.45, 0.66, 12]} />
      </mesh>
      <Hologram />
    </group>
  )
}

/** Notice board with one pinned card per task, redrawn whenever statuses change. */
function TaskBoard() {
  const rows = useWorld(
    useShallow((s) => {
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (!p) return [] as string[]
      return p.taskIds
        .map((id) => s.tasks[id])
        .filter(Boolean)
        .map((t) => `${t.status}|${t.role}|${t.title}`)
    }),
  )
  const title = useWorld((s) => (s.activeProjectId ? s.projects[s.activeProjectId]?.title : null))
  const { ctx, tex } = useMemo(() => makeCanvasTexture(512, 384), [])
  useEffect(() => {
    ctx.fillStyle = '#c99462'
    ctx.fillRect(0, 0, 512, 384)
    ctx.fillStyle = '#f7ecd6'
    ctx.fillRect(14, 14, 484, 356)
    ctx.fillStyle = '#5a3d25'
    ctx.font = '700 30px Fredoka, sans-serif'
    ctx.fillText((title ?? 'No active project').slice(0, 28), 30, 54)
    ctx.font = '600 20px Nunito, sans-serif'
    const list = rows.slice(0, 9)
    if (list.length === 0) {
      ctx.fillStyle = '#8a7a66'
      ctx.fillText('Give the crew a goal to get started!', 30, 110)
    }
    list.forEach((r, i) => {
      const [status, role, name] = r.split('|')
      const y = 92 + i * 31
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(28, y - 21, 456, 27)
      ctx.fillStyle = STATUS_COLOR[status as TaskStatus]
      ctx.beginPath()
      ctx.arc(44, y - 8, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#3a2e22'
      ctx.fillText(name.slice(0, 26), 62, y)
      ctx.fillStyle = CREW[role as keyof typeof CREW]?.color ?? '#666'
      ctx.fillText(CREW[role as keyof typeof CREW]?.name ?? '', 410, y)
    })
    tex.needsUpdate = true
  }, [rows, title, ctx, tex])
  return (
    <group position={polar(114, 4.35)} rotation={[0, -0.25, 0]}>
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.8, 0]} castShadow material={MAT.woodDark}>
          <cylinderGeometry args={[0.06, 0.07, 1.6, 8]} />
        </mesh>
      ))}
      <mesh position={[0, 1.15, 0.03]} castShadow>
        <boxGeometry args={[2.0, 1.5, 0.08]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.98, 0]} castShadow material={MAT.roofRed}>
        <boxGeometry args={[2.25, 0.12, 0.35]} />
      </mesh>
    </group>
  )
}

function LevelFlag() {
  const level = useWorld((s) => s.game.level)
  const flag = useRef<THREE.Mesh>(null)
  const { ctx, tex } = useMemo(() => makeCanvasTexture(256, 160), [])
  useEffect(() => {
    ctx.fillStyle = '#4C6FFF'
    ctx.fillRect(0, 0, 256, 160)
    ctx.fillStyle = '#ffd84d'
    ctx.font = '700 54px Fredoka, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`LV ${level}`, 128, 100)
    tex.needsUpdate = true
  }, [level, ctx, tex])
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.15
  })
  return (
    <group position={polar(201, 4.6)}>
      <mesh position={[0, 1.2, 0]} castShadow material={MAT.metal}>
        <cylinderGeometry args={[0.035, 0.045, 2.4, 8]} />
      </mesh>
      <mesh ref={flag} position={[0.42, 2.05, 0]} castShadow>
        <planeGeometry args={[0.8, 0.5]} />
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Fountain() {
  const jet = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const m = getWorld().game.momentum
    if (jet.current) {
      const h = 0.3 + (m / 100) * 0.9 + Math.sin(clock.elapsedTime * 6) * 0.04
      jet.current.scale.set(1, h, 1)
      jet.current.position.y = 0.35 + h / 2
    }
  })
  return (
    <group position={polar(246, 4.25)}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow material={MAT.stone}>
        <cylinderGeometry args={[0.7, 0.8, 0.36, 24]} />
      </mesh>
      <mesh position={[0, 0.33, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.6, 24]} />
        <meshStandardMaterial color="#7fd4ff" emissive="#3aa0d8" emissiveIntensity={0.3} />
      </mesh>
      <mesh ref={jet}>
        <cylinderGeometry args={[0.05, 0.12, 1, 10]} />
        <meshStandardMaterial color="#bfeaff" transparent opacity={0.7} emissive="#7fd4ff" emissiveIntensity={0.5} />
      </mesh>
    </group>
  )
}

function Rainbow() {
  const colors = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa']
  return (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 4, 0]}>
      {colors.map((c, i) => (
        <mesh key={c} position={[0, 0, 0]}>
          <torusGeometry args={[6.2 - i * 0.18, 0.09, 8, 64, Math.PI]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.4} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  )
}

function CloudCat() {
  const until = useWorld((s) => s.game.catUntil)
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.y = 1 + Math.sin(clock.elapsedTime * 2) * 0.04
  })
  if (until < Date.now()) return null
  return (
    <group
      ref={ref}
      position={polar(66, 4.4)}
      onClick={(e) => {
        e.stopPropagation()
        sfx('coin')
        mutate((s) => {
          s.game.sparks += 8
          s.game.catUntil = 0
          pushToast(s, { kind: 'success', title: 'The cloud cat purrs', body: '+8 ✦ sparks (cosmetic event)' })
        })
      }}
    >
      <mesh position={[0, 0.2, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshStandardMaterial color="#f3f3f7" />
      </mesh>
      <mesh position={[0.22, 0.32, 0]} castShadow>
        <sphereGeometry args={[0.17, 14, 10]} />
        <meshStandardMaterial color="#f3f3f7" />
      </mesh>
      {[-0.08, 0.08].map((z) => (
        <mesh key={z} position={[0.26, 0.48, z]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.05, 0.12, 4]} />
          <meshStandardMaterial color="#f3f3f7" />
        </mesh>
      ))}
    </group>
  )
}

export function Plaza({ fountain, rainbow }: { fountain: boolean; rainbow: boolean }) {
  return (
    <Room center={PLAZA_CENTER}>
      <PlanningTable />
      <TaskBoard />
      <LevelFlag />
      {[21, 159, 294].map((a) => (
        <Lamp key={a} position={polar(a, 5.0)} />
      ))}
      <group position={polar(339, 4.5)} rotation={[0, 0.9, 0]}>
        <mesh position={[0, 0.28, 0]} castShadow material={MAT.woodLight}>
          <boxGeometry args={[1.1, 0.08, 0.36]} />
        </mesh>
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, 0.13, 0]} material={MAT.woodDark}>
            <boxGeometry args={[0.08, 0.26, 0.32]} />
          </mesh>
        ))}
      </group>
      {fountain && <Fountain />}
      {rainbow && <Rainbow />}
      <CloudCat />
    </Room>
  )
}
