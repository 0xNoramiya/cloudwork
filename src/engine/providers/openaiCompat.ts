import OpenAI from 'openai'
import type { ProviderConfig } from '../types'
import { ProviderError, SERVER_KEY_SENTINEL, b64url, estimateTokens, proxyBase, type LLMRequest, type LLMResult } from './base'
import { costFor } from './models'

function baseUrlFor(cfg: ProviderConfig): string {
  const direct =
    cfg.kind === 'openai' ? 'https://api.openai.com/v1' : cfg.kind === 'openrouter' ? 'https://openrouter.ai/api/v1' : cfg.baseUrl
  if (!direct) throw new ProviderError('not_configured', `${cfg.label} has no base URL configured.`)
  if (!cfg.useProxy) return direct
  if (cfg.kind === 'openai') return proxyBase('openai/v1')
  if (cfg.kind === 'openrouter') return proxyBase('openrouter/v1')
  return proxyBase(`custom/${b64url(direct.replace(/\/+$/, ''))}`)
}

function mapError(e: unknown, label: string): ProviderError {
  if (e instanceof ProviderError) return e
  if (e instanceof OpenAI.APIUserAbortError) return new ProviderError('aborted', 'Request cancelled')
  if (e instanceof OpenAI.AuthenticationError) return new ProviderError('auth', `${label} rejected the API key (401).`)
  if (e instanceof OpenAI.PermissionDeniedError) return new ProviderError('auth', `${label}: permission denied (403).`)
  if (e instanceof OpenAI.UnprocessableEntityError) return new ProviderError('bad_request', `${label} 422: ${e.message}`)
  if (e instanceof OpenAI.RateLimitError) return new ProviderError('rate_limit', `${label} rate limit hit (429).`, true)
  if (e instanceof OpenAI.BadRequestError) return new ProviderError('bad_request', `${label} 400: ${e.message}`)
  if (e instanceof OpenAI.NotFoundError) return new ProviderError('bad_request', `${label} 404 (unknown model?): ${e.message}`)
  if (e instanceof OpenAI.APIConnectionError)
    return new ProviderError('network', `Could not reach ${label} (network/CORS or server down).`, true)
  if (e instanceof OpenAI.APIError) return new ProviderError('server', `${label} ${e.status}: ${e.message}`, true)
  return new ProviderError('unknown', e instanceof Error ? e.message : String(e))
}

export async function openaiCompatComplete(
  cfg: ProviderConfig,
  apiKey: string,
  model: string,
  req: LLMRequest,
): Promise<LLMResult> {
  const client = new OpenAI({
    apiKey: apiKey || SERVER_KEY_SENTINEL,
    baseURL: baseUrlFor(cfg),
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  })
  const isOpenAI = cfg.kind === 'openai'
  let text = ''
  let inputTokens = 0
  let outputTokens = 0
  let usageReported = false
  let finish: string | undefined
  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        stream: true,
        ...(isOpenAI ? { max_completion_tokens: req.maxTokens } : { max_tokens: req.maxTokens }),
        ...(cfg.kind === 'openai' || cfg.kind === 'openrouter' ? { stream_options: { include_usage: true } } : {}),
      },
      { signal: req.signal },
    )
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        text += delta
        req.onText?.(delta)
      }
      if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason
      if (chunk.usage) {
        usageReported = true
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }
    }
  } catch (e) {
    throw mapError(e, cfg.label)
  }
  if (!usageReported) {
    inputTokens = estimateTokens(req.system + req.messages.map((m) => m.content).join('\n'))
    outputTokens = estimateTokens(text)
  }
  if (finish === 'content_filter') throw new ProviderError('refusal', `${cfg.label} filtered this response (content_filter).`)
  return {
    text,
    inputTokens,
    outputTokens,
    model,
    providerId: cfg.id,
    simulated: false,
    stopReason: finish,
    costUsd: costFor(model, inputTokens, outputTokens),
    estimatedUsage: !usageReported,
  }
}
