import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ISLANDS, ISLAND_LIST, PLAZA_CENTER, PLAZA_RADIUS, type Island } from './layout'
import { MAT, ROCK_MAT, makeCanvasTexture, makeRockGeometry, rng } from './kit'

const TOP_H = 0.32

function IslandBody({ center, radius, seed, plaza = false }: { center: THREE.Vector3; radius: number; seed: number; plaza?: boolean }) {
  const rock = useMemo(() => makeRockGeometry(radius * 0.98, radius * 1.25, seed), [radius, seed])
  const tufts = useMemo(() => {
    const r = rng(seed + 7)
    return Array.from({ length: plaza ? 26 : 12 }, () => {
      const a = r() * Math.PI * 2
      const d = radius * (0.9 + r() * 0.08)
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.14 + r() * 0.16, rock: r() < 0.3 }
    })
  }, [radius, seed, plaza])
  return (
    <group position={center}>
      {/* grass cap with a soft rounded lip */}
      <mesh position={[0, -TOP_H / 2, 0]} receiveShadow castShadow material={MAT.grass}>
        <cylinderGeometry args={[radius, radius * 0.985, TOP_H, 40]} />
      </mesh>
      <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow material={MAT.grassDark}>
        <torusGeometry args={[radius * 0.995, 0.1, 6, 48]} />
      </mesh>
      <mesh position={[0, -TOP_H - 0.09, 0]} receiveShadow material={MAT.dirt}>
        <cylinderGeometry args={[radius * 0.985, radius * 0.96, 0.18, 40]} />
      </mesh>
      <mesh position={[0, -TOP_H - 0.18, 0]} geometry={rock} material={ROCK_MAT} castShadow />
      {plaza && (
        <>
          <mesh position={[0, 0.012, 0]} receiveShadow material={MAT.stoneWarm}>
            <cylinderGeometry args={[radius * 0.86, radius * 0.86, 0.03, 48]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={MAT.stoneDark}>
            <ringGeometry args={[radius * 0.62, radius * 0.66, 64]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={MAT.stoneDark}>
            <ringGeometry args={[2.05, 2.12, 48]} />
          </mesh>
        </>
      )}
      {tufts.map((t, i) =>
        t.rock ? (
          <mesh key={i} position={[t.x, 0.03, t.z]} scale={[t.s, t.s * 0.6, t.s]} material={MAT.stoneDark} castShadow>
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
        ) : (
          <mesh key={i} position={[t.x, t.s * 0.4, t.z]} scale={[t.s * 0.8, t.s, t.s * 0.8]} material={i % 2 ? MAT.grassDark : MAT.grassLight} castShadow>
            <coneGeometry args={[1, 1.4, 5]} />
          </mesh>
        ),
      )}
    </group>
  )
}

interface Plank {
  pos: THREE.Vector3
  yaw: number
  pitch: number
}

function bridgePlanks(isl: Island): { planks: Plank[]; posts: THREE.Vector3[]; ropes: THREE.Vector3[][] } {
  const start = isl.dir.clone().multiplyScalar(PLAZA_RADIUS - 0.25)
  start.y = PLAZA_CENTER.y - 0.02
  const end = isl.center.clone().addScaledVector(isl.dir, -(isl.radius - 0.25))
  end.y = isl.center.y - 0.02
  const len = start.distanceTo(end)
  const n = Math.round(len / 0.34)
  const yaw = Math.atan2(isl.dir.x, isl.dir.z)
  const side = new THREE.Vector3(isl.dir.z, 0, -isl.dir.x)
  const planks: Plank[] = []
  const at = (t: number) => {
    const p = start.clone().lerp(end, t)
    p.y -= Math.sin(t * Math.PI) * 0.22
    return p
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = at(t)
    const p2 = at(Math.min(1, t + 0.02))
    const pitch = Math.atan2(p2.y - p.y, 0.02 * len)
    planks.push({ pos: p, yaw, pitch })
  }
  const posts: THREE.Vector3[] = []
  const ropes: THREE.Vector3[][] = [[], []]
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const p = at(t)
    for (const [k, s] of [-1, 1].entries()) {
      const q = p.clone().addScaledVector(side, s * 0.62)
      posts.push(q)
      ropes[k].push(q.clone().add(new THREE.Vector3(0, 0.5, 0)))
    }
  }
  return { planks, posts, ropes }
}

