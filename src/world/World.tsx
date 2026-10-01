import { Environment, Html, Lightformer, MapControls, OrthographicCamera, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { MapControls as MapControlsImpl } from 'three-stdlib'
import { CREW } from '../engine/crew'
import { ROLE_IDS, type RoleId } from '../engine/types'
import { getWorld, mutate, useWorld } from '../state/store'
import { isCompact } from '../ui/layout'
import { pushToast } from '../engine/game/progression'
import { sfx } from '../audio/sfx'
import { Agent, agentPositions } from './Agent'
import { Decorations } from './Decor'
import { Birds, Clouds, Confetti, DataFlows, HotAirBalloon, MemoryFlight, Particles, Stars } from './Effects'
import { Islands } from './Islands'
import { Pops } from './Pops'
import { RankBanners } from './RankBanners'
import { ISLANDS, ISLAND_LIST, PLAZA_CENTER, type IslandId } from './layout'
import { makeCanvasTexture } from './kit'
import { Plaza } from './rooms/Plaza'
import { SkyDock } from './rooms/Dock'
import { Atelier, CodeForge, DataLoft, MemoryGrove, Observatory, TestLab, WritersNook } from './rooms/Workshops'

interface Theme {
  sky: [string, string, string]
  sun: string
  sunIntensity: number
  sunPos: [number, number, number]
  hemiSky: string
  hemiGround: string
  hemi: number
  cloud: string
  particles: 'fireflies' | 'petals' | null
  stars: boolean
  exposure: number
}

export const THEMES: Record<string, Theme> = {
  'theme-daybreak': {
    sky: ['#7fb8ff', '#bfe0ff', '#ffe9d9'],
    sun: '#fff1dc',
    sunIntensity: 2.4,
    sunPos: [14, 22, 6],
    hemiSky: '#d6ecff',
    hemiGround: '#f1d2b8',
    hemi: 1.0,
    cloud: '#ffffff',
    particles: null,
    stars: false,
    exposure: 1.0,
  },
  'theme-sunset': {
    sky: ['#5b4b9e', '#ff8f7a', '#ffd6a0'],
    sun: '#ffb27a',
    sunIntensity: 2.2,
    sunPos: [22, 9, -4],
    hemiSky: '#ffc6a3',
    hemiGround: '#6b4f86',
    hemi: 0.85,
    cloud: '#ffe0d2',
    particles: null,
    stars: false,
    exposure: 1.0,
  },
  'theme-starlight': {
    sky: ['#070b24', '#1a1f55', '#3b3a7a'],
    sun: '#a9bcff',
    sunIntensity: 0.9,
    sunPos: [-10, 20, 12],
    hemiSky: '#4b5aa8',
    hemiGround: '#1b1636',
    hemi: 0.7,
    cloud: '#6a70ad',
    particles: 'fireflies',
    stars: true,
    exposure: 1.1,
  },
  'theme-blossom': {
    sky: ['#ffb8d9', '#ffdcec', '#fff6e8'],
    sun: '#fff0f5',
    sunIntensity: 2.3,
    sunPos: [12, 20, 10],
    hemiSky: '#ffe3f0',
    hemiGround: '#e8c7b8',
    hemi: 1.0,
    cloud: '#fff4fa',
    particles: 'petals',
    stars: false,
    exposure: 1.0,
  },
}

function SkyBackground({ theme }: { theme: Theme }) {
  const { scene } = useThree()
  const tex = useMemo(() => {
    const { ctx, tex } = makeCanvasTexture(8, 512)
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, theme.sky[0])
    g.addColorStop(0.55, theme.sky[1])
    g.addColorStop(1, theme.sky[2])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 8, 512)
    tex.needsUpdate = true
    return tex
  }, [theme])
  useEffect(() => {
    scene.background = tex
    return () => {
      scene.background = null
    }
  }, [scene, tex])
  return null
}

