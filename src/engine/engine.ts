import { nanoid } from 'nanoid'
import { getWorld, mutate, projectTasks, type Draft } from '../state/store'
import { sfx } from '../audio/sfx'
import { CREW, bark } from './crew'
import { classifyAgainst, retrieveMemories, suggestTags } from './memory'
import {
  cleanContent,
  extractDiscoveries,
  extractJson,
  extractSummary,
  extractToolCall,
  findSolutionAndTests,
  parseVerdict,
  truncate,
  type ToolCall,
} from './parse'
import {
  chatContext,
  chatSystemPrompt,
  deliverSystemPrompt,
  deliverUserMessage,
  memorySystemPrompt,
  memoryUserMessage,
  planSystemPrompt,
  planUserMessage,
  reviewSystemPrompt,
  reviewUserMessage,
  workSystemPrompt,
  workUserMessage,
} from './prompts'
import { ProviderError, complete, type LLMRequest, type LLMResult } from './providers'
import type { ChatTurn, RequestMeta } from './providers/base'
import { runInSandbox, formatTestReport } from './sandbox'
import { detectScenario } from './scenario'
import { toolFetchUrl, toolMemorySearch, toolRunJs, toolWebSearch, type ToolOutcome } from './tools'
import {
  WORK_ROLES,
  type AgentActivity,
  type ApprovalKind,
  type Artifact,
  type ArtifactKind,
  type KeyMoment,
  type LogLevel,
  type MemoryEntry,
  type ModelRef,
  type Project,
  type Provenance,
  type RoleId,
  type ScenarioId,
  type Task,
  type TaskKind,
} from './types'
import { addSynergy, addXp, bump, pop, pushEvent, pushToast, removeEvent, synergyBetween, unlockAchievement } from './game/progression'
import { pairKey, synergyLevel } from './game/defs'

const ACTIVE_STATUSES = new Set(['running', 'awaiting_approval', 'needs_input'])
const MAX_REWORKS = 2
const WORKING: AgentActivity[] = ['thinking', 'working', 'tool', 'memory']
const EXPECTED_CHARS: Record<string, number> = { plan: 1400, work: 2600, review: 900, deliver: 5000, memory: 300, chat: 300 }
const FALLBACK_ROLES: Partial<Record<RoleId, RoleId[]>> = {
  researcher: ['analyst', 'writer'],
  analyst: ['researcher'],
  writer: ['researcher', 'designer'],
  designer: ['writer'],
  qa: ['analyst'],
}

class BudgetError extends Error {}

interface Decision {
  approved: boolean
  note?: string
}

function now() {
  return Date.now()
}

function artifactKindFor(role: RoleId, kind: TaskKind): ArtifactKind {
  if (kind === 'plan') return 'plan'
  if (kind === 'review') return 'review'
  if (kind === 'deliver') return 'deliverable'
  return ({ researcher: 'research', coder: 'code', designer: 'design', analyst: 'data', writer: 'markdown' } as Partial<Record<RoleId, ArtifactKind>>)[role] ?? 'markdown'
}

const ROLE_ALIASES: Record<string, RoleId> = {
  research: 'researcher',
  researcher: 'researcher',
  coder: 'coder',
  code: 'coder',
  developer: 'coder',
  engineer: 'coder',
  programmer: 'coder',
  writer: 'writer',
  writing: 'writer',
  copywriter: 'writer',
  designer: 'designer',
  design: 'designer',
  analyst: 'analyst',
  analysis: 'analyst',
  data: 'analyst',
  qa: 'qa',
  reviewer: 'qa',
  review: 'qa',
  tester: 'qa',
}

interface PlanTask {
  key: string
  title: string
  role: RoleId
  description: string
  dependsOn: string[]
  estimateMinutes: number
}

interface ParsedPlan {
  title: string
  summary: string
  deliverable: string
  tasks: PlanTask[]
}

export function parsePlan(text: string): ParsedPlan | string {
  const raw = extractJson(text) as Record<string, unknown> | undefined
  if (!raw || typeof raw !== 'object') return 'Response did not contain a JSON object.'
  const list = Array.isArray(raw.tasks) ? (raw.tasks as Record<string, unknown>[]) : null
  if (!list || list.length === 0) return 'JSON had no "tasks" array.'
  const tasks: PlanTask[] = []
  const seen = new Set<string>()
  for (const [i, t] of list.slice(0, 8).entries()) {
    let key = String(t.key ?? `t${i + 1}`).trim() || `t${i + 1}`
    if (seen.has(key)) key = `${key}_${i}`
    seen.add(key)
    const role = ROLE_ALIASES[String(t.role ?? '').toLowerCase().trim()]
    if (!role) return `Task "${String(t.title ?? key)}" has unknown role "${String(t.role)}".`
    tasks.push({
      key,
      title: String(t.title ?? `Task ${i + 1}`).slice(0, 60),
      role,
      description: String(t.description ?? t.title ?? '').slice(0, 600),
      dependsOn: Array.isArray(t.dependsOn) ? (t.dependsOn as unknown[]).map(String) : [],
      estimateMinutes: Math.min(30, Math.max(0.5, Number(t.estimateMinutes) || 2)),
    })
  }
  const keys = new Set(tasks.map((t) => t.key))
  for (const t of tasks) t.dependsOn = [...new Set(t.dependsOn.filter((d) => keys.has(d) && d !== t.key))]
  // Break cycles: DFS and drop back-edges.
  const state = new Map<string, number>()
  const byKey = new Map(tasks.map((t) => [t.key, t]))
  const visit = (k: string) => {
    state.set(k, 1)
    const t = byKey.get(k)!
    t.dependsOn = t.dependsOn.filter((d) => {
      if (state.get(d) === 1) return false
      if (!state.get(d)) visit(d)
      return true
    })
    state.set(k, 2)
  }
  for (const t of tasks) if (!state.get(t.key)) visit(t.key)
  return {
    title: String(raw.title ?? 'Untitled project').slice(0, 60),
    summary: String(raw.summary ?? ''),
    deliverable: String(raw.deliverable ?? ''),
    tasks,
  }
}

class Engine {
  private controllers = new Map<string, AbortController>()
  private decisions = new Map<string, (d: Decision) => void>()
  private answers = new Map<string, (text: string) => void>()
  private streamBuf = new Map<string, string>()
  private tickTimer: number | null = null
  private lastFrame = 0
  private lastMomentum = 0
  private lastBottleneckCheck = 0
  private lastRandomEvent = now()
  private lastIdleBark = now()
  private memoryBusy = false
  private lastCompletion: { role: RoleId; at: number } | null = null