function Bridges({ fairy }: { fairy: boolean }) {
  const plankRef = useRef<THREE.InstancedMesh>(null)
  const postRef = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => ISLAND_LIST.map(bridgePlanks), [])
  const allPlanks = data.flatMap((d) => d.planks)
  const allPosts = data.flatMap((d) => d.posts)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3(1, 1, 1)
    allPlanks.forEach((p, i) => {
      e.set(p.pitch, p.yaw, 0, 'YXZ')
      q.setFromEuler(e)
      s.set(1.25 + ((i * 7) % 5) * 0.02, 1, 1)
      m.compose(p.pos, q, s)
      plankRef.current!.setMatrixAt(i, m)
    })
    plankRef.current!.instanceMatrix.needsUpdate = true
    allPosts.forEach((p, i) => {
      m.compose(p.clone().add(new THREE.Vector3(0, 0.22, 0)), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
      postRef.current!.setMatrixAt(i, m)
    })
    postRef.current!.instanceMatrix.needsUpdate = true
  }, [allPlanks, allPosts])
  const ropeGeoms = useMemo(
    () =>
      data.flatMap((d) =>
        d.ropes.map((pts) => {
          const curve = new THREE.CatmullRomCurve3(pts.map((p, i) => p.clone().add(new THREE.Vector3(0, i % 2 ? -0.06 : 0, 0))))
          return new THREE.TubeGeometry(curve, 24, 0.025, 5, false)
        }),
      ),
    [data],
  )
  const lights = useMemo(() => {
    if (!fairy) return []
    return data.flatMap((d) =>
      d.ropes.flatMap((pts) => {
        const curve = new THREE.CatmullRomCurve3(pts)
        return Array.from({ length: 9 }, (_, i) => curve.getPoint((i + 0.5) / 9))
      }),
    )
  }, [data, fairy])
  return (
    <group>
      <instancedMesh ref={plankRef} args={[undefined, undefined, allPlanks.length]} castShadow receiveShadow material={MAT.plank}>
        <boxGeometry args={[1, 0.07, 0.28]} />
      </instancedMesh>
      <instancedMesh ref={postRef} args={[undefined, undefined, allPosts.length]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.05, 0.06, 0.56, 6]} />
      </instancedMesh>
      {ropeGeoms.map((g, i) => (
        <mesh key={i} geometry={g} material={MAT.rope} />
      ))}
      {lights.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial color={['#fff3a0', '#ffc2e0', '#bde9ff'][i % 3]} emissive={['#ffd84d', '#ff7fbf', '#7fd4ff'][i % 3]} emissiveIntensity={2.2} />
        </mesh>
      ))}
    </group>
  )
}

/** Rim foliage and stepping-stone paths: instanced so the whole archipelago costs a handful of draw calls. */
function Greenery() {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const bushes = useRef<THREE.InstancedMesh>(null)
  const stones = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const r = rng(2024)
    const trees: { p: THREE.Vector3; s: number }[] = []
    const shrubs: { p: THREE.Vector3; s: number }[] = []
    const path: THREE.Vector3[] = []
    for (const isl of ISLAND_LIST) {
      const doorAng = Math.atan2(-isl.dir.z, -isl.dir.x)
      const nTrees = isl.id === 'dock' ? 0 : 2
      for (let i = 0; i < nTrees; i++) {
        const a = doorAng + (i ? 1 : -1) * (1.1 + r() * 0.35)
        const d = isl.radius * (0.84 + r() * 0.06)
        trees.push({ p: new THREE.Vector3(isl.center.x + Math.cos(a) * d, isl.center.y, isl.center.z + Math.sin(a) * d), s: 0.75 + r() * 0.35 })
      }
      for (let i = 0; i < 5; i++) {
        const a = doorAng + Math.PI * (0.45 + r() * 1.1) * (r() < 0.5 ? 1 : -1)
        const d = isl.radius * (0.86 + r() * 0.08)
        shrubs.push({ p: new THREE.Vector3(isl.center.x + Math.cos(a) * d, isl.center.y, isl.center.z + Math.sin(a) * d), s: 0.22 + r() * 0.18 })
      }
      // stepping stones from the bridge landing toward the middle of the island
      for (let k = 0; k < 4; k++) {
        const t = 0.25 + k * 0.17
        const p = isl.door.clone().lerp(isl.center, t)
        const side = new THREE.Vector3(isl.dir.z, 0, -isl.dir.x).multiplyScalar((k % 2 ? 1 : -1) * 0.12)
        path.push(p.add(side).setY(isl.center.y + 0.015))
      }
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2
      if (ISLAND_LIST.some((isl) => Math.abs(Math.atan2(Math.sin(a - isl.angle), Math.cos(a - isl.angle))) < 0.3)) continue
      shrubs.push({ p: new THREE.Vector3(Math.cos(a) * 5.15, PLAZA_CENTER.y, Math.sin(a) * 5.15), s: 0.2 + r() * 0.16 })
    }
    return { trees, shrubs, path }
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    data.trees.forEach((t, i) => {
      m.compose(v.copy(t.p).add(new THREE.Vector3(0, 0.45 * t.s, 0)), q, new THREE.Vector3(t.s, t.s, t.s))
      trunks.current!.setMatrixAt(i, m)
      m.compose(v.copy(t.p).add(new THREE.Vector3(0, 1.15 * t.s, 0)), q, new THREE.Vector3(t.s, t.s * 1.1, t.s))
      crowns.current!.setMatrixAt(i, m)
    })
    data.shrubs.forEach((b, i) => {
      m.compose(v.copy(b.p).add(new THREE.Vector3(0, b.s * 0.6, 0)), q, new THREE.Vector3(b.s * 1.3, b.s, b.s * 1.3))
      bushes.current!.setMatrixAt(i, m)
    })
    data.path.forEach((p, i) => {
      m.compose(p, q, new THREE.Vector3(1, 1, 1))
      stones.current!.setMatrixAt(i, m)
    })
    for (const im of [trunks, crowns, bushes, stones]) im.current!.instanceMatrix.needsUpdate = true
  }, [data])
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, data.trees.length]} castShadow material={MAT.woodDark}>
        <cylinderGeometry args={[0.07, 0.11, 0.9, 6]} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, data.trees.length]} castShadow material={MAT.leafDark}>
        <coneGeometry args={[0.5, 1.1, 7]} />
      </instancedMesh>
      <instancedMesh ref={bushes} args={[undefined, undefined, data.shrubs.length]} castShadow material={MAT.leaf}>
        <icosahedronGeometry args={[1, 0]} />
      </instancedMesh>
      <instancedMesh ref={stones} args={[undefined, undefined, data.path.length]} receiveShadow material={MAT.stone}>
        <cylinderGeometry args={[0.22, 0.24, 0.05, 9]} />
      </instancedMesh>
    </group>
  )
}

