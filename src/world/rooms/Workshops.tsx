import { useFrame } from '@react-three/fiber'
import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { extractChart, extractSvg } from '../../engine/parse'
import { getWorld, useWorld } from '../../state/store'
import { ISLANDS } from '../layout'
import { MAT, colorMat, makeCanvasTexture } from '../kit'
import { Crate, Lamp, Plant, Room, Rug, isBusy } from './common'

// ------------------------------------------------------------------ Observatory (Sage, researcher)

export function Observatory() {
  const scope = useRef<THREE.Group>(null)
  const books = useRef<THREE.Group>(null)
  useFrame(({ clock }, dt) => {
    const busy = isBusy('researcher')
    if (scope.current) scope.current.rotation.y += dt * (busy ? 0.6 : 0.05)
    if (books.current) {
      books.current.visible = busy
      books.current.rotation.y = clock.elapsedTime * 1.4
      books.current.position.y = 1.25 + Math.sin(clock.elapsedTime * 2) * 0.06
    }
  })
  return (
    <Room center={ISLANDS.researcher.center}>
      <group position={[0.3, 0, -1.35]}>
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow material={MAT.cream}>
          <cylinderGeometry args={[1.15, 1.2, 1.3, 28]} />
        </mesh>
        <mesh position={[0, 1.3, 0]} castShadow material={colorMat('#d8dde8', { roughness: 0.4, metalness: 0.3 })}>
          <sphereGeometry args={[1.18, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, 1.31, 0]} material={MAT.woodDark}>
          <torusGeometry args={[1.18, 0.05, 6, 40]} />
        </mesh>
        <mesh position={[0, 0.5, 1.13]} material={MAT.woodDark}>
          <boxGeometry args={[0.55, 0.95, 0.08]} />
        </mesh>
        <mesh position={[0, 0.98, 1.13]} rotation={[Math.PI / 2, 0, 0]} material={MAT.woodDark}>
          <cylinderGeometry args={[0.275, 0.275, 0.08, 16, 1, false, 0, Math.PI]} />
        </mesh>
        <group ref={scope} position={[0, 1.55, 0]}>
          <group rotation={[0, 0, 0.75]} position={[0.35, 0.25, 0]}>
            <mesh castShadow material={MAT.brass}>
              <cylinderGeometry args={[0.14, 0.2, 1.5, 14]} />
            </mesh>
            <mesh position={[0, 0.78, 0]} material={MAT.dark}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 14]} />
            </mesh>
          </group>
        </group>
      </group>
      <group position={[-1.3, 0, 1.05]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow material={MAT.woodLight}>
          <boxGeometry args={[1.0, 0.07, 0.6]} />
        </mesh>
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.27, 0]} material={MAT.woodDark}>
            <boxGeometry args={[0.07, 0.54, 0.55]} />
          </mesh>
        ))}
        <mesh position={[0.22, 0.78, 0]} castShadow>
          <sphereGeometry args={[0.17, 18, 14]} />
          <meshStandardMaterial color="#6fb7ff" roughness={0.5} />
        </mesh>
        <mesh position={[-0.22, 0.61, 0.05]} rotation={[0, 0.3, 0]} material={MAT.paper}>
          <boxGeometry args={[0.36, 0.06, 0.26]} />
        </mesh>
      </group>
      <group ref={books} position={[-0.35, 1.25, 0.55]}>
        {['#e5534b', '#4c8dff', '#f5c542'].map((c, i) => (
          <mesh key={c} position={[Math.cos((i / 3) * Math.PI * 2) * 0.6, i * 0.08, Math.sin((i / 3) * Math.PI * 2) * 0.6]} rotation={[0.3, i, 0.2]}>
            <boxGeometry args={[0.22, 0.05, 0.16]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>
      <Crate position={[1.7, 0, -0.1]} size={0.38} rot={0.3} />
      <Plant position={[-1.9, 0, -0.6]} />
    </Room>
  )
}

// ------------------------------------------------------------------ Code Forge (Bolt, coder)

const KEYWORDS = /\b(function|const|let|return|if|else|for|while|test|expect|new|class|import|export)\b/g

function drawCode(ctx: CanvasRenderingContext2D, text: string, t: number, busy: boolean) {
  const w = 512
  const h = 320
  ctx.fillStyle = '#17142b'
  ctx.fillRect(0, 0, w, h)
  ctx.font = '15px "JetBrains Mono", ui-monospace, monospace'
  if (!text) {
    ctx.fillStyle = '#6d5bd0'
    ctx.font = '700 36px Fredoka, sans-serif'
    const x = 110 + Math.sin(t * 0.7) * 90
    const y = 170 + Math.cos(t * 0.9) * 70
    ctx.fillText('{ zzz }', x, y)
    return
  }
  const lines: string[] = []
  for (const raw of text.split('\n').slice(-40)) {
    let l = raw
    while (l.length > 52) {
      lines.push(l.slice(0, 52))
      l = l.slice(52)
    }
    lines.push(l)
  }
  const show = lines.slice(-17)
  show.forEach((line, i) => {
    const y = 26 + i * 17.5
    ctx.fillStyle = '#4a4470'
    ctx.fillText(String(i + 1).padStart(2, ' '), 8, y)
    let x = 40
    const parts = line.split(KEYWORDS)
    for (const p of parts) {
      if (!p) continue
      ctx.fillStyle = KEYWORDS.test(p) ? '#c792ea' : /^\s*\/\//.test(p) ? '#6a7a8c' : /['"`]/.test(p) ? '#a3e7a0' : '#e6e3f7'
      KEYWORDS.lastIndex = 0
      ctx.fillText(p, x, y)
      x += ctx.measureText(p).width
    }
  })
  if (busy && Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = '#7cf5c8'
    ctx.fillRect(40 + ctx.measureText(show[show.length - 1] ?? '').width, 26 + (show.length - 1) * 17.5 - 13, 9, 16)
  }
}

export function CodeForge() {
  const screen = useMemo(() => makeCanvasTexture(512, 320), [])
  const side = useMemo(() => makeCanvasTexture(256, 200), [])
  const leds = useRef<THREE.InstancedMesh>(null)
  const last = useRef(0)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = getWorld()
    const a = s.agents.coder
    const busy = isBusy('coder')
    if (t - last.current > 0.25) {
      last.current = t
      const task = a.taskId ? s.tasks[a.taskId] : undefined
      drawCode(screen.ctx, task?.streamText ?? '', t, busy)
      screen.tex.needsUpdate = true
      // side monitor: sandbox status from the most recent test report
      const reports = Object.values(s.artifacts).filter((x) => x.kind === 'test_report')
      const lastReport = reports.sort((x, y) => y.createdAt - x.createdAt)[0]
      const c = side.ctx
      c.fillStyle = '#10201a'
      c.fillRect(0, 0, 256, 200)
      c.font = '700 22px Fredoka, sans-serif'
      c.fillStyle = '#7cf5c8'
      c.fillText('SANDBOX', 18, 36)
      c.font = '16px "JetBrains Mono", monospace'
      const m = lastReport?.summary.match(/(\d+)\/(\d+) tests passed/)
      if (m) {
        const ok = m[1] === m[2]
        c.fillStyle = ok ? '#5ff0a8' : '#ff6b6b'
        c.font = '700 48px Fredoka, sans-serif'
        c.fillText(`${m[1]}/${m[2]}`, 18, 110)
        c.font = '16px "JetBrains Mono", monospace'
        c.fillText(ok ? 'all green ✓' : 'failing ✗', 18, 150)
      } else {
        c.fillStyle = '#5c7a6c'
        c.fillText('no runs yet', 18, 100)
      }
      side.tex.needsUpdate = true
    }
    if (leds.current) {
      const col = new THREE.Color()
      for (let i = 0; i < 12; i++) {
        const on = Math.sin(t * (busy ? 14 : 2) + i * 1.7) > 0.2
        col.set(on ? (i % 3 === 0 ? '#7cf5c8' : '#8b5cf6') : '#2a2440')
        leds.current.setColorAt(i, col)
      }
      if (leds.current.instanceColor) leds.current.instanceColor.needsUpdate = true
    }
  })
  const ledMatrices = useMemo(() => Array.from({ length: 12 }, (_, i) => new THREE.Vector3(-0.2 + (i % 3) * 0.2, 0.35 + Math.floor(i / 3) * 0.3, 0.26)), [])
  useEffect(() => {
    const m = new THREE.Matrix4()
    ledMatrices.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z)
      leds.current?.setMatrixAt(i, m)
    })
    if (leds.current) leds.current.instanceMatrix.needsUpdate = true
  }, [ledMatrices])
  return (
    <Room center={ISLANDS.coder.center}>
      <Rug position={[0, 0, -0.35]} radius={1.2} color="#cbbcf5" />
      <group position={[0, 0, -1.05]}>
        <mesh position={[0, 0.6, 0]} castShadow receiveShadow material={MAT.woodDark}>
          <boxGeometry args={[2.1, 0.08, 0.75]} />
        </mesh>
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, 0.3, 0]} material={MAT.dark}>
            <boxGeometry args={[0.07, 0.6, 0.7]} />
          </mesh>
        ))}
        <group position={[0, 1.02, -0.12]}>
          <mesh castShadow material={MAT.dark}>
            <boxGeometry args={[1.0, 0.62, 0.05]} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[0.94, 0.56]} />
            <meshStandardMaterial map={screen.tex} emissive="#ffffff" emissiveMap={screen.tex} emissiveIntensity={0.9} />
          </mesh>
        </group>
        <group position={[0.85, 0.94, 0.02]} rotation={[0, -0.6, 0]}>
          <mesh castShadow material={MAT.dark}>
            <boxGeometry args={[0.56, 0.44, 0.04]} />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[0.52, 0.4]} />
            <meshStandardMaterial map={side.tex} emissive="#ffffff" emissiveMap={side.tex} emissiveIntensity={0.8} />
          </mesh>
        </group>
        <mesh position={[0, 0.66, 0.2]} material={MAT.dark}>
          <boxGeometry args={[0.7, 0.03, 0.2]} />
        </mesh>
        <mesh position={[-0.7, 0.72, 0.15]} castShadow>
          <sphereGeometry args={[0.1, 14, 10]} />
          <meshStandardMaterial color="#ffd43b" />
        </mesh>
        <mesh position={[-0.62, 0.8, 0.2]}>
          <sphereGeometry args={[0.065, 12, 10]} />
          <meshStandardMaterial color="#ffd43b" />
        </mesh>
        <mesh position={[0.55, 0.7, 0.2]} castShadow material={MAT.white}>
          <cylinderGeometry args={[0.06, 0.05, 0.13, 12]} />
        </mesh>
      </group>
      <group position={[-1.7, 0, -0.95]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.8, 0]} castShadow material={MAT.dark}>
          <boxGeometry args={[0.7, 1.6, 0.5]} />
        </mesh>
        <instancedMesh ref={leds} args={[undefined, undefined, 12]}>
          <boxGeometry args={[0.1, 0.05, 0.02]} />
          <meshBasicMaterial color={[1.6, 1.6, 1.6]} toneMapped={false} />
        </instancedMesh>
      </group>
      <Crate position={[1.8, 0, -1.1]} size={0.36} rot={0.4} />
    </Room>
  )
}

