import type { ToolName } from './types'

export interface CodeBlock {
  lang: string
  info: string
  code: string
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/g

export function extractCodeBlocks(text: string): CodeBlock[] {
  const out: CodeBlock[] = []
  for (const m of text.matchAll(FENCE)) {
    const info = m[1].trim()
    out.push({ lang: info.split(/\s+/)[0]?.toLowerCase() ?? '', info, code: m[2] })
  }
  return out
}

// TypeScript is deliberately excluded: `new Function` can't parse type annotations.
const JS_LANGS = new Set(['js', 'javascript', 'mjs', 'cjs', 'node'])

export function findSolutionAndTests(text: string): { solution?: CodeBlock; tests?: CodeBlock; otherLang?: string } {
  const blocks = extractCodeBlocks(text).filter((b) => b.lang !== 'tool' && b.lang !== 'svg' && b.lang !== 'chart')
  if (blocks.length === 0) return {}
  const js = blocks.filter((b) => JS_LANGS.has(b.lang))
  if (js.length === 0) return { otherLang: blocks[0].lang || 'unknown' }
  const tests = js.find((b) => /test/i.test(b.info) || (/\btest\s*\(/.test(b.code) && /expect\s*\(/.test(b.code)))
  const solution = js.find((b) => b !== tests && !/test/i.test(b.info)) ?? js.find((b) => b !== tests)
  // A single block holding both the code and its tests runs as-is.
  if (!solution && tests) return { solution: tests }
  return { solution, tests }
}

export function extractSummary(text: string): string {
  const m = text.match(/^\s*SUMMARY:\s*(.+)$/m)
  if (m) return m[1].trim().slice(0, 220)
  const first = text
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim())
    .find((l) => l.length > 12)
  return (first ?? text.slice(0, 160)).slice(0, 220)
}

export function extractDiscoveries(text: string): string[] {
  return [...text.matchAll(/^\s*DISCOVERY:\s*(.+)$/gm)].map((m) => m[1].trim()).slice(0, 3)
}

/** Remove protocol lines (SUMMARY/DISCOVERY/VERDICT/ISSUE markers) from displayed content. */
export function cleanContent(text: string): string {
  return text
    .replace(/^\s*SUMMARY:.*$/m, '')
    .replace(/^\s*DISCOVERY:.*$/gm, '')
    .replace(/^\s*VERDICT:.*$/gm, '')
    .trim()
}

export interface ToolCall {
  tool: ToolName
  input: Record<string, unknown>
}

const TOOL_NAMES: ToolName[] = ['web_search', 'fetch_url', 'memory_search', 'run_js', 'ask_user']

export function extractToolCall(text: string): ToolCall | null {
  const m = text.match(/```tool\s*\n([\s\S]*?)```/)
  let raw = m?.[1]
  if (!raw) {
    // Some models answer with a bare JSON object when asked to call a tool.
    const trimmed = text.trim()
    if (trimmed.startsWith('{') && trimmed.includes('"tool"')) raw = trimmed
  }
  if (!raw) return null
  const obj = safeJson(raw)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const rec = obj as Record<string, unknown>
  const tool = rec.tool as ToolName
  if (!TOOL_NAMES.includes(tool)) return null
  const { tool: _omit, ...input } = rec
  void _omit
  return { tool, input: (rec.input as Record<string, unknown>) ?? input }
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Pull the first balanced JSON object/array out of a model response (handles fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/)
  if (fenced) {
    const v = safeJson(fenced[1])
    if (v !== undefined) return v
  }
  const start = text.search(/[[{]/)
  if (start < 0) return undefined
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return safeJson(text.slice(start, i + 1))
    }
  }
  return undefined
}

export function parseVerdict(text: string): { verdict: 'pass' | 'fail' | null; issues: string[] } {
  const v = text.match(/VERDICT:\s*(PASS|FAIL)/i)
  const issues = [...text.matchAll(/^\s*[-*]?\s*ISSUE:\s*(.+)$/gim)].map((m) => m[1].trim())
  return { verdict: v ? (v[1].toLowerCase() as 'pass' | 'fail') : null, issues }
}

export function extractSvg(text: string): string | null {
  const block = extractCodeBlocks(text).find((b) => b.lang === 'svg' || b.code.trim().startsWith('<svg'))
  if (block) return block.code.trim()
  const inline = text.match(/<svg[\s\S]*?<\/svg>/)
  return inline ? inline[0] : null
}

export interface ChartSpec {
  type: 'bar'
  title?: string
  labels: string[]
  values: number[]
  unit?: string
}

export function extractChart(text: string): ChartSpec | null {
  const block = extractCodeBlocks(text).find((b) => b.lang === 'chart')
  if (!block) return null
  const v = safeJson(block.code) as Partial<ChartSpec> | undefined
  if (!v || !Array.isArray(v.labels) || !Array.isArray(v.values)) return null
  const values = v.values.map(Number).filter((n) => Number.isFinite(n))
  if (values.length === 0) return null
  return { type: 'bar', title: v.title, labels: v.labels.map(String).slice(0, values.length), values, unit: v.unit }
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]`
}
