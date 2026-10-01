import type { ProviderConfig } from '../types'

/** USD per 1M tokens [input, output]. `est` marks prices we could not verify at build time. */
interface Price {
  in: number
  out: number
  est?: boolean
}

const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { in: 10, out: 50 },
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'gpt-5': { in: 1.25, out: 10, est: true },
  'gpt-5-mini': { in: 0.25, out: 2, est: true },
  'gpt-4.1': { in: 2, out: 8, est: true },
  'gpt-4.1-mini': { in: 0.4, out: 1.6, est: true },
  'gpt-4o': { in: 2.5, out: 10, est: true },
  'gpt-4o-mini': { in: 0.15, out: 0.6, est: true },
}

export function priceFor(model: string): Price | null {
  if (PRICES[model]) return PRICES[model]
  // OpenRouter-style ids: vendor/model
  const bare = model.includes('/') ? model.split('/').pop()! : model
  return PRICES[bare] ?? null
}

export function costFor(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model)
  if (!p) return null
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000
}

/** Anthropic models that accept output_config.effort. */
export function supportsEffort(model: string): boolean {
  return /claude-(fable|mythos|opus-5|opus-4-[5-9]|sonnet-5|sonnet-4-6)/.test(model)
}

/** Anthropic models where server-side refusal fallbacks (`fallbacks: "default"`) apply. */
export function supportsFallback(model: string): boolean {
  return ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'].includes(model)
}

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'demo',
    kind: 'demo',
    label: 'Demo (simulated)',
    models: ['cloudworks-sim-1'],
    useProxy: false,
    enabled: true,
  },
  {
    id: 'anthropic',
    kind: 'anthropic',
    label: 'Anthropic',
    models: [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-4-5',
      'claude-fable-5-1',
      'claude-opus-5',
      'claude-sonnet-5',
    ],
    useProxy: true,
    enabled: true,
  },
  {
    id: 'openai',
    kind: 'openai',
    label: 'OpenAI',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
    useProxy: true,
    enabled: true,
  },
  {
    id: 'openrouter',
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
    useProxy: true,
    enabled: true,
  },
  {
    id: 'local',
    kind: 'openai-compatible',
    label: 'Local / OpenAI-compatible',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'qwen2.5'],
    useProxy: true,
    enabled: true,
  },
]
