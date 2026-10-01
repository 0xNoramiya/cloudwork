import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { DEFAULT_PROVIDERS } from '../engine/providers/models'
import {
  ROLE_IDS,
  type AgentState,
  type ApprovalRequest,
  type Artifact,
  type LogEvent,
  type MemoryEntry,
  type Project,
  type RoleId,
  type Settings,
  type Task,
} from '../engine/types'

enableMapSet()

export interface Discovery {
  id: string
  text: string
  agentId: RoleId
  projectTitle: string
  at: number
  collected: boolean
  rarity: 'common' | 'rare' | 'epic'
}

export interface Idea {
  id: string
  text: string
  color: string
  at: number
  sentTo?: 'memory' | 'goal'
}

export type GameEventKind =
  | 'research_breakthrough'
  | 'bottleneck'
  | 'optimization'
  | 'model_swap'
  | 'memory_conflict'
  | 'golden_hour'
  | 'supply_drop'
  | 'cat_visit'
  | 'combo'
  | 'approval_waiting'

export interface GameEvent {
  id: string
  kind: GameEventKind
  title: string
  body: string
  at: number
  expiresAt?: number
  actions: { id: string; label: string; primary?: boolean }[]
  provenance: 'real' | 'cosmetic'
  data?: Record<string, unknown>
}

export interface GameState {
  xp: number
  level: number
  sparks: number
  momentum: number
  achievements: Record<string, number>
  synergy: Record<string, number>
  unlocked: string[]
  decor: Record<string, string>
  theme: string
  skin: string
  music: string
  avatar: 'figurine' | 'bean'
  counters: Record<string, number>
  discoveries: Discovery[]
  crates: number
  sessionDays: string[]
  ideas: Idea[]
  events: GameEvent[]
  boostUntil: number
  catUntil: number
}

export interface Toast {
  id: string
  at: number
  kind: 'info' | 'success' | 'warn' | 'error' | 'achievement' | 'level' | 'xp'
  title: string
  body?: string
  agentId?: RoleId
  icon?: string
}

export type PanelId =
  | 'tasks'
  | 'memory'
  | 'artifacts'
  | 'log'
  | 'achievements'
  | 'replay'
  | 'stats'
  | 'decorate'
  | 'ideas'
  | 'discoveries'
  | 'settings'
  | 'customize'
  | 'budget'
  | 'projects'

export interface Selection {
  kind: 'agent' | 'task' | 'artifact' | 'approval' | null
  id: string | null
}

export interface UIState {
  selection: Selection
  panel: PanelId | null
  goalOpen: boolean
  toasts: Toast[]
  celebrate: { projectId: string; at: number } | null
  levelUp: { level: number; unlocks: string[]; at: number } | null
  replay: { projectId: string; t: number; playing: boolean; speed: number } | null
  decorSlot: string | null
  focus: RoleId | 'dock' | 'tree' | 'plaza' | null
  proxyAvailable: boolean | null
  started: boolean
  muted: boolean
  /** bumped when API keys change (they live in localStorage, outside the store) */
  keysVersion: number
  goalDraft: string
  /** camera auto-follows whatever just happened */
  spectate: boolean
  /** artifact open in the full-size reader */
  reader: string | null
  /** side panels tucked away for a clean view of the world */
  panelsHidden: boolean
  /** floating feedback numbers above crew members (+XP, test scores…) */
  pops: { id: string; role: RoleId; text: string; tone: 'xp' | 'good' | 'bad' | 'info'; at: number }[]
  /** Compact (phone) layout: which bottom sheet is open. The inspector sheet also opens whenever something is selected. */
  sheet: 'crew' | 'desk' | 'more' | 'menu' | null
}

export interface MemoryJob {
  taskId: string
  artifactId: string
}

export interface WorldState {
  hydrated: boolean
  sessionId: string
  agents: Record<RoleId, AgentState>
  projects: Record<string, Project>
  projectOrder: string[]
  activeProjectId: string | null
  tasks: Record<string, Task>
  artifacts: Record<string, Artifact>
  memories: Record<string, MemoryEntry>
  approvals: Record<string, ApprovalRequest>
  log: LogEvent[]
  memoryQueue: MemoryJob[]
  game: GameState
  settings: Settings
  ui: UIState
}

export function newAgent(id: RoleId): AgentState {
  return {
    id,
    activity: 'idle',
    taskId: null,
    statusText: 'Idle',
    bubble: null,
    loadout: { model: null, trait: 'balanced', effort: id === 'archivist' ? 'low' : 'medium' },
    xp: 0,
    stats: { tasksDone: 0, tasksFailed: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, workMs: 0, handoffs: 0, reworks: 0 },
    recent: [],
    visitTarget: null,
    carrying: null,
    chat: [],
    badges: [],
    directive: null,
    busyUntil: 0,
  }
}

export function defaultSettings(): Settings {
  return {
    providers: DEFAULT_PROVIDERS.map((p) => ({ ...p, models: [...p.models] })),
    defaultModel: { providerId: 'demo', model: 'cloudworks-sim-1' },
    budgetUsd: 2,
    turbo: false,
    autoApproveWeb: false,
    webhookUrl: '',
    maxParallel: 6,
    demoSpeed: 1,
    refusalFallback: true,
    reviewPlan: false,
    volume: { master: 0.7, music: 0.35, sfx: 0.7 },
    quality: 'high',
    showLabels: true,
  }
}

export function defaultGame(): GameState {
  return {
    xp: 0,
    level: 1,
    sparks: 25,
    momentum: 35,
    achievements: {},
    synergy: {},
    unlocked: ['theme-daybreak', 'skin-parchment', 'music-drift', 'decor-plant', 'decor-crates'],
    decor: { 'plaza-a': 'decor-plant', 'dock-a': 'decor-crates' },
    theme: 'theme-daybreak',
    skin: 'skin-parchment',
    music: 'music-drift',
    avatar: 'figurine',
    counters: {},
    discoveries: [],
    crates: 1,
    sessionDays: [],
    ideas: [],
    events: [],
    boostUntil: 0,
    catUntil: 0,
  }
}

function initialAgents(): Record<RoleId, AgentState> {
  return Object.fromEntries(ROLE_IDS.map((r) => [r, newAgent(r)])) as Record<RoleId, AgentState>
}

export const useWorld = create<WorldState>()(
  immer(() => ({
    hydrated: false,
    sessionId: `s-${Date.now().toString(36)}`,
    agents: initialAgents(),
    projects: {},
    projectOrder: [],
    activeProjectId: null,
    tasks: {},
    artifacts: {},
    memories: {},
    approvals: {},
    log: [],
    memoryQueue: [],
    game: defaultGame(),
    settings: defaultSettings(),
    ui: {
      selection: { kind: null, id: null },
      panel: null,
      goalOpen: false,
      toasts: [],
      celebrate: null,
      levelUp: null,
      replay: null,
      decorSlot: null,
      focus: null,
      proxyAvailable: null,
      started: false,
      muted: false,
      keysVersion: 0,
      goalDraft: '',
      spectate: false,
      reader: null,
      panelsHidden: false,
      pops: [],
      sheet: null,
    },
  })),
)

export type Draft = WorldState
export const getWorld = useWorld.getState
/** Immer-style update. The recipe's return value is ignored, so helpers that return ids are safe to call inline. */
export function mutate(fn: (s: Draft) => unknown) {
  useWorld.setState((s) => {
    fn(s)
  })
}

export function projectTasks(s: WorldState, projectId: string): Task[] {
  const p = s.projects[projectId]
  if (!p) return []
  return p.taskIds.map((id) => s.tasks[id]).filter(Boolean)
}
