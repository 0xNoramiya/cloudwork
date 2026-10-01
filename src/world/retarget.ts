import * as THREE from 'three'

/** A clip exported by dev/extract_clips.mjs together with the bind pose of the rig it was authored on. */
export interface ClipData {
  duration: number
  frames: number
  times: number[]
  names: string[]
  parents: number[]
  bindQ: number[][]
  bindP: number[][]
  rot: Record<string, number[]>
  hips: number[] | null
  source: string
}

export type ClipName = 'walk' | 'idle' | 'work' | 'look' | 'help' | 'headache' | 'cheer' | 'wave' | 'doze' | 'agree' | 'cast' | 'chat'

interface Rig {
  names: string[]
  parents: number[]
  bindWorldQ: THREE.Quaternion[]
  bindHips: THREE.Vector3
  order: number[]
}

function depthOrder(parents: number[]): number[] {
  const depth = (i: number): number => (parents[i] < 0 ? 0 : 1 + depth(parents[i]))
  return parents.map((_, i) => i).sort((a, b) => depth(a) - depth(b))
}

export function rigFromSkinnedMesh(mesh: THREE.SkinnedMesh): Rig {
  const bones = mesh.skeleton.bones
  const names = bones.map((b) => b.name)
  const parents = bones.map((b) => (b.parent && (b.parent as THREE.Bone).isBone ? names.indexOf(b.parent.name) : -1))
  const bindWorldQ: THREE.Quaternion[] = []
  let bindHips = new THREE.Vector3()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  mesh.skeleton.boneInverses.forEach((inv, i) => {
    const q = new THREE.Quaternion()
    inv.clone().invert().decompose(p, q, s)
    bindWorldQ.push(q)
    if (names[i] === 'Hips') bindHips = p.clone()
  })
  return { names, parents, bindWorldQ, bindHips, order: depthOrder(parents) }
}

/**
 * Retarget a clip onto a different rig by transferring each bone's world-space rotation *delta from bind pose*.
 * Works across rigs whose bones have different rest orientations/rolls, as long as both bind poses are
 * similar (here: every rig was auto-rigged from an A-pose), and scales hip motion by hip height.
 */
export function retargetClip(clip: ClipData, rig: Rig, name: string): THREE.AnimationClip {
  const srcIndex = new Map(clip.names.map((n, i) => [n, i]))
  const srcOrder = depthOrder(clip.parents)
  const srcBind = clip.bindQ.map((q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]))
  const srcBindInv = srcBind.map((q) => q.clone().invert())
  const srcBindLocal = srcBind.map((q, i) => (clip.parents[i] < 0 ? q.clone() : srcBind[clip.parents[i]].clone().invert().multiply(q)))
  const n = clip.frames
  const GA = clip.names.map(() => new THREE.Quaternion())
  const GB = rig.names.map(() => new THREE.Quaternion())
  const out = rig.names.map(() => new Float32Array(n * 4))
  const local = new THREE.Quaternion()
  const tmp = new THREE.Quaternion()
  const inv = new THREE.Quaternion()

  for (let f = 0; f < n; f++) {
    for (const i of srcOrder) {
      const track = clip.rot[clip.names[i]]
      if (track) local.set(track[f * 4], track[f * 4 + 1], track[f * 4 + 2], track[f * 4 + 3])
      else local.copy(srcBindLocal[i])
      if (clip.parents[i] < 0) GA[i].copy(local)
      else GA[i].copy(GA[clip.parents[i]]).multiply(local)
    }
    for (const j of rig.order) {
      const i = srcIndex.get(rig.names[j])
      if (i === undefined) GB[j].copy(rig.parents[j] < 0 ? rig.bindWorldQ[j] : GB[rig.parents[j]]).multiply(tmp.identity())
      else GB[j].copy(GA[i]).multiply(srcBindInv[i]).multiply(rig.bindWorldQ[j])
      const pj = rig.parents[j]
      if (pj < 0) local.copy(GB[j])
      else local.copy(inv.copy(GB[pj]).invert().multiply(GB[j]))
      local.normalize()
      // keep quaternion hemisphere continuous to avoid interpolation flips
      if (f > 0) {
        const o = out[j]
        const dot = o[(f - 1) * 4] * local.x + o[(f - 1) * 4 + 1] * local.y + o[(f - 1) * 4 + 2] * local.z + o[(f - 1) * 4 + 3] * local.w
        if (dot < 0) local.set(-local.x, -local.y, -local.z, -local.w)
      }
      out[j].set([local.x, local.y, local.z, local.w], f * 4)
    }
  }

  const times = new Float32Array(clip.times)
  const tracks: THREE.KeyframeTrack[] = rig.names.map((bone, j) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, out[j]))
  const hi = srcIndex.get('Hips')
  if (clip.hips && hi !== undefined) {
    const bindA = clip.bindP[hi]
    const scale = rig.bindHips.y / (bindA[1] || 1)
    const pos = new Float32Array(n * 3)
    for (let f = 0; f < n; f++) {
      pos[f * 3] = rig.bindHips.x + (clip.hips[f * 3] - bindA[0]) * scale
      pos[f * 3 + 1] = rig.bindHips.y + (clip.hips[f * 3 + 1] - bindA[1]) * scale
      pos[f * 3 + 2] = rig.bindHips.z + (clip.hips[f * 3 + 2] - bindA[2]) * scale
    }
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pos))
  }
  return new THREE.AnimationClip(name, clip.duration, tracks)
}
