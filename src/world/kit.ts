import * as THREE from 'three'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })

/** Shared palette materials (created once). */
export const MAT = {
  grass: std('#8fcf6a'),
  grassDark: std('#6fb552'),
  grassLight: std('#a8dd7f'),
  dirt: std('#b07a4f'),
  stone: std('#d9d2c5'),
  stoneDark: std('#b9b0a2'),
  stoneWarm: std('#e8dcc6'),
  wood: std('#b9814f'),
  woodDark: std('#8a5a36'),
  woodLight: std('#d7a26d'),
  plank: std('#c99462'),
  rope: std('#e3cf9f'),
  cream: std('#fff4e0'),
  white: std('#ffffff'),
  roofRed: std('#d9644a'),
  roofBlue: std('#5c7cd6'),
  roofTeal: std('#3fb3a1'),
  brass: new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.35, metalness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9aa3b5', roughness: 0.4, metalness: 0.6 }),
  dark: std('#2c2a3a'),
  screen: new THREE.MeshStandardMaterial({ color: '#1b1830', emissive: '#6d5bd0', emissiveIntensity: 0.35, roughness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#cdefff', roughness: 0.08, transmission: 0, transparent: true, opacity: 0.35, metalness: 0 }),
  leaf: std('#5fbf6a', { flatShading: true }),
  leafDark: std('#46a05a', { flatShading: true }),
  leafLight: std('#7fd37e', { flatShading: true }),
  paper: std('#fffaf0'),
  red: std('#e5534b'),
  green: std('#3fbf7f'),
  yellow: std('#f5c542'),
  blue: std('#4c8dff'),
  pink: std('#ff8fb1'),
  purple: std('#9b7bff'),
  orange: std('#ff9f43'),
  cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, transparent: true, opacity: 0.95 }),
}

export function colorMat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return std(color, extra)
}

/** Stylized floating-rock underside: a jittered lathe cone with a warm-to-cool vertex gradient. */
export function makeRockGeometry(radius: number, depth: number, seed: number): THREE.BufferGeometry {
  const r = rng(seed)
  const profile: THREE.Vector2[] = []
  const rings = 7
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const rr = radius * (1 - t ** 1.35) * (0.94 + r() * 0.1) + 0.05
    profile.push(new THREE.Vector2(i === rings ? 0.0001 : rr, -t * depth))
  }
  const g = new THREE.LatheGeometry(profile, 22)
  const pos = g.attributes.position as THREE.BufferAttribute
  const colors: number[] = []
  const top = new THREE.Color('#b27c55')
  const mid = new THREE.Color('#9a7a86')
  const bottom = new THREE.Color('#7e86b8')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = -y / depth
    if (t > 0.03) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const k = 1 + (r() - 0.5) * 0.28
      pos.setXYZ(i, x * k, y + (r() - 0.5) * 0.25 * depth * 0.2, z * k)
    }
    if (t < 0.5) c.copy(top).lerp(mid, t * 2)
    else c.copy(mid).lerp(bottom, (t - 0.5) * 2)
    colors.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g.toNonIndexed()
}

export const ROCK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })

/** Canvas-backed texture helper for live screens, boards and signs. */
export function makeCanvasTexture(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { canvas, ctx, tex }
}
