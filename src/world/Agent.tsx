import { useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Component, Suspense, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { CREW } from '../engine/crew'
import { ROLE_IDS, type AgentActivity, type RoleId } from '../engine/types'
import { getWorld, mutate, useWorld } from '../state/store'
import { sfx } from '../audio/sfx'
import { buildClips, clipFor, loadClipData } from './characters'
import { engine } from '../engine/engine'
import type { ClipName } from './retarget'
import { ISLANDS, SCREEN_YAW, TREE_SPOT, dockSpot, home, localToWorld, meetingSpot, planPath, visitSpot, wanderPoint, yawTowards } from './layout'
import { AgentLabel } from './AgentLabel'
import { Carried } from './Carried'
import { replayFrameAt } from './replay'

export const AGENT_SCALE = 1.45

export const agentPositions: Record<RoleId, THREE.Vector3> = Object.fromEntries(ROLE_IDS.map((r) => [r, home(r).pos.clone()])) as Record<RoleId, THREE.Vector3>

const TREE_POS = localToWorld(ISLANDS.archivist.center, 0, -0.9)

interface Desired {
  key: string
  pos: THREE.Vector3
  yaw: number | null
}

function desiredFor(role: RoleId, activity: AgentActivity, visit: string | null, wanderKey: number, wanderPos: THREE.Vector3): Desired {
  const idx = ROLE_IDS.indexOf(role)
  switch (activity) {
    case 'meeting': {
      const m = meetingSpot(idx, ROLE_IDS.length)
      return { key: 'meeting', pos: m.pos, yaw: m.yaw }
    }
    case 'celebrating': {
      const m = meetingSpot(idx, ROLE_IDS.length)
      return { key: 'celebrate', pos: m.pos, yaw: m.yaw + Math.PI }
    }
    case 'awaiting_approval': {
      if (visit !== 'dock') {
        const h = home(role)
        return { key: 'home', pos: h.pos, yaw: h.yaw }
      }
      const waiting = ROLE_IDS.filter((r) => getWorld().agents[r].activity === 'awaiting_approval' && getWorld().agents[r].visitTarget === 'dock')
      const slot = Math.max(0, waiting.indexOf(role))
      return { key: `dock-${slot}`, pos: dockSpot(slot), yaw: SCREEN_YAW }
    }
    case 'memory':
      return { key: 'tree', pos: TREE_SPOT.clone(), yaw: yawTowards(TREE_SPOT, TREE_POS) }
    case 'handoff': {
      if (visit && visit !== 'dock' && visit !== 'tree') {
        const target = visit as RoleId | 'plaza'
        const spot = visitSpot(target)
        const face = target === 'plaza' ? new THREE.Vector3() : home(target as RoleId).pos
        return { key: `visit-${visit}`, pos: spot, yaw: yawTowards(spot, face) }
      }
      const h = home(role)
      return { key: 'home', pos: h.pos, yaw: h.yaw }
    }
    case 'idle':
      return { key: `wander-${wanderKey}`, pos: wanderPos, yaw: null }
    case 'paused':
      return { key: 'stay', pos: null as unknown as THREE.Vector3, yaw: null }
    default: {
      const h = home(role)
      return { key: 'home', pos: h.pos, yaw: h.yaw }
    }
  }
}

function useCrewModel(role: RoleId) {
  const gltf = useGLTF(`/assets/models/${role}.glb`)
  const data = use(loadClipData())
  const clips = useMemo(() => buildClips(role, gltf, data), [role, gltf, data])
  return { scene: gltf.scene, clips }
}

function Figurine({ role, actionRef }: { role: RoleId; actionRef: React.RefObject<((name: ClipName, speed?: number) => void) | null> }) {
  const { scene, clips } = useCrewModel(role)
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene])
  const actions = useMemo(() => {
    const out = {} as Record<ClipName, THREE.AnimationAction>
    for (const [name, clip] of Object.entries(clips)) out[name as ClipName] = mixer.clipAction(clip)
    return out
  }, [clips, mixer])
  const current = useRef<ClipName | null>(null)
  useEffect(() => {
    actionRef.current = (name, speed = 1) => {
      const next = actions[name] ?? actions.idle
      if (!next) return
      next.timeScale = speed
      if (current.current === name) return
      const prev = current.current ? actions[current.current] : null
      next.reset().setEffectiveWeight(1).fadeIn(0.28).play()
      if (name === 'cheer' || name === 'agree') next.time = Math.random() * 0.3
      prev?.fadeOut(0.28)
      current.current = name
    }
    actionRef.current('idle')
    return () => {
      actionRef.current = null
      mixer.stopAllAction()
    }
  }, [actions, actionRef, mixer])
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)))
  return <primitive object={scene} />
}

