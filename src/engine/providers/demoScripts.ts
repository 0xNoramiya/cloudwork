// Scripted outputs for Demo mode. These stand in for a language model ONLY; everything around them
// (planning DAG, scheduling, approvals, sandboxed tests, reviews, memory, delivery) is the real engine.
import type { ScenarioId } from '../types'

export interface DemoInput {
  title: string
  role: string
  summary: string
  content: string
}

/** The subject of a goal with purpose/audience clauses removed: "history of the Eiffel Tower for a school talk" → "history of the Eiffel Tower". */
export function coreTopic(goal: string): string {
  const PURPOSE = /\s+(?:for|so that|so|to help|aimed at|targeting|with)\s+/i
  const topic = topicOf(goal).topic.replace(/\([^)]*\)/g, ' ')
  let head = topic.split(PURPOSE)[0]
  // "blog post for developers about Rust" → "Rust": a generic format word is not the subject.
  const about = topic.match(/\b(?:about|on|of|regarding|covering|explaining|to)\s+(.+)/i)?.[1]
  if (about && GENERIC_FORMAT.test(head.trim())) head = about.split(PURPOSE)[0]
  return head.replace(/[“”"']/g, '').trim()
}

const GENERIC_FORMAT =
  /^(?:(?:short|quick|brief|simple|friendly|detailed|fun|punchy|one-page|comparison|complete|practical|beginner'?s?)\s+)*(?:blog\s+post|post|article|guide|report|talk|presentation|essay|summary|overview|explainer|newsletter|thread|one-pager|cheat\s*sheet|faq|tutorial|lesson|piece|write-?up)s?\b/i

export function topicOf(goal: string): { topic: string; brand?: string } {
  const brand = goal.match(/["“']([^"”']{3,40})["”']/)?.[1]
  let t = goal
    .replace(/^(please\s+)?(build|create|write|make|design|draft|plan|research|compare|develop|produce|put together|come up with|prepare|analy[sz]e|summari[sz]e|explain|investigate|outline|review|tell|teach|give|find)\s+(me\s+)?(about\s+)?(a|an|the)?\s*/i, '')
    .replace(/\([^)]*\)/g, ' ')
    // Sentence/clause breaks, but not abbreviations like "U.S." or names like "Node.js".
    .split(/(?<!\b[A-Z])[.:;](?=\s|$)|,\s(?:with|and|including)|\s(?:with|including)\s/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 70) t = `${t.slice(0, 67)}…`
  return { topic: t || goal.slice(0, 60), brand }
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

function titleCase(s: string): string {
  return s
    .replace(/\([^)]*\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

function shortTitle(topic: string, words = 6): string {
  return titleCase(topic.replace(/\([^)]*\)/g, '').split(/\s+/).slice(0, words).join(' ')).replace(/\s+(of|for|and|the|to|a|with)$/i, '')
}

// ---------------------------------------------------------------- plans

export function demoPlan(goal: string, scenario: ScenarioId): string {
  const { topic, brand } = topicOf(goal)
  const name = brand ?? shortTitle(topic, 4)
  const subject = coreTopic(goal)
  const plans: Record<ScenarioId, object> = {
    code: {
      title: `${titleCase(codeKind(goal).label)} toolkit`,
      summary: `Sage maps the tricky inputs while Hue sketches a usage card. Bolt implements ${codeKind(goal).fn}() with tests, Rook runs them in the sandbox, then Quill documents it and Tally profiles it in parallel.`,
      deliverable: `A tested JavaScript ${codeKind(goal).fn}() utility with README, usage card and performance notes.`,
      tasks: [
        { key: 't1', title: 'Map edge cases', role: 'researcher', description: `List the inputs and conventions ${codeKind(goal).fn}() must handle, with examples of expected output.`, dependsOn: [], estimateMinutes: 1 },
        { key: 't2', title: 'Design usage card', role: 'designer', description: 'Design a one-glance usage card (SVG) showing input → output examples.', dependsOn: [], estimateMinutes: 1 },
        { key: 't3', title: `Implement ${codeKind(goal).fn}()`, role: 'coder', description: `Write ${codeKind(goal).fn}() in plain JavaScript with unit tests covering the edge cases.`, dependsOn: ['t1'], estimateMinutes: 2 },
        { key: 't4', title: 'Write the README', role: 'writer', description: 'Document install-free usage, options, examples and limitations.', dependsOn: ['t3'], estimateMinutes: 1 },
        { key: 't5', title: 'Profile performance', role: 'analyst', description: 'Estimate complexity and throughput; include a small chart.', dependsOn: ['t3'], estimateMinutes: 1 },
      ],
    },
    launch: {
      title: `${name} launch plan`,
      summary: `Sage scouts the market while Hue sets the brand direction. Tally turns the research into pricing, Quill writes the landing page from research + brand, and Rook fact-checks the copy.`,
      deliverable: `A launch kit for ${name}: market snapshot, pricing model, brand direction with logo, and landing page copy.`,
      tasks: [
        { key: 't1', title: 'Market snapshot', role: 'researcher', description: `Summarize the market, audience and 3-4 competitor archetypes for ${name}.`, dependsOn: [], estimateMinutes: 2 },
        { key: 't2', title: 'Brand direction & logo', role: 'designer', description: 'Propose palette, type, tone and a simple SVG logo mark.', dependsOn: [], estimateMinutes: 2 },
        { key: 't3', title: 'Pricing model', role: 'analyst', description: 'Propose 3 subscription tiers with unit economics and a break-even estimate.', dependsOn: ['t1'], estimateMinutes: 2 },
        { key: 't4', title: 'Landing page copy', role: 'writer', description: 'Write hero, value props, tier blurbs and FAQ in the brand voice.', dependsOn: ['t1', 't2', 't3'], estimateMinutes: 2 },
        { key: 't5', title: 'Fact-check the copy', role: 'qa', description: 'Check claims in the landing copy against research and pricing; flag anything unverified.', dependsOn: ['t4'], estimateMinutes: 1 },
      ],
    },
    content: {
      title: shortTitle(topic, 7),
      summary: `Sage researches the subject, then Tally builds a comparison matrix while Hue designs a cheat-sheet in parallel. Quill drafts the piece from both, and Rook reviews it for clarity.`,
      deliverable: `A reader-friendly guide on ${subject}, with a comparison table and a visual cheat-sheet.`,
      tasks: [
        { key: 't1', title: 'Research the subject', role: 'researcher', description: `Gather how each option in "${topic}" works, strengths, weaknesses and who it suits.`, dependsOn: [], estimateMinutes: 2 },
        { key: 't2', title: 'Comparison matrix', role: 'analyst', description: 'Score the options on 4-5 criteria in a table, with a short rationale.', dependsOn: ['t1'], estimateMinutes: 1 },
        { key: 't3', title: 'Cheat-sheet visual', role: 'designer', description: 'Design a one-page SVG cheat-sheet summarizing each option.', dependsOn: ['t1'], estimateMinutes: 1 },
        { key: 't4', title: 'Draft the guide', role: 'writer', description: 'Write the friendly guide using the research and the matrix.', dependsOn: ['t1', 't2'], estimateMinutes: 2 },
        { key: 't5', title: 'Review for clarity', role: 'qa', description: 'Review the draft for accuracy, clarity and missing pieces.', dependsOn: ['t4'], estimateMinutes: 1 },
      ],
    },
    research: {
      title: shortTitle(topic, 6),
      summary: `Sage gathers the key facts first. Then Tally quantifies the options and Hue builds a visual summary in parallel, Quill writes the report, and Rook fact-checks it.`,
      deliverable: `A concise report on ${subject} with a scored comparison and a visual summary.`,
      tasks: [
        { key: 't1', title: 'Gather key facts', role: 'researcher', description: `Collect the essential facts, options and open questions about ${subject}.`, dependsOn: [], estimateMinutes: 2 },
        { key: 't2', title: 'Quantify the options', role: 'analyst', description: 'Score or estimate the main options with stated assumptions.', dependsOn: ['t1'], estimateMinutes: 1 },
        { key: 't3', title: 'Visual summary', role: 'designer', description: 'Design an SVG one-pager that summarizes the findings.', dependsOn: ['t1'], estimateMinutes: 1 },
        { key: 't4', title: 'Write the report', role: 'writer', description: 'Write the report from the research and numbers.', dependsOn: ['t1', 't2'], estimateMinutes: 2 },
        { key: 't5', title: 'Fact-check report', role: 'qa', description: 'Check the report\'s claims and flag uncertainty.', dependsOn: ['t4'], estimateMinutes: 1 },
      ],
    },
  }
  return JSON.stringify(plans[scenario], null, 2)
}

// ---------------------------------------------------------------- code samples

interface CodeKind {
  id: 'slugify' | 'todo' | 'stats'
  fn: string
  label: string
}

export function codeKind(goal: string): CodeKind {
  if (/\b(slug|url|permalink)\b/i.test(goal)) return { id: 'slugify', fn: 'slugify', label: 'slugify' }
  if (/\b(todo|to-do|task list|checklist)\b/i.test(goal)) return { id: 'todo', fn: 'createTodoList', label: 'todo list' }
  return { id: 'stats', fn: 'textStats', label: 'text stats' }
}

const CODE: Record<CodeKind['id'], { buggy: string; fixed: string; tests: string; bugNote: string }> = {
  slugify: {
    buggy: `function slugify(input, options = {}) {
  const separator = options.separator ?? '-'
  const maxLength = options.maxLength ?? 80
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, separator)
    .slice(0, maxLength)
}`,
    fixed: `function slugify(input, options = {}) {
  const separator = options.separator ?? '-'
  const maxLength = options.maxLength ?? 80
  const esc = separator.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
  let slug = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp('^' + esc + '+|' + esc + '+$', 'g'), '')
  if (slug.length > maxLength) {
    const cut = slug.slice(0, maxLength + 1)
    const last = cut.lastIndexOf(separator)
    slug = last > 0 ? cut.slice(0, last) : slug.slice(0, maxLength)
  }
  return slug
}`,
    tests: `test('lowercases and joins words', () => {
  expect(slugify('Hello World')).toBe('hello-world')
})
test('strips punctuation and collapses separators', () => {
  expect(slugify('Hello,  World!!')).toBe('hello-world')
})
test('removes diacritics', () => {
  expect(slugify('Crème Brûlée à la mode')).toBe('creme-brulee-a-la-mode')
})
test('trims leading and trailing separators', () => {
  expect(slugify('  --Sky Islands--  ')).toBe('sky-islands')
})
test('supports a custom separator', () => {
  expect(slugify('Cloud Nine Beans', { separator: '_' })).toBe('cloud_nine_beans')
})
test('respects maxLength without cutting mid-word', () => {
  expect(slugify('The quick brown fox jumps', { maxLength: 15 })).toBe('the-quick-brown')
})
test('handles empty input', () => {
  expect(slugify('')).toBe('')
})`,
    bugNote: 'Replaced every single non-alphanumeric character instead of runs, and never trimmed edge separators.',
  },
  todo: {
    buggy: `function createTodoList() {
  let nextId = 1
  const items = []
  return {
    add(title) {
      const t = String(title ?? '').trim()
      if (!t) throw new Error('Title required')
      const item = { id: nextId++, title: t, done: false }
      items.push(item)
      return { ...item }
    },
    toggle(id) {
      const it = items.find((i) => i.id === id)
      if (!it) throw new Error('No todo ' + id)
      it.done = !it.done
      return { ...it }
    },
    remove(id) {
      const i = items.findIndex((x) => x.id === id)
      if (i < 0) return false
      items.splice(i, 1)
      return true
    },
    list(filter = 'all') {
      return items.filter((i) => filter === 'all' || (filter === 'done' ? !i.done : i.done))
    },
    stats() {
      const done = items.filter((i) => i.done).length
      return { total: items.length, done, open: items.length - done }
    },
  }
}`,
    fixed: `function createTodoList() {
  let nextId = 1
  const items = []
  return {
    add(title) {
      const t = String(title ?? '').trim()
      if (!t) throw new Error('Title required')
      const item = { id: nextId++, title: t, done: false }
      items.push(item)
      return { ...item }
    },
    toggle(id) {
      const it = items.find((i) => i.id === id)
      if (!it) throw new Error('No todo ' + id)
      it.done = !it.done
      return { ...it }
    },
    remove(id) {
      const i = items.findIndex((x) => x.id === id)
      if (i < 0) return false
      items.splice(i, 1)
      return true
    },
    list(filter = 'all') {
      return items
        .filter((i) => filter === 'all' || (filter === 'done' ? i.done : !i.done))
        .map((i) => ({ ...i }))
    },
    stats() {
      const done = items.filter((i) => i.done).length
      return { total: items.length, done, open: items.length - done }
    },
  }
}`,
    tests: `test('adds todos with incrementing ids', () => {
  const l = createTodoList()
  expect(l.add('Water the sky garden').id).toBe(1)
  expect(l.add('Oil the airship').id).toBe(2)
})
test('rejects empty titles', () => {
  const l = createTodoList()
  expect(() => l.add('   ')).toThrow('Title required')
})
test('toggles completion', () => {
  const l = createTodoList()
  const t = l.add('Polish telescope')
  expect(l.toggle(t.id).done).toBe(true)
})
test('filters open and done', () => {
  const l = createTodoList()
  const a = l.add('A'); l.add('B'); l.toggle(a.id)
  expect(l.list('done').map((t) => t.title)).toEqual(['A'])
  expect(l.list('open').map((t) => t.title)).toEqual(['B'])
})
test('list returns copies, not live references', () => {
  const l = createTodoList()
  l.add('A')
  l.list()[0].title = 'hacked'
  expect(l.list()[0].title).toBe('A')
})
test('reports stats', () => {
  const l = createTodoList()
  const a = l.add('A'); l.add('B'); l.toggle(a.id)
  expect(l.stats()).toEqual({ total: 2, done: 1, open: 1 })
})`,
    bugNote: 'The open/done filter was inverted and list() leaked live references.',
  },
  stats: {
    buggy: `function textStats(text, wordsPerMinute = 220) {
  const clean = String(text ?? '').trim()
  const words = clean ? clean.split(/\\s+/).length : 0
  const sentences = clean ? (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).length : 0
  const readingMinutes = Math.round(words / wordsPerMinute)
  return { words, sentences, characters: clean.length, readingMinutes }
}`,
    fixed: `function textStats(text, wordsPerMinute = 220) {
  const clean = String(text ?? '').trim()
  const words = clean ? clean.split(/\\s+/).length : 0
  const sentences = clean ? (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).length : 0
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wordsPerMinute))
  return { words, sentences, characters: clean.length, readingMinutes }
}`,
    tests: `test('counts words', () => {
  expect(textStats('The crew works in the clouds').words).toBe(6)
})
test('counts sentences', () => {
  expect(textStats('One. Two! Three?').sentences).toBe(3)
})
test('empty text is all zeros', () => {
  expect(textStats('   ')).toEqual({ words: 0, sentences: 0, characters: 0, readingMinutes: 0 })
})
test('short non-empty text takes at least one minute', () => {
  expect(textStats('Hello there').readingMinutes).toBe(1)
})
test('reading time rounds up', () => {
  const text = Array(221).fill('word').join(' ')
  expect(textStats(text).readingMinutes).toBe(2)
})`,
    bugNote: 'Reading time used Math.round, so short texts reported 0 minutes and 221 words reported 1.',
  },
}

// ---------------------------------------------------------------- role outputs

export interface WorkCtx {
  goal: string
  scenario: ScenarioId
  taskTitle: string
  taskDescription: string
  attempts: number
  feedback: string[]
  answer?: string
  inputs: DemoInput[]
  memories: string[]
  toolResults: { tool: string; ok: boolean; output: string }[]
  toolRound: number
}

export type DemoWork = { kind: 'tool'; text: string } | { kind: 'final'; text: string }

function memoryNote(ctx: WorkCtx): string {
  if (ctx.memories.length === 0) return ''
  return `\n> Recalled from Moss's archive: ${ctx.memories.slice(0, 2).join(' · ')}\n`
}

const CODE_QUERY: Record<CodeKind['id'], string> = { slugify: 'URL slug', todo: 'task list software', stats: 'word count readability' }

/** What is being launched, e.g. "…for a cozy neighborhood coffee subscription called X" → "coffee subscription". */
export function productOf(goal: string): string | null {
  const m = goal.match(/\bfor\s+(?:a|an|the|my|our)?\s*([^,:;."“”]+?)\s+(?:called|named|brand(?:ed)?)\b/i)
  return m ? m[1].trim().split(/\s+/).slice(-2).join(' ') : null
}

function searchQuery(ctx: WorkCtx): string {
  const { brand } = topicOf(ctx.goal)
  if (ctx.scenario === 'code') return CODE_QUERY[codeKind(ctx.goal).id]
  // A new brand has no footprint yet: search its category, which is where the competitors are.
  if (ctx.scenario === 'launch') return productOf(ctx.goal) ?? brand ?? coreTopic(ctx.goal)
  return coreTopic(ctx.goal)
}

const STOP = new Set(
  'the a an and or of for to in on with by at from as is are was be this that into about how what why who list any all also can may has have had its their them they which not but one such other some many more most often used use part than then there these those very will would could should like just only each every get make made'.split(' '),
)
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w)),
  )

type Hit = { title: string; url: string; snippet: string }

/** Parsed search hits that plausibly match the goal: most title words appear in the goal, or the snippet names every query word. */
function relevantHits(ctx: WorkCtx): { hits: Hit[]; total: number } {
  const r = ctx.toolResults.find((x) => x.tool === 'web_search' && x.ok)
  if (!r) return { hits: [], total: 0 }
  const all: Hit[] = []
  const lines = r.output.split('\n')
  lines.forEach((l, i) => {
    const m = l.match(/^\d+\.\s+(.+?)\s+—\s+(https?:\S+)/)
    if (m) all.push({ title: m[1], url: m[2], snippet: (lines[i + 1] ?? '').trim() })
  })
  const goalWords = words(`${ctx.goal} ${searchQuery(ctx)}`)
  const queryWords = [...words(searchQuery(ctx))]
  const hits = all.filter((h) => {
    const tw = [...words(h.title)]
    const sw = words(h.snippet)
    const matched = tw.filter((w) => goalWords.has(w))
    // One shared title word is weak evidence ("Slug" the mollusc): the snippet must echo another goal word too.
    const corroborated = matched.length >= 2 || [...sw].some((w) => goalWords.has(w) && !matched.includes(w))
    if (tw.length && matched.length / tw.length >= 0.5 && corroborated) return true
    return queryWords.length >= 2 && queryWords.every((w) => sw.has(w))
  })
  return { hits, total: all.length }
}

function sourcesFrom(ctx: WorkCtx): { lines: string[]; note: string } {
  const r = ctx.toolResults.find((x) => x.tool === 'web_search')
  if (!r) return { lines: [], note: '' }
  if (!r.ok)
    return {
      lines: [],
      note: `> **Note:** web search was ${/reject/i.test(r.output) ? 'declined by the captain' : 'unavailable'} (${r.output.slice(0, 120)}). The points below are unverified general knowledge.`,
    }
  const { hits, total } = relevantHits(ctx)
  const items = hits.slice(0, 4).map((h) => `- [${h.title}](${h.url})`)
  return {
    lines: items,
    note: items.length
      ? `> Real web search results for “${searchQuery(ctx)}” were retrieved (relevant links below${total > items.length ? `; ${total - items.length} off-topic hit(s) dropped` : ''}). Demo mode cannot read them deeply, so the analysis itself is simulated.`
      : `> The web search for “${searchQuery(ctx)}” returned ${total ? 'only off-topic pages' : 'nothing usable'}; the analysis below is simulated.`,
  }
}

/** Plain factual sentences from a fetched page: extractive, no model involved. */
export function extractFacts(pageText: string, max = 6): string[] {
  const body = pageText
    .replace(/^# .*$/m, '')
    .replace(/^URL: .*$/m, '')
    .replace(/\[\s*(?:\d+|edit|citation needed|note \d+)\s*\]/gi, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
  const out: string[] = []
  for (const raw of body.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
    const t = raw.trim()
    if (t.length < 60 || t.length > 260 || !/^[A-Z]/.test(t)) continue
    if (/wikipedia|cookie|javascript|sign in|subscribe|•|\||\^|citation|main article|this article|this section|tag was added|may include|consider splitting|help improve/i.test(t)) continue
    if (out.some((o) => o.slice(0, 40) === t.slice(0, 40))) continue
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

function firstResultUrl(ctx: WorkCtx): string | null {
  return relevantHits(ctx).hits[0]?.url ?? null
}

function fetchedFacts(results: WorkCtx['toolResults']): { title: string; url: string; facts: string[] } | null {
  const r = results.find((x) => x.tool === 'fetch_url' && x.ok)
  if (!r) return null
  const title = r.output.match(/^# (.+)$/m)?.[1] ?? 'the source'
  const url = r.output.match(/^URL: (\S+)/m)?.[1] ?? ''
  const facts = extractFacts(r.output)
  return facts.length >= 2 ? { title, url, facts } : null
}

export function demoWork(role: string, ctx: WorkCtx): DemoWork {
  const { topic, brand } = topicOf(ctx.goal)
  const name = brand ?? titleCase(topic)

  if (role === 'researcher') {
    if (ctx.toolRound === 0 && ctx.toolResults.length === 0) {
      return { kind: 'tool', text: '```tool\n' + JSON.stringify({ tool: 'web_search', query: searchQuery(ctx) }) + '\n```' }
    }
    // For open-ended topics, read the top result so the notes carry real, relevant sentences.
    const url = firstResultUrl(ctx)
    const wantsReading = ctx.scenario === 'research' || ctx.scenario === 'content'
    if (wantsReading && url && ctx.toolRound === 1 && !ctx.toolResults.some((x) => x.tool === 'fetch_url')) {
      return { kind: 'tool', text: '```tool\n' + JSON.stringify({ tool: 'fetch_url', url }) + '\n```' }
    }
    const src = sourcesFrom(ctx)
    const read = fetchedFacts(ctx.toolResults)
    const body = researchBody(ctx, name, coreTopic(ctx.goal), read !== null)
    if (read) body.summary = `SUMMARY: Pulled ${read.facts.length} key facts about ${coreTopic(ctx.goal)} from ${read.title.replace(/ - Wikipedia$/, '')}, verbatim, plus open questions.`
    const facts = read
      ? `\n## What the source says\n> Sentences extracted verbatim from [${read.title}](${read.url}), fetched with your approval. Real text, no model involved.\n\n${read.facts.map((f) => `- ${f}`).join('\n')}\n`
      : ''
    return {
      kind: 'final',
      text: `${body.summary}\n${memoryNote(ctx)}\n${read ? '' : src.note}\n${facts}\n${body.content}\n${src.lines.length ? `\n## Sources\n${src.lines.join('\n')}\n` : ''}\n${read ? `DISCOVERY: ${read.facts[0]}` : body.discovery}`,
    }
  }

  if (role === 'coder') {
    const kind = codeKind(ctx.goal)
    const code = CODE[kind.id]
    const fixed = ctx.feedback.length > 0
    return {
      kind: 'final',
      text: `SUMMARY: ${fixed ? `Fixed ${kind.fn}() per Rook's review and kept the full test suite.` : `Implemented ${kind.fn}() in dependency-free JavaScript with ${code.tests.split('test(').length - 1} unit tests.`}
${memoryNote(ctx)}
${fixed ? `### What changed\n${code.bugNote} Both are fixed; the regex now handles runs and edges explicitly.\n` : `### Approach\nA single pure function, no dependencies, safe on any input (\`null\`, numbers, unicode). The edge cases from Sage's notes are encoded as tests so Rook can run them.\n`}
\`\`\`javascript file=solution.js
${fixed ? code.fixed : code.buggy}
\`\`\`

\`\`\`javascript file=tests.js
${code.tests}
\`\`\`

DISCOVERY: ${kind.id === 'slugify' ? 'NFKD normalization plus stripping combining marks (U+0300–U+036F) removes most Latin diacritics without a lookup table.' : kind.id === 'todo' ? 'Returning copies from list() keeps callers from mutating internal state by accident.' : 'Reading-time estimates should round up and floor at one minute for any non-empty text.'}`,
    }
  }

  if (role === 'designer') {
    if (ctx.scenario === 'launch' && ctx.toolRound === 0 && !ctx.answer) {
      return {
        kind: 'tool',
        text: '```tool\n' + JSON.stringify({ tool: 'ask_user', question: `Which direction should ${name} lean? (A) cozy & handcrafted pastel, or (B) bold, modern & minimal?` }) + '\n```',
      }
    }
    const bold = ctx.answer ? /\b(b|bold|modern|minimal)\b/i.test(ctx.answer) : false
    return { kind: 'final', text: designBody(ctx, name, bold) }
  }

  if (role === 'analyst') return { kind: 'final', text: analystBody(ctx, name) }
  if (role === 'writer') return { kind: 'final', text: writerBody(ctx, name, coreTopic(ctx.goal)) }
  return { kind: 'final', text: `SUMMARY: Worked on ${ctx.taskTitle}.\n\n${ctx.taskDescription}` }
}

function researchBody(ctx: WorkCtx, name: string, topic: string, hasFacts = false) {
  if (ctx.scenario === 'code') {
    const k = codeKind(ctx.goal)
    return {
      summary: `SUMMARY: Mapped ${k.id === 'slugify' ? '7' : '6'} edge cases ${k.fn}() must handle, each with an expected output.`,
      content:
        k.id === 'slugify'
          ? `## Edge cases to cover
| Input | Expected | Why it matters |
|---|---|---|
| \`Hello World\` | \`hello-world\` | baseline |
| \`Hello,  World!!\` | \`hello-world\` | punctuation runs must collapse to ONE separator |
| \`Crème Brûlée\` | \`creme-brulee\` | diacritics → ASCII (NFKD) |
| \`  --Sky Islands--  \` | \`sky-islands\` | no leading/trailing separators |
| \`Salt & Pepper\` | \`salt-and-pepper\` | readable ampersand |
| long titles | cut at a word boundary | stable, pretty URLs |
| \`''\` / \`null\` | \`''\` | never throw on empty input |

## Conventions
- Lowercase ASCII, \`-\` as default separator, configurable (\`_\` is common for filenames).
- Keep slugs ≤ 80 chars; search engines truncate long URLs anyway (unverified).
- Slugs should be **idempotent**: \`slugify(slugify(x)) === slugify(x)\`.`
          : k.id === 'todo'
            ? `## Behaviors to cover
- Adding trims whitespace and rejects empty titles.
- IDs are stable and increment; removing never reuses an id.
- \`toggle\` flips completion and errors on unknown ids.
- Filters: \`all\`, \`open\`, \`done\`.
- Callers must not be able to mutate internal state through returned objects.
- \`stats()\` returns totals for a progress bar.`
            : `## Behaviors to cover
- Word count splits on any whitespace run.
- Sentence count handles \`.\`, \`!\`, \`?\` and a trailing sentence without punctuation.
- Empty or whitespace-only input returns zeros.
- Reading time rounds **up** and is at least 1 minute for any non-empty text (~220 wpm is a common default, unverified).`,
      discovery: 'DISCOVERY: Idempotence (f(f(x)) === f(x)) is a cheap, powerful property test for text-normalization utilities.',
    }
  }
  if (ctx.scenario === 'launch') {
    return {
      summary: `SUMMARY: Market snapshot for ${name}: audience, demand drivers and four competitor archetypes.`,
      content: `## Audience
- **Remote workers & home brewers** (25–45) who want café-quality beans without the café trip.
- **Gift buyers.** Subscriptions spike around holidays (unverified, typical of the category).

## Demand drivers
1. Premiumization: people trade up to specialty beans at home.
2. Convenience: "never run out" auto-delivery.
3. Local pride: neighborhood roasters beat faceless brands on story and freshness.

## Competitor archetypes
| Archetype | Example promise | Weak spot we can exploit |
|---|---|---|
| National marketplace | 400+ roasters | impersonal, choice overload |
| Big-brand pods | convenience | quality & waste perception |
| Local café retail bags | freshness | no subscription / delivery |
| Single-origin snobs | provenance | intimidating tone |

## Positioning opportunity
**"Your neighborhood roaster, on autopilot."** Cozy, local, fresh-roasted within 48h, delivered by bike in the neighborhood.`,
      discovery: `DISCOVERY: For local subscriptions, freshness ("roasted within 48h") is a sharper differentiator than origin variety.`,
    }
  }
  return {
    summary: `SUMMARY: Research notes on ${topic}: how each option works, strengths, weaknesses, and who it suits.`,
    content: /cornell|zettel|outline|note/i.test(ctx.goal)
      ? `## The three methods
### Cornell
Page split into **cues**, **notes** and a **summary**. Built for review: cover the notes, quiz yourself from the cues.
- Great for lectures and exam prep, though the layout is rigid and slower to set up.

### Zettelkasten
Atomic, linked notes ("one idea per card") with IDs and links. Knowledge compounds over time.
- Great for essays and research you'll build on for years. The learning curve is steep, and it's easy to over-engineer.

### Outline
Hierarchical bullets that mirror the lecture's structure.
- Fast and works in any app, but weak at connecting ideas across courses.

## Who each suits
- **Exam-heavy STEM courses** → Cornell
- **Humanities / thesis-bound students** → Zettelkasten
- **Fast-paced lectures, beginners** → Outline`
      : hasFacts
        ? `## Reading of the source
- The extracted passages above are the evidence base; everything below builds on them.
- Next step would be a second source to confirm or contradict them (not done in demo mode).

## Open questions
- Which of these points matters most for the captain's goal?
- What is missing that a specialist source would cover?`
        : `## Key facts
- ${titleCase(topic)} has several competing approaches; most trade simplicity against flexibility.
- The best choice depends on scale, budget and how often requirements change.

## Main options
1. **The simple default.** Quickest to adopt, with a low ceiling.
2. **The flexible middle.** More setup, but it adapts well.
3. **The power option.** Highest ceiling and highest cost.

## Open questions
- What constraints (time, budget, skills) matter most to the captain? (unverified assumptions below)`,
    discovery: `DISCOVERY: Matching a method to the *type* of work (review vs. synthesis) matters more than the method's popularity.`,
  }
}

function designBody(ctx: WorkCtx, name: string, bold: boolean): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  const pal = bold ? ['#111827', '#FF5A36', '#F5F5F0', '#2B59FF'] : ['#5B3A29', '#F4B6A6', '#FFF4E6', '#8FB9A8']
  if (ctx.scenario === 'code') {
    return `SUMMARY: Designed a one-glance usage card showing input → output examples.

## Usage card
A dark "terminal" card: inputs on the left, arrows, outputs on the right in the accent color, so the behavior is learnable in 3 seconds.

\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" font-family="ui-monospace, Menlo, monospace">
  <rect width="480" height="240" rx="18" fill="#1E1B2E"/>
  <circle cx="26" cy="24" r="6" fill="#FF6B6B"/><circle cx="46" cy="24" r="6" fill="#FFD166"/><circle cx="66" cy="24" r="6" fill="#06D6A0"/>
  <text x="240" y="30" fill="#B9B4D6" font-size="13" text-anchor="middle">${codeKind(ctx.goal).fn}() cheat card</text>
  <g font-size="14">
    <text x="28" y="80" fill="#E8E6F5">"Hello, World!"</text><text x="250" y="80" fill="#8B5CF6">→</text><text x="280" y="80" fill="#7CF5C8">hello-world</text>
    <text x="28" y="118" fill="#E8E6F5">"Crème Brûlée"</text><text x="250" y="118" fill="#8B5CF6">→</text><text x="280" y="118" fill="#7CF5C8">creme-brulee</text>
    <text x="28" y="156" fill="#E8E6F5">"  --Sky Islands-- "</text><text x="250" y="156" fill="#8B5CF6">→</text><text x="280" y="156" fill="#7CF5C8">sky-islands</text>
    <text x="28" y="194" fill="#E8E6F5">{ separator: "_" }</text><text x="250" y="194" fill="#8B5CF6">→</text><text x="280" y="194" fill="#7CF5C8">cloud_nine_beans</text>
  </g>
</svg>
\`\`\`

- **Palette:** night \`#1E1B2E\`, violet accent \`#8B5CF6\`, mint output \`#7CF5C8\`.
- **Type:** monospace throughout, because it's a developer artifact.`
  }
  if (ctx.scenario === 'launch') {
    return `SUMMARY: ${bold ? 'Bold, modern' : 'Cozy, handcrafted'} brand direction for ${name} with palette, type and an SVG logo mark.
${ctx.answer ? `\n> Captain chose "${ctx.answer}", so the direction is **${bold ? 'bold & modern' : 'cozy & handcrafted'}**.\n` : ''}
## Direction: ${bold ? '"Loud Morning"' : '"Warm Window"'}
${bold ? 'High-contrast, confident, a little cheeky. Big type, flat color blocks, one electric accent.' : 'Like the first sip by a sunny window: soft pastels, rounded shapes, hand-drawn warmth.'}

## Palette
| Role | Hex |
|---|---|
| Primary | \`${pal[0]}\` |
| Accent | \`${pal[1]}\` |
| Background | \`${pal[2]}\` |
| Support | \`${pal[3]}\` |

## Logo mark
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
  <rect width="320" height="200" rx="24" fill="${pal[2]}"/>
  <g transform="translate(160 88)">
    <circle r="54" fill="${pal[1]}"/>
    <path d="M-38 6c0-16 12-26 26-26 5-13 18-20 31-17 12 3 20 13 21 24 12 1 21 10 21 21 0 12-10 20-22 20h-55c-12 0-22-10-22-22z" fill="${pal[2]}"/>
    <ellipse cx="-4" cy="10" rx="10" ry="14" fill="${pal[0]}" transform="rotate(-25)"/>
    <path d="M-10 -2c6 6 6 18 0 24" stroke="${pal[2]}" stroke-width="2.5" fill="none" transform="rotate(-25)"/>
  </g>
  <text x="160" y="178" text-anchor="middle" font-family="${bold ? 'Arial Black, sans-serif' : 'Georgia, serif'}" font-size="22" fill="${pal[0]}" letter-spacing="${bold ? 1 : 0.5}">${name.toUpperCase().slice(0, 22)}</text>
  <text x="160" y="46" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${pal[0]}" opacity=".6">${initials} · FRESH ROASTED</text>
</svg>
\`\`\`

## Type & tone
- Headings: ${bold ? 'a heavy grotesk (e.g. Inter Display Black)' : 'a soft serif (e.g. Fraunces)'}; body: a friendly sans.
- Voice: ${bold ? 'short, punchy, playful.' : 'warm, neighborly, unhurried.'}

DISCOVERY: A coffee bean nested inside a cloud reads at favicon size. Simple silhouettes beat detailed illustrations for subscription brands.`
  }
  const facts = sourcedFacts(ctx.inputs).slice(0, 3)
  const notes = /cornell|zettel|note/i.test(ctx.goal)
  const labels = notes ? ['Cornell', 'Zettelkasten', 'Outline'] : ['Option A', 'Option B', 'Option C']
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const wrap = (t: string, n = 26, lines = 5) => {
    const words = t.split(' ')
    const out: string[] = ['']
    for (const w of words) {
      if ((out[out.length - 1] + ' ' + w).trim().length > n) {
        if (out.length === lines) break
        out.push(w)
      } else out[out.length - 1] = (out[out.length - 1] + ' ' + w).trim()
    }
    return out
  }
  const cols = ['#DDEBFF', '#FFE1EC', '#E3F6E8']
  const inks = ['#2B4C9B', '#A33A63', '#2F7A48']
  const cards = [0, 1, 2]
    .map((i) => {
      const lines = facts[i]
        ? wrap(facts[i].replace(/^- /, ''))
        : notes
          ? [['Use when: reviewing', '+ exam-friendly', '− rigid layout'], ['Use when: connecting', '+ ideas compound', '− learning curve'], ['Use when: capturing', '+ fast, zero setup', '− shallow links']][i]
          : ['Use when: …', '+ strength', '− trade-off']
      return `<g transform="translate(${24 + i * 168} 60)"><rect width="156" height="216" rx="14" fill="${cols[i]}"/><text x="78" y="30" text-anchor="middle" font-weight="700" fill="${inks[i]}">${facts[i] ? `Point ${i + 1}` : labels[i]}</text>${lines.map((l, k) => `<text x="12" y="${60 + k * 20}" font-size="11.5" fill="${inks[i]}">${esc(l)}</text>`).join('')}</g>`
    })
    .join('\n  ')
  return `SUMMARY: Designed a one-page SVG ${facts.length ? 'summary of the three strongest points from the sources' : 'cheat-sheet summarizing each option at a glance'}.

## One-pager
Three color-coded cards${facts.length ? ", each carrying one point from Sage's sources," : ', one per option,'} so the whole topic fits on a single glance.

\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 300" font-family="Helvetica, Arial, sans-serif">
  <rect width="540" height="300" rx="20" fill="#FFF8EE"/>
  <text x="270" y="38" text-anchor="middle" font-size="18" font-weight="700" fill="#3A2E4F">${esc(name.slice(0, 40))}</text>
  ${cards}
</svg>
\`\`\`

- Pastel colors map 1:1 to the sections of the write-up, so readers can cross-reference.`
}

function sourcedFacts(inputs: DemoInput[]): string[] {
  // Only bullets under "What the source says". Later sections (open questions, sources) are not facts.
  return inputs.flatMap((i) => (i.content.split('## What the source says')[1] ?? '').split(/\n## /)[0].split('\n')).filter((l) => l.startsWith('- '))
}

function analystBody(ctx: WorkCtx, name: string): string {
  if (ctx.scenario === 'code') {
    return `SUMMARY: Estimated O(n) time for ${codeKind(ctx.goal).fn}() with rough throughput figures and a chart.

## Complexity
- Time **O(n)** in input length: a constant number of linear regex passes.
- Space **O(n)** for the intermediate strings.

## Throughput (simulated estimate, not measured)
| Input size | ~ops/sec |
|---|---|
| 20 chars | 1,500,000 |
| 200 chars | 240,000 |
| 2,000 chars | 26,000 |

\`\`\`chart
{"type":"bar","title":"Estimated ops/sec by input length","labels":["20","200","2000"],"values":[1500000,240000,26000],"unit":"ops/s"}
\`\`\`

Assumption: modern V8, warm JIT. Real numbers vary ±50%; run a benchmark before optimizing. This is already fast enough for request-time use.`
  }
  if (ctx.scenario === 'launch') {
    return `SUMMARY: Three subscription tiers for ${name} with unit economics; break-even at roughly 180 subscribers (simulated estimates).
${memoryNote(ctx)}
## Tiers
| Tier | Bags / month | Price | COGS (beans+bag+roast) | Delivery | Margin |
|---|---|---|---|---|---|
| **Drizzle** | 1 × 250g | $16 | $6.10 | $2.00 | **$7.90** |
| **Cumulus** | 2 × 250g | $29 | $12.20 | $2.00 | **$14.80** |
| **Nimbus** | 4 × 250g | $52 | $24.40 | $2.50 | **$25.10** |

## Break-even
- Fixed costs ≈ **$2,600/month** (roaster lease share, packaging stock, software, bike courier retainer).
- Expected mix 45% / 40% / 15% → blended margin ≈ **$13.25**/subscriber.
- **Break-even ≈ 196 subscribers** (2,600 ÷ 13.25).

\`\`\`chart
{"type":"bar","title":"Margin per subscriber by tier","labels":["Drizzle","Cumulus","Nimbus"],"values":[7.9,14.8,25.1],"unit":"$"}
\`\`\`

Assumptions are illustrative (demo mode). Replace COGS with real supplier quotes before launch.

DISCOVERY: The middle tier usually carries a subscription business; price it so its margin per bag beats the entry tier.`
  }
  const notes = /cornell|zettel|note/i.test(ctx.goal)
  const [a, b, c] = notes ? ['Cornell', 'Zettelkasten', 'Outline'] : ['Option A', 'Option B', 'Option C']
  const rows = notes
    ? [
        ['Setup speed', 3, 2, 5],
        ['Review / recall', 5, 3, 3],
        ['Connecting ideas', 2, 5, 2],
        ['Learning curve (higher = easier)', 4, 2, 5],
        ['Long-term value', 3, 5, 2],
      ]
    : [
        ['Cost (higher = cheaper)', 4, 2, 3],
        ['Effort to start', 5, 2, 3],
        ['Expected impact', 2, 5, 4],
        ['Risk (higher = safer)', 4, 3, 3],
        ['Time to results', 3, 4, 4],
      ]
  const total = (i: number) => rows.reduce((n, r) => n + (r[i] as number), 0)
  return `SUMMARY: Scored ${notes ? 'the three methods' : 'the main options'} on five criteria; ${notes ? 'the best fit depends on the reader\'s main goal' : 'weights decide the winner'} (simulated scores).
${memoryNote(ctx)}
## Comparison matrix (1–5, illustrative)
| Criterion | ${a} | ${b} | ${c} |
|---|---|---|---|
${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join('\n')}
| **Total** | **${total(1)}** | **${total(2)}** | **${total(3)}** |

Close totals are the insight: **weights decide**. Decide what matters most, then re-weight.

\`\`\`chart
{"type":"bar","title":"Total score by option","labels":["${a}","${b}","${c}"],"values":[${total(1)},${total(2)},${total(3)}]}
\`\`\``
}

function writerBody(ctx: WorkCtx, name: string, topic: string): string {
  const revised = ctx.feedback.length > 0
  const revisionNote = revised ? `\n> Revised after review: ${ctx.feedback.slice(-1)[0] ?? 'addressed feedback'}\n` : ''
  if (ctx.scenario === 'code') {
    const k = codeKind(ctx.goal)
    return `SUMMARY: Wrote the README for ${k.fn}(): usage, options, examples and limitations.
${revisionNote}
# ${k.fn}()
Tiny and dependency-free. Every example below is a test Rook ran in the sandbox.

## Usage
\`\`\`js
${k.id === 'slugify' ? "slugify('Crème Brûlée & Co.')      // 'creme-brulee-and-co'\nslugify('Cloud Nine Beans', { separator: '_' }) // 'cloud_nine_beans'" : k.id === 'todo' ? "const todos = createTodoList()\ntodos.add('Oil the airship')\ntodos.list('open')" : "textStats('Hello there. General Kenobi!')\n// { words: 4, sentences: 2, characters: 29, readingMinutes: 1 }"}
\`\`\`

## Options
${k.id === 'slugify' ? '| Option | Default | Notes |\n|---|---|---|\n| `separator` | `-` | any string |\n| `maxLength` | `80` | cuts at a word boundary |' : k.id === 'todo' ? '- `list(filter)`: `all`, `open` or `done`\n- `stats()` returns `{ total, done, open }`' : '- `wordsPerMinute`, default `220`'}

## Limitations
- ${k.id === 'slugify' ? 'Non-Latin scripts (e.g. 日本語) are dropped rather than transliterated.' : 'In-memory only; persist it yourself.'}
- Written for modern JavaScript runtimes (ES2020+).`
  }
  if (ctx.scenario === 'launch') {
    return `SUMMARY: Landing page copy for ${name}: hero, value props, tier blurbs and FAQ.
${revisionNote}
# ${name}
### Your neighborhood roaster, on autopilot.
Fresh-roasted beans, delivered by bike within 48 hours of roasting. Pause or skip anytime.

**[Start my first bag →]**

## Why neighbors love it
- **Roasted this week, not this season.** Every bag ships within 48 hours of roasting.
- **Local, for real.** Roasted two streets over, delivered by bike.
- **Zero hassle.** Skip, swap or pause from your phone in two taps.

## Pick your cloud
- **Drizzle, $16/mo** · one 250g bag. For the one-cup-a-day crowd.
- **Cumulus, $29/mo** · two bags. Our most popular.
- **Nimbus, $52/mo** · four bags. For households, studios and the gloriously caffeinated.

## FAQ
**Can I pause?** Anytime, no fees.
**Where do you deliver?** Within our neighborhood by bike; everywhere else by post.
**Whole bean or ground?** Your call, per bag.`
  }
  const sourced = ctx.inputs
    .flatMap((i) => (i.content.split('## What the source says')[1] ?? '').split('\n'))
    .filter((l) => l.startsWith('- '))
    .slice(0, 4)
  const facts = sourced.length ? `\n## What we know (from Sage's sources)\n${sourced.join('\n')}\n` : ''
  const notes = /cornell|zettel|note/i.test(ctx.goal)
  const table = revised
    ? notes
      ? `\n## At a glance\n| | Best for | Setup | Superpower |\n|---|---|---|---|\n| **Cornell** | review & exams | medium | self-quizzing |\n| **Zettelkasten** | essays & research | slow | connecting ideas |\n| **Outline** | fast lectures | instant | speed |\n`
      : `\n## At a glance\n| Question | Short answer |\n|---|---|\n| What is it? | ${titleCase(topic)} |\n| What matters most? | The points the sources agree on (below) |\n| What's still open? | See "Open questions" in Sage's notes |\n`
    : ''
  const body = notes
    ? `## The short version
- Cramming for exams? Pick the method built for **review**.
- Writing essays or a thesis? Pick the one built for **connections**.
- Just surviving fast lectures? Pick the one built for **speed**.

## How each one works
Using Sage's research and Tally's matrix, here's how the options stack up. A tie on total score means **your priorities decide**.

## Try it this week
1. Pick one course.
2. Use one method for two weeks.
3. At the end, test yourself: which notes actually helped?`
    : `## The short version
${sourced.length ? '- Start from what the sources say above; it is the most solid ground we have.' : '- Sage could not read a source this time, so treat everything here as a starting point.'}
- Tally's numbers show where the trade-offs are; your priorities decide between them.
- Anything marked (unverified) deserves a second look before you rely on it.

## Next steps
1. Pick the one question that matters most for you.
2. Check it against a second source.
3. Decide, then revisit in a week.`
  return `SUMMARY: ${revised ? 'Revised' : 'Drafted'} a friendly ${notes ? 'guide' : 'write-up'} on ${topic}${revised ? ' with an at-a-glance table up top' : ''}.
${revisionNote}
# ${titleCase(topic)}: ${notes ? 'a friendly guide' : 'what we found'}
${notes ? "Picking a method isn't about finding the *best* one. It's about matching the method to the kind of work you do." : `A plain-language summary of what the crew found about ${topic}.`}
${table}
${facts}
${body}`
}

// ---------------------------------------------------------------- review / deliver / memory / chat

export function demoReview(ctx: {
  scenario: ScenarioId
  targetRole: string
  targetTitle: string
  reworks: number
  tests?: { passed: number; total: number; failures: string[]; ran: boolean }
}): string {
  if (ctx.tests?.ran) {
    const { passed, total, failures } = ctx.tests
    if (failures.length) {
      return `SUMMARY: ${passed}/${total} tests pass. Sending "${ctx.targetTitle}" back to Bolt.

## Test results (real sandbox run)
${failures.map((f) => `- ✘ ${f}`).join('\n')}

## Review
The happy path works, but the failing cases are exactly the edge cases Sage flagged.

${failures.map((f) => `ISSUE: Failing test: ${f}`).join('\n')}
VERDICT: FAIL`
    }
    return `SUMMARY: All ${total} tests pass; "${ctx.targetTitle}" is approved.

## Review
- ✔ Every edge case from the research is covered by a passing test.
- ✔ Pure function, no dependencies, handles empty input.
- Nit (non-blocking): consider a property test for idempotence.

VERDICT: PASS`
  }
  const firstDraft = ctx.reworks === 0
  if (firstDraft && ctx.targetRole === 'writer' && ctx.scenario !== 'launch') {
    return `SUMMARY: Good draft, but readers need a quick comparison before the details. Sending it back once.

## Review
- ✔ Friendly tone, clear structure, accurate against Sage's notes.
- ✘ There's no at-a-glance comparison near the top; skimmers will bounce.

ISSUE: Add a quick at-a-glance comparison table near the top of the guide.
VERDICT: FAIL`
  }
  return `SUMMARY: "${ctx.targetTitle}" checks out${ctx.scenario === 'launch' ? '. Numbers match Tally\'s model; two claims are flagged as unverified' : ''}.

## Review
- ✔ Consistent with the research and the other crew outputs.
${ctx.scenario === 'launch' ? '- Check: "Roasted within 48h" and "delivered by bike" are promises. Confirm operations can meet them before launch.\n- ✔ Tier prices match the pricing model exactly.' : '- ✔ Clear, skimmable, answers the brief.'}

VERDICT: PASS`
}

export function demoDeliver(ctx: { title: string; planSummary?: string; artifacts: DemoInput[]; feedback: string[] }): string {
  const clean = (s: string) =>
    s
      .replace(/^\s*SUMMARY:.*$/m, '')
      .replace(/^\s*DISCOVERY:.*$/gm, '')
      .replace(/^\s*VERDICT:.*$/gm, '')
      .replace(/^\s*ISSUE:.*$/gm, '')
      .trim()
  const sections = ctx.artifacts
    .filter((a) => a.role !== 'qa')
    .map((a) => `## ${a.title}\n*by ${a.role}*\n\n${clean(a.content).replace(/^# /gm, '### ').slice(0, 4000)}`)
  const reviews = ctx.artifacts.filter((a) => a.role === 'qa').map((a) => `- ${a.summary}`)
  return `SUMMARY: Assembled the final deliverable for "${ctx.title}" from ${ctx.artifacts.length} crew outputs.

# ${ctx.title}
> Assembled by Juno. **Demo mode:** the writing is templated, but the plan, hand-offs, sandbox tests, reviews and this assembly ran through the real Cloudworks engine.
${ctx.feedback.length ? `\n> Revised per captain's feedback: ${ctx.feedback.map((f) => `"${f}"`).join('; ')}\n` : ''}
## Executive summary
${ctx.planSummary ?? ''}
${ctx.artifacts
  .filter((a) => a.role !== 'qa')
  .map((a) => `- **${a.title}:** ${a.summary}`)
  .join('\n')}

${sections.join('\n\n')}

## Quality checks
${reviews.join('\n') || '- No separate QA review was part of this plan.'}

## Next steps
1. Skim each section and mark anything you want changed.
2. Swap Demo for a real model (Settings → Models) and re-run to get original content.
3. Ask any crew member a follow-up from their card.`
}

export function demoMemory(ctx: { title: string; role: string; summary: string; discoveries: string[]; goal: string }): string {
  const notes: { text: string; kind: string; tags: string[] }[] = []
  for (const d of ctx.discoveries.slice(0, 2)) notes.push({ text: d, kind: 'discovery', tags: tagsOf(d) })
  if (ctx.summary && notes.length < 2) {
    notes.push({ text: `${ctx.title}: ${ctx.summary}`, kind: ctx.role === 'qa' ? 'lesson' : 'decision', tags: tagsOf(`${ctx.title} ${ctx.goal}`) })
  }
  return JSON.stringify(notes)
}

function tagsOf(s: string): string[] {
  return [...new Set((s.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !['which', 'their', 'about', 'there', 'these', 'would', 'should'].includes(w)))].slice(0, 3)
}

export function demoChat(ctx: { question: string; status: string; taskTitle?: string; progress?: number; lastSummary?: string }): string {
  const q = ctx.question.toLowerCase()
  const where = ctx.taskTitle
    ? `I'm on "${ctx.taskTitle}"${ctx.progress !== undefined ? `, about ${Math.round(ctx.progress * 100)}% through` : ''}.`
    : "I'm between tasks right now."
  if (/why|how come|reason/.test(q)) {
    return `${where} ${ctx.lastSummary ? `My last output: ${ctx.lastSummary}` : ''} I made that call because it fit the plan Juno set and the inputs I was handed. (Demo reply: assembled from live engine state; a real model would reason about your exact question.)`
  }
  if (/eta|how long|when|done|finish/.test(q)) {
    return `${where} Status: ${ctx.status}. In demo mode each task takes roughly 10–25 seconds. (Demo reply built from live state.)`
  }
  return `${where} Status: ${ctx.status}. ${ctx.lastSummary ? `Latest thing I shipped: ${ctx.lastSummary}` : ''} Happy to adjust. Use "Redirect" on my card to change what I'm doing. (Demo reply: connect a real model for genuine answers.)`
}
