export type RoleId =
  | 'planner'
  | 'researcher'
  | 'coder'
  | 'writer'
  | 'designer'
  | 'analyst'
  | 'qa'
  | 'archivist'

export const ROLE_IDS: RoleId[] = [
  'planner',
  'researcher',
  'coder',
  'writer',
  'designer',
  'analyst',
  'qa',
  'archivist',
]

/** Roles the planner may assign work to (planner + archivist have fixed duties). */
export const WORK_ROLES: RoleId[] = ['researcher', 'coder', 'writer', 'designer', 'analyst', 'qa']

export type AgentActivity =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'tool'
  | 'awaiting_approval'
  | 'needs_input'
  | 'blocked'
  | 'handoff'
  | 'memory'
  | 'celebrating'
  | 'paused'
  | 'error'
  | 'chatting'
  | 'meeting'

export type Provenance = 'real' | 'simulated' | 'user' | 'cosmetic'

export interface ModelRef {
  providerId: string
  model: string
}

export type TraitId = 'balanced' | 'concise' | 'thorough' | 'creative' | 'skeptical'
export type Effort = 'low' | 'medium' | 'high'

export interface Loadout {
  model: ModelRef | null // null = workspace default
  trait: TraitId
  effort: Effort
}

export interface AgentStats {
  tasksDone: number
  tasksFailed: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  workMs: number
  handoffs: number
  reworks: number
}

export interface Bubble {
  text: string
  at: number
  kind: 'say' | 'think' | 'alert' | 'happy'
}

export interface AgentState {
  id: RoleId
  activity: AgentActivity
  taskId: string | null
  statusText: string
  bubble: Bubble | null
  loadout: Loadout
  xp: number
  stats: AgentStats
  recent: { at: number; text: string }[]
  /** For world animation: which agent this one is walking to (handoff / review / memory). */
  visitTarget: RoleId | 'dock' | 'tree' | 'plaza' | null
  carrying: 'parcel' | 'stamp-ok' | 'stamp-bad' | 'orb' | 'letter' | null
  chat: ChatMessage[]
  badges: string[]
  /** A captain's instruction waiting to be applied to this agent's next task. */
  directive: string | null
  /** When the current visit/meeting/celebration ends (engine-controlled). */
  busyUntil: number
}

export interface ChatMessage {
  id: string
  from: 'user' | 'agent'
  text: string
  at: number
  provenance: Provenance
  pending?: boolean
}

export type TaskStatus =
  | 'pending'
  | 'handoff'
  | 'ready'
  | 'running'
  | 'awaiting_approval'
  | 'needs_input'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'paused'

export type TaskKind = 'plan' | 'work' | 'review' | 'deliver'

export interface TaskFeedback {
  from: 'user' | 'qa' | 'system'
  text: string
  at: number
}

export interface ToolCallRecord {
  id: string
  tool: ToolName
  input: Record<string, unknown>
  status: 'pending_approval' | 'running' | 'ok' | 'error' | 'rejected'
  output?: string
  at: number
  approvalId?: string
}

export type ToolName = 'web_search' | 'fetch_url' | 'memory_search' | 'run_js' | 'ask_user'

export interface Task {
  id: string
  projectId: string
  key: string
  title: string
  description: string
  role: RoleId
  kind: TaskKind
  dependsOn: string[]
  priority: number
  status: TaskStatus
  /** how many times the task has been started (restarts after pause/redirect included) */
  attempts: number
  /** failed runs; a retryable failure is retried while failures < maxAttempts */
  failures: number
  /** times QA sent this work back */
  reworks: number
  maxAttempts: number
  createdAt: number
  readyAt?: number
  handoffUntil?: number
  startedAt?: number
  finishedAt?: number
  progress: number
  estimateSec: number
  outputArtifactId?: string
  error?: string
  feedback: TaskFeedback[]
  streamText: string
  reviewOf?: string
  modelUsed?: string
  providerUsed?: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  toolCalls: ToolCallRecord[]
  question?: string
  answer?: string
  summary?: string
  verdict?: 'pass' | 'fail'
  /** earliest time the scheduler may start this task (retry backoff) */
  notBefore?: number
  /** QA caught a real failure in this task (used for the "Caught in the Act" achievement) */
  caught?: boolean
}