// ------------------------------------------------------------------ Writer's Nook (Quill, writer)

export function WritersNook() {
  const smoke = useRef<THREE.Group>(null)
  const stack = useRef<THREE.Mesh>(null)
  const pages = useWorld((s) => Object.values(s.artifacts).filter((a) => a.agentId === 'writer').reduce((n, a) => n + a.content.length, 0))
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const busy = isBusy('writer')
    smoke.current?.children.forEach((c, i) => {
      const k = (t * (busy ? 0.6 : 0.25) + i / 4) % 1
      c.position.set(Math.sin(k * 6 + i) * 0.12, k * 1.4, 0)
      const sc = 0.12 + k * 0.28
      c.scale.setScalar(sc)
      ;((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = (1 - k) * (busy ? 0.85 : 0.4)
    })
    if (stack.current) {
      const h = Math.min(0.45, 0.02 + pages / 30000)
      stack.current.scale.y = THREE.MathUtils.lerp(stack.current.scale.y, h / 0.1, 0.05)
      stack.current.position.y = 0.66 + (stack.current.scale.y * 0.1) / 2
    }
  })
  return (
    <Room center={ISLANDS.writer.center}>
      <group position={[0.55, 0, -1.55]}>
        <mesh position={[0, 0.65, 0]} castShadow receiveShadow material={MAT.cream}>
          <boxGeometry args={[1.8, 1.3, 1.3]} />
        </mesh>
        <mesh position={[0, 1.62, 0]} rotation={[0, 0, Math.PI / 4]} castShadow material={MAT.roofRed}>
          <boxGeometry args={[1.05, 1.05, 1.5]} />
        </mesh>
        <mesh position={[0, 0.45, 0.66]} material={MAT.woodDark}>
          <boxGeometry args={[0.45, 0.8, 0.05]} />
        </mesh>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.85, 0.66]}>
            <boxGeometry args={[0.36, 0.34, 0.04]} />
            <meshStandardMaterial color="#ffe6a8" emissive="#ffb84d" emissiveIntensity={0.5} />
          </mesh>
        ))}
        <mesh position={[0.5, 2.05, -0.1]} castShadow material={MAT.stoneDark}>
          <boxGeometry args={[0.28, 0.6, 0.28]} />
        </mesh>
        <group ref={smoke} position={[0.5, 2.4, -0.1]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#f4f1ee" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          ))}
        </group>
      </group>
      <group position={[1.2, 0, 0.45]} rotation={[0, -Math.PI / 2 + 0.25, 0]}>
        <mesh position={[0, 0.62, 0]} castShadow receiveShadow material={MAT.woodLight}>
          <boxGeometry args={[1.1, 0.07, 0.62]} />
        </mesh>
        {[-0.48, 0.48].map((x) => (
          <mesh key={x} position={[x, 0.3, 0]} material={MAT.woodDark}>
            <boxGeometry args={[0.07, 0.6, 0.56]} />
          </mesh>
        ))}
        <group position={[0, 0.72, 0.02]}>
          <mesh castShadow>
            <boxGeometry args={[0.46, 0.14, 0.34]} />
            <meshStandardMaterial color="#2f5d50" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.1, -0.1]} rotation={[0, 0, Math.PI / 2]} material={MAT.dark}>
            <cylinderGeometry args={[0.05, 0.05, 0.52, 12]} />
          </mesh>
          <mesh position={[0, 0.2, -0.12]} rotation={[-0.2, 0, 0]} material={MAT.paper}>
            <boxGeometry args={[0.3, 0.26, 0.01]} />
          </mesh>
        </group>
        <mesh ref={stack} position={[-0.35, 0.67, 0.05]} castShadow material={MAT.paper}>
          <boxGeometry args={[0.24, 0.1, 0.3]} />
        </mesh>
      </group>
      <Lamp position={[1.9, 0, -0.3]} height={1.2} />
      <Plant position={[-0.6, 0, -1.4]} scale={1.2} />
    </Room>
  )
}

