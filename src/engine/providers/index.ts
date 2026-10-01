import type { ModelRef, ProviderConfig, Settings } from '../types'
import { ProviderError, type LLMRequest, type LLMResult } from './base'
import { demoComplete } from './demo'

const KEY_STORE = 'cloudworks.keys.v1'

/** API keys live only in this browser's localStorage — never in the saved world state, logs or exports. */
export function loadKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY_STORE) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function saveKey(providerId: string, key: string) {
  const keys = loadKeys()
  if (key) keys[providerId] = key
  else delete keys[providerId]
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(keys))
  } catch {
    /* storage blocked: key stays for this session only */
    sessionKeys[providerId] = key
  }
}

const sessionKeys: Record<string, string> = {}

export function keyFor(providerId: string): string {
  return loadKeys()[providerId] ?? sessionKeys[providerId] ?? ''
}

export function providerReady(p: ProviderConfig): boolean {
  if (!p.enabled) return false
  if (p.kind === 'demo') return true
  if (p.kind === 'openai-compatible') return Boolean(p.baseUrl)
  return Boolean(keyFor(p.id)) || Boolean(p.serverKey && p.useProxy)
}

export async function complete(settings: Settings, ref: ModelRef, req: LLMRequest): Promise<LLMResult> {
  const cfg = settings.providers.find((p) => p.id === ref.providerId)
  if (!cfg) throw new ProviderError('not_configured', `Provider "${ref.providerId}" is not configured.`)
  if (!cfg.enabled) throw new ProviderError('not_configured', `${cfg.label} is disabled in settings.`)
  if (cfg.kind === 'demo') return demoComplete(req, settings.demoSpeed)
  const key = keyFor(cfg.id)
  if (!key && !(cfg.serverKey && cfg.useProxy) && cfg.kind !== 'openai-compatible') {
    throw new ProviderError('not_configured', `No API key for ${cfg.label}. Add one in ⚙️ Settings → Models (BYOK).`)
  }
  // Provider SDKs load on first use so demo-only sessions never download them.
  if (cfg.kind === 'anthropic') {
    const { anthropicComplete } = await import('./anthropic')
    return anthropicComplete(cfg, key, ref.model, req, { refusalFallback: settings.refusalFallback })
  }
  const { openaiCompatComplete } = await import('./openaiCompat')
  return openaiCompatComplete(cfg, key, ref.model, req)
}

export { ProviderError } from './base'
export type { LLMRequest, LLMResult } from './base'