export type ArtifactKind =
  | 'plan'
  | 'research'
  | 'code'
  | 'markdown'
  | 'design'
  | 'data'
  | 'test_report'
  | 'review'
  | 'deliverable'

export interface Artifact {
  id: string
  projectId: string
  taskId: string
  agentId: RoleId
  kind: ArtifactKind
  title: string
  content: string
  summary: string
  createdAt: number
  provenance: Provenance
  status: 'draft' | 'final' | 'rejected' | 'approved'
  version: number
  model?: string
  /** "DISCOVERY:" lines from the raw response (stripped from the displayed content) */
  discoveries?: string[]
}

export type MemoryKind = 'fact' | 'decision' | 'preference' | 'discovery' | 'summary' | 'lesson'

export interface MemoryEntry {
  id: string
  text: string
  kind: MemoryKind
  tags: string[]
  source: { agent: RoleId | 'user'; taskId?: string; projectId?: string; projectTitle?: string }
  createdAt: number
  sessionId: string
  uses: number
  lastUsedAt?: number
  pinned: boolean
  provenance: Provenance
  conflictWith?: string
}

export type ApprovalKind = 'fetch_url' | 'web_search' | 'webhook_post' | 'ship' | 'plan'

export interface ApprovalRequest {
  id: string
  projectId: string
  taskId: string
  agentId: RoleId
  kind: ApprovalKind
  title: string
  detail: string
  payload: Record<string, unknown>
  risk: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  decidedAt?: number
  note?: string
}

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

export interface LogEvent {
  id: string
  at: number
  projectId?: string
  agentId?: RoleId
  taskId?: string
  type: string
  text: string
  level: LogLevel
  provenance?: Provenance
  data?: Record<string, unknown>
}

export type ProjectStatus = 'planning' | 'running' | 'paused' | 'delivering' | 'done' | 'failed' | 'cancelled'

export interface TimelineFrame {
  t: number
  a: Record<string, [AgentActivity, string | null]>
  s: Record<string, TaskStatus>
  m: number
}

export interface KeyMoment {
  t: number
  kind: 'plan' | 'start' | 'done' | 'fail' | 'handoff' | 'approval' | 'rework' | 'memory' | 'event' | 'deliver' | 'user'
  text: string
  agentId?: RoleId
}

export interface Project {
  id: string
  goal: string
  title: string
  status: ProjectStatus
  createdAt: number
  finishedAt?: number
  planSummary?: string
  deliverableDescription?: string
  taskIds: string[]
  deliverableId?: string
  mode: 'live' | 'demo'
  sessionId: string
  timeline: TimelineFrame[]
  moments: KeyMoment[]
  pausedAt?: number
  costUsd: number
  tokens: number
  peakParallel: number
  memoriesUsed: number
  memoriesFromEarlierSessions: number
  bottlenecksResolved: number
}

export interface ProviderConfig {
  id: string
  kind: 'demo' | 'anthropic' | 'openai' | 'openrouter' | 'openai-compatible'
  label: string
  baseUrl?: string
  models: string[]
  useProxy: boolean
  /** true when the dev server has a key for this provider in its environment */
  serverKey?: boolean
  /** proxy was switched off automatically because no local API was found (re-enabled when it returns) */
  proxyAutoOff?: boolean
  enabled: boolean
}

export interface Settings {
  providers: ProviderConfig[]
  defaultModel: ModelRef
  budgetUsd: number
  turbo: boolean
  autoApproveWeb: boolean
  webhookUrl: string
  maxParallel: number
  demoSpeed: number
  refusalFallback: boolean
  /** pause after planning so the captain can edit/approve the task graph */
  reviewPlan: boolean
  volume: { master: number; music: number; sfx: number }
  quality: 'low' | 'high'
  showLabels: boolean
}

export type ScenarioId = 'code' | 'launch' | 'content' | 'research'
