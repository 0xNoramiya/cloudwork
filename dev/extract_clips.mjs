// Extract animation clips + their source bind poses into compact JSON for runtime retargeting.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import * as THREE from 'three'
import fs from 'node:fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const dir = 'asset-src/models/'
const CLIPS = { walk: 'planner', idle: 'clip_idle', work: 'clip_work', look: 'clip_look', help: 'clip_help', headache: 'clip_headache', cheer: 'clip_cheer', wave: 'clip_wave', doze: 'clip_doze', agree: 'clip_agree', cast: 'clip_cast', chat: 'clip_chat' }
const out = {}
const r4 = (x) => Math.round(x * 10000) / 10000
function resample(inT, outV, stride, times) {
  const res = []
  let k = 0
  for (const t of times) {
    while (k < inT.length - 2 && inT[k + 1] < t) k++
    const t0 = inT[k], t1 = inT[Math.min(k + 1, inT.length - 1)]
    const a = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0
    const v = []
    for (let j = 0; j < stride; j++) v.push(outV[k * stride + j] * (1 - a) + outV[Math.min(k + 1, inT.length - 1) * stride + j] * a)
    if (stride === 4) { const l = Math.hypot(...v) || 1; for (let j = 0; j < 4; j++) v[j] /= l }
    res.push(...v)
  }
  return res
}
for (const [name, file] of Object.entries(CLIPS)) {
  const doc = await io.read(dir + file + '.glb')
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin.listJoints()
  const names = joints.map((j) => j.getName())
  const parents = joints.map((j) => { const p = j.getParentNode(); return p ? names.indexOf(p.getName()) : -1 })
  const ibm = skin.getInverseBindMatrices().getArray()
  const bindQ = [], bindP = []
  for (let i = 0; i < joints.length; i++) {
    const m = new THREE.Matrix4().fromArray(ibm, i * 16).invert()
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    m.decompose(p, q, s)
    bindQ.push([q.x, q.y, q.z, q.w].map(r4)); bindP.push([p.x, p.y, p.z].map(r4))
  }
  const anim = doc.getRoot().listAnimations()[0]
  const chans = anim.listChannels()
  const times = chans.filter(c => c.getTargetPath()==='rotation').map(c => c.getSampler().getInput().getArray()).sort((a,b)=>b.length-a.length)[0]
  const frames = times.length
  const rot = {}
  let hips = null
  for (const c of chans) {
    const n = c.getTargetNode().getName(), path = c.getTargetPath()
    const s = c.getSampler()
    const arr = resample(s.getInput().getArray(), s.getOutput().getArray(), path === 'rotation' ? 4 : 3, times).map(r4)
    if (path === 'rotation') rot[n] = arr
    if (path === 'translation' && n === 'Hips') hips = arr
  }
  // Rest local transforms from the node graph (used when a joint has no rotation track).
  out[name] = { duration: r4(times[frames - 1]), frames, times: Array.from(times).map(r4), names, parents, bindQ, bindP, rot, hips, source: file }
  console.log(name, file, 'frames', frames, 'dur', times[frames - 1].toFixed(2), 'rot tracks', Object.keys(rot).length, 'hips', !!hips)
}
fs.mkdirSync('public/assets/anim', { recursive: true })
fs.writeFileSync('public/assets/anim/clips.json', JSON.stringify(out))
console.log('bytes', fs.statSync('public/assets/anim/clips.json').size)
