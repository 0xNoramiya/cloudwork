import * as THREE from 'three'
import type { RoleId } from '../engine/types'

/** Outer islands. The planner lives on the central Command Plaza. */
export type IslandId = Exclude<RoleId, 'planner'> | 'dock'
export type Place = RoleId | 'dock' | 'tree' | 'plaza'

// The isometric camera sits at +x,+y,+z looking at the origin, so on the ground plane
// screen-right = (1,0,-1)/√2 and screen-far = (-1,0,-1)/√2.
const R = Math.SQRT1_2
function fromScreen(sx: number, sy: number): THREE.Vector3 {
  return new THREE.Vector3(sx * R - sy * R, 0, -sx * R - sy * R)
}

export const RING_RADIUS = 13.5
export const PLAZA_RADIUS = 5.6
export const PLAZA_CENTER = new THREE.Vector3(0, 0.2, 0)
export const WALK_RING = 3.25

/** Rooms are authored in a screen-aligned frame: +x = screen right, +z = toward the camera. */
export const SCREEN_YAW = Math.PI / 4
const _q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SCREEN_YAW)
export function localToWorld(center: THREE.Vector3, x: number, z: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyQuaternion(_q).add(center)
}

interface IslandDef {
  id: IslandId
  name: string
  screenAngle: number // degrees; 0 = screen right, 90 = far/top
  height: number
  radius: number
}

const DEFS: IslandDef[] = [
  { id: 'archivist', name: 'Memory Grove', screenAngle: 90, height: 0.5, radius: 3.9 },
  { id: 'researcher', name: 'Observatory', screenAngle: 138, height: 0.35, radius: 3.5 },
  { id: 'coder', name: 'Code Forge', screenAngle: 180, height: 0.0, radius: 3.5 },
  { id: 'designer', name: 'Design Atelier', screenAngle: 222, height: -0.25, radius: 3.5 },
  { id: 'dock', name: 'Sky Dock', screenAngle: 270, height: -0.4, radius: 3.3 },
  { id: 'qa', name: 'Test Lab', screenAngle: 318, height: -0.2, radius: 3.5 },
  { id: 'writer', name: "Writer's Nook", screenAngle: 0, height: 0.1, radius: 3.5 },
  { id: 'analyst', name: 'Data Loft', screenAngle: 42, height: 0.3, radius: 3.5 },
]

interface RoomSpots {
  station: [number, number]
  /** yaw in the screen frame; 0 = facing the camera */
  stationYaw: number
  visit: [number, number]
}

// Hand-placed per room (see src/world/rooms). Kept here so the agent controller and the rooms agree.
export const ROOM_SPOTS: Record<IslandId | 'planner', RoomSpots> = {
  planner: { station: [0, -2.35], stationYaw: 0, visit: [1.3, -2.1] },
  researcher: { station: [-0.35, 0.55], stationYaw: -0.9, visit: [0.75, 0.9] },
  coder: { station: [0, -0.2], stationYaw: Math.PI, visit: [1.0, 0.55] },
  writer: { station: [0.15, 0.2], stationYaw: Math.PI * 0.42, visit: [-0.9, 0.75] },
  designer: { station: [-0.15, 0.3], stationYaw: -Math.PI * 0.72, visit: [0.95, 0.65] },
  analyst: { station: [0.15, -0.25], stationYaw: Math.PI, visit: [-0.9, 0.65] },
  qa: { station: [0.25, 0.1], stationYaw: Math.PI * 0.4, visit: [-0.85, 0.85] },
  archivist: { station: [-0.8, 1.0], stationYaw: -Math.PI * 0.72, visit: [0.85, 1.35] },
  dock: { station: [0.2, 0.9], stationYaw: 0, visit: [0.2, 0.9] },
}

export interface Island {
  id: IslandId
  name: string
  center: THREE.Vector3
  radius: number
  /** unit vector from plaza center toward the island */
  dir: THREE.Vector3
  station: THREE.Vector3
  stationYaw: number
  visit: THREE.Vector3
  door: THREE.Vector3
  plazaGate: THREE.Vector3
  angle: number
  screenAngle: number
}

export const ISLANDS: Record<IslandId, Island> = Object.fromEntries(
  DEFS.map((d) => {
    const a = (d.screenAngle * Math.PI) / 180
    const dir = fromScreen(Math.cos(a), Math.sin(a)).normalize()
    const center = dir.clone().multiplyScalar(RING_RADIUS)
    center.y = d.height
    const door = center.clone().addScaledVector(dir, -(d.radius - 0.45))
    const plazaGate = dir.clone().multiplyScalar(PLAZA_RADIUS - 0.45)
    plazaGate.y = PLAZA_CENTER.y
    const spots = ROOM_SPOTS[d.id]
    return [
      d.id,
      {
        id: d.id,
        name: d.name,
        center,
        radius: d.radius,
        dir,
        station: localToWorld(center, spots.station[0], spots.station[1]),
        stationYaw: spots.stationYaw + SCREEN_YAW,
        visit: localToWorld(center, spots.visit[0], spots.visit[1]),
        door,
        plazaGate,
        angle: Math.atan2(dir.z, dir.x),
        screenAngle: d.screenAngle,
      },
    ]
  }),
) as Record<IslandId, Island>

export const ISLAND_LIST = Object.values(ISLANDS)