function Lights({ theme, shadows }: { theme: Theme; shadows: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  useEffect(() => {
    const l = sun.current
    if (!l) return
    l.shadow.camera.left = -26
    l.shadow.camera.right = 26
    l.shadow.camera.top = 26
    l.shadow.camera.bottom = -26
    l.shadow.camera.near = 1
    l.shadow.camera.far = 80
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.03
    l.shadow.camera.updateProjectionMatrix()
  }, [])
  return (
    <>
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemi]} />
      <directionalLight
        ref={sun}
        color={theme.sun}
        intensity={theme.sunIntensity}
        position={theme.sunPos}
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <ambientLight intensity={0.25} />
    </>
  )
}

function IslandLabels() {
  const labels = useWorld((s) => s.settings.showLabels)
  if (!labels) return null
  const entries: { id: IslandId | 'plaza'; name: string; pos: THREE.Vector3; role: RoleId | null }[] = [
    { id: 'plaza', name: 'Command Plaza', pos: PLAZA_CENTER.clone().add(new THREE.Vector3(0, 0.1, 0)), role: 'planner' },
    ...ISLAND_LIST.map((i) => ({ id: i.id, name: i.name, pos: i.center.clone(), role: i.id === 'dock' ? null : (i.id as RoleId) })),
  ]
  return (
    <>
      {entries.map((e) => {
        const off = e.id === 'plaza' ? new THREE.Vector3(3.2, 0, 3.2) : ISLANDS[e.id as IslandId].dir.clone().multiplyScalar(-0.2).add(new THREE.Vector3(1.9, 0, 1.9))
        return (
          <Html key={e.id} position={e.pos.clone().add(off).add(new THREE.Vector3(0, 0.05, 0))} center zIndexRange={[5, 0]}>
            <button
              className="island-label"
              style={{ ['--role' as string]: e.role ? CREW[e.role].color : '#8a6d4b' }}
              onClick={() => {
                sfx('click')
                mutate((s) => {
                  if (e.role) {
                    s.ui.selection = { kind: 'agent', id: e.role }
                    s.ui.focus = e.role
                  } else {
                    const first = Object.values(s.approvals).find((a) => a.status === 'pending')
                    s.ui.selection = first ? { kind: 'approval', id: first.id } : s.ui.selection
                    s.ui.focus = 'dock'
                  }
                })
              }}
            >
              {e.name}
            </button>
          </Html>
        )
      })}
    </>
  )
}

/** Camera rig: responsive zoom, gentle follow of the focused crew member or place. */
const SPECTATE_TYPES = new Set(['task', 'handoff', 'approval', 'tests', 'review', 'memory', 'question', 'deliver', 'tool'])

/** Spectator director: every few seconds, follow whoever did the most recent interesting thing. */
function pickSpectateTarget(): RoleId | null {
  const s = getWorld()
  for (let i = s.log.length - 1; i >= Math.max(0, s.log.length - 40); i--) {
    const l = s.log[i]
    if (Date.now() - l.at > 15000) break
    if (l.agentId && SPECTATE_TYPES.has(l.type)) return l.agentId
  }
  const busy = ROLE_IDS.filter((r) => ['working', 'thinking', 'tool', 'awaiting_approval', 'needs_input', 'handoff', 'memory'].includes(s.agents[r].activity))
  return busy.length ? busy[Math.floor(Math.random() * busy.length)] : null
}

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)')

