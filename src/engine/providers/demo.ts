import { ProviderError, estimateTokens, type LLMRequest, type LLMResult } from './base'
import {
  demoChat,
  demoDeliver,
  demoMemory,
  demoPlan,
  demoReview,
  demoWork,
  type DemoInput,
  type WorkCtx,
} from './demoScripts'
import type { ScenarioId } from '../types'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError('aborted', 'Request cancelled'))
    const onAbort = () => {
      clearTimeout(t)
      reject(new ProviderError('aborted', 'Request cancelled'))
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function compose(req: LLMRequest): string {
  const { meta } = req
  const c = (meta.context ?? {}) as Record<string, unknown>
  const scenario = (meta.scenario ?? 'research') as ScenarioId
  switch (meta.purpose) {
    case 'plan':
      return demoPlan(meta.goal ?? '', scenario)
    case 'work': {
      const ctx: WorkCtx = {
        goal: meta.goal ?? '',
        scenario,
        taskTitle: meta.taskTitle ?? '',
        taskDescription: meta.taskDescription ?? '',
        attempts: meta.attempt ?? 1,
        feedback: (c.feedback as string[]) ?? [],
        answer: c.answer as string | undefined,
        inputs: (c.inputs as DemoInput[]) ?? [],
        memories: (c.memories as string[]) ?? [],
        toolResults: meta.toolResults ?? [],
        toolRound: meta.toolRound ?? 0,
      }
      return demoWork(meta.role, ctx).text
    }
    case 'review':
      return demoReview({
        scenario,
        targetRole: String(c.targetRole ?? ''),
        targetTitle: String(c.targetTitle ?? ''),
        reworks: Number(c.targetReworks ?? 0),
        tests: c.tests as { passed: number; total: number; failures: string[]; ran: boolean } | undefined,
      })
    case 'deliver':
      return demoDeliver({
        title: String(c.title ?? 'Deliverable'),
        planSummary: c.planSummary as string | undefined,
        artifacts: (c.artifacts as DemoInput[]) ?? [],
        feedback: (c.feedback as string[]) ?? [],
      })
    case 'memory':
      return demoMemory({
        title: String(c.title ?? ''),
        role: meta.role,
        summary: String(c.summary ?? ''),
        discoveries: (c.discoveries as string[]) ?? [],
        goal: meta.goal ?? '',
      })
    case 'chat':
      return demoChat({
        question: String(c.question ?? ''),
        status: String(c.status ?? ''),
        taskTitle: c.taskTitle as string | undefined,
        progress: c.progress as number | undefined,
        lastSummary: c.lastSummary as string | undefined,
      })
  }
}

/**
 * The Demo "model": returns scripted text for the request's purpose, streamed with human-ish pacing.
 * It never pretends to be a real model — results are flagged `simulated` and cost $0.
 */
export async function demoComplete(req: LLMRequest, speed: number): Promise<LLMResult> {
  const text = compose(req)
  const s = Math.max(0.25, speed)
  const quick = req.meta.purpose === 'memory' || req.meta.purpose === 'chat'
  await sleep((quick ? 350 : 700 + Math.random() * 900) / s, req.signal)
  let i = 0
  while (i < text.length) {
    const n = 4 + Math.floor(Math.random() * 10)
    req.onText?.(text.slice(i, i + n))
    i += n
    const pause = Math.random() < 0.04 ? 260 : 18 + Math.random() * 26
    await sleep(pause / s / (quick ? 3 : 1), req.signal)
  }
  const inputText = req.system + req.messages.map((m) => m.content).join('\n')
  return {
    text,
    inputTokens: estimateTokens(inputText),
    outputTokens: estimateTokens(text),
    model: 'cloudworks-sim-1',
    providerId: 'demo',
    simulated: true,
    costUsd: 0,
    estimatedUsage: true,
  }
}
