import { del, get, set } from 'idb-keyval'
import { nanoid } from 'nanoid'
import { defaultGame, defaultSettings, getWorld, mutate, newAgent, useWorld, type WorldState } from '../state/store'
import { ROLE_IDS } from './types'
import { pushToast, unlockAchievement } from './game/progression'

const KEY = 'cloudworks.world.v1'

type Snapshot = Pick<
  WorldState,
  'projects' | 'projectOrder' | 'activeProjectId' | 'tasks' | 'artifacts' | 'memories' | 'approvals' | 'log' | 'memoryQueue' | 'game' | 'settings' | 'agents'
> & { savedAt: number; version: 1 }

function snapshot(s: WorldState): Snapshot {
  const tasks: WorldState['tasks'] = {}
  for (const [id, t] of Object.entries(s.tasks)) tasks[id] = { ...t, streamText: t.streamText.slice(-3000) }
  return {
    version: 1,
    savedAt: Date.now(),
    projects: s.projects,
    projectOrder: s.projectOrder,
    activeProjectId: s.activeProjectId,
    tasks,
    artifacts: s.artifacts,
    memories: s.memories,
    approvals: s.approvals,
    log: s.log.slice(-1200),
    memoryQueue: s.memoryQueue,
    game: { ...s.game, events: s.game.events.filter((e) => e.kind === 'memory_conflict') },
    settings: s.settings,
    agents: s.agents,
  }
}

export async function loadWorld() {
  let snap: Snapshot | undefined
  try {
    snap = await get<Snapshot>(KEY)
  } catch (e) {
    console.warn('Could not read saved world', e)
  }
  const today = new Date().toISOString().slice(0, 10)
  mutate((s) => {
    if (snap) {
      s.projects = snap.projects ?? {}
      s.projectOrder = snap.projectOrder ?? []
      s.activeProjectId = snap.activeProjectId ?? null
      s.tasks = snap.tasks ?? {}
      s.artifacts = snap.artifacts ?? {}
      s.memories = snap.memories ?? {}
      s.approvals = snap.approvals ?? {}
      s.log = snap.log ?? []
      s.memoryQueue = snap.memoryQueue ?? []
      s.game = { ...defaultGame(), ...snap.game }
      const defaults = defaultSettings()
      const saved = snap.settings ?? defaults
      s.settings = {
        ...defaults,
        ...saved,
        volume: { ...defaults.volume, ...saved.volume },
        providers: [
          ...defaults.providers.map((dp) => {
            const sp = saved.providers?.find((p) => p.id === dp.id)
            return sp ? { ...dp, ...sp, models: [...new Set([...dp.models, ...sp.models])] } : dp
          }),
          ...(saved.providers ?? []).filter((p) => !defaults.providers.some((dp) => dp.id === p.id)),
        ],
      }
      for (const r of ROLE_IDS) {
        const a = snap.agents?.[r]
        const fresh = newAgent(r)
        s.agents[r] = a ? { ...fresh, ...a, stats: { ...fresh.stats, ...a.stats } } : fresh
      }
      // Anything that was mid-flight when the tab closed cannot resume its network call: rewind it.
      for (const t of Object.values(s.tasks)) {
        if (['running', 'awaiting_approval', 'needs_input', 'handoff'].includes(t.status)) {
          t.status = 'ready'
          t.progress = 0
        }
      }
      for (const a of Object.values(s.approvals)) {
        if (a.status === 'pending') {
          a.status = 'rejected'
          a.note = 'Session ended before a decision; the crew will ask again.'
        }
      }
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (p && ['running', 'planning', 'delivering'].includes(p.status)) {
        p.status = 'paused'
        p.pausedAt = Date.now()
        pushToast(s, { kind: 'info', title: 'Welcome back!', body: `"${p.title}" was paused while you were away. Resume it from the top bar.` })
      }
      for (const a of Object.values(s.agents)) {
        a.activity = p?.status === 'paused' ? 'paused' : 'idle'
        a.taskId = null
        a.visitTarget = null
        a.carrying = null
        a.busyUntil = 0
        a.bubble = null
        for (const m of a.chat) if (m.pending) {
          m.pending = false
          m.text ||= '(Interrupted when the session ended.)'
        }
      }
    }
    if (!s.game.sessionDays.includes(today)) s.game.sessionDays.push(today)
    if (s.game.sessionDays.length >= 3) unlockAchievement(s, 'streak')
    s.log.push({ id: nanoid(8), at: Date.now(), type: 'session', level: 'info', text: snap ? `Session started. Restored ${Object.keys(s.memories).length} memories and ${s.projectOrder.length} project(s).` : 'First session. Welcome to Cloudworks!' })
    s.hydrated = true
  })
}

let dirty = false
let timer: number | null = null

export function startAutosave() {
  if (timer) return
  useWorld.subscribe((s, prev) => {
    if (
      s.projects !== prev.projects ||
      s.tasks !== prev.tasks ||
      s.memories !== prev.memories ||
      s.game !== prev.game ||
      s.settings !== prev.settings ||
      s.agents !== prev.agents ||
      s.artifacts !== prev.artifacts
    )
      dirty = true
  })
  timer = window.setInterval(() => void flush(), 1500)
  // IndexedDB writes are async, so save as soon as the tab is hidden rather than relying on beforeunload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => void flush())
}

export async function flush() {
  if (!dirty || !getWorld().hydrated) return
  dirty = false
  try {
    await set(KEY, snapshot(getWorld()))
  } catch (e) {
    console.warn('Autosave failed', e)
  }
}

export async function resetWorld() {
  await del(KEY)
  window.location.reload()
}

export function exportWorld(): string {
  return JSON.stringify(snapshot(getWorld()), null, 2)
}

export async function importWorld(json: string) {
  const snap = JSON.parse(json) as Snapshot
  if (snap.version !== 1 || !snap.memories) throw new Error('Not a Cloudworks save file.')
  await set(KEY, snap)
  window.location.reload()
}