/** Where a crew member works. */
export function home(role: RoleId): { pos: THREE.Vector3; yaw: number } {
  if (role === 'planner') {
    const s = ROOM_SPOTS.planner
    return { pos: localToWorld(PLAZA_CENTER, s.station[0], s.station[1]), yaw: s.stationYaw + SCREEN_YAW }
  }
  const isl = ISLANDS[role]
  return { pos: isl.station.clone(), yaw: isl.stationYaw }
}

/** Height of walkable ground at a point (islands have different heights; bridges interpolate). */
export function groundY(p: THREE.Vector3): number {
  const r = Math.hypot(p.x, p.z)
  if (r <= PLAZA_RADIUS) return PLAZA_CENTER.y
  let best: Island | null = null
  let bestD = Infinity
  for (const isl of ISLAND_LIST) {
    const d = Math.hypot(p.x - isl.center.x, p.z - isl.center.z)
    if (d < bestD) {
      bestD = d
      best = isl
    }
  }
  if (!best) return 0
  if (bestD <= best.radius) return best.center.y
  const t = THREE.MathUtils.clamp((r - PLAZA_RADIUS) / (RING_RADIUS - best.radius - PLAZA_RADIUS), 0, 1)
  return THREE.MathUtils.lerp(PLAZA_CENTER.y, best.center.y, t)
}

function regionOf(p: THREE.Vector3): IslandId | 'plaza' {
  if (Math.hypot(p.x, p.z) < PLAZA_RADIUS + 0.9) return 'plaza'
  let best: IslandId = 'dock'
  let bestD = Infinity
  for (const isl of ISLAND_LIST) {
    const d = Math.hypot(p.x - isl.center.x, p.z - isl.center.z)
    if (d < bestD) {
      bestD = d
      best = isl.id
    }
  }
  return best
}

function ringPoint(angle: number): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(angle) * WALK_RING, PLAZA_CENTER.y, Math.sin(angle) * WALK_RING)
}

function arc(fromAngle: number, toAngle: number): THREE.Vector3[] {
  let delta = toAngle - fromAngle
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.35))
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i++) pts.push(ringPoint(fromAngle + (delta * i) / steps))
  return pts
}

/** Waypoint path between two ground points, routed over bridges and around the planning table. */
export function planPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  const a = regionOf(from)
  const b = regionOf(to)
  if (a === b) {
    if (a === 'plaza') {
      // walk around the table rather than through it
      const ra = Math.hypot(from.x, from.z)
      const rb = Math.hypot(to.x, to.z)
      const angA = Math.atan2(from.z, from.x)
      const angB = Math.atan2(to.z, to.x)
      let delta = Math.abs(angB - angA)
      if (delta > Math.PI) delta = Math.PI * 2 - delta
      if (delta > 0.6 && Math.min(ra, rb) < WALK_RING + 0.3) return [...arc(angA, angB).slice(1, -1), to.clone()]
    }
    return [to.clone()]
  }
  const pts: THREE.Vector3[] = []
  const angA = a === 'plaza' ? Math.atan2(from.z, from.x) : ISLANDS[a].angle
  const angB = b === 'plaza' ? Math.atan2(to.z, to.x) : ISLANDS[b].angle
  if (a !== 'plaza') pts.push(ISLANDS[a].door.clone(), ISLANDS[a].plazaGate.clone())
  pts.push(...arc(angA, angB))
  if (b !== 'plaza') pts.push(ISLANDS[b].plazaGate.clone(), ISLANDS[b].door.clone())
  pts.push(to.clone())
  for (const p of pts) p.y = groundY(p)
  return pts
}

export function meetingSpot(index: number, total: number): { pos: THREE.Vector3; yaw: number } {
  const a = (index / total) * Math.PI * 2 + 0.35
  const pos = new THREE.Vector3(Math.cos(a) * 2.45, PLAZA_CENTER.y, Math.sin(a) * 2.45)
  return { pos, yaw: Math.atan2(-pos.x, -pos.z) }
}

/** Queue positions at the Sky Dock for crew waiting on the captain's approval. */
export function dockSpot(slot: number): THREE.Vector3 {
  return localToWorld(ISLANDS.dock.center, -0.9 + (slot % 4) * 0.7, 0.9 - Math.floor(slot / 4) * 0.7)
}

export const TREE_SPOT = localToWorld(ISLANDS.archivist.center, 0.9, 0.95)

export function visitSpot(target: RoleId | 'plaza'): THREE.Vector3 {
  if (target === 'plaza' || target === 'planner') return localToWorld(PLAZA_CENTER, ...ROOM_SPOTS.planner.visit)
  return ISLANDS[target].visit.clone()
}

export function yawTowards(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

/** Random idle wander point near a crew member's home. */
export function wanderPoint(role: RoleId): THREE.Vector3 {
  const h = home(role).pos
  const a = Math.random() * Math.PI * 2
  const r = 0.4 + Math.random() * (role === 'planner' ? 1.2 : 1.1)
  const p = h.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
  if (role === 'planner') {
    const d = Math.hypot(p.x, p.z)
    if (d < WALK_RING) p.multiplyScalar(WALK_RING / Math.max(d, 0.01))
  } else {
    const isl = ISLANDS[role]
    const off = new THREE.Vector3(p.x - isl.center.x, 0, p.z - isl.center.z)
    if (off.length() > isl.radius * 0.62) off.setLength(isl.radius * 0.62)
    p.set(isl.center.x + off.x, 0, isl.center.z + off.z)
  }
  p.y = groundY(p)
  return p
}
