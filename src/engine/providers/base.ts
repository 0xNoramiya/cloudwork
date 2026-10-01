import type { Effort, RoleId, ScenarioId } from '../types'

export type Purpose = 'plan' | 'work' | 'review' | 'deliver' | 'memory' | 'chat'

export interface RequestMeta {
  purpose: Purpose
  role: RoleId
  goal?: string
  taskKey?: string
  taskTitle?: string
  taskDescription?: string
  scenario?: ScenarioId
  attempt?: number
  toolRound?: number
  /** Tool results already gathered this task (the demo model reads these; real models get them in messages). */
  toolResults?: { tool: string; ok: boolean; output: string }[]
  /** Anything the demo model needs to assemble a believable answer from real engine state. */
  context?: Record<string, unknown>
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMRequest {
  system: string
  messages: ChatTurn[]
  maxTokens: number
  effort?: Effort
  signal?: AbortSignal
  onText?: (delta: string) => void
  meta: RequestMeta
  /** Anthropic only: enable the server-side web_search tool with this many max uses (already approved by the captain). */
  serverWebSearch?: number
}

export interface LLMResult {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
  providerId: string
  simulated: boolean
  stopReason?: string
  costUsd: number | null
  /** true when the provider did not report usage and we estimated from characters */
  estimatedUsage?: boolean
  webSearches?: number
  warning?: string
}

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'refusal'
  | 'bad_request'
  | 'aborted'
  | 'not_configured'
  | 'server'
  | 'unknown'

export class ProviderError extends Error {
  kind: ProviderErrorKind
  retryable: boolean
  constructor(kind: ProviderErrorKind, message: string, retryable = false) {
    super(message)
    this.kind = kind
    this.retryable = retryable
  }
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}

export function proxyBase(path: string): string {
  return `${window.location.origin}/api/proxy/${path}`
}

export function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Placeholder the dev proxy swaps for a key from the server environment. */
export const SERVER_KEY_SENTINEL = 'use-server-key'