/** A little spring on the Memory Grove that spills off the island's edge. */
function Waterfall() {
  const isl = ISLANDS.archivist
  const { tex } = useMemo(() => {
    const c = makeCanvasTexture(64, 256)
    const g = c.ctx
    g.fillStyle = '#7fd4ff'
    g.fillRect(0, 0, 64, 256)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`
      g.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 4, 20 + Math.random() * 60)
    }
    c.tex.wrapS = c.tex.wrapT = THREE.RepeatWrapping
    c.tex.needsUpdate = true
    return c
  }, [])
  const mist = useRef<THREE.Group>(null)
  useFrame(({ clock }, dt) => {
    tex.offset.y += dt * 0.9
    mist.current?.children.forEach((m, i) => {
      const k = (clock.elapsedTime * 0.5 + i / 5) % 1
      m.position.y = -3.2 + k * 0.6
      m.scale.setScalar(0.3 + k * 0.5)
      ;((m as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - k)
    })
  })
  // Pond near the rim on the camera-facing right flank (clear of the plaza bridge);
  // the fall spills down the rock face below it where the camera can see it.
  const out = new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(0.45).add(new THREE.Vector3(1, 0, -1).normalize()).normalize()
  const pond = isl.center.clone().addScaledVector(out, isl.radius * 0.66)
  const lip = isl.center.clone().addScaledVector(out, isl.radius * 0.97)
  const yaw = Math.atan2(out.x, out.z)
  return (
    <group>
      <mesh position={[pond.x, isl.center.y + 0.015, pond.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.75, 28]} />
        <meshStandardMaterial color="#6cc6f2" roughness={0.15} metalness={0.1} emissive="#2a7fb8" emissiveIntensity={0.15} />
      </mesh>
      <group position={[lip.x, isl.center.y, lip.z]} rotation={[0, yaw, 0]}>
        {/* brook from the pond to the lip */}
        <mesh position={[0, 0.02, -isl.radius * 0.155]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.42, isl.radius * 0.31 + 0.2]} />
          <meshStandardMaterial map={tex} color="#bfeaff" roughness={0.2} emissive="#2a7fb8" emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0, -1.6, 0.12]} rotation={[0.08, 0, 0]}>
          <planeGeometry args={[0.6, 3.2]} />
          <meshStandardMaterial map={tex} transparent opacity={0.92} emissive="#9fe6ff" emissiveIntensity={0.3} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <group ref={mist} position={[0, 0, 0.35]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[(i - 2) * 0.12, -3, 0]}>
              <sphereGeometry args={[0.35, 8, 6]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

export function Islands({ fairy }: { fairy: boolean }) {
  return (
    <group>
      <Greenery />
      <Waterfall />
      <IslandBody center={new THREE.Vector3(0, PLAZA_CENTER.y, 0)} radius={PLAZA_RADIUS} seed={11} plaza />
      {ISLAND_LIST.map((isl, i) => (
        <IslandBody key={isl.id} center={isl.center} radius={isl.radius} seed={100 + i * 17} />
      ))}
      <Bridges fairy={fairy} />
    </group>
  )
}
