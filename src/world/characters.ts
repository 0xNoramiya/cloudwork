import * as THREE from 'three'
import { retargetClip, rigFromSkinnedMesh, type ClipData, type ClipName } from './retarget'
import type { AgentActivity, RoleId } from '../engine/types'

let clipsPromise: Promise<Record<ClipName, ClipData>> | null = null

export function loadClipData(): Promise<Record<ClipName, ClipData>> {
  clipsPromise ??= fetch('/assets/anim/clips.json').then((r) => {
    if (!r.ok) throw new Error(`clips.json HTTP ${r.status}`)
    return r.json() as Promise<Record<ClipName, ClipData>>
  })
  return clipsPromise
}

interface LoadedModel {
  scene: THREE.Object3D
  animations: THREE.AnimationClip[]
}

/** Swap Meshy's emissive/glossy export material for a soft matte "vinyl toy" material. */
export function prepareCharacter(gltf: LoadedModel): THREE.SkinnedMesh | null {
  let skinned: THREE.SkinnedMesh | null = null
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const old = m.material as THREE.MeshStandardMaterial
    if (!(old as unknown as { __cw?: boolean }).__cw) {
      const map = old.map
      if (map) map.colorSpace = THREE.SRGBColorSpace
      const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.58, metalness: 0, envMapIntensity: 0.7 })
      ;(mat as unknown as { __cw: boolean }).__cw = true
      m.material = mat
    }
    m.castShadow = true
    m.receiveShadow = false
    m.frustumCulled = false
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh
  })
  return skinned
}

const cache = new Map<string, Record<ClipName, THREE.AnimationClip>>()

export function buildClips(role: RoleId, gltf: LoadedModel, data: Record<ClipName, ClipData>): Record<ClipName, THREE.AnimationClip> {
  const hit = cache.get(role)
  if (hit) return hit
  const skinned = prepareCharacter(gltf)
  const out = {} as Record<ClipName, THREE.AnimationClip>
  if (!skinned) return out
  const rig = rigFromSkinnedMesh(skinned)
  for (const name of Object.keys(data) as ClipName[]) out[name] = retargetClip(data[name], rig, name)
  // Each character ships with its own native walk cycle — use it instead of the retargeted one.
  const native = gltf.animations[0]
  if (native) {
    const walk = native.clone()
    walk.name = 'walk'
    walk.tracks = walk.tracks.filter((t) => !t.name.endsWith('.scale') && (t.name.endsWith('.quaternion') || t.name === 'Hips.position'))
    out.walk = walk
  }
  cache.set(role, out)
  return out
}

export const CLIP_FOR: Record<AgentActivity, ClipName> = {
  idle: 'idle',
  thinking: 'look',
  working: 'work',
  tool: 'work',
  awaiting_approval: 'wave',
  needs_input: 'help',
  blocked: 'headache',
  handoff: 'agree',
  memory: 'cast',
  celebrating: 'cheer',
  paused: 'doze',
  error: 'headache',
  chatting: 'chat',
  meeting: 'idle',
}

export function clipFor(role: RoleId, activity: AgentActivity): ClipName {
  if (role === 'archivist' && (activity === 'working' || activity === 'thinking')) return 'cast'
  if (role === 'planner' && activity === 'working') return 'chat'
  if (role === 'researcher' && activity === 'tool') return 'look'
  return CLIP_FOR[activity]
}
