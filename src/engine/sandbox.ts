export interface SandboxTestResult {
  name: string
  passed: boolean
  error?: string
  ms: number
}

export interface SandboxRun {
  ok: boolean
  error?: string
  logs: string[]
  results: SandboxTestResult[]
  value?: string
  timedOut?: boolean
  ms: number
}

/** Execute JavaScript (and optional tests) in a throwaway Web Worker with a hard timeout. */
export function runInSandbox(code: string, tests?: string, timeoutMs = 4000, signal?: AbortSignal): Promise<SandboxRun> {
  const started = performance.now()
  return new Promise((resolve) => {
    if (/\bimport\s*\(/.test(`${code}\n${tests ?? ''}`)) {
      resolve({ ok: false, error: 'Dynamic import() is not allowed in the sandbox (no network access).', logs: [], results: [], ms: 0 })
      return
    }
    if (signal?.aborted) {
      resolve({ ok: false, error: 'Cancelled', logs: [], results: [], ms: 0 })
      return
    }
    const worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' })
    // Unguessable id so sandboxed code can't forge a result message.
    const id = crypto.randomUUID()
    const onAbort = () => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ ok: false, error: 'Cancelled', logs: [], results: [], ms: Math.round(performance.now() - started) })
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({
        ok: false,
        timedOut: true,
        error: `Timed out after ${timeoutMs}ms (infinite loop or very slow code?)`,
        logs: [],
        results: [],
        ms: timeoutMs,
      })
    }, timeoutMs)
    worker.onmessage = (e: MessageEvent<Omit<SandboxRun, 'ms'> & { id: string }>) => {
      if (e.data.id !== id) return
      signal?.removeEventListener('abort', onAbort)
      clearTimeout(timer)
      worker.terminate()
      resolve({ ...e.data, ms: Math.round(performance.now() - started) })
    }
    worker.onerror = (e) => {
      signal?.removeEventListener('abort', onAbort)
      clearTimeout(timer)
      worker.terminate()
      resolve({ ok: false, error: e.message || 'Sandbox worker crashed', logs: [], results: [], ms: Math.round(performance.now() - started) })
    }
    worker.postMessage({ id, code, tests })
  })
}

export function formatTestReport(run: SandboxRun): string {
  const passed = run.results.filter((r) => r.passed).length
  const lines: string[] = []
  if (!run.ok) lines.push(`Sandbox error: ${run.error}`)
  if (run.results.length) {
    lines.push(`Tests: ${passed}/${run.results.length} passed (${run.ms}ms)`)
    for (const r of run.results) lines.push(`${r.passed ? '✔' : '✘'} ${r.name}${r.passed ? '' : ` — ${r.error}`}`)
  } else if (run.ok) {
    lines.push('No tests were registered.')
  }
  if (run.logs.length) lines.push('Console:', ...run.logs.slice(0, 20).map((l) => `  ${l}`))
  if (run.value) lines.push(`Result: ${run.value}`)
  return lines.join('\n')
}
