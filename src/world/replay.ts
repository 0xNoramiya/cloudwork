import type { TimelineFrame } from '../engine/types'
import { getWorld } from '../state/store'

/** Latest recorded frame at or before time t (binary search over the project's timeline). */
export function replayFrameAt(projectId: string, t: number): TimelineFrame | null {
  const p = getWorld().projects[projectId]
  const tl = p?.timeline
  if (!tl || tl.length === 0) return null
  let lo = 0
  let hi = tl.length - 1
  if (t <= tl[0].t) return tl[0]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tl[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return tl[lo]
}
