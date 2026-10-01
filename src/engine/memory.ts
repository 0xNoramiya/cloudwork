import type { MemoryEntry } from './types'

const STOP = new Set(
  'the a an and or but if of to in on at for with by from as is are was were be been being this that these those it its into about over under than then so such can could should would will just also very more most less least not no yes you your our we they them their there here what which who whom when where why how all any each few other some own same too only up down out off again further once both between through during before after above below while do does did done have has had having i me my mine he she his her hers him us create make build write using use used new plan project task'.split(
    ' ',
  ),
)

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [])
    .map((w) => w.replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, ''))
    .filter((w) => w.length > 2 && !STOP.has(w))
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

export interface Retrieved {
  entry: MemoryEntry
  score: number
}

/** Keyword-overlap retrieval with tag, pin and recency boosts. Pinned preferences always come along. */
export function retrieveMemories(memories: MemoryEntry[], query: string, k = 6): Retrieved[] {
  const q = new Set(tokenize(query))
  const now = Date.now()
  const scored = memories.map((m) => {
    const words = new Set([...tokenize(m.text), ...m.tags.flatMap(tokenize)])
    let overlap = 0
    for (const w of q) if (words.has(w)) overlap++
    const tagHit = m.tags.some((t) => q.has(t.toLowerCase())) ? 1 : 0
    const ageDays = (now - m.createdAt) / 86_400_000
    const recency = 1 / (1 + ageDays / 14)
    const score = overlap * 1.0 + tagHit * 0.8 + (m.pinned ? 2.5 : 0) + (overlap > 0 ? recency * 0.5 : 0) + Math.min(m.uses, 5) * 0.05
    return { entry: m, score: overlap > 0 || m.pinned ? score : 0 }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

function numbers(text: string): Set<string> {
  const cleaned = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
  return new Set((cleaned.match(/\d+(?:[.,]\d+)?%?/g) ?? []).map((n) => n.replace(',', '.')))
}

/** Decide whether a new note duplicates or contradicts an existing one. */
export function classifyAgainst(
  existing: MemoryEntry[],
  text: string,
): { duplicateOf?: MemoryEntry; conflictWith?: MemoryEntry } {
  const t = new Set(tokenize(text))
  const nums = numbers(text)
  let best: { e: MemoryEntry; sim: number } | null = null
  for (const e of existing) {
    const sim = jaccard(t, new Set(tokenize(e.text)))
    if (!best || sim > best.sim) best = { e, sim }
  }
  if (!best) return {}
  if (best.sim >= 0.72) return { duplicateOf: best.e }
  if (best.sim >= 0.45) {
    const other = numbers(best.e.text)
    const onlyNew = [...nums].filter((n) => !other.has(n))
    const onlyOld = [...other].filter((n) => !nums.has(n))
    const numsDiffer = onlyNew.length > 0 && onlyOld.length > 0
    const negation = /\b(not|never|no longer|instead)\b/i.test(text) !== /\b(not|never|no longer|instead)\b/i.test(best.e.text)
    if (numsDiffer || negation) return { conflictWith: best.e }
  }
  return {}
}

export function suggestTags(text: string, max = 4): string[] {
  const counts = new Map<string, number>()
  for (const w of tokenize(text)) counts.set(w, (counts.get(w) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w)
}