function CameraRig() {
  const controls = useRef<MapControlsImpl>(null)
  const { size, camera } = useThree()
  const nextCut = useRef(0)
  const labelScale = useRef(0)
  const panelsHidden = useWorld((s) => s.ui.panelsHidden)
  const view = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [layoutTick, setLayoutTick] = useState(0)
  useEffect(() => {
    const on = () => setLayoutTick((t) => t + 1)
    window.addEventListener('cw-layout', on)
    return () => window.removeEventListener('cw-layout', on)
  }, [])
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    const css = getComputedStyle(document.documentElement)
    const left = panelsHidden ? 0 : parseFloat(css.getPropertyValue('--left-w')) || 0
    const right = panelsHidden ? 0 : parseFloat(css.getPropertyValue('--right-w')) || 0
    const sheet = parseFloat(css.getPropertyValue('--sheet-h')) || 0
    const free = Math.max(280, size.width - left - right)
    // Phones fit the whole archipelago to the screen width; desktops leave the islands a little breathing room.
    cam.zoom = isCompact() ? Math.max(8, Math.min(free / 34, (size.height - 150) / 22)) : Math.max(14, Math.min(free / 30, size.height / 25))
    // Shift the view so the plaza sits in the middle of the uncovered area, not under a panel or bottom sheet.
    const tx = (right - left) / 2
    const ty = sheet / 2
    if (!view.current) view.current = { x: tx, y: ty, tx, ty }
    view.current.tx = tx
    view.current.ty = ty
    cam.setViewOffset(size.width, size.height, view.current.x, view.current.y, size.width, size.height)
    cam.updateProjectionMatrix()
  }, [size, camera, panelsHidden, layoutTick])
  // Grabbing the map hands the camera back to the captain. (A prop, not a listener: drei rebuilds the
  // controls when the default camera changes, which would strand a listener on the old instance.)
  const stopFollowing = () => {
    const ui = getWorld().ui
    if (ui.focus || ui.spectate)
      mutate((s) => {
        s.ui.focus = null
        s.ui.spectate = false
      })
  }
  useFrame(({ clock }, dt) => {
    const c = controls.current
    if (!c) return
    const v = view.current
    if (v && (Math.abs(v.tx - v.x) > 0.5 || Math.abs(v.ty - v.y) > 0.5)) {
      // Glide to a new view offset (a sheet opened, a panel hid) instead of jumping, unless motion is reduced.
      const k = REDUCED_MOTION.matches ? 1 : Math.min(1, dt * 8)
      v.x += (v.tx - v.x) * k
      v.y += (v.ty - v.y) * k
      const cam = camera as THREE.OrthographicCamera
      cam.setViewOffset(size.width, size.height, v.x, v.y, size.width, size.height)
      cam.updateProjectionMatrix()
    }
    const ui = getWorld().ui
    if (ui.spectate) {
      const t = clock.elapsedTime
      if (t > nextCut.current) {
        nextCut.current = t + 6
        const who = pickSpectateTarget()
        if (who && who !== ui.focus) mutate((s) => void (s.ui.focus = who))
      }
      const cam = camera as THREE.OrthographicCamera
      const wantZoom = Math.max(14, Math.min(size.width / 40, size.height / 26)) * 1.7
      if (Math.abs(cam.zoom - wantZoom) > 0.2) {
        cam.zoom += (wantZoom - cam.zoom) * Math.min(1, dt * 1.5)
        cam.updateProjectionMatrix()
      }
    }
    const focus = getWorld().ui.focus
    let target: THREE.Vector3 | null = null
    if (focus === 'dock') target = ISLANDS.dock.center
    else if (focus === 'tree') target = ISLANDS.archivist.center
    else if (focus === 'plaza') target = PLAZA_CENTER
    else if (focus && ROLE_IDS.includes(focus as RoleId)) target = agentPositions[focus as RoleId]
    if (target) {
      const desired = target.clone().setY(0)
      const delta = desired.sub(c.target).multiplyScalar(Math.min(1, dt * 3))
      c.target.add(delta)
      camera.position.add(delta)
    }
    // keep the view near the archipelago
    const r = Math.hypot(c.target.x, c.target.z)
    if (r > 22) {
      const k = 22 / r
      const nx = c.target.x * k - c.target.x
      const nz = c.target.z * k - c.target.z
      c.target.x += nx
      c.target.z += nz
      camera.position.x += nx
      camera.position.z += nz
    }
    // Only touch the root style when the value changes: a per-frame write restyles the whole document.
    const scale = Math.round(THREE.MathUtils.clamp((camera as THREE.OrthographicCamera).zoom / 42, 0.62, 1.25) * 50) / 50
    if (scale !== labelScale.current) {
      labelScale.current = scale
      document.documentElement.style.setProperty('--label-scale', String(scale))
    }
    c.update()
  })
  return (
    <MapControls
      ref={controls}
      makeDefault
      onStart={stopFollowing}
      enableDamping
      dampingFactor={0.12}
      minZoom={12}
      maxZoom={140}
      minPolarAngle={0.35}
      maxPolarAngle={1.15}
      screenSpacePanning
    />
  )
}

