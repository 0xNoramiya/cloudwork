import Anthropic from '@anthropic-ai/sdk'
import type { ProviderConfig } from '../types'
import { ProviderError, SERVER_KEY_SENTINEL, estimateTokens, proxyBase, type LLMRequest, type LLMResult } from './base'
import { costFor, supportsEffort, supportsFallback } from './models'

function mapError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e
  if (e instanceof Anthropic.APIUserAbortError) return new ProviderError('aborted', 'Request cancelled')
  if (e instanceof Anthropic.AuthenticationError) return new ProviderError('auth', 'Anthropic rejected the API key (401).')
  if (e instanceof Anthropic.PermissionDeniedError) return new ProviderError('auth', 'Anthropic: permission denied (403).')
  if (e instanceof Anthropic.RateLimitError) return new ProviderError('rate_limit', 'Anthropic rate limit hit (429).', true)
  if (e instanceof Anthropic.BadRequestError) return new ProviderError('bad_request', `Anthropic 400: ${e.message}`)
  if (e instanceof Anthropic.NotFoundError) return new ProviderError('bad_request', `Anthropic 404 (unknown model?): ${e.message}`)
  if (e instanceof Anthropic.InternalServerError) return new ProviderError('server', `Anthropic server error: ${e.message}`, true)
  if (e instanceof Anthropic.APIConnectionError)
    return new ProviderError('network', 'Could not reach Anthropic (network/CORS). Is the dev proxy running?', true)
  if (e instanceof Anthropic.APIError) return new ProviderError('unknown', `Anthropic ${e.status}: ${e.message}`, true)
  return new ProviderError('unknown', e instanceof Error ? e.message : String(e))
}

export async function anthropicComplete(
  cfg: ProviderConfig,
  apiKey: string,
  model: string,
  req: LLMRequest,
  opts: { refusalFallback: boolean },
): Promise<LLMResult> {
  const client = new Anthropic({
    apiKey: apiKey || SERVER_KEY_SENTINEL,
    baseURL: cfg.useProxy ? proxyBase('anthropic') : undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  })

  const base: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
  }
  if (supportsEffort(model) && req.effort) base.output_config = { effort: req.effort }
  let warning: string | undefined
  let searchTool = req.serverWebSearch ? webSearchTool(model, req.serverWebSearch) : null

  const run = async (params: Anthropic.Beta.MessageCreateParamsNonStreaming, withFallback: boolean) => {
    const full: Anthropic.Beta.MessageCreateParamsNonStreaming = withFallback
      ? { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
      : params
    const stream = client.beta.messages.stream(full, { signal: req.signal })
    stream.on('text', (delta) => req.onText?.(delta))
    return stream.finalMessage()
  }

  let wantFallback = opts.refusalFallback && supportsFallback(model)
  const attempt = async (params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> => {
    try {
      return await run(searchTool ? { ...params, tools: [searchTool] } : params, wantFallback)
    } catch (e) {
      // Degrade gracefully when an optional feature is rejected for this account or model.
      if (e instanceof Anthropic.BadRequestError && wantFallback && /fallback/i.test(e.message)) {
        wantFallback = false
        return attempt(params)
      }
      if (e instanceof Anthropic.BadRequestError && searchTool && /tool|web_search/i.test(e.message)) {
        searchTool = null
        warning = `Web search tool unavailable (${e.message}); continued without it.`
        return attempt(params)
      }
      throw mapError(e)
    }
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [...req.messages]
  let msg = await attempt(base)
  let text = collectText(msg)
  let inputTokens = usageIn(msg)
  let outputTokens = msg.usage.output_tokens ?? 0
  let searches = msg.usage.server_tool_use?.web_search_requests ?? 0
  // Long server-tool turns can pause; resume up to twice by echoing the partial assistant turn.
  for (let i = 0; i < 2 && msg.stop_reason === 'pause_turn'; i++) {
    // max_uses applies per request, so continuations only get what is left of the approved search budget.
    if (searchTool && req.serverWebSearch) {
      const left = req.serverWebSearch - searches
      if (left <= 0) {
        warning = 'Stopped a paused turn early: the approved web-search budget is used up.'
        break
      }
      searchTool = webSearchTool(model, left)
    }
    messages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] })
    msg = await attempt({ ...base, messages })
    text += collectText(msg)
    inputTokens += usageIn(msg)
    outputTokens += msg.usage.output_tokens ?? 0
    searches += msg.usage.server_tool_use?.web_search_requests ?? 0
  }

  if (msg.stop_reason === 'refusal') {
    const category = msg.stop_details?.category ?? 'unspecified'
    throw new ProviderError('refusal', `The model declined this request (category: ${category}).`)
  }
  if (!outputTokens) outputTokens = estimateTokens(text)
  const tokenCost = costFor(model, inputTokens, outputTokens)
  return {
    text,
    inputTokens,
    outputTokens,
    model: msg.model ?? model,
    providerId: cfg.id,
    simulated: false,
    stopReason: msg.stop_reason ?? undefined,
    costUsd: tokenCost === null ? null : tokenCost + searches * WEB_SEARCH_USD,
    webSearches: searches,
    warning,
  }
}

/** Anthropic bills server-side web search per request ($10 per 1,000). */
const WEB_SEARCH_USD = 0.01

function webSearchTool(model: string, maxUses: number): Anthropic.Beta.BetaToolUnion {
  const dynamic = /claude-(fable|mythos|opus-5|opus-4-[6-9]|sonnet-5|sonnet-4-6)/.test(model)
  return { type: dynamic ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: maxUses } as Anthropic.Beta.BetaToolUnion
}

function collectText(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function usageIn(msg: Anthropic.Beta.BetaMessage): number {
  return (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0)
}