  start() {
    if (this.tickTimer) return
    this.tickTimer = window.setInterval(() => this.tick(), 400)
    window.setInterval(() => this.flushStreams(), 110)
    // Timed events and toasts don't count down in a background tab: whatever was showing is still there on return.
    let hiddenAt = 0
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        hiddenAt = now()
        return
      }
      const away = hiddenAt ? now() - hiddenAt : 0
      hiddenAt = 0
      if (away > 0)
        mutate((d) => {
          for (const e of d.game.events) if (e.expiresAt) e.expiresAt += away
          for (const t of d.ui.toasts) t.at += away
        })
    })
  }

  // ------------------------------------------------------------------ small helpers

  private log(level: LogLevel, text: string, extra: { agentId?: RoleId; taskId?: string; type?: string; provenance?: Provenance; data?: Record<string, unknown> } = {}) {
    mutate((s) => {
      s.log.push({
        id: nanoid(8),
        at: now(),
        projectId: s.activeProjectId ?? undefined,
        type: extra.type ?? 'info',
        level,
        text,
        agentId: extra.agentId,
        taskId: extra.taskId,
        provenance: extra.provenance,
        data: extra.data,
      })
      if (s.log.length > 2500) s.log.splice(0, s.log.length - 2500)
    })
  }

  private moment(s: Draft, kind: KeyMoment['kind'], text: string, agentId?: RoleId) {
    const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
    if (p) p.moments.push({ t: now(), kind, text, agentId })
  }

  say(role: RoleId, text: string, kind: 'say' | 'think' | 'alert' | 'happy' = 'say') {
    if (!text) return
    mutate((s) => {
      s.agents[role].bubble = { text, at: now(), kind }
    })
  }

  private recent(s: Draft, role: RoleId, text: string) {
    const a = s.agents[role]
    a.recent.unshift({ at: now(), text })
    if (a.recent.length > 14) a.recent.length = 14
  }

  modelFor(role: RoleId): ModelRef {
    const s = getWorld()
    const m = s.agents[role].loadout.model ?? s.settings.defaultModel
    const prov = s.settings.providers.find((p) => p.id === m.providerId)
    if (!prov || !prov.enabled) return { providerId: 'demo', model: 'cloudworks-sim-1' }
    return m
  }

  private scenarioOf(p: Project): ScenarioId {
    return detectScenario(p.goal)
  }

  private isDemo(role: RoleId) {
    return this.modelFor(role).providerId === 'demo'
  }

  // ------------------------------------------------------------------ model calls

  private async callModel(
    role: RoleId,
    taskId: string | null,
    req: Omit<LLMRequest, 'effort' | 'onText'>,
    opts: { stream?: boolean; purpose?: string } = {},
  ): Promise<LLMResult> {
    const s0 = getWorld()
    const ref = this.modelFor(role)
    const project = s0.activeProjectId ? s0.projects[s0.activeProjectId] : null
    if (project && ref.providerId !== 'demo' && project.costUsd >= s0.settings.budgetUsd) {
      throw new BudgetError(`Budget cap of $${s0.settings.budgetUsd.toFixed(2)} reached for this project.`)
    }
    const stream = opts.stream !== false && taskId
    const started = now()
    const res = await complete(s0.settings, ref, {
      ...req,
      effort: s0.agents[role].loadout.effort,
      onText: stream
        ? (delta) => {
            this.streamBuf.set(taskId!, (this.streamBuf.get(taskId!) ?? '') + delta)
          }
        : undefined,
    })
    this.flushStreams()
    const cost = res.costUsd ?? 0
    mutate((s) => {
      const a = s.agents[role]
      a.stats.tokensIn += res.inputTokens
      a.stats.tokensOut += res.outputTokens
      a.stats.costUsd += cost
      a.stats.workMs += now() - started
      if (taskId && s.tasks[taskId]) {
        const t = s.tasks[taskId]
        t.tokensIn += res.inputTokens
        t.tokensOut += res.outputTokens
        t.costUsd += cost
        t.modelUsed = res.model
        t.providerUsed = res.providerId
      }
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (p) {
        const before = p.costUsd
        p.costUsd += cost
        p.tokens += res.inputTokens + res.outputTokens
        const warnAt = s.settings.budgetUsd * 0.8
        if (before < warnAt && p.costUsd >= warnAt)
          pushToast(s, { kind: 'warn', title: 'Budget 80% used', body: `$${p.costUsd.toFixed(2)} of $${s.settings.budgetUsd.toFixed(2)}. The project pauses at the cap; raise it in Settings if needed.` })
      }
      s.log.push({
        id: nanoid(8),
        at: now(),
        projectId: s.activeProjectId ?? undefined,
        agentId: role,
        taskId: taskId ?? undefined,
        type: 'llm',
        level: 'debug',
        provenance: res.simulated ? 'simulated' : 'real',
        text: `${CREW[role].name} ← ${res.providerId}/${res.model} · ${req.meta.purpose} · ${res.inputTokens}→${res.outputTokens} tok${res.estimatedUsage ? ' (est.)' : ''} · ${res.costUsd === null ? 'price n/a' : `$${cost.toFixed(4)}`} · ${((now() - started) / 1000).toFixed(1)}s`,
      })
    })
    return res
  }

  private flushStreams() {
    if (this.streamBuf.size === 0) return
    const buf = new Map(this.streamBuf)
    this.streamBuf.clear()
    mutate((s) => {
      for (const [taskId, delta] of buf) {
        const t = s.tasks[taskId]
        if (!t) continue
        t.streamText = (t.streamText + delta).slice(-24000)
        const expected = EXPECTED_CHARS[t.kind === 'plan' ? 'plan' : t.kind === 'deliver' ? 'deliver' : t.kind === 'review' ? 'review' : 'work']
        t.progress = Math.min(0.95, Math.max(t.progress, t.streamText.length / expected))
        const a = s.agents[t.role]
        if (a.taskId === taskId && (a.activity === 'thinking' || a.activity === 'tool')) a.activity = 'working'
      }
    })
  }

  // ------------------------------------------------------------------ project lifecycle

  startProject(goal: string): string | null {
    goal = goal.trim()
    if (!goal) return null
    const s0 = getWorld()
    const cur = s0.activeProjectId ? s0.projects[s0.activeProjectId] : null
    if (cur && !['done', 'failed', 'cancelled'].includes(cur.status)) {
      mutate((s) => pushToast(s, { kind: 'warn', title: 'A project is already in progress', body: 'Finish, or cancel it from the top bar, before starting a new goal.' }))
      return null
    }
    const pid = nanoid(10)
    const planTask = this.newTask(pid, {
      key: 'plan',
      title: 'Plan the project',
      description: `Break the goal into parallelizable tasks: ${goal}`,
      role: 'planner',
      kind: 'plan',
      dependsOn: [],
      estimateSec: 20,
      priority: 100,
    })
    planTask.status = 'ready'
    const planId = planTask.id
    const demo = this.isDemo('planner')
    const turbo = s0.settings.turbo
    mutate((s) => {
      const p: Project = {
        id: pid,
        goal,
        title: goal.length > 48 ? `${goal.slice(0, 45)}…` : goal,
        status: 'planning',
        createdAt: now(),
        taskIds: [planId],
        mode: demo ? 'demo' : 'live',
        sessionId: s.sessionId,
        timeline: [],
        moments: [],
        costUsd: 0,
        tokens: 0,
        peakParallel: 0,
        memoriesUsed: 0,
        memoriesFromEarlierSessions: 0,
        bottlenecksResolved: 0,
      }
      s.projects[pid] = p
      s.projectOrder.unshift(pid)
      s.activeProjectId = pid
      s.tasks[planId] = planTask
      // Kick-off huddle: the crew gathers around the planning table while Juno plans.
      for (const a of Object.values(s.agents)) {
        if (a.id === 'planner') continue
        if (!turbo) {
          a.activity = 'meeting'
          a.visitTarget = 'plaza'
          a.busyUntil = now() + 60_000
        }
        a.taskId = null
      }
      s.agents.planner.bubble = { text: bark('planner', 'meeting'), at: now(), kind: 'say' }
      s.ui.goalOpen = false
      p.moments.push({ t: now(), kind: 'start', text: `Goal received: ${goal}` })
      s.log.push({ id: nanoid(8), at: now(), projectId: pid, type: 'project', level: 'info', text: `New goal: "${goal}" (${demo ? 'demo mode, simulated model output' : 'live models'})` })
    })
    const memCount = Object.keys(getWorld().memories).length
    if (memCount > 0) {
      const rel = retrieveMemories(Object.values(getWorld().memories), goal, 4)
      if (rel.length) this.say('archivist', `I brought ${rel.length} note${rel.length > 1 ? 's' : ''} from the archive.`)
    }
    sfx('open')
    return pid
  }

  private newTask(
    projectId: string,
    t: { key: string; title: string; description: string; role: RoleId; kind: TaskKind; dependsOn: string[]; estimateSec: number; priority?: number; reviewOf?: string },
  ): Task {
    return {
      id: nanoid(10),
      projectId,
      key: t.key,
      title: t.title,
      description: t.description,
      role: t.role,
      kind: t.kind,
      dependsOn: t.dependsOn,
      priority: t.priority ?? 50,
      status: 'pending',
      attempts: 0,
      failures: 0,
      reworks: 0,
      maxAttempts: 2,
      createdAt: now(),
      progress: 0,
      estimateSec: t.estimateSec,
      feedback: [],
      streamText: '',
      reviewOf: t.reviewOf,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      toolCalls: [],
    }
  }

  pauseProject() {
    const p = this.active()
    if (!p || !['running', 'planning', 'delivering'].includes(p.status)) return
    for (const t of projectTasks(getWorld(), p.id)) if (ACTIVE_STATUSES.has(t.status)) this.abortTask(t.id, 'ready')
    mutate((s) => {
      const pp = s.projects[p.id]
      pp.status = 'paused'
      pp.pausedAt = now()
      for (const a of Object.values(s.agents)) {
        a.activity = 'paused'
        a.visitTarget = null
        a.carrying = null
      }
      this.moment(s, 'user', 'Captain paused the project')
      pushToast(s, { kind: 'info', title: 'Project paused', body: 'In-flight model calls were cancelled; they restart on resume.' })
    })
    this.log('warn', 'Project paused by the captain. Running calls aborted.', { type: 'control' })
  }

  resumeProject() {
    const p = this.active()
    if (!p || p.status !== 'paused') return
    mutate((s) => {
      const pp = s.projects[p.id]
      const planDone = pp.taskIds.some((id) => s.tasks[id]?.kind === 'plan' && s.tasks[id]?.status === 'done')
      pp.status = planDone ? 'running' : 'planning'
      for (const a of Object.values(s.agents)) if (a.activity === 'paused') a.activity = 'idle'
      this.moment(s, 'user', 'Captain resumed the project')
    })
    this.log('info', 'Project resumed.', { type: 'control' })
  }

  cancelProject() {
    const p = this.active()
    if (!p || ['done', 'cancelled'].includes(p.status)) return
    for (const t of projectTasks(getWorld(), p.id)) if (ACTIVE_STATUSES.has(t.status)) this.abortTask(t.id, 'cancelled')
    mutate((s) => {
      const pp = s.projects[p.id]
      pp.status = 'cancelled'
      pp.finishedAt = now()
      for (const id of pp.taskIds) {
        const t = s.tasks[id]
        if (t && !['done', 'failed'].includes(t.status)) t.status = 'cancelled'
      }
      for (const ap of Object.values(s.approvals)) if (ap.projectId === p.id && ap.status === 'pending') ap.status = 'rejected'
      for (const a of Object.values(s.agents)) {
        a.activity = 'idle'
        a.taskId = null
        a.visitTarget = null
        a.carrying = null
      }
      this.moment(s, 'user', 'Captain cancelled the project')
    })
    this.log('warn', 'Project cancelled by the captain.', { type: 'control' })
  }

  private active(): Project | null {
    const s = getWorld()
    return s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null
  }

  // ------------------------------------------------------------------ tick & scheduling

  private tick() {
    const s = getWorld()
    if (!s.hydrated) return
    const t = now()
    const p = this.active()

    mutate((d) => {
      for (const a of Object.values(d.agents)) {
        if (a.bubble && t - a.bubble.at > 5200) a.bubble = null
        if (a.busyUntil && t > a.busyUntil && !a.taskId && ['handoff', 'celebrating', 'meeting', 'chatting', 'error'].includes(a.activity)) {
          if (a.activity === 'meeting' && d.activeProjectId && d.projects[d.activeProjectId]?.status === 'planning') continue
          a.activity = d.activeProjectId && d.projects[d.activeProjectId]?.status === 'paused' ? 'paused' : 'idle'
          a.visitTarget = null
          a.carrying = null
          a.busyUntil = 0
        }
      }
      if (!document.hidden) {
        if (d.game.events.some((e) => e.expiresAt && e.expiresAt <= t)) d.game.events = d.game.events.filter((e) => !e.expiresAt || e.expiresAt > t)
        if (d.ui.toasts.length && t - d.ui.toasts[0].at > 6500) d.ui.toasts.shift()
      }
    })

    if (p && ['running', 'planning', 'delivering'].includes(p.status)) this.schedule(p.id)
    if (t - this.lastMomentum > 1000) {
      this.lastMomentum = t
      this.updateMomentum()
    }
    if (p && t - this.lastFrame > 1000 && !['done', 'cancelled', 'failed'].includes(p.status)) {
      this.lastFrame = t
      this.recordFrame(p.id)
    }
    if (p && t - this.lastBottleneckCheck > 3000) {
      this.lastBottleneckCheck = t
      this.detectBottlenecks(p.id)
      this.checkWaitingApprovals()
    }
    if (t - this.lastRandomEvent > 75_000 + Math.random() * 60_000) {
      this.lastRandomEvent = t
      this.randomEvent()
    }
    if (t - this.lastIdleBark > 9000) {
      this.lastIdleBark = t
      const idle = Object.values(getWorld().agents).filter((a) => a.activity === 'idle' && !a.bubble)
      if (idle.length && Math.random() < 0.6) {
        const a = idle[Math.floor(Math.random() * idle.length)]
        this.say(a.id, bark(a.id, 'idle'), 'think')
      }
    }
    if (!this.memoryBusy && getWorld().memoryQueue.length) void this.processMemoryQueue()
  }

  private schedule(projectId: string) {
    const s = getWorld()
    const settings = s.settings
    const tasks = projectTasks(s, projectId)
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const t0 = now()
    const toStart: string[] = []

    mutate((d) => {
      const p = d.projects[projectId]
      for (const tt of tasks) {
        const t = d.tasks[tt.id]
        // While the plan awaits the captain's review, nothing but the plan itself moves.
        if (p.status === 'planning' && t.kind !== 'plan') continue
        if (t.status === 'pending' || (t.status === 'blocked' && t.error?.startsWith('Waiting on'))) {
          const deps = t.dependsOn.map((id) => byId.get(id)).filter(Boolean) as Task[]
          const bad = deps.find((x) => x.status === 'failed' || x.status === 'cancelled')
          if (bad) {
            if (t.status !== 'blocked') {
              t.status = 'blocked'
              t.error = `Waiting on ${bad.status} task "${bad.title}". Retry it, or skip the dependency.`
            }
            continue
          }
          if (deps.every((x) => x.status === 'done')) {
            t.error = undefined
            const sources = [...new Set(deps.map((x) => (x.kind === 'review' ? 'qa' : x.role)).filter((r) => r !== t.role))] as RoleId[]
            if (sources.length && !settings.turbo) {
              const lvl = Math.max(...sources.map((r) => synergyBetween(d, r, t.role)))
              const delay = Math.round((3400 * (1 - lvl * 0.18)) / Math.max(1, settings.demoSpeed))
              t.status = 'handoff'
              t.handoffUntil = t0 + delay
              for (const r of sources) {
                addSynergy(d, r, t.role)
                d.agents[r].stats.handoffs++
                const src = d.agents[r]
                if (!src.taskId && ['idle', 'handoff', 'celebrating'].includes(src.activity)) {
                  src.activity = 'handoff'
                  src.visitTarget = t.role
                  src.carrying = 'parcel'
                  src.busyUntil = t0 + delay + 1600
                  src.bubble = { text: bark(r, 'handoff_give', `For you, ${CREW[t.role].name}!`), at: t0, kind: 'say' }
                }
              }
              this.moment(d, 'handoff', `${sources.map((r) => CREW[r].name).join(' & ')} → ${CREW[t.role].name}: "${t.title}"`, t.role)
              d.log.push({
                id: nanoid(8),
                at: t0,
                projectId,
                taskId: t.id,
                agentId: t.role,
                type: 'handoff',
                level: 'info',
                text: `Hand-off to ${CREW[t.role].name} for "${t.title}" from ${sources.map((r) => CREW[r].name).join(', ')}${lvl ? ` (synergy Lv${lvl}: ${Math.round(lvl * 18)}% faster)` : ''}`,
              })
              sfx('handoff')
            } else {
              t.status = 'ready'
              t.readyAt = t0
            }
          }
        } else if (t.status === 'handoff' && (t.handoffUntil ?? 0) <= t0) {
          t.status = 'ready'
          t.readyAt = t0
          d.agents[t.role].bubble = { text: bark(t.role, 'handoff_get', 'Got it, thanks!'), at: t0, kind: 'happy' }
        }
      }

      const activeCount = tasks.filter((x) => ACTIVE_STATUSES.has(d.tasks[x.id].status)).length
      let slots = settings.maxParallel - activeCount
      const ready = tasks
        .map((x) => d.tasks[x.id])
        .filter((x) => x.status === 'ready' && (x.notBefore ?? 0) <= t0)
        .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      const claimed = new Set<RoleId>()
      for (const t of ready) {
        if (slots <= 0) break
        const a = d.agents[t.role]
        if (a.taskId || claimed.has(t.role)) continue
        if (p.status === 'planning' && t.kind !== 'plan') continue
        claimed.add(t.role)
        slots--
        toStart.push(t.id)
        a.taskId = t.id
      }
    })

    for (const id of toStart) void this.execute(id)
  }

  private async execute(taskId: string) {
    const ac = new AbortController()
    this.controllers.set(taskId, ac)
    const t0 = getWorld().tasks[taskId]
    const role = t0.role
    mutate((s) => {
      const t = s.tasks[taskId]
      t.status = 'running'
      t.startedAt ??= now()
      t.attempts += 1
      t.progress = Math.min(t.progress, 0.05)
      t.streamText = ''
      t.error = undefined
      const a = s.agents[role]
      a.taskId = taskId
      a.activity = 'thinking'
      a.statusText = t.title
      a.visitTarget = null
      a.carrying = null
      a.busyUntil = 0
      a.bubble = { text: (t.reworks ?? 0) > 0 && t.feedback.length ? bark(role, 'rework', 'Round two!') : bark(role, 'thinking', 'On it!'), at: now(), kind: 'think' }
      if (a.directive) {
        t.feedback.push({ from: 'user', text: a.directive, at: now() })
        a.directive = null
      }
      this.recent(s, role, `Started "${t.title}"${t.attempts > 1 ? ` (attempt ${t.attempts})` : ''}`)
      this.moment(s, 'start', `${CREW[role].name} started "${t.title}"`, role)
      s.log.push({ id: nanoid(8), at: now(), projectId: t.projectId, taskId, agentId: role, type: 'task', level: 'info', text: `${CREW[role].name} started "${t.title}"${t.attempts > 1 ? ` (attempt ${t.attempts})` : ''}` })
      const p = s.projects[t.projectId]
      const busy = Object.values(s.agents).filter((x) => x.taskId).length
      if (p && busy > p.peakParallel) p.peakParallel = busy
      if (busy >= 3) unlockAchievement(s, 'parallel_play')
      if (busy >= 5) unlockAchievement(s, 'full_house')
    })
    try {
      const kind = t0.kind
      if (kind === 'plan') await this.runPlan(taskId, ac.signal)
      else if (kind === 'review') await this.runReview(taskId, ac.signal)
      else if (kind === 'deliver') await this.runDeliver(taskId, ac.signal)
      else await this.runWork(taskId, ac.signal)
    } catch (e) {
      if (!(e instanceof ProviderError && e.kind === 'aborted') && !ac.signal.aborted) this.handleFailure(taskId, e)
    } finally {
      // A newer run of this task may already own the slot (pause → resume, redirect); leave it alone.
      const owner = this.controllers.get(taskId) === ac
      if (owner) {
        this.controllers.delete(taskId)
        this.streamBuf.delete(taskId)
      }
      mutate((s) => {
        const a = s.agents[role]
        if (owner && a.taskId === taskId) {
          a.taskId = null
          if (!['celebrating', 'error', 'handoff', 'paused'].includes(a.activity)) {
            a.activity = 'idle'
            a.visitTarget = null
            a.carrying = null
          }
        }
      })
    }
  }

  private abortTask(taskId: string, next: Task['status']) {
    const ac = this.controllers.get(taskId)
    ac?.abort()
    this.controllers.delete(taskId)
    const d = this.decisions
    mutate((s) => {
      const t = s.tasks[taskId]
      if (!t) return
      for (const ap of Object.values(s.approvals)) {
        if (ap.taskId === taskId && ap.status === 'pending') {
          ap.status = 'rejected'
          ap.note = 'Withdrawn: task was paused, cancelled or redirected.'
          d.delete(ap.id)
        }
      }
      t.status = next
      t.question = next === 'ready' ? t.question : undefined
      const a = s.agents[t.role]
      if (a.taskId === taskId) {
        a.taskId = null
        a.activity = 'idle'
        a.visitTarget = null
        a.carrying = null
      }
    })
    this.answers.delete(taskId)
  }

  private handleFailure(taskId: string, e: unknown) {
    const t = getWorld().tasks[taskId]
    if (!t) return
    const role = t.role
    if (e instanceof BudgetError) {
      mutate((s) => {
        s.tasks[taskId].status = 'ready'
        pushToast(s, { kind: 'error', title: 'Budget cap reached', body: `${e.message} Raise it in Settings, then resume.` })
      })
      this.log('error', `${e.message} Project paused.`, { type: 'budget', taskId })
      this.pauseProject()
      return
    }
    const pe = e instanceof ProviderError ? e : new ProviderError('unknown', e instanceof Error ? e.message : String(e))
    const failures = (t.failures ?? 0) + 1
    const retry = pe.retryable && failures < t.maxAttempts
    mutate((s) => {
      const tt = s.tasks[taskId]
      tt.failures = failures
      tt.error = pe.message
      const a = s.agents[role]
      a.activity = 'error'
      a.busyUntil = now() + 4000
      a.bubble = { text: pe.kind === 'refusal' ? 'The model declined this one…' : 'Ouch, something broke!', at: now(), kind: 'alert' }
      if (retry) {
        tt.status = 'ready'
        tt.notBefore = now() + 5000
      } else {
        tt.status = 'failed'
        tt.finishedAt = now()
        a.stats.tasksFailed++
        if (tt.kind === 'plan') {
          for (const ag of Object.values(s.agents)) {
            if (ag.activity === 'meeting') {
              ag.activity = 'idle'
              ag.visitTarget = null
              ag.busyUntil = 0
            }
          }
        }
        s.game.momentum = Math.max(0, s.game.momentum - 15)
        this.moment(s, 'fail', `"${tt.title}" failed: ${pe.message}`, role)
        pushToast(s, { kind: 'error', title: `${CREW[role].name} hit an error`, body: pe.message, agentId: role })
        if (['auth', 'not_configured', 'network', 'rate_limit', 'server', 'refusal', 'bad_request'].includes(pe.kind)) {
          const ref = this.modelFor(role)
          if (ref.providerId !== 'demo') {
            pushEvent(s, {
              kind: 'model_swap',
              title: 'Model swap opportunity',
              body: `${CREW[role].name}'s model (${ref.providerId}/${ref.model}) failed: ${pe.message} Swap ${CREW[role].name} to another model and retry?`,
              actions: [
                { id: 'swap-demo', label: 'Use Demo & retry', primary: true },
                { id: 'open-loadout', label: 'Pick a model' },
                { id: 'dismiss', label: 'Dismiss' },
              ],
              provenance: 'real',
              data: { role, taskId },
            })
          }
        }
      }
      s.log.push({
        id: nanoid(8),
        at: now(),
        projectId: tt.projectId,
        taskId,
        agentId: role,
        type: 'error',
        level: 'error',
        provenance: 'real',
        text: `${CREW[role].name} failed "${tt.title}" (${pe.kind}): ${pe.message}${retry ? '. Retrying in 5s.' : ''}`,
      })
    })
    sfx('error')
  }

  // ------------------------------------------------------------------ planning

  private async runPlan(taskId: string, signal: AbortSignal) {
    const s = getWorld()
    const task = s.tasks[taskId]
    const project = s.projects[task.projectId]
    const scenario = this.scenarioOf(project)
    const mems = this.useMemories(project.goal, 5, taskId)
    const messages: ChatTurn[] = [{ role: 'user', content: planUserMessage(project.goal, mems, task.feedback.map((f) => f.text).join('\n') || undefined) }]
    const meta: RequestMeta = { purpose: 'plan', role: 'planner', goal: project.goal, scenario }
    let res = await this.callModel('planner', taskId, { system: planSystemPrompt(7), messages, maxTokens: 12000, signal, meta })
    let plan = parsePlan(res.text)
    if (typeof plan === 'string') {
      this.log('warn', `Juno's plan was malformed (${plan}). Asking for a corrected one.`, { agentId: 'planner', taskId })
      messages.push({ role: 'assistant', content: res.text }, { role: 'user', content: `That was not a valid plan: ${plan} Return ONLY the JSON object.` })
      res = await this.callModel('planner', taskId, { system: planSystemPrompt(7), messages, maxTokens: 12000, signal, meta })
      plan = parsePlan(res.text)
    }
    let fallbackUsed = false
    if (typeof plan === 'string') {
      fallbackUsed = true
      this.log('warn', `Planner output still invalid (${plan}). Using a minimal fallback plan (research → write) so work can continue.`, {
        agentId: 'planner',
        taskId,
        type: 'plan',
      })
      plan = {
        title: project.goal.slice(0, 48),
        summary: 'Fallback plan: research the goal, then write it up.',
        deliverable: 'A written response to the goal.',
        tasks: [
          { key: 't1', title: 'Research the goal', role: 'researcher', description: `Research: ${project.goal}`, dependsOn: [], estimateMinutes: 2 },
          { key: 't2', title: 'Write the response', role: 'writer', description: `Write a complete response to: ${project.goal}`, dependsOn: ['t1'], estimateMinutes: 2 },
        ],
      }
    }
    this.assertLive(signal)
    const finalPlan = plan
    const provenance: Provenance = res.simulated ? 'simulated' : 'real'
    // A plan review interrupted by pause/reload/retry leaves the previous proposal behind; replace it, never stack it.
    for (const t of projectTasks(getWorld(), project.id)) if (t.id !== taskId && ACTIVE_STATUSES.has(t.status)) this.abortTask(t.id, 'cancelled')
    mutate((d) => {
      const p = d.projects[project.id]
      for (const id of p.taskIds) if (id !== taskId) delete d.tasks[id]
      p.taskIds = p.taskIds.filter((id) => id === taskId)
      const idByKey = new Map<string, string>()
      const created: Task[] = []
      for (const pt of finalPlan.tasks) {
        const kind: TaskKind = pt.role === 'qa' && pt.dependsOn.length ? 'review' : 'work'
        const nt = this.newTask(project.id, {
          key: pt.key,
          title: pt.title,
          description: pt.description,
          role: pt.role,
          kind,
          dependsOn: [],
          estimateSec: Math.round(pt.estimateMinutes * 60),
          priority: 50,
        })
        idByKey.set(pt.key, nt.id)
        created.push(nt)
      }
      finalPlan.tasks.forEach((pt, i) => {
        created[i].dependsOn = pt.dependsOn.map((k) => idByKey.get(k)!).filter(Boolean)
        if (created[i].kind === 'review') created[i].reviewOf = created[i].dependsOn[created[i].dependsOn.length - 1]
      })
      // Every coder task gets Rook's sandbox test + review; dependents wait for the reviewed code.
      const reviews: Task[] = []
      for (const c of created.filter((x) => x.role === 'coder')) {
        const r = this.newTask(project.id, {
          key: `${c.key}-qa`,
          title: `Test & review: ${c.title}`.slice(0, 60),
          description: `Run ${CREW.coder.name}'s tests in the sandbox and review "${c.title}" for correctness.`,
          role: 'qa',
          kind: 'review',
          dependsOn: [c.id],
          estimateSec: 40,
          reviewOf: c.id,
        })
        for (const other of created) if (other.dependsOn.includes(c.id)) other.dependsOn = other.dependsOn.map((x) => (x === c.id ? r.id : x))
        reviews.push(r)
      }
      const all = [...created, ...reviews]
      const deliver = this.newTask(project.id, {
        key: 'deliver',
        title: 'Assemble & ship deliverable',
        description: finalPlan.deliverable || 'Assemble the crew outputs into the final deliverable.',
        role: 'planner',
        kind: 'deliver',
        dependsOn: all.map((x) => x.id),
        estimateSec: 45,
        priority: 10,
      })
      for (const x of [...all, deliver]) d.tasks[x.id] = x
      p.taskIds.push(...all.map((x) => x.id), deliver.id)
      p.title = finalPlan.title
      p.planSummary = finalPlan.summary
      p.deliverableDescription = finalPlan.deliverable
      this.moment(d, 'plan', `Plan ready: ${all.length} tasks (${reviews.length} auto QA)`, 'planner')
    })

    if (getWorld().settings.reviewPlan) {
      const n = projectTasks(getWorld(), project.id).filter((t) => t.kind !== 'plan' && t.kind !== 'deliver').length
      const decision = await this.requestApproval(
        taskId,
        'plan',
        `Juno's plan: "${finalPlan.title}"`,
        `${n} tasks proposed. Remove or reassign tasks below, then approve to start the crew. Or send it back with notes and Juno will re-plan.`,
        { projectId: project.id },
        'low',
        signal,
        false,
      )
      if (!decision.approved) {
        mutate((d) => {
          const p = d.projects[project.id]
          for (const id of p.taskIds) if (id !== taskId) delete d.tasks[id]
          p.taskIds = [taskId]
          const t = d.tasks[taskId]
          t.feedback.push({ from: 'user', text: decision.note?.trim() || 'Please propose a different plan.', at: now() })
          t.status = 'ready'
          this.moment(d, 'user', 'Captain sent the plan back for changes', 'planner')
        })
        this.log('info', `Captain asked Juno to re-plan: "${decision.note ?? ''}"`, { agentId: 'planner', taskId, type: 'plan' })
        return
      }
    }
    this.assertLive(signal)

    mutate((d) => {
      const p = d.projects[project.id]
      const tasks = p.taskIds.map((id) => d.tasks[id]).filter((t) => t && t.kind !== 'plan' && t.kind !== 'deliver')
      const deliver = p.taskIds.map((id) => d.tasks[id]).find((t) => t?.kind === 'deliver')!
      p.status = 'running'
      const art = this.makeArtifact(d, d.tasks[taskId], planMarkdown(finalPlan, tasks, deliver, fallbackUsed), provenance, 'plan', `Plan: ${p.title}`)
      this.finishTask(d, taskId, art, finalPlan.summary)
      for (const a of Object.values(d.agents)) {
        if (a.activity === 'meeting') {
          a.activity = 'idle'
          a.visitTarget = null
          a.busyUntil = 0
        }
      }
      d.agents.planner.bubble = { text: bark('planner', 'done'), at: now(), kind: 'happy' }
      d.log.push({
        id: nanoid(8),
        at: now(),
        projectId: project.id,
        agentId: 'planner',
        taskId,
        type: 'plan',
        level: 'success',
        provenance,
        text: `Plan "${p.title}": ${tasks.map((x) => `${x.title} [${CREW[x.role].name}]`).join(' · ')} → ship`,
      })
    })
    sfx('done')
  }

  /** Captain edits to a proposed plan while it awaits approval: drop a task or hand it to someone else. */
  editPlanTask(taskId: string, change: { remove?: boolean; role?: RoleId }) {
    const t0 = getWorld().tasks[taskId]
    if (!t0 || t0.kind === 'plan' || t0.kind === 'deliver' || t0.status !== 'pending') return
    mutate((d) => {
      const p = d.projects[t0.projectId]
      const tasks = () => p.taskIds.map((id) => d.tasks[id]).filter(Boolean)
      const drop = (id: string, replaceWith: string[]) => {
        for (const t of tasks()) {
          if (t.dependsOn.includes(id)) t.dependsOn = [...new Set(t.dependsOn.flatMap((x) => (x === id ? replaceWith : [x])))].filter((x) => x !== t.id)
        }
        p.taskIds = p.taskIds.filter((x) => x !== id)
        delete d.tasks[id]
      }
      const t = d.tasks[taskId]
      if (change.remove) {
        // Removing code also removes its automatic review.
        for (const r of tasks().filter((x) => x.reviewOf === taskId)) drop(r.id, r.dependsOn.flatMap((x) => (x === taskId ? t.dependsOn : [x])))
        drop(taskId, t.dependsOn)
        d.log.push({ id: nanoid(8), at: now(), projectId: p.id, type: 'plan', level: 'info', text: `Captain removed "${t.title}" from the plan` })
        return
      }
      if (change.role && t.kind === 'work' && WORK_ROLES.includes(change.role) && change.role !== t.role) {
        const from = t.role
        if (from === 'coder') for (const r of tasks().filter((x) => x.reviewOf === taskId && x.key.endsWith('-qa'))) drop(r.id, [taskId])
        t.role = change.role
        d.log.push({ id: nanoid(8), at: now(), projectId: p.id, type: 'plan', level: 'info', text: `Captain moved "${t.title}" from ${CREW[from].name} to ${CREW[change.role].name}` })
      }
    })
  }

  // ------------------------------------------------------------------ work tasks (agentic loop with tools)

  private gatherInputs(taskId: string): { task: Task; artifact: Artifact }[] {
    const s = getWorld()
    const task = s.tasks[taskId]
    const out: { task: Task; artifact: Artifact }[] = []
    for (const depId of task.dependsOn) {
      const dep = s.tasks[depId]
      if (!dep) continue
      if (dep.kind === 'review' && dep.reviewOf) {
        const target = s.tasks[dep.reviewOf]
        const ta = target?.outputArtifactId ? s.artifacts[target.outputArtifactId] : undefined
        if (target && ta && !out.some((o) => o.task.id === target.id)) out.push({ task: target, artifact: ta })
      }
      const art = dep.outputArtifactId ? s.artifacts[dep.outputArtifactId] : undefined
      if (art) out.push({ task: dep, artifact: art })
    }
    return out
  }

  private useMemories(query: string, k: number, taskId: string): MemoryEntry[] {
    const s = getWorld()
    const hits = retrieveMemories(Object.values(s.memories), query, k)
    if (hits.length === 0) return []
    const earlier = hits.filter((h) => h.entry.sessionId !== s.sessionId)
    mutate((d) => {
      for (const h of hits) {
        const m = d.memories[h.entry.id]
        if (m) {
          m.uses++
          m.lastUsedAt = now()
        }
      }
      const p = d.activeProjectId ? d.projects[d.activeProjectId] : null
      if (p) {
        p.memoriesUsed += hits.length
        p.memoriesFromEarlierSessions += earlier.length
      }
      if (earlier.length) unlockAchievement(d, 'deja_vu')
      d.log.push({
        id: nanoid(8),
        at: now(),
        taskId,
        agentId: 'archivist',
        type: 'memory',
        level: 'info',
        text: `Moss supplied ${hits.length} memory note(s)${earlier.length ? `, ${earlier.length} from earlier sessions` : ''}.`,
      })
    })
    return hits.map((h) => h.entry)
  }

  private async runWork(taskId: string, signal: AbortSignal) {
    const s = getWorld()
    const task = s.tasks[taskId]
    const role = task.role
    const project = s.projects[task.projectId]
    const scenario = this.scenarioOf(project)
    const inputs = this.gatherInputs(taskId)
    const mems = this.useMemories(`${project.goal} ${task.title} ${task.description}`, 5, taskId)
    let tools = CREW[role].tools
    const maxTools = 3
    // Anthropic models browse with the server-side web_search tool instead of the local proxy, approved up front.
    const provider = s.settings.providers.find((p) => p.id === this.modelFor(role).providerId)
    let serverWebSearch: number | undefined
    let webNote = ''
    if (provider?.kind === 'anthropic' && tools.includes('web_search')) {
      tools = tools.filter((t) => t !== 'web_search' && t !== 'fetch_url')
      const decision = s.settings.autoApproveWeb
        ? { approved: true }
        : await this.requestApproval(
            taskId,
            'web_search',
            `Web research for "${task.title}"`,
            `${CREW[role].name} wants to research on the live web with Anthropic's server-side web search (up to 3 searches, about $0.01 each). The searches run on Anthropic's servers.`,
            { maxUses: 3, via: 'anthropic' },
            'medium',
            signal,
          )
      if (decision.approved) {
        serverWebSearch = 3
        webNote = 'You have a built-in web_search tool. Use it for current or checkable facts, and end with a "Sources" list of the URLs you relied on.'
      } else {
        webNote = 'The captain declined web access for this task. Rely on what you know and mark uncertain claims as (unverified).'
      }
    }
    const messages: ChatTurn[] = [
      {
        role: 'user',
        content: workUserMessage({ goal: project.goal, planSummary: project.planSummary, task, inputs, memories: mems }),
      },
    ]
    const toolResults: { tool: string; ok: boolean; output: string }[] = []
    let finalText = ''
    let simulated = false
    const contextOf = (cur: Task) => ({
      feedback: cur.feedback.map((f) => f.text),
      answer: cur.answer,
      inputs: inputs.map((i) => ({ title: i.task.title, role: CREW[i.task.role].name, summary: i.artifact.summary, content: i.artifact.content })),
      memories: mems.map((m) => m.text),
    })
    for (let round = 0; round <= maxTools; round++) {
      const cur = getWorld().tasks[taskId]
      const res = await this.callModel(role, taskId, {
        system: [workSystemPrompt(role, getWorld().agents[role].loadout.trait, tools, maxTools - round), webNote].filter(Boolean).join('\n\n'),
        messages,
        maxTokens: role === 'coder' ? 24000 : 16000,
        signal,
        serverWebSearch,
        meta: {
          purpose: 'work',
          role,
          goal: project.goal,
          scenario,
          taskKey: task.key,
          taskTitle: task.title,
          taskDescription: task.description,
          attempt: cur.attempts,
          toolRound: round,
          toolResults,
          context: contextOf(cur),
        },
      })
      simulated = res.simulated
      if (serverWebSearch !== undefined) serverWebSearch = Math.max(0, serverWebSearch - (res.webSearches ?? 0)) || undefined
      if (res.webSearches) {
        const n = res.webSearches
        mutate((d) => {
          d.game.counters.balloons = (d.game.counters.balloons ?? 0) + n
          d.tasks[taskId].toolCalls.push({ id: nanoid(8), tool: 'web_search', input: { via: 'anthropic server tool' }, status: 'ok', output: `${n} search(es) run by Anthropic`, at: now() })
        })
        this.log('info', `${CREW[role].name} ran ${n} web search(es) via Anthropic's server tool.`, { agentId: role, taskId, type: 'tool', provenance: 'real' })
      }
      if (res.warning) this.log('warn', `${res.warning}`, { agentId: role, taskId, type: 'provider' })
      const call = extractToolCall(res.text)
      if (call && round < maxTools) {
        messages.push({ role: 'assistant', content: res.text })
        if (!tools.includes(call.tool)) {
          messages.push({ role: 'user', content: `The tool "${call.tool}" is not available to you. Complete the task without it.` })
          continue
        }
        const out = await this.runTool(taskId, call, signal)
        toolResults.push({ tool: call.tool, ok: out.ok, output: out.output })
        messages.push({ role: 'user', content: `Tool result for ${call.tool}:\n${truncate(out.output, 7000)}\n\nContinue the task. Remember the response rules.` })
        mutate((d) => {
          d.tasks[taskId].streamText = ''
        })
        continue
      }
      if (call) {
        // Out of tool budget but still asking for one: insist on a final answer instead of saving the tool call.
        messages.push(
          { role: 'assistant', content: res.text },
          { role: 'user', content: 'You have no tool calls left. Write your final answer now, following the response rules.' },
        )
        const last = await this.callModel(role, taskId, {
          system: [workSystemPrompt(role, getWorld().agents[role].loadout.trait, [], 0), webNote].filter(Boolean).join('\n\n'),
          messages,
          maxTokens: role === 'coder' ? 24000 : 16000,
          signal,
          meta: { purpose: 'work', role, goal: project.goal, scenario, taskKey: task.key, taskTitle: task.title, taskDescription: task.description, attempt: cur.attempts, toolRound: maxTools + 1, toolResults, context: contextOf(cur) },
        })
        finalText = extractToolCall(last.text) ? '' : last.text
        break
      }
      finalText = res.text
      break
    }
    if (!finalText.trim()) throw new ProviderError('unknown', 'The model returned no usable answer (empty, or only tool calls).')
    this.assertLive(signal)
    const discoveries = extractDiscoveries(finalText)
    mutate((d) => {
      const art = this.makeArtifact(d, d.tasks[taskId], finalText, simulated ? 'simulated' : 'real')
      this.finishTask(d, taskId, art)
      this.discover(d, role, discoveries, d.projects[task.projectId]?.title ?? '')
    })
  }

  private async runTool(taskId: string, call: ToolCall, signal: AbortSignal): Promise<ToolOutcome> {
    const task = getWorld().tasks[taskId]
    const role = task.role
    const recId = nanoid(8)
    const input = call.input
    const str = (k: string) => String(input[k] ?? '').trim()
    mutate((d) => {
      d.tasks[taskId].toolCalls.push({ id: recId, tool: call.tool, input, status: 'running', at: now() })
      d.agents[role].activity = 'tool'
      d.agents[role].bubble = { text: bark(role, 'tool', 'Using a tool…'), at: now(), kind: 'think' }
    })
    const setRec = (patch: Partial<Task['toolCalls'][number]>) =>
      mutate((d) => {
        const r = d.tasks[taskId]?.toolCalls.find((x) => x.id === recId)
        if (r) Object.assign(r, patch)
      })
    let outcome: ToolOutcome
    if (call.tool === 'ask_user') {
      const q = str('question') || 'Could you clarify the goal?'
      const answer = await this.waitForAnswer(taskId, q, signal)
      outcome = { ok: true, output: `The captain answered: ${answer}` }
    } else if (call.tool === 'memory_search') {
      outcome = toolMemorySearch(Object.values(getWorld().memories), str('query'))
    } else if (call.tool === 'run_js') {
      outcome = await toolRunJs(str('code'), signal)
    } else {
      const kind: ApprovalKind = call.tool
      const target = call.tool === 'web_search' ? str('query') : str('url')
      const auto = getWorld().settings.autoApproveWeb
      const decision = auto
        ? { approved: true, note: 'auto-approved (settings)' }
        : await this.requestApproval(taskId, kind, call.tool === 'web_search' ? `Web search: "${target}"` : `Open web page: ${target}`, `${CREW[role].name} wants to ${call.tool === 'web_search' ? 'search the web for' : 'fetch'} "${target}". This sends a request from your machine to an external site.`, { target }, 'medium', signal)
      if (!decision.approved) {
        setRec({ status: 'rejected', output: decision.note })
        outcome = { ok: false, output: `The captain rejected this request${decision.note ? `: ${decision.note}` : ''}. Continue without it.` }
      } else {
        mutate((d) => {
          d.agents[role].activity = 'tool'
          d.agents[role].visitTarget = null
          d.agents[role].carrying = null
          d.game.counters.balloons = (d.game.counters.balloons ?? 0) + 1
        })
        outcome = call.tool === 'web_search' ? await toolWebSearch(target, signal) : await toolFetchUrl(target, signal)
      }
    }
    if (signal.aborted) throw new ProviderError('aborted', 'Request cancelled')
    setRec({ status: outcome.ok ? 'ok' : 'error', output: truncate(outcome.output, 4000) })
    this.log(outcome.ok ? 'info' : 'warn', `${CREW[role].name} used ${call.tool}${outcome.ok ? '' : ' (failed)'}: ${truncate(outcome.output.split('\n')[0], 140)}`, {
      agentId: role,
      taskId,
      type: 'tool',
      provenance: 'real',
    })
    mutate((d) => {
      d.agents[role].activity = 'thinking'
    })
    return outcome
  }

  private requestApproval(
    taskId: string,
    kind: ApprovalKind,
    title: string,
    detail: string,
    payload: Record<string, unknown>,
    risk: 'low' | 'medium' | 'high',
    signal?: AbortSignal,
    atDock = true,
  ): Promise<Decision> {
    const id = nanoid(8)
    const task = getWorld().tasks[taskId]
    mutate((d) => {
      d.approvals[id] = { id, projectId: task.projectId, taskId, agentId: task.role, kind, title, detail, payload, risk, status: 'pending', createdAt: now() }
      const t = d.tasks[taskId]
      t.status = 'awaiting_approval'
      const a = d.agents[task.role]
      a.activity = 'awaiting_approval'
      a.visitTarget = atDock ? 'dock' : null
      a.carrying = atDock ? 'letter' : null
      a.bubble = { text: bark(task.role, 'awaiting_approval', 'Captain, may I?'), at: now(), kind: 'alert' }
      this.moment(d, 'approval', `${CREW[task.role].name} requested approval: ${title}`, task.role)
      d.log.push({ id: nanoid(8), at: now(), projectId: task.projectId, taskId, agentId: task.role, type: 'approval', level: 'warn', text: `Approval needed: ${title}` })
      pushToast(d, { kind: 'warn', title: 'Approval needed', body: title, agentId: task.role })
    })
    sfx('approval')
    return new Promise<Decision>((resolve, reject) => {
      this.decisions.set(id, (dec) => {
        mutate((d) => {
          const t = d.tasks[taskId]
          if (t && t.status === 'awaiting_approval') t.status = 'running'
          const a = d.agents[task.role]
          if (a.taskId === taskId) {
            a.activity = 'thinking'
            a.visitTarget = null
            a.carrying = null
          }
        })
        resolve(dec)
      })
      signal?.addEventListener('abort', () => reject(new ProviderError('aborted', 'Request cancelled')), { once: true })
    })
  }

  decide(approvalId: string, approved: boolean, note?: string) {
    const ap = getWorld().approvals[approvalId]
    if (!ap || ap.status !== 'pending') return
    mutate((d) => {
      const a = d.approvals[approvalId]
      a.status = approved ? 'approved' : 'rejected'
      a.decidedAt = now()
      a.note = note
      this.moment(d, 'approval', `Captain ${approved ? 'approved' : 'rejected'}: ${a.title}`, a.agentId)
      d.log.push({ id: nanoid(8), at: now(), projectId: a.projectId, taskId: a.taskId, agentId: a.agentId, type: 'approval', level: approved ? 'success' : 'warn', text: `${approved ? 'Approved' : 'Rejected'}: ${a.title}${note ? ` (note: "${note}")` : ''}` })
      if (approved) {
        if (bump(d, 'approvals') >= 10) unlockAchievement(d, 'green_light')
      } else if (a.kind !== 'ship') unlockAchievement(d, 'careful_captain')
      d.game.events = d.game.events.filter((e) => !(e.kind === 'approval_waiting' && e.data?.approvalId === approvalId))
    })
    sfx('stamp')
    const fn = this.decisions.get(approvalId)
    this.decisions.delete(approvalId)
    fn?.({ approved, note })
  }

  private waitForAnswer(taskId: string, question: string, signal: AbortSignal): Promise<string> {
    const task = getWorld().tasks[taskId]
    mutate((d) => {
      const t = d.tasks[taskId]
      t.status = 'needs_input'
      t.question = question
      const a = d.agents[task.role]
      a.activity = 'needs_input'
      a.bubble = { text: `${question}`, at: now() + 60_000, kind: 'alert' }
      this.moment(d, 'user', `${CREW[task.role].name} asked the captain: ${question}`, task.role)
      d.log.push({ id: nanoid(8), at: now(), projectId: t.projectId, taskId, agentId: task.role, type: 'question', level: 'warn', text: `${CREW[task.role].name} needs input: ${question}` })
      pushToast(d, { kind: 'warn', title: `${CREW[task.role].name} has a question`, body: question, agentId: task.role })
    })
    sfx('question')
    return new Promise<string>((resolve, reject) => {
      this.answers.set(taskId, resolve)
      signal.addEventListener('abort', () => reject(new ProviderError('aborted', 'Request cancelled')), { once: true })
    })
  }

  answer(taskId: string, text: string) {
    const fn = this.answers.get(taskId)
    if (!fn || !text.trim()) return
    this.answers.delete(taskId)
    mutate((d) => {
      const t = d.tasks[taskId]
      t.answer = text.trim()
      t.status = 'running'
      const a = d.agents[t.role]
      a.activity = 'thinking'
      a.bubble = { text: 'Thanks, captain!', at: now(), kind: 'happy' }
      d.log.push({ id: nanoid(8), at: now(), projectId: t.projectId, taskId, agentId: t.role, type: 'answer', level: 'info', text: `Captain answered ${CREW[t.role].name}: "${text.trim()}"` })
    })
    sfx('pop')
    fn(text.trim())
  }

  // ------------------------------------------------------------------ review

  private async runReview(taskId: string, signal: AbortSignal) {
    const s = getWorld()
    const task = s.tasks[taskId]
    const reviewer = task.role
    const who = CREW[reviewer].name
    const project = s.projects[task.projectId]
    const target = task.reviewOf ? s.tasks[task.reviewOf] : undefined
    const art = target?.outputArtifactId ? s.artifacts[target.outputArtifactId] : undefined
    if (!target || !art) throw new ProviderError('unknown', 'Nothing to review: the reviewed task has no output.')
    const round = (target.reworks ?? 0) + 1
    let testReport: string | undefined
    let tests: { passed: number; total: number; failures: string[]; ran: boolean } | undefined
    if (target.role === 'coder') {
      const { solution, tests: testBlock, otherLang } = findSolutionAndTests(art.content)
      mutate((d) => {
        d.agents[reviewer].activity = 'tool'
        d.agents[reviewer].bubble = { text: bark(reviewer, 'tool', 'Running tests…'), at: now(), kind: 'think' }
      })
      if (solution) {
        const run = await runInSandbox(solution.code, testBlock?.code, 4000, signal)
        this.assertLive(signal)
        testReport = formatTestReport(run)
        const failures = run.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.error}`)
        if (!run.ok) failures.unshift(run.error ?? 'Sandbox error')
        tests = { passed: run.results.filter((r) => r.passed).length, total: run.results.length, failures, ran: true }
        const result = tests
        mutate((d) => {
          const ta = this.makeArtifact(d, d.tasks[taskId], `SUMMARY: Sandbox run of "${target.title}" (round ${round}): ${result.passed}/${result.total} tests passed.\n\n\`\`\`text\n${testReport}\n\`\`\``, 'real', 'test_report', `Test report: ${target.title} (round ${round})`, false)
          pop(d, reviewer, `${result.passed}/${result.total} ${failures.length ? '' : ''}`, failures.length ? 'bad' : 'good')
          d.log.push({
            id: nanoid(8),
            at: now(),
            projectId: project.id,
            taskId,
            agentId: reviewer,
            type: 'tests',
            level: failures.length ? 'warn' : 'success',
            provenance: 'real',
            text: `Sandbox tests for "${target.title}": ${result.passed}/${result.total} passed${failures.length ? `, ${failures.length} failing` : ''} (${run.ms}ms)`,
            data: { artifactId: ta.id },
          })
        })
      } else {
        testReport = otherLang
          ? `The code is written in "${otherLang}", which the browser sandbox cannot execute. Static review only.`
          : 'No runnable code block was found in the submission.'
        this.log('warn', `${testReport}`, { agentId: reviewer, taskId, type: 'tests' })
      }
    }
    const instructions = task.feedback.filter((f) => f.from === 'user').map((f) => f.text)
    const res = await this.callModel(reviewer, taskId, {
      system: reviewSystemPrompt(getWorld().agents[reviewer].loadout.trait),
      messages: [{ role: 'user', content: reviewUserMessage({ goal: project.goal, target: { task: target, artifact: art }, testReport, round, instructions }) }],
      maxTokens: 8000,
      signal,
      meta: {
        purpose: 'review',
        role: reviewer,
        goal: project.goal,
        scenario: this.scenarioOf(project),
        context: { targetRole: target.role, targetTitle: target.title, targetReworks: target.reworks ?? 0, tests },
      },
    })
    this.assertLive(signal)
    let { verdict, issues } = parseVerdict(res.text)
    let note = ''
    if (!verdict) {
      verdict = tests?.failures.length ? 'fail' : 'pass'
      note = ` (no explicit verdict; engine inferred ${verdict.toUpperCase()} from ${tests ? 'test results' : 'absence of issues'})`
    }
    if (verdict === 'pass' && tests && tests.failures.length) {
      verdict = 'fail'
      note = ' (engine override: reviewer said PASS but sandbox tests failed)'
      if (issues.length === 0) issues = tests.failures.map((f) => `Failing test: ${f}`)
    }
    const provenance: Provenance = res.simulated ? 'simulated' : 'real'
    const finalVerdict = verdict
    mutate((d) => {
      const t = d.tasks[taskId]
      const tgt = d.tasks[target.id]
      const reviewArt = this.makeArtifact(d, t, res.text, provenance, 'review', `Review: ${target.title} (round ${round})`, false)
      t.verdict = finalVerdict
      t.summary = extractSummary(res.text)
      d.log.push({
        id: nanoid(8),
        at: now(),
        projectId: project.id,
        taskId,
        agentId: reviewer,
        type: 'review',
        level: finalVerdict === 'pass' ? 'success' : 'warn',
        provenance,
        text: `${who}'s verdict on "${target.title}": ${finalVerdict.toUpperCase()}${note}${issues.length ? `, ${issues.length} issue(s)` : ''}`,
        data: { artifactId: reviewArt.id },
      })
      if (finalVerdict === 'fail' && (tgt.reworks ?? 0) < MAX_REWORKS) {
        const fb = issues.length ? issues.join(' | ') : t.summary
        tgt.feedback.push({ from: 'qa', text: fb, at: now() })
        tgt.caught = tgt.caught || Boolean(tests?.failures.length)
        tgt.reworks = (tgt.reworks ?? 0) + 1
        tgt.status = 'handoff'
        tgt.handoffUntil = now() + (d.settings.turbo ? 0 : Math.round(3000 / Math.max(1, d.settings.demoSpeed)))
        tgt.progress = 0
        // Every review of this work must look at the new version, not just the one that failed it.
        for (const id of d.projects[project.id].taskIds) {
          const other = d.tasks[id]
          if (other && other.reviewOf === target.id && ['done', 'pending', 'ready', 'handoff'].includes(other.status)) {
            other.status = 'pending'
            other.progress = 0
          }
        }
        t.status = 'pending'
        t.progress = 0
        d.agents[tgt.role].stats.reworks++
        const rv = d.agents[reviewer]
        rv.activity = 'handoff'
        rv.visitTarget = tgt.role
        rv.carrying = 'stamp-bad'
        rv.busyUntil = now() + 5000
        rv.taskId = null
        rv.bubble = { text: `Back to you, ${CREW[tgt.role].name}. ${issues.length} issue${issues.length === 1 ? '' : 's'}.`, at: now(), kind: 'alert' }
        this.moment(d, 'rework', `${who} sent "${tgt.title}" back: ${truncate(fb, 120)}`, reviewer)
        bump(d, 'reworks')
        return
      }
      if (finalVerdict === 'fail') {
        d.log.push({ id: nanoid(8), at: now(), projectId: project.id, taskId, agentId: reviewer, type: 'review', level: 'warn', text: `"${target.title}" is out of rework rounds. Continuing with known issues, which the deliverable will list.` })
      } else if (tgt.caught) {
        unlockAchievement(d, 'quality_gate')
      }
      this.finishTask(d, taskId, reviewArt)
      d.agents[reviewer].carrying = finalVerdict === 'pass' ? 'stamp-ok' : 'stamp-bad'
    })
    sfx('stamp')
  }

  /** Throw if this run was cancelled, so a late result never overwrites a paused, cancelled or restarted task. */
  private assertLive(signal: AbortSignal) {
    if (signal.aborted) throw new ProviderError('aborted', 'Request cancelled')
  }

  // ------------------------------------------------------------------ delivery

  private async runDeliver(taskId: string, signal: AbortSignal) {
    const s = getWorld()
    const task = s.tasks[taskId]
    const project = s.projects[task.projectId]
    const parts = projectTasks(s, project.id)
      .filter((t) => t.kind !== 'plan' && t.kind !== 'deliver' && t.status === 'done' && t.outputArtifactId)
      .map((t) => ({ task: t, artifact: s.artifacts[t.outputArtifactId!] }))
    const feedback = task.feedback.map((f) => f.text)
    const res = await this.callModel('planner', taskId, {
      system: deliverSystemPrompt(s.agents.planner.loadout.trait),
      messages: [{ role: 'user', content: deliverUserMessage(project.goal, project.planSummary, parts, feedback) }],
      maxTokens: 32000,
      signal,
      meta: {
        purpose: 'deliver',
        role: 'planner',
        goal: project.goal,
        scenario: this.scenarioOf(project),
        context: {
          title: project.title,
          planSummary: project.planSummary,
          feedback,
          artifacts: parts.map((p) => ({ title: p.task.title, role: CREW[p.task.role].name, summary: p.artifact.summary, content: p.artifact.content })),
        },
      },
    })
    this.assertLive(signal)
    const provenance: Provenance = res.simulated ? 'simulated' : 'real'
    let artId = ''
    mutate((d) => {
      const art = this.makeArtifact(d, d.tasks[taskId], res.text, provenance, 'deliverable', `${project.title} · final v${task.attempts}`, false)
      artId = art.id
      d.projects[project.id].deliverableId = art.id
      d.projects[project.id].status = 'delivering'
      d.tasks[taskId].progress = 0.97
      d.tasks[taskId].summary = art.summary
      // Surface the deliverable, but never yank the inspector away from something the captain is looking at.
      if (!d.ui.selection.kind) d.ui.selection = { kind: 'artifact', id: art.id }
    })
    const decision = await this.requestApproval(
      taskId,
      'ship',
      `Ship "${project.title}"`,
      'Juno assembled the final deliverable. Approve to ship it, or reject with notes and Juno will revise.',
      { artifactId: artId },
      'low',
      signal,
    )
    if (!decision.approved) {
      mutate((d) => {
        const t = d.tasks[taskId]
        t.feedback.push({ from: 'user', text: decision.note?.trim() || 'Please improve the deliverable.', at: now() })
        t.status = 'ready'
        d.projects[project.id].status = 'running'
        d.artifacts[artId].status = 'rejected'
        d.agents.planner.bubble = { text: 'Revisions coming right up!', at: now(), kind: 'say' }
      })
      this.log('info', `Captain requested a revision of the deliverable: "${decision.note ?? ''}"`, { agentId: 'planner', taskId, type: 'deliver' })
      return
    }
    this.completeProject(project.id, taskId, artId)
  }

  private completeProject(projectId: string, taskId: string, artId: string) {
    mutate((d) => {
      const p = d.projects[projectId]
      d.artifacts[artId].status = 'approved'
      this.finishTask(d, taskId, d.artifacts[artId])
      p.status = 'done'
      p.finishedAt = now()
      const tasks = p.taskIds.map((id) => d.tasks[id])
      const failed = tasks.some((t) => t.status === 'failed')
      const reworked = tasks.some((t) => t.feedback.some((f) => f.from === 'qa'))
      const providers = new Set(tasks.map((t) => t.providerUsed).filter(Boolean))
      unlockAchievement(d, 'first_flight')
      if (!failed && !reworked) unlockAchievement(d, 'clean_sweep')
      if (p.finishedAt - p.createdAt < 4 * 60_000) unlockAchievement(d, 'speedrun')
      if (p.mode === 'live' && p.costUsd < 0.05) unlockAchievement(d, 'frugal')
      if (providers.size >= 2 && !(providers.size === 2 && providers.has('demo') && p.mode === 'demo')) unlockAchievement(d, 'byok_brigade')
      addXp(d, 80 + tasks.length * 5, null)
      d.game.sparks += 20
      d.game.crates += 1
      d.game.momentum = Math.min(100, d.game.momentum + 20)
      for (const a of Object.values(d.agents)) {
        a.activity = 'celebrating'
        a.visitTarget = 'plaza'
        a.carrying = null
        a.busyUntil = now() + 9000
        a.taskId = null
        a.bubble = { text: bark(a.id, 'celebrating', ''), at: now() + Math.random() * 1500, kind: 'happy' }
      }
      d.ui.celebrate = { projectId, at: now() }
      this.moment(d, 'deliver', `Delivered "${p.title}"`, 'planner')
      d.log.push({ id: nanoid(8), at: now(), projectId, type: 'deliver', level: 'success', text: `Project delivered: "${p.title}". ${tasks.length} tasks in ${Math.round((p.finishedAt - p.createdAt) / 1000)}s for $${p.costUsd.toFixed(4)}.` })
      // Moss files a project summary for future sessions.
      const summaryText = `Project "${p.title}" (${new Date().toISOString().slice(0, 10)}): ${d.artifacts[artId].summary}`
      const mem: MemoryEntry = {
        id: nanoid(10),
        text: summaryText,
        kind: 'summary',
        tags: suggestTags(`${p.title} ${p.goal}`),
        source: { agent: 'archivist', projectId, projectTitle: p.title, taskId },
        createdAt: now(),
        sessionId: d.sessionId,
        uses: 0,
        pinned: false,
        provenance: p.mode === 'demo' ? 'simulated' : 'real',
      }
      d.memories[mem.id] = mem
      if (Object.keys(d.memories).length >= 25) unlockAchievement(d, 'keeper_of_lore')
    })
    sfx('deliver')
  }

  // ------------------------------------------------------------------ artifacts / completion

  private makeArtifact(d: Draft, task: Task, text: string, provenance: Provenance, kind?: ArtifactKind, title?: string, attach = true): Artifact {
    const version = Object.values(d.artifacts).filter((a) => a.taskId === task.id && a.kind === (kind ?? artifactKindFor(task.role, task.kind))).length + 1
    const art: Artifact = {
      id: nanoid(10),
      projectId: task.projectId,
      taskId: task.id,
      agentId: task.role,
      kind: kind ?? artifactKindFor(task.role, task.kind),
      title: title ?? `${task.title}${version > 1 ? ` (v${version})` : ''}`,
      content: kind === 'plan' ? text : cleanContent(text),
      summary: extractSummary(text),
      createdAt: now(),
      provenance,
      status: 'draft',
      version,
      model: task.modelUsed,
      discoveries: extractDiscoveries(text),
    }
    d.artifacts[art.id] = art
    if (attach) task.outputArtifactId = art.id
    return art
  }

  private finishTask(d: Draft, taskId: string, art: Artifact, summary?: string) {
    const t = d.tasks[taskId]
    t.status = 'done'
    t.progress = 1
    t.finishedAt = now()
    t.summary = summary ?? art.summary
    t.outputArtifactId ??= art.id
    if (art.status === 'draft' && t.kind !== 'deliver') art.status = 'final'
    const a = d.agents[t.role]
    a.stats.tasksDone++
    a.bubble = { text: bark(t.role, 'done', 'Done!'), at: now(), kind: 'happy' }
    this.recent(d, t.role, `Finished "${t.title}"`)
    const base = t.kind === 'deliver' ? 40 : t.kind === 'review' ? 20 : t.kind === 'plan' ? 20 : 30
    const gained = addXp(d, base + Math.min(20, Math.round(t.tokensOut / 200)), t.role)
    d.game.sparks += 3
    d.game.momentum = Math.min(100, d.game.momentum + 6)
    this.moment(d, 'done', `${CREW[t.role].name} finished "${t.title}"`, t.role)
    d.log.push({
      id: nanoid(8),
      at: now(),
      projectId: t.projectId,
      taskId,
      agentId: t.role,
      type: 'task',
      level: 'success',
      provenance: art.provenance,
      text: `${CREW[t.role].name} finished "${t.title}" (+${gained} XP)${t.summary ? `. ${truncate(t.summary, 140)}` : ''}`,
      data: { artifactId: art.id },
    })
    // The deliverable is summarized by completeProject(); everything else gets distilled by Moss.
    if (t.kind !== 'plan' && t.kind !== 'deliver') d.memoryQueue.push({ taskId, artifactId: art.id })
    // Combo: two synergistic crew members finishing close together.
    const prev = this.lastCompletion
    if (prev && prev.role !== t.role && now() - prev.at < 15_000 && synergyLevel(d.game.synergy[pairKey(prev.role, t.role)] ?? 0) >= 1) {
      addXp(d, 15, prev.role, false)
      addXp(d, 15, t.role, false)
      pushEvent(d, {
        kind: 'combo',
        title: 'Combo!',
        body: `${CREW[prev.role].name} and ${CREW[t.role].name} finished back-to-back. +15 XP each.`,
        actions: [{ id: 'dismiss', label: 'Nice!', primary: true }],
        provenance: 'real',
        expiresAt: now() + 9000,
      })
    }
    this.lastCompletion = { role: t.role, at: now() }
    sfx('done')
  }

  private discover(d: Draft, role: RoleId, lines: string[], projectTitle: string) {
    if (!lines.length) return
    for (const text of lines) {
      d.game.discoveries.unshift({
        id: nanoid(8),
        text,
        agentId: role,
        projectTitle,
        at: now(),
        collected: false,
        rarity: role === 'researcher' ? 'rare' : Math.random() < 0.15 ? 'epic' : 'common',
      })
    }
    if (d.game.discoveries.length > 200) d.game.discoveries.length = 200
    if (role === 'researcher') {
      pushEvent(d, {
        kind: 'research_breakthrough',
        title: 'Research breakthrough!',
        body: `${CREW[role].name} found: “${truncate(lines[0], 160)}”`,
        actions: [
          { id: 'collect', label: 'Collect card (+10 ✦)', primary: true },
          { id: 'dismiss', label: 'Later' },
        ],
        provenance: 'real',
        expiresAt: now() + 40_000,
      })
    }
  }

  // ------------------------------------------------------------------ memory keeper

  private async processMemoryQueue() {
    const job = getWorld().memoryQueue[0]
    if (!job) return
    this.memoryBusy = true
    const s = getWorld()
    const task = s.tasks[job.taskId]
    const art = s.artifacts[job.artifactId]
    const project = task ? s.projects[task.projectId] : undefined
    try {
      if (!task || !art || !project) return
      const arch = s.agents.archivist
      if (!arch.taskId) {
        mutate((d) => {
          const a = d.agents.archivist
          a.activity = 'memory'
          a.visitTarget = 'tree'
          a.carrying = 'orb'
          a.bubble = { text: bark('archivist', 'memory'), at: now(), kind: 'think' }
        })
      }
      const res = await this.callModel('archivist', null, {
        system: memorySystemPrompt(),
        messages: [{ role: 'user', content: memoryUserMessage(project.goal, task, art) }],
        maxTokens: 4000,
        meta: {
          purpose: 'memory',
          role: 'archivist',
          goal: project.goal,
          context: { title: task.title, summary: art.summary, discoveries: art.discoveries ?? [] },
        },
      })
      const parsed = extractJson(res.text)
      const notes = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]).slice(0, 3) : []
      if (!Array.isArray(parsed)) this.log('warn', `Moss couldn't parse memory notes for "${task.title}", so they were skipped.`, { agentId: 'archivist', type: 'memory' })
      const provenance: Provenance = res.simulated ? 'simulated' : 'real'
      mutate((d) => {
        let added = 0
        for (const n of notes) {
          const text = String(n.text ?? '').trim()
          if (text.length < 8) continue
          const existing = Object.values(d.memories)
          const cls = classifyAgainst(existing, text)
          if (cls.duplicateOf) {
            const m = d.memories[cls.duplicateOf.id]
            m.uses++
            continue
          }
          const kind = (['fact', 'decision', 'discovery', 'lesson', 'preference', 'summary'].includes(String(n.kind)) ? n.kind : 'fact') as MemoryEntry['kind']
          const tags = Array.isArray(n.tags) ? (n.tags as unknown[]).map((x) => String(x).toLowerCase()).slice(0, 5) : suggestTags(text)
          const entry: MemoryEntry = {
            id: nanoid(10),
            text,
            kind,
            tags,
            source: { agent: task.role, taskId: task.id, projectId: project.id, projectTitle: project.title },
            createdAt: now(),
            sessionId: d.sessionId,
            uses: 0,
            pinned: false,
            provenance,
            conflictWith: cls.conflictWith?.id,
          }
          d.memories[entry.id] = entry
          added++
          if (cls.conflictWith) {
            pushEvent(d, {
              kind: 'memory_conflict',
              title: 'Memory conflict',
              body: `New: “${truncate(text, 120)}” vs. existing: “${truncate(cls.conflictWith.text, 120)}”. Which should the crew trust?`,
              actions: [
                { id: 'keep-new', label: 'Keep new', primary: true },
                { id: 'keep-old', label: 'Keep old' },
                { id: 'keep-both', label: 'Keep both' },
              ],
              provenance: 'real',
              data: { newId: entry.id, oldId: cls.conflictWith.id },
            })
          }
        }
        d.game.counters.memoryPulse = now()
        if (added) {
          d.log.push({ id: nanoid(8), at: now(), agentId: 'archivist', taskId: task.id, type: 'memory', level: 'success', provenance, text: `Moss filed ${added} memory note(s) from "${task.title}".` })
          d.agents.archivist.stats.tasksDone++
          addXp(d, 5 * added, 'archivist')
          this.moment(d, 'memory', `Moss remembered ${added} thing(s) from "${task.title}"`, 'archivist')
        }
        if (Object.keys(d.memories).length >= 25) unlockAchievement(d, 'keeper_of_lore')
      })
      if (notes.length) sfx('memory')
    } catch (e) {
      this.log('warn', `Memory extraction failed for "${task?.title ?? job.taskId}": ${e instanceof Error ? e.message : String(e)}`, { agentId: 'archivist', type: 'memory' })
    } finally {
      mutate((d) => {
        d.memoryQueue.shift()
        const a = d.agents.archivist
        if (!a.taskId && a.activity === 'memory') {
          a.activity = 'idle'
          a.visitTarget = null
          a.carrying = null
        }
      })
      this.memoryBusy = false
    }
  }

  // ------------------------------------------------------------------ momentum, frames, bottlenecks, events

  private updateMomentum() {
    const s = getWorld()
    const p = this.active()
    const working = Object.values(s.agents).filter((a) => WORKING.includes(a.activity)).length
    let target = 32
    if (p && ['running', 'planning', 'delivering'].includes(p.status)) {
      const tasks = projectTasks(s, p.id)
      const waiting = tasks.filter((t) => t.status === 'awaiting_approval' || t.status === 'needs_input')
      const staleWaiting = waiting.filter((t) => {
        const ap = Object.values(s.approvals).find((a) => a.taskId === t.id && a.status === 'pending')
        return ap ? now() - ap.createdAt > 20_000 : true
      }).length
      const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'blocked').length
      const queued = tasks.filter((t) => t.status === 'ready' && s.agents[t.role].taskId && s.agents[t.role].taskId !== t.id).length
      target = 28 + working * 13 - staleWaiting * 14 - failed * 18 - queued * 6
    } else if (p?.status === 'paused') target = 15
    target = Math.max(0, Math.min(100, target))
    const step = (target - s.game.momentum) * 0.07
    if (Math.abs(step) < 0.05) return // settled: don't wake every subscriber once a second
    mutate((d) => {
      d.game.momentum += step
      if (d.game.momentum > 90) unlockAchievement(d, 'momentum_max')
    })
  }

  private recordFrame(projectId: string) {
    mutate((d) => {
      const p = d.projects[projectId]
      const a: Record<string, [AgentActivity, string | null]> = {}
      for (const ag of Object.values(d.agents)) a[ag.id] = [ag.activity, ag.taskId]
      const st: Record<string, Task['status']> = {}
      for (const id of p.taskIds) if (d.tasks[id]) st[id] = d.tasks[id].status
      p.timeline.push({ t: now(), a, s: st, m: Math.round(d.game.momentum) })
      if (p.timeline.length > 2400) p.timeline = p.timeline.filter((_, i) => i % 2 === 0)
    })
  }

  private detectBottlenecks(projectId: string) {
    const s = getWorld()
    if (s.game.events.some((e) => e.kind === 'bottleneck')) return
    if ((s.game.counters.lastBottleneck ?? 0) > now() - 45_000) return
    const tasks = projectTasks(s, projectId)
    for (const t of tasks) {
      if (t.kind !== 'work' || t.status !== 'ready' || !t.readyAt || now() - t.readyAt < 6000) continue
      const owner = s.agents[t.role]
      if (!owner.taskId || owner.taskId === t.id) continue
      const alt = (FALLBACK_ROLES[t.role] ?? []).find((r) => !s.agents[r].taskId && !tasks.some((x) => x.role === r && x.status === 'ready'))
      if (!alt) continue
      mutate((d) => {
        d.game.counters.lastBottleneck = now()
        pushEvent(d, {
          kind: 'bottleneck',
          title: 'Bottleneck detected',
          body: `"${t.title}" is queued behind ${CREW[t.role].name}'s current task while ${CREW[alt].name} is free. Reassign it to ${CREW[alt].name}?`,
          actions: [
            { id: 'reassign', label: `Reassign to ${CREW[alt].name}`, primary: true },
            { id: 'dismiss', label: 'Keep waiting' },
          ],
          provenance: 'real',
          data: { taskId: t.id, role: alt },
          expiresAt: now() + 45_000,
        })
      })
      return
    }
    // Optimization tip: premium model doing lightweight memory work.
    const arch = this.modelFor('archivist')
    if (/opus|fable|gpt-5$|gpt-4\.1$/.test(arch.model) && !s.game.counters.tipArchivist) {
      mutate((d) => {
        d.game.counters.tipArchivist = 1
        pushEvent(d, {
          kind: 'optimization',
          title: 'Optimization suggestion',
          body: `Moss only extracts short memory notes, but runs on ${arch.model}. A smaller model would cut cost with little quality loss.`,
          actions: [
            { id: 'cheap-archivist', label: 'Use a lighter model', primary: true },
            { id: 'dismiss', label: 'Keep it' },
          ],
          provenance: 'real',
          data: { providerId: arch.providerId },
        })
      })
    }
  }

  private checkWaitingApprovals() {
    const s = getWorld()
    const stale = Object.values(s.approvals).find((a) => a.status === 'pending' && now() - a.createdAt > 25_000)
    if (!stale || s.game.events.some((e) => e.kind === 'approval_waiting' && e.data?.approvalId === stale.id)) return
    mutate((d) =>
      pushEvent(d, {
        kind: 'approval_waiting',
        title: `${CREW[stale.agentId].name} is waiting at the dock`,
        body: `${stale.title}. Momentum drains while approvals wait.`,
        actions: [
          { id: 'approve', label: 'Approve', primary: true },
          { id: 'reject', label: 'Reject' },
        ],
        provenance: 'real',
        data: { approvalId: stale.id },
      }),
    )
  }

  private randomEvent() {
    const s = getWorld()
    if (!s.ui.started) return
    const roll = Math.random()
    mutate((d) => {
      if (roll < 0.34) {
        d.game.boostUntil = now() + 60_000
        pushEvent(d, { kind: 'golden_hour', title: 'Golden hour', body: 'The sun is doing its best work. All XP ×2 for 60 seconds!', actions: [{ id: 'dismiss', label: 'Lovely', primary: true }], provenance: 'cosmetic', expiresAt: now() + 60_000 })
      } else if (roll < 0.7) {
        pushEvent(d, { kind: 'supply_drop', title: 'Supply drop', body: 'A delivery balloon dropped a crate at the Sky Dock.', actions: [{ id: 'crate', label: 'Take crate', primary: true }], provenance: 'cosmetic', expiresAt: now() + 45_000 })
      } else {
        d.game.catUntil = now() + 45_000
        pushEvent(d, { kind: 'cat_visit', title: 'A cloud cat wandered in', body: 'Someone is napping on the Command Plaza. Click the cat for a treat.', actions: [{ id: 'dismiss', label: 'Aww', primary: true }], provenance: 'cosmetic', expiresAt: now() + 45_000 })
      }
    })
  }

  // ------------------------------------------------------------------ captain interventions

  resolveEvent(eventId: string, actionId: string) {
    const ev = getWorld().game.events.find((e) => e.id === eventId)
    if (!ev) return
    const data = ev.data ?? {}
    mutate((d) => removeEvent(d, eventId))
    switch (actionId) {
      case 'collect':
        mutate((d) => {
          const disc = d.game.discoveries.find((x) => !x.collected)
          if (disc) disc.collected = true
          d.game.sparks += 10
        })
        sfx('coin')
        break
      case 'crate':
        mutate((d) => {
          d.game.crates += 1
        })
        sfx('coin')
        break
      case 'reassign':
        this.reassign(String(data.taskId), data.role as RoleId)
        mutate((d) => {
          const p = d.activeProjectId ? d.projects[d.activeProjectId] : null
          if (p) p.bottlenecksResolved++
          unlockAchievement(d, 'bottleneck_buster')
        })
        break
      case 'approve':
      case 'reject':
        this.decide(String(data.approvalId), actionId === 'approve')
        break
      case 'swap-demo': {
        const role = data.role as RoleId
        this.setLoadout(role, { model: { providerId: 'demo', model: 'cloudworks-sim-1' } })
        this.retry(String(data.taskId))
        break
      }
      case 'open-loadout':
        mutate((d) => {
          d.ui.selection = { kind: 'agent', id: String(data.role) }
        })
        break
      case 'cheap-archivist': {
        const pid = String(data.providerId)
        const cheap = pid === 'anthropic' ? 'claude-haiku-4-5' : pid === 'openai' ? 'gpt-4o-mini' : null
        if (cheap) this.setLoadout('archivist', { model: { providerId: pid, model: cheap } })
        break
      }
      case 'keep-new':
      case 'keep-old':
      case 'keep-both':
        mutate((d) => {
          const n = d.memories[String(data.newId)]
          const o = d.memories[String(data.oldId)]
          if (actionId === 'keep-new' && o) delete d.memories[o.id]
          if (actionId === 'keep-old' && n) delete d.memories[n.id]
          if (actionId === 'keep-both' && n) n.conflictWith = undefined
          if (actionId === 'keep-new' && n) n.conflictWith = undefined
        })
        break
    }
  }

  retry(taskId: string) {
    mutate((d) => {
      const t = d.tasks[taskId]
      if (!t || !['failed', 'cancelled', 'blocked', 'paused'].includes(t.status)) return
      t.status = 'pending'
      t.error = undefined
      t.failures = 0
      t.notBefore = undefined
      const p = d.projects[t.projectId]
      if (p && ['failed', 'cancelled'].includes(p.status)) {
        const planDone = p.taskIds.some((id) => d.tasks[id]?.kind === 'plan' && d.tasks[id]?.status === 'done')
        p.status = planDone ? 'running' : 'planning'
        p.finishedAt = undefined
      }
      d.log.push({ id: nanoid(8), at: now(), taskId, agentId: t.role, type: 'control', level: 'info', text: `Captain retried "${t.title}"` })
    })
  }

  cancelTask(taskId: string) {
    const t = getWorld().tasks[taskId]
    if (!t || ['done', 'cancelled'].includes(t.status)) return
    if (ACTIVE_STATUSES.has(t.status)) this.abortTask(taskId, 'cancelled')
    mutate((d) => {
      d.tasks[taskId].status = 'cancelled'
      d.log.push({ id: nanoid(8), at: now(), taskId, agentId: t.role, type: 'control', level: 'warn', text: `Captain cancelled "${t.title}"` })
      this.moment(d, 'user', `Captain cancelled "${t.title}"`, t.role)
    })
  }

  pauseTask(taskId: string) {
    const t = getWorld().tasks[taskId]
    if (!t) return
    if (ACTIVE_STATUSES.has(t.status)) this.abortTask(taskId, 'paused')
    else if (['pending', 'ready', 'handoff'].includes(t.status)) mutate((d) => void (d.tasks[taskId].status = 'paused'))
    this.log('info', `Captain paused "${t.title}"`, { taskId, agentId: t.role, type: 'control' })
  }

  resumeTask(taskId: string) {
    mutate((d) => {
      const t = d.tasks[taskId]
      if (t?.status === 'paused') t.status = 'pending'
    })
  }

  skipDependency(taskId: string) {
    mutate((d) => {
      const t = d.tasks[taskId]
      if (!t) return
      t.dependsOn = t.dependsOn.filter((id) => !['failed', 'cancelled'].includes(d.tasks[id]?.status))
      t.status = 'pending'
      t.error = undefined
    })
  }

  reprioritize(taskId: string, delta: number) {
    mutate((d) => {
      const t = d.tasks[taskId]
      if (t) t.priority = Math.max(0, Math.min(200, t.priority + delta))
    })
  }

  reassign(taskId: string, role: RoleId) {
    const t = getWorld().tasks[taskId]
    if (!t || t.kind !== 'work' || ACTIVE_STATUSES.has(t.status) || t.status === 'done' || !WORK_ROLES.includes(role)) return
    mutate((d) => {
      const tt = d.tasks[taskId]
      const from = tt.role
      tt.role = role
      d.log.push({ id: nanoid(8), at: now(), taskId, agentId: role, type: 'control', level: 'info', text: `"${tt.title}" reassigned from ${CREW[from].name} to ${CREW[role].name}` })
      this.moment(d, 'user', `Reassigned "${tt.title}" to ${CREW[role].name}`, role)
      d.agents[role].bubble = { text: 'I can take that one!', at: now(), kind: 'happy' }
    })
  }

  redirect(role: RoleId, text: string) {
    text = text.trim()
    if (!text) return
    const s = getWorld()
    const a = s.agents[role]
    const t = a.taskId ? s.tasks[a.taskId] : undefined
    mutate((d) => {
      bump(d, 'redirects')
      unlockAchievement(d, 'redirector')
    })
    if (t && ACTIVE_STATUSES.has(t.status) && t.kind !== 'plan') {
      this.abortTask(t.id, 'ready')
      mutate((d) => {
        const tt = d.tasks[t.id]
        tt.feedback.push({ from: 'user', text, at: now() })
        tt.priority += 5
        d.agents[role].bubble = { text: 'Got it, captain. Changing course!', at: now(), kind: 'say' }
        this.moment(d, 'user', `Captain redirected ${CREW[role].name}: "${text}"`, role)
        d.log.push({ id: nanoid(8), at: now(), taskId: t.id, agentId: role, type: 'control', level: 'info', text: `Captain redirected ${CREW[role].name} mid-task: "${text}". Restarting "${t.title}" with the new direction.` })
      })
      return
    }
    mutate((d) => {
      d.agents[role].directive = text
      d.agents[role].bubble = { text: "Noted! I'll apply that to my next task.", at: now(), kind: 'say' }
      d.log.push({ id: nanoid(8), at: now(), agentId: role, type: 'control', level: 'info', text: `Captain gave ${CREW[role].name} a standing instruction: "${text}"` })
    })
  }

  setLoadout(role: RoleId, patch: Partial<{ model: ModelRef | null; trait: import('./types').TraitId; effort: import('./types').Effort }>) {
    mutate((d) => {
      Object.assign(d.agents[role].loadout, patch)
      if (patch.model !== undefined)
        d.log.push({ id: nanoid(8), at: now(), agentId: role, type: 'loadout', level: 'info', text: `${CREW[role].name} now uses ${patch.model ? `${patch.model.providerId}/${patch.model.model}` : 'the workspace default model'}` })
    })
  }

  async askAgent(role: RoleId, question: string) {
    question = question.trim()
    if (!question) return
    const msgId = nanoid(8)
    const s = getWorld()
    const a = s.agents[role]
    const task = a.taskId ? s.tasks[a.taskId] : Object.values(s.tasks).filter((t) => t.role === role && t.finishedAt).sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0))[0]
    const art = task?.outputArtifactId ? s.artifacts[task.outputArtifactId] : undefined
    const project = this.active()
    const wasIdle = a.activity === 'idle'
    mutate((d) => {
      const ag = d.agents[role]
      ag.chat.push({ id: nanoid(8), from: 'user', text: question, at: now(), provenance: 'user' })
      ag.chat.push({ id: msgId, from: 'agent', text: '', at: now(), provenance: 'real', pending: true })
      if (ag.chat.length > 60) ag.chat.splice(0, ag.chat.length - 60)
      if (wasIdle) {
        ag.activity = 'chatting'
        ag.busyUntil = now() + 60_000
      }
      if (bump(d, 'questions') >= 5) unlockAchievement(d, 'curious_mind')
    })
    const mems = retrieveMemories(Object.values(s.memories), `${question} ${task?.title ?? ''}`, 4).map((h) => h.entry)
    const history = a.chat.slice(-6).filter((m) => !m.pending && m.text)
    const messages: ChatTurn[] = [
      { role: 'user', content: chatContext({ role, status: `${a.activity}${task ? ` on "${task.title}"` : ''}`, task, artifact: art, memories: mems, goal: project?.goal }) },
      { role: 'assistant', content: 'Understood. What would you like to know, captain?' },
      ...history.map((m) => ({ role: (m.from === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.text })),
      { role: 'user', content: question },
    ]
    try {
      const res = await this.callModel(role, null, {
        system: chatSystemPrompt(role, a.loadout.trait),
        messages,
        maxTokens: 4000,
        meta: {
          purpose: 'chat',
          role,
          goal: project?.goal,
          context: {
            name: CREW[role].name,
            question,
            status: a.activity,
            taskTitle: task?.title,
            progress: task?.progress,
            lastSummary: art?.summary,
          },
        },
      })
      mutate((d) => {
        const m = d.agents[role].chat.find((x) => x.id === msgId)
        if (m) {
          m.text = res.text.trim()
          m.pending = false
          m.provenance = res.simulated ? 'simulated' : 'real'
        }
        d.agents[role].bubble = { text: truncate(res.text.trim(), 90), at: now(), kind: 'say' }
      })
    } catch (e) {
      mutate((d) => {
        const m = d.agents[role].chat.find((x) => x.id === msgId)
        if (m) {
          m.text = `Couldn't answer: ${e instanceof Error ? e.message : String(e)}`
          m.pending = false
          m.provenance = 'real'
        }
      })
    } finally {
      mutate((d) => {
        const ag = d.agents[role]
        if (ag.activity === 'chatting') {
          ag.activity = 'idle'
          ag.busyUntil = 0
        }
      })
    }
  }

  openCrate() {
    const s = getWorld()
    if (s.game.crates <= 0) return null
    const lockedDecor = ['decor-lantern', 'decor-flowers', 'decor-windmill', 'decor-tree', 'decor-telescope'].filter((id) => !s.game.unlocked.includes(id))
    const roll = Math.random()
    let reward: { kind: 'sparks' | 'decor'; id?: string; amount?: number }
    if (roll < 0.35 && lockedDecor.length) reward = { kind: 'decor', id: lockedDecor[Math.floor(Math.random() * lockedDecor.length)] }
    else reward = { kind: 'sparks', amount: 15 + Math.floor(Math.random() * 30) }
    mutate((d) => {
      d.game.crates--
      if (reward.kind === 'decor' && reward.id) d.game.unlocked.push(reward.id)
      else d.game.sparks += reward.amount ?? 0
      if (bump(d, 'cratesOpened') >= 5) unlockAchievement(d, 'patron')
    })
    sfx('coin')
    return reward
  }

  approveAllWeb() {
    for (const a of Object.values(getWorld().approvals)) if (a.status === 'pending' && (a.kind === 'web_search' || a.kind === 'fetch_url')) this.decide(a.id, true)
  }
}

function planMarkdown(plan: ParsedPlan, tasks: Task[], deliver: Task, fallback: boolean): string {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return [
    `SUMMARY: ${plan.summary}`,
    `# ${plan.title}`,
    fallback ? '> **Note:** the planner model did not return a valid plan; this is the engine\'s minimal fallback plan.' : '',
    plan.summary,
    `**Deliverable:** ${plan.deliverable}`,
    '## Tasks',
    ...tasks.map(
      (t) =>
        `- **${t.title}** · ${CREW[t.role].name} (${CREW[t.role].title})${t.dependsOn.length ? ` · after ${t.dependsOn.map((d) => `"${byId.get(d)?.title}"`).join(', ')}` : ' · starts immediately'}${t.kind === 'review' && t.key.endsWith('-qa') ? ' · *auto-added QA*' : ''}\n  ${t.description}`,
    ),
    `- **${deliver.title}** · Juno · after all tasks · needs captain approval to ship`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const engine = new Engine()