/** Simple procedural stand-in used while models load (and as the "Bean" avatar style). */
export function Bean({ role, bob = true }: { role: RoleId; bob?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const c = CREW[role]
  useFrame(({ clock }) => {
    if (ref.current && bob) ref.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 3 + role.length)) * 0.05
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <capsuleGeometry args={[0.26, 0.34, 6, 14]} />
        <meshStandardMaterial color={c.color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <sphereGeometry args={[0.24, 20, 16]} />
        <meshStandardMaterial color={c.soft} roughness={0.6} />
      </mesh>
      {[-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, 0.9, 0.21]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshStandardMaterial color="#1d1a2b" />
        </mesh>
      ))}
    </group>
  )
}

export function Agent({ role, figurine }: { role: RoleId; figurine: boolean }) {
  const group = useRef<THREE.Group>(null)
  const actionRef = useRef<((name: ClipName, speed?: number) => void) | null>(null)
  const st = useRef({
    pos: home(role).pos.clone(),
    yaw: home(role).yaw,
    path: [] as THREE.Vector3[],
    key: '',
    wanderKey: 0,
    wanderPos: home(role).pos.clone(),
    wanderAt: 0,
    lastActivity: 'idle' as AgentActivity,
    lookUntil: 0,
    social: null as { target: RoleId; said: boolean } | null,
  })
  const [hover, setHover] = useState(false)
  const selected = useWorld((s) => s.ui.selection.kind === 'agent' && s.ui.selection.id === role)

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const s = getWorld()
    const S = st.current
    const t = clock.elapsedTime
    let activity: AgentActivity = s.agents[role].activity
    let visit: string | null = s.agents[role].visitTarget
    if (s.ui.replay) {
      const f = replayFrameAt(s.ui.replay.projectId, s.ui.replay.t)
      activity = (f?.a[role]?.[0] as AgentActivity) ?? 'idle'
      visit = null
    }
    if (activity === 'idle' && (t > S.wanderAt || S.lastActivity !== 'idle')) {
      S.wanderKey++
      const returning = S.lastActivity !== 'idle' || S.social !== null
      S.social = null
      if (!returning && !s.ui.replay && Math.random() < 0.22) {
        // Cosmetic: pop over to visit a crewmate and chat for a bit.
        const others = ROLE_IDS.filter((r) => r !== role && r !== 'planner')
        const target = others[Math.floor(Math.random() * others.length)]
        S.social = { target, said: false }
        S.wanderPos = visitSpot(target).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8))
        S.wanderAt = t + 16 + Math.random() * 6
      } else {
        S.wanderPos = returning && Math.random() < 0.6 ? home(role).pos.clone() : wanderPoint(role)
        S.wanderAt = t + 7 + Math.random() * 9
      }
    }
    S.lastActivity = activity
    const want = desiredFor(role, activity, visit, S.wanderKey, S.wanderPos)
    if (want.key !== S.key) {
      S.key = want.key
      S.path = want.pos ? planPath(S.pos, want.pos) : []
    }
    let moving = false
    if (S.path.length) {
      const target = S.path[0]
      const d = new THREE.Vector3(target.x - S.pos.x, 0, target.z - S.pos.z)
      const dist = d.length()
      const speed = activity === 'idle' ? 1.25 : activity === 'celebrating' ? 2.4 : 2.0
      const step = speed * Math.min(dt, 0.25)
      if (dist <= step) {
        S.pos.copy(target)
        S.path.shift()
        // Still travelling: keep the walk cycle running through waypoints instead of blending to a rest pose.
        moving = S.path.length > 0
      } else {
        d.normalize()
        S.pos.addScaledVector(d, step)
        S.pos.y = THREE.MathUtils.lerp(S.pos.y, target.y, Math.min(1, step / Math.max(dist, 0.001)))
        const wantYaw = Math.atan2(d.x, d.z)
        S.yaw = lerpAngle(S.yaw, wantYaw, Math.min(1, dt * 10))
        moving = true
      }
      actionRef.current?.('walk', speed / 1.6)
    }
    if (!moving) {
      let clip = clipFor(role, activity)
      const social = activity === 'idle' ? S.social : null
      if (social) {
        const friend = agentPositions[social.target]
        S.yaw = lerpAngle(S.yaw, yawTowards(S.pos, friend), Math.min(1, dt * 6))
        clip = 'chat'
        if (!social.said) {
          social.said = true
          const busy = s.agents[social.target].taskId !== null
          engine.say(role, socialLine(social.target, busy), 'say')
        }
      } else {
        if (want.yaw !== null) S.yaw = lerpAngle(S.yaw, want.yaw, Math.min(1, dt * 6))
        if (activity === 'idle' && Math.sin(t * 0.21 + ROLE_IDS.indexOf(role)) > 0.93) clip = 'look'
      }
      actionRef.current?.(clip, 1)
    }
    g.position.copy(S.pos)
    g.rotation.y = S.yaw
    agentPositions[role].copy(S.pos)
    if (!figurine) g.position.y += Math.abs(Math.sin(t * (moving ? 9 : 2.5))) * (moving ? 0.08 : 0.02)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    sfx('click')
    mutate((s) => {
      s.ui.selection = { kind: 'agent', id: role }
      s.ui.focus = role
    })
  }

  return (
    <group
      ref={group}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
      <group scale={AGENT_SCALE}>
        {figurine ? <FigurineOrBean role={role} actionRef={actionRef} /> : <Bean role={role} />}
        <Carried role={role} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} visible={selected || hover}>
        <ringGeometry args={[0.55, 0.68, 40]} />
        <meshBasicMaterial color={selected ? CREW[role].color : '#ffffff'} transparent opacity={selected ? 0.95 : 0.6} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <AgentLabel role={role} />
    </group>
  )
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.warn('Character model failed to load; using the Bean stand-in.', e)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function FigurineOrBean({ role, actionRef }: { role: RoleId; actionRef: React.RefObject<((name: ClipName, speed?: number) => void) | null> }) {
  return (
    <ModelBoundary fallback={<Bean role={role} />}>
      <Suspense fallback={<Bean role={role} />}>
        <Figurine role={role} actionRef={actionRef} />
      </Suspense>
    </ModelBoundary>
  )
}

const SOCIAL_LINES = ['Nice weather up here, {n}!', 'Coffee later, {n}?', 'Did you see that cloud, {n}?', 'Hey {n}! Just stretching my legs.', 'Your island looks great, {n}.']
const CHEER_LINES = ["Go {n}, you've got this!", "Don't mind me, {n}, just cheering!", 'Looking good, {n}!']

function socialLine(friend: RoleId, busy: boolean): string {
  const pool = busy ? CHEER_LINES : SOCIAL_LINES
  return pool[Math.floor(Math.random() * pool.length)].replace('{n}', CREW[friend].name)
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

for (const r of ROLE_IDS) useGLTF.preload(`/assets/models/${r}.glb`)