// ------------------------------------------------------------------ Design Atelier (Hue, designer)

function useLatestArtifactText(role: 'designer' | 'analyst'): string {
  return useWorld((s) => {
    let best: { at: number; c: string } | null = null
    for (const a of Object.values(s.artifacts)) if (a.agentId === role && (!best || a.createdAt > best.at)) best = { at: a.createdAt, c: a.content }
    return best?.c ?? ''
  })
}

export function Atelier() {
  const canvas = useMemo(() => makeCanvasTexture(512, 400), [])
  const latest = useLatestArtifactText('designer')
  const svg = useMemo(() => extractSvg(latest), [latest])
  const strokes = useRef<{ x: number; y: number; c: string; r: number }[]>([])
  const drawn = useRef<string | null>(null)
  const last = useRef(0)
  useEffect(() => {
    const { ctx, tex } = canvas
    ctx.fillStyle = '#fffdf7'
    ctx.fillRect(0, 0, 512, 400)
    if (!svg) {
      drawn.current = null
      tex.needsUpdate = true
      return
    }
    const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#fffdf7'
      ctx.fillRect(0, 0, 512, 400)
      const s = Math.min(480 / (img.width || 480), 370 / (img.height || 370))
      const w = (img.width || 480) * s
      const h = (img.height || 370) * s
      ctx.drawImage(img, (512 - w) / 2, (400 - h) / 2, w, h)
      drawn.current = svg
      tex.needsUpdate = true
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`
  }, [svg, canvas])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!isBusy('designer') || t - last.current < 0.12) return
    last.current = t
    const { ctx, tex } = canvas
    const colors = ['#F2548B', '#4c8dff', '#ffd43b', '#3fbf7f', '#9b7bff', '#ff9f43']
    strokes.current.push({ x: 60 + Math.random() * 390, y: 60 + Math.random() * 280, c: colors[Math.floor(Math.random() * colors.length)], r: 6 + Math.random() * 22 })
    const st = strokes.current[strokes.current.length - 1]
    ctx.globalAlpha = 0.8
    ctx.fillStyle = st.c
    ctx.beginPath()
    ctx.ellipse(st.x, st.y, st.r * 1.6, st.r, Math.random() * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    tex.needsUpdate = true
  })
  return (
    <Room center={ISLANDS.designer.center}>
      <group position={[-1.05, 0, -0.45]} rotation={[0, 0.75, 0]}>
        {[-0.35, 0.35].map((x) => (
          <mesh key={x} position={[x, 0.75, 0.05]} rotation={[0.12, 0, x > 0 ? -0.08 : 0.08]} castShadow material={MAT.wood}>
            <boxGeometry args={[0.06, 1.55, 0.06]} />
          </mesh>
        ))}
        <mesh position={[0, 0.7, -0.25]} rotation={[-0.3, 0, 0]} material={MAT.wood}>
          <boxGeometry args={[0.06, 1.45, 0.06]} />
        </mesh>
        <mesh position={[0, 0.42, 0.1]} material={MAT.woodDark}>
          <boxGeometry args={[0.95, 0.05, 0.12]} />
        </mesh>
        <mesh position={[0, 1.02, 0.12]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[1.0, 0.8, 0.04]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 1.02, 0.145]} rotation={[-0.12, 0, 0]}>
          <planeGeometry args={[0.94, 0.74]} />
          <meshStandardMaterial map={canvas.tex} roughness={0.9} />
        </mesh>
      </group>
      <group position={[0.55, 0, -1.55]} rotation={[0, -0.2, 0]}>
        <mesh position={[0, 0.9, 0]} castShadow material={MAT.cream}>
          <boxGeometry args={[1.3, 1.1, 0.06]} />
        </mesh>
        {['#F2548B', '#ffd43b', '#4c8dff', '#3fbf7f', '#9b7bff', '#ff9f43'].map((c, i) => (
          <mesh key={c} position={[-0.42 + (i % 3) * 0.42, 1.12 - Math.floor(i / 3) * 0.42, 0.04]}>
            <boxGeometry args={[0.32, 0.32, 0.02]} />
            <meshStandardMaterial color={c} />
          </mesh>
        ))}
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} position={[x, 0.2, 0]} material={MAT.woodDark}>
            <boxGeometry args={[0.06, 0.4, 0.06]} />
          </mesh>
        ))}
      </group>
      {[
        [0.95, 0.9, '#F2548B'],
        [1.25, 0.55, '#4c8dff'],
        [-1.6, 0.7, '#ffd43b'],
      ].map(([x, z, c]) => (
        <group key={String(c)} position={[x as number, 0, z as number]}>
          <mesh position={[0, 0.14, 0]} castShadow material={MAT.metal}>
            <cylinderGeometry args={[0.14, 0.12, 0.28, 14]} />
          </mesh>
          <mesh position={[0, 0.285, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.01, 14]} />
            <meshStandardMaterial color={c as string} />
          </mesh>
          <mesh position={[0.25, 0.012, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.18, 14]} />
            <meshStandardMaterial color={c as string} />
          </mesh>
        </group>
      ))}
    </Room>
  )
}

// ------------------------------------------------------------------ Data Loft (Tally, analyst)

export function DataLoft() {
  const latest = useLatestArtifactText('analyst')
  const chart = useMemo(() => extractChart(latest), [latest])
  const bars = useRef<THREE.Group>(null)
  const colors = ['#E0A000', '#4c8dff', '#3fbf7f', '#F2548B', '#9b7bff', '#ff9f43']
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const busy = isBusy('analyst')
    const vals = chart?.values ?? [3, 5, 4, 7, 6]
    const max = Math.max(...vals, 1)
    bars.current?.children.forEach((c, i) => {
      const target = busy ? 0.3 + Math.abs(Math.sin(t * 2.3 + i * 1.3)) * 1.0 : i < vals.length ? 0.12 + (vals[i] / max) * 1.15 : 0.05
      c.scale.y = THREE.MathUtils.lerp(c.scale.y, target, 0.08)
      c.position.y = 0.2 + c.scale.y / 2
    })
  })
  return (
    <Room center={ISLANDS.analyst.center}>
      <group position={[0.15, 0, -1.35]}>
        <mesh position={[0, 1.0, -0.05]} castShadow receiveShadow material={MAT.dark}>
          <boxGeometry args={[2.2, 1.7, 0.08]} />
        </mesh>
        <mesh position={[0, 0.25, 0.02]} material={MAT.woodLight}>
          <boxGeometry args={[2.1, 0.06, 0.3]} />
        </mesh>
        <group ref={bars} position={[-0.8, 0, 0.05]}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[i * 0.32, 0.5, 0]} castShadow>
              <boxGeometry args={[0.22, 1, 0.08]} />
              <meshStandardMaterial color={colors[i]} emissive={colors[i]} emissiveIntensity={0.35} />
            </mesh>
          ))}
        </group>
        {[-1.0, 1.0].map((x) => (
          <mesh key={x} position={[x, 0.5, -0.1]} material={MAT.woodDark}>
            <boxGeometry args={[0.08, 1.0, 0.08]} />
          </mesh>
        ))}
      </group>
      <group position={[1.4, 0, -0.1]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow material={MAT.woodLight}>
          <boxGeometry args={[0.9, 0.07, 0.55]} />
        </mesh>
        <mesh position={[0, 0.26, 0]} material={MAT.woodDark}>
          <boxGeometry args={[0.8, 0.52, 0.45]} />
        </mesh>
        <group position={[0, 0.82, 0]}>
          <mesh material={MAT.wood}>
            <boxGeometry args={[0.6, 0.04, 0.04]} />
          </mesh>
          {[0, 1, 2].map((r) => (
            <group key={r} position={[0, -0.08 * (r + 1), 0]}>
              {[0, 1, 2, 3, 4].map((k) => (
                <mesh key={k} position={[-0.2 + k * 0.1, 0, 0]}>
                  <sphereGeometry args={[0.035, 8, 6]} />
                  <meshStandardMaterial color={['#e5534b', '#4c8dff', '#f5c542'][r]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      </group>
      <group position={[-1.35, 0, -0.9]}>
        {[
          [0, 0.2, 0, '#4c8dff'],
          [0.42, 0.2, 0.05, '#E0A000'],
          [0.2, 0.6, 0.02, '#3fbf7f'],
        ].map(([x, y, z, c]) => (
          <mesh key={String(c)} position={[x as number, y as number, z as number]} rotation={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
            <meshStandardMaterial color={c as string} />
          </mesh>
        ))}
      </group>
    </Room>
  )
}

// ------------------------------------------------------------------ Test Lab (Rook, QA)

export function TestLab() {
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  const bubbles = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const s = getWorld()
    const t = clock.elapsedTime
    const busy = isBusy('qa')
    const reviews = Object.values(s.tasks).filter((x) => x.kind === 'review' && x.verdict)
    const last = reviews.sort((a, b) => (b.finishedAt ?? b.startedAt ?? 0) - (a.finishedAt ?? a.startedAt ?? 0))[0]
    const col = busy ? '#ffb347' : last?.verdict === 'pass' ? '#44e08a' : last?.verdict === 'fail' ? '#ff5a52' : '#8a8fa3'
    if (lamp.current) {
      lamp.current.color.set(col)
      lamp.current.emissive.set(col)
      lamp.current.emissiveIntensity = busy ? 1.5 + Math.sin(t * 8) : 1.4
    }
    bubbles.current?.children.forEach((c, i) => {
      const k = (t * (busy ? 0.9 : 0.3) + i / 5) % 1
      c.position.y = 0.95 + k * 0.4
      c.scale.setScalar(0.03 + k * 0.03)
    })
  })
  return (
    <Room center={ISLANDS.qa.center}>
      <group position={[0.75, 0, -1.4]}>
        <mesh position={[0, 0.7, 0]} material={MAT.glass}>
          <boxGeometry args={[1.7, 1.4, 1.2]} />
        </mesh>
        {[
          [-0.85, -0.6],
          [0.85, -0.6],
          [-0.85, 0.6],
          [0.85, 0.6],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.72, z]} castShadow material={MAT.white}>
            <boxGeometry args={[0.06, 1.44, 0.06]} />
          </mesh>
        ))}
        <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 4]} material={MAT.glass}>
          <boxGeometry args={[0.95, 0.95, 1.2]} />
        </mesh>
        <Plant position={[-0.4, 0, 0]} scale={0.9} />
        <Plant position={[0.4, 0, 0.1]} scale={0.75} />
      </group>
      <group position={[1.3, 0, 0.45]} rotation={[0, -Math.PI / 2 + 0.3, 0]}>
        <mesh position={[0, 0.62, 0]} castShadow receiveShadow material={MAT.white}>
          <boxGeometry args={[1.2, 0.08, 0.6]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} material={colorMat('#c9d6c0')}>
          <boxGeometry args={[1.1, 0.58, 0.5]} />
        </mesh>
        {['#7cf5c8', '#ff8fb1', '#ffd43b', '#9b7bff'].map((c, i) => (
          <group key={c} position={[-0.42 + i * 0.28, 0.66, 0]}>
            <mesh position={[0, 0.14, 0]} material={MAT.glass}>
              <cylinderGeometry args={[0.07, 0.09, 0.28, 12]} />
            </mesh>
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.065, 0.085, 0.16, 12]} />
              <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
        <group ref={bubbles} position={[-0.42, 0, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[(i % 2) * 0.03, 1, 0]}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color="#c9fff0" transparent opacity={0.8} />
            </mesh>
          ))}
        </group>
      </group>
      <group position={[1.95, 0, -0.3]}>
        <mesh position={[0, 0.7, 0]} castShadow material={MAT.dark}>
          <cylinderGeometry args={[0.05, 0.06, 1.4, 8]} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.2, 18, 14]} />
          <meshStandardMaterial ref={lamp} color="#8a8fa3" emissive="#8a8fa3" emissiveIntensity={1} />
        </mesh>
      </group>
    </Room>
  )
}

// ------------------------------------------------------------------ Memory Grove (Moss, archivist)

function MemoryOrbs() {
  const count = useWorld((s) => Object.keys(s.memories).length)
  const kinds = useWorld((s) => Object.values(s.memories).map((m) => m.kind).join(','))
  const ref = useRef<THREE.InstancedMesh>(null)
  const pulse = useRef(0)
  const lastPulse = useRef(0)
  const MAX = 90
  const positions = useMemo(() => {
    const out: THREE.Vector3[] = []
    for (let i = 0; i < MAX; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / MAX)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      const r = 1.35 + ((i * 37) % 7) * 0.03
      out.push(new THREE.Vector3(Math.cos(theta) * Math.sin(phi) * r * 1.2, 3.0 + Math.cos(phi) * r * 0.8, Math.sin(theta) * Math.sin(phi) * r * 1.2))
    }
    return out
  }, [])
  useEffect(() => {
    const inst = ref.current
    if (!inst) return
    const kindColor: Record<string, string> = { fact: '#7fd4ff', decision: '#ffd43b', discovery: '#ff8fb1', lesson: '#ff9f43', preference: '#b39bff', summary: '#7cf5c8' }
    const list = kinds ? kinds.split(',') : []
    const col = new THREE.Color()
    list.slice(0, MAX).forEach((k, i) => inst.setColorAt(i, col.set(kindColor[k] ?? '#7fd4ff')))
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }, [kinds, count])
  useFrame(({ clock }) => {
    const inst = ref.current
    if (!inst) return
    const s = getWorld()
    const mp = s.game.counters.memoryPulse ?? 0
    if (mp !== lastPulse.current) {
      lastPulse.current = mp
      pulse.current = 1
    }
    pulse.current = Math.max(0, pulse.current - 0.015)
    const m = new THREE.Matrix4()
    const t = clock.elapsedTime
    const n = Math.min(count, MAX)
    for (let i = 0; i < MAX; i++) {
      const p = positions[i]
      const sc = i < n ? 0.085 + Math.sin(t * 2 + i) * 0.012 + (i === n - 1 ? pulse.current * 0.12 : 0) : 0.0001
      m.makeScale(sc, sc, sc).setPosition(p.x, p.y + Math.sin(t + i) * 0.03, p.z)
      inst.setMatrixAt(i, m)
    }
    inst.instanceMatrix.needsUpdate = true
    ;(inst.material as THREE.MeshBasicMaterial).color.setScalar(1.6 + pulse.current * 2.5)
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshBasicMaterial color={[1.8, 1.8, 1.8]} toneMapped={false} />
    </instancedMesh>
  )
}

export function MemoryGrove() {
  const book = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const busy = getWorld().agents.archivist.activity === 'memory'
    if (book.current) book.current.emissiveIntensity = busy ? 1.2 + Math.sin(clock.elapsedTime * 6) * 0.4 : 0.15
  })
  const foliage: [number, number, number, number, THREE.Material][] = [
    [0, 3.05, 0, 1.45, MAT.leaf],
    [-0.95, 2.7, 0.2, 1.0, MAT.leafDark],
    [0.95, 2.75, -0.1, 1.05, MAT.leafLight],
    [0.2, 3.7, -0.3, 1.0, MAT.leafLight],
    [-0.4, 3.35, 0.7, 0.85, MAT.leafDark],
  ]
  return (
    <Room center={ISLANDS.archivist.center}>
      <group position={[0, 0, -0.9]}>
        <mesh position={[0, 1.1, 0]} castShadow material={MAT.woodDark}>
          <cylinderGeometry args={[0.32, 0.55, 2.3, 10]} />
        </mesh>
        {[0, 1.3, 2.6, 3.9, 5.2].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55]} rotation={[0, -a, 0.9]} castShadow material={MAT.woodDark}>
            <cylinderGeometry args={[0.07, 0.16, 0.8, 6]} />
          </mesh>
        ))}
        {foliage.map(([x, y, z, r, m], i) => (
          <mesh key={i} position={[x, y, z]} castShadow material={m}>
            <icosahedronGeometry args={[r, 1]} />
          </mesh>
        ))}
        <MemoryOrbs />
      </group>
      {[
        [1.65, -0.35, -0.7],
        [-1.75, -0.9, 0.6],
      ].map(([x, z, r]) => (
        <group key={x} position={[x, 0, z]} rotation={[0, r, 0]}>
          <mesh position={[0, 0.65, 0]} castShadow material={MAT.woodDark}>
            <boxGeometry args={[1.0, 1.3, 0.35]} />
          </mesh>
          {[0.3, 0.7, 1.1].map((y) => (
            <group key={y}>
              {[-0.35, -0.2, -0.05, 0.1, 0.25, 0.38].map((bx, k) => (
                <mesh key={bx} position={[bx, y, 0.1]}>
                  <boxGeometry args={[0.1, 0.28, 0.2]} />
                  <meshStandardMaterial color={['#e5534b', '#4c8dff', '#f5c542', '#3fbf7f', '#9b7bff', '#ff9f43'][(k + Math.round(y * 10)) % 6]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      <group position={[-1.4, 0, 0.5]} rotation={[0, 0.8, 0]}>
        <mesh position={[0, 0.45, 0]} castShadow material={MAT.wood}>
          <cylinderGeometry args={[0.08, 0.16, 0.9, 8]} />
        </mesh>
        <mesh position={[0, 0.95, 0]} rotation={[-0.5, 0, 0]} castShadow material={MAT.woodDark}>
          <boxGeometry args={[0.6, 0.06, 0.45]} />
        </mesh>
        <mesh position={[0, 1.0, 0.02]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.5, 0.03, 0.36]} />
          <meshStandardMaterial ref={book} color="#fff7e0" emissive="#8ff0e0" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </Room>
  )
}