/** Keeps tone-mapping exposure in step with the theme (onCreated only runs once). */
function ExposureSync({ exposure }: { exposure: number }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

export default function World() {
  const themeId = useWorld((s) => s.game.theme)
  const quality = useWorld((s) => s.settings.quality)
  const unlocked = useWorld((s) => s.game.unlocked)
  const avatar = useWorld((s) => s.game.avatar)
  const theme = THEMES[themeId] ?? THEMES['theme-daybreak']
  const high = quality === 'high'
  const has = (id: string) => unlocked.includes(id)
  return (
    <Canvas
      shadows={high ? 'soft' : false}
      dpr={high ? [1, 2] : 1}
      gl={{ antialias: !high, powerPreference: 'high-performance' }}
      onPointerMissed={() => mutate((s) => void (s.ui.selection = { kind: null, id: null }))}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = theme.exposure
      }}
    >
      <OrthographicCamera makeDefault position={[28, 26, 28]} near={-100} far={300} zoom={40} />
      <PerformanceMonitor
        onDecline={() =>
          mutate((d) => {
            if (d.settings.quality !== 'high' || d.game.counters.autoLowQ) return
            d.settings.quality = 'low'
            d.game.counters.autoLowQ = 1
            pushToast(d, { kind: 'info', title: 'Switched to performance mode', body: 'Frame rate was dropping, so shadows and ambient occlusion are off. Turn them back on under Style → Display.' })
          })
        }
      />
      <CameraRig />
      <ExposureSync exposure={theme.exposure} />
      <SkyBackground theme={theme} />
      <Lights theme={theme} shadows={high} />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.6} position={[0, 6, -10]} scale={[20, 8, 1]} color={theme.hemiSky} />
        <Lightformer intensity={1.2} position={[10, 4, 10]} scale={[12, 6, 1]} color="#ffffff" />
        <Lightformer intensity={0.8} position={[-10, 2, 6]} scale={[8, 4, 1]} color={theme.sun} />
      </Environment>
      <Stars on={theme.stars} />
      <Clouds tint={theme.cloud} />
      <Birds />
      <Particles kind={theme.particles} />
      <Islands fairy={has('facility-fairylights')} />
      <Plaza fountain={has('facility-fountain')} rainbow={has('facility-rainbow')} />
      <Observatory />
      <CodeForge />
      <WritersNook />
      <Atelier />
      <DataLoft />
      <TestLab />
      <MemoryGrove />
      <SkyDock />
      <Decorations />
      <RankBanners />
      {has('facility-balloon') && <HotAirBalloon />}
      <Suspense fallback={null}>
        {ROLE_IDS.map((r) => (
          <Agent key={r} role={r} figurine={avatar === 'figurine'} />
        ))}
      </Suspense>
      <DataFlows />
      <MemoryFlight />
      <Confetti />
      <Pops />
      <IslandLabels />
      {high ? (
        <EffectComposer multisampling={4}>
          <N8AO halfRes aoRadius={1.1} intensity={1.6} distanceFalloff={0.6} />
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.25} darkness={0.45} />
        </EffectComposer>
      ) : (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.95} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
