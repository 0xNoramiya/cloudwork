import { retrieveMemories } from './memory'
import { runInSandbox, formatTestReport } from './sandbox'
import type { MemoryEntry } from './types'

export interface ToolOutcome {
  ok: boolean
  output: string
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal })
  const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`)
  return body
}

export async function toolWebSearch(query: string, signal?: AbortSignal): Promise<ToolOutcome> {
  if (!query.trim()) return { ok: false, output: 'Empty query.' }
  try {
    const data = (await getJson(`/api/search?q=${encodeURIComponent(query)}`, signal)) as {
      results: { title: string; url: string; snippet: string }[]
      engine: string
    }
    if (!data.results?.length) return { ok: false, output: `No results for "${query}" (${data.engine}).` }
    return {
      ok: true,
      output: [
        `Search results for "${query}" (via ${data.engine}):`,
        ...data.results.slice(0, 6).map((r, i) => `${i + 1}. ${r.title} — ${r.url}\n   ${r.snippet}`),
      ].join('\n'),
    }
  } catch (e) {
    return { ok: false, output: `Web search failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function toolFetchUrl(url: string, signal?: AbortSignal): Promise<ToolOutcome> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, output: `Not an http(s) URL: ${url}` }
  try {
    const data = (await getJson(`/api/fetch?url=${encodeURIComponent(url)}`, signal)) as {
      title: string
      text: string
      url: string
      truncated: boolean
    }
    return {
      ok: true,
      output: `# ${data.title || data.url}\nURL: ${data.url}\n\n${data.text}${data.truncated ? '\n…[page truncated]' : ''}`,
    }
  } catch (e) {
    return { ok: false, output: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function toolMemorySearch(memories: MemoryEntry[], query: string): ToolOutcome {
  const hits = retrieveMemories(memories, query, 8)
  if (hits.length === 0) return { ok: true, output: `No memories match "${query}".` }
  return {
    ok: true,
    output: hits.map((h) => `- [${h.entry.kind}] ${h.entry.text} (from ${h.entry.source.projectTitle ?? 'earlier work'})`).join('\n'),
  }
}

export async function toolRunJs(code: string, signal?: AbortSignal): Promise<ToolOutcome> {
  const run = await runInSandbox(code, undefined, 4000, signal)
  return { ok: run.ok, output: formatTestReport(run) || 'Ran with no output.' }
}
