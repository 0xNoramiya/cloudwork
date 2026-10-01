import { nanoid } from 'nanoid'
import { CREW } from '../crew'
import type { RoleId } from '../types'
import type { Draft, GameEvent, Toast } from '../../state/store'
import { ACHIEVEMENTS, UNLOCKABLES, levelForXp, momentumTier, pairKey, rankFor, synergyLevel } from './defs'
import { sfx } from '../../audio/sfx'

export function pushToast(s: Draft, t: Omit<Toast, 'id' | 'at'>) {
  s.ui.toasts.push({ ...t, id: nanoid(6), at: Date.now() })
  if (s.ui.toasts.length > 6) s.ui.toasts.splice(0, s.ui.toasts.length - 6)
}

export function pop(s: Draft, role: RoleId, text: string, tone: 'xp' | 'good' | 'bad' | 'info' = 'xp') {
  s.ui.pops.push({ id: nanoid(6), role, text, tone, at: Date.now() })
  if (s.ui.pops.length > 12) s.ui.pops.splice(0, s.ui.pops.length - 12)
}

export function bump(s: Draft, counter: string, by = 1): number {
  s.game.counters[counter] = (s.game.counters[counter] ?? 0) + by
  return s.game.counters[counter]
}

export function unlockAchievement(s: Draft, id: string) {
  if (s.game.achievements[id]) return
  const def = ACHIEVEMENTS.find((a) => a.id === id)
  if (!def) return
  s.game.achievements[id] = Date.now()
  s.game.sparks += def.sparks
  pushToast(s, { kind: 'achievement', title: `Achievement: ${def.title}`, body: def.desc, icon: `/assets/badges/${def.id}.webp` })
  s.log.push({
    id: nanoid(8),
    at: Date.now(),
    type: 'achievement',
    text: `Achievement unlocked: ${def.title} (+${def.xp} XP, +${def.sparks} ✦)`,
    level: 'success',
    provenance: 'cosmetic',
  })
  sfx('achievement')
  addXp(s, def.xp, null, false)
}

/** Grant XP to the workspace (and optionally an agent). Returns the XP actually granted after multipliers. */
export function addXp(s: Draft, base: number, agent: RoleId | null, applyMultipliers = true): number {
  let amount = base
  if (applyMultipliers) {
    amount *= momentumTier(s.game.momentum).mult
    if (s.game.boostUntil > Date.now()) amount *= 2
  }
  amount = Math.round(amount)
  const before = s.game.level
  s.game.xp += amount
  const after = levelForXp(s.game.xp)
  if (after > before) {
    s.game.level = after
    const unlocks = UNLOCKABLES.filter((u) => u.level > before && u.level <= after)
    for (const u of unlocks) {
      if (u.kind !== 'decor' && !s.game.unlocked.includes(u.id)) s.game.unlocked.push(u.id)
    }
    s.game.crates += 1
    s.ui.levelUp = { level: after, unlocks: unlocks.map((u) => u.id), at: Date.now() }
    s.log.push({
      id: nanoid(8),
      at: Date.now(),
      type: 'level',
      text: `⬆️ Workspace reached level ${after}! ${unlocks.length} new unlock(s) and a supply crate.`,
      level: 'success',
      provenance: 'cosmetic',
    })
    sfx('levelup')
  }
  if (agent) {
    const a = s.agents[agent]
    const r0 = rankFor(a.xp).index
    a.xp += amount
    const r1 = rankFor(a.xp)
    if (r1.index > r0) {
      const badge = `${CREW[agent].specialty} ${r1.name}`
      a.badges.push(badge)
      pushToast(s, { kind: 'success', title: `${CREW[agent].name} ranked up: ${r1.name}!`, body: `New badge: ${badge}`, agentId: agent })
      s.log.push({ id: nanoid(8), at: Date.now(), agentId: agent, type: 'rank', text: `${CREW[agent].name} ranked up to ${r1.name}.`, level: 'success', provenance: 'cosmetic' })
    }
  }
  return amount
}

export function addSynergy(s: Draft, a: RoleId, b: RoleId, points = 1) {
  if (a === b) return
  const k = pairKey(a, b)
  const before = synergyLevel(s.game.synergy[k] ?? 0)
  s.game.synergy[k] = (s.game.synergy[k] ?? 0) + points
  const after = synergyLevel(s.game.synergy[k])
  if (after > before) {
    pushToast(s, {
      kind: 'success',
      title: `Synergy ${CREW[a].name} × ${CREW[b].name} → Lv ${after}`,
      body: `Their hand-offs are now ${Math.round(after * 18)}% faster.`,
    })
    if (after >= 3) unlockAchievement(s, 'synergy_surge')
  }
}

export function synergyBetween(s: Draft, a: RoleId, b: RoleId): number {
  return synergyLevel(s.game.synergy[pairKey(a, b)] ?? 0)
}

export function pushEvent(s: Draft, e: Omit<GameEvent, 'id' | 'at'>): string {
  const id = nanoid(8)
  s.game.events.push({ ...e, id, at: Date.now() })
  if (s.game.events.length > 5) s.game.events.splice(0, s.game.events.length - 5)
  s.log.push({
    id: nanoid(8),
    at: Date.now(),
    type: `event:${e.kind}`,
    text: `Event: ${e.title}${/[.!?]$/.test(e.title) ? '' : '.'} ${e.body}`,
    level: e.provenance === 'real' ? 'info' : 'debug',
    provenance: e.provenance === 'real' ? 'real' : 'cosmetic',
  })
  sfx(e.provenance === 'real' ? 'event' : 'sparkle')
  return id
}

export function removeEvent(s: Draft, id: string) {
  s.game.events = s.game.events.filter((e) => e.id !== id)
}
