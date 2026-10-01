import { CREW, TRAITS } from './crew'
import { truncate } from './parse'
import type { Artifact, MemoryEntry, RoleId, Task, ToolName, TraitId } from './types'

const TOOL_DOCS: Record<ToolName, string> = {
  web_search: '- web_search {"query": string} — search the web; returns titles, links and snippets. Needs the captain\'s approval.',
  fetch_url: '- fetch_url {"url": string} — read a web page as plain text. Needs the captain\'s approval.',
  memory_search: '- memory_search {"query": string} — search the crew\'s shared long-term memory.',
  run_js: '- run_js {"code": string} — run JavaScript in an isolated sandbox (no network); console.log output is returned.',
  ask_user: '- ask_user {"question": string} — ask the human captain one short clarifying question. Use only when truly blocked.',
}

const CREW_LINE =
  'Crew: Juno (planner), Sage (researcher), Bolt (coder), Quill (writer), Hue (designer), Tally (analyst), Rook (QA), Moss (archivist). The human user is "the captain".'

function persona(role: RoleId, trait: TraitId): string {
  const c = CREW[role]
  const t = TRAITS[trait].prompt
  return [
    `You are ${c.name}, the ${c.title} at Cloudworks — a small sky-island workshop where a crew of AI specialists collaborates on the captain's goals.`,
    `Personality: ${c.personality}. Let it show in at most one short phrase; substance comes first.`,
    c.guidance,
    t ? `Working style: ${t}` : '',
    CREW_LINE,
  ]
    .filter(Boolean)
    .join('\n')
}

function toolSection(tools: ToolName[], maxCalls: number): string {
  if (tools.length === 0 || maxCalls <= 0) return ''
  return [
    '## Tools',
    'To call a tool, reply with ONLY a fenced block like the one below and nothing else, then wait for the result:',
    '```tool',
    '{"tool": "memory_search", "query": "pricing decisions"}',
    '```',
    ...tools.map((t) => TOOL_DOCS[t]),
    `You may make at most ${maxCalls} more tool call(s) for this task. If you do not need a tool, answer directly.`,
  ].join('\n')
}

function roleFormat(role: RoleId): string {
  switch (role) {
    case 'coder':
      return [
        '## Output format for code',
        'Give a 2-4 sentence overview, then the implementation in a block fenced as ```javascript file=solution.js (plain JavaScript, no imports/exports, top-level function declarations),',
        'then runnable tests in a block fenced as ```javascript file=tests.js using test(name, fn) with expect(x).toBe / toEqual / toBeTruthy / toBeFalsy / toContain / toThrow.',
        'The sandbox loads solution.js then tests.js. If the captain explicitly needs another language, write it, but note tests cannot run in the sandbox.',
      ].join('\n')
    case 'designer':
      return 'When it helps, include ONE self-contained SVG in a ```svg block (set viewBox, under 6 KB, no scripts or external references). Describe palette (hex), type and layout choices briefly.'
    case 'analyst':
      return 'Present numbers in Markdown tables and state assumptions. You may add one chart as a ```chart block containing JSON: {"type":"bar","title":"…","labels":["…"],"values":[1,2],"unit":"$"}.'
    case 'researcher':
      return 'Mark uncertain claims as (unverified). If you used web tools, end with a "Sources" list of the URLs you actually read.'
    default:
      return ''
  }
}

const RESPONSE_RULES = [
  '## Response rules',
  '- Do the actual work; never just describe what you would do.',
  '- First line: `SUMMARY: <one sentence describing what you produced>`.',
  '- Use Markdown with short headings. Be complete but tight.',
  '- Optionally end with up to 2 lines `DISCOVERY: <a surprising or reusable insight worth remembering>`.',
].join('\n')

export function workSystemPrompt(role: RoleId, trait: TraitId, tools: ToolName[], toolCallsLeft: number): string {
  return [persona(role, trait), roleFormat(role), RESPONSE_RULES, toolSection(tools, toolCallsLeft)].filter(Boolean).join('\n\n')
}

export function memoryBlock(memories: MemoryEntry[]): string {
  if (memories.length === 0) return ''
  return ['# Shared memory (from Moss\'s archive — may come from earlier projects)', ...memories.map((m) => `- [${m.kind}] ${m.text}`)].join('\n')
}

export function handoffBlock(inputs: { task: Task; artifact: Artifact }[], budgetChars = 16000): string {
  if (inputs.length === 0) return ''
  const per = Math.max(1500, Math.floor(budgetChars / inputs.length))
  return [
    '# Inputs handed off by teammates',
    ...inputs.map(({ task, artifact }) =>
      [`## From ${CREW[task.role].name} (${CREW[task.role].title}) — "${task.title}"`, truncate(artifact.content, per)].join('\n'),
    ),
  ].join('\n\n')
}

export function workUserMessage(opts: {
  goal: string
  planSummary?: string
  task: Task
  inputs: { task: Task; artifact: Artifact }[]
  memories: MemoryEntry[]
  reviewTarget?: { task: Task; artifact: Artifact }
  testReport?: string
}): string {
  const { goal, planSummary, task, inputs, memories } = opts
  const parts = [
    `# Captain's goal\n${goal}`,
    planSummary ? `# Plan (from Juno)\n${planSummary}` : '',
    `# Your task: ${task.title}\n${task.description}`,
    handoffBlock(inputs),
    memoryBlock(memories),
  ]
  if (task.feedback.length) {
    parts.push(
      [
        '# Feedback you must address in this attempt',
        ...task.feedback.map((f) => `- (${f.from === 'qa' ? 'Rook, QA' : f.from === 'user' ? 'Captain' : 'System'}) ${f.text}`),
      ].join('\n'),
    )
  }
  if (task.answer && task.question) parts.push(`# The captain answered your question\nQ: ${task.question}\nA: ${task.answer}`)
  return parts.filter(Boolean).join('\n\n')
}

export function reviewSystemPrompt(trait: TraitId): string {
  return [
    persona('qa', trait),
    [
      '## Review format',
      'Write a short Markdown review: what works, what is wrong or risky, and concrete fixes.',
      'List each blocking problem on its own line as `ISSUE: <specific, actionable problem>`.',
      'If automated tests were run and any failed, the verdict MUST be FAIL.',
      'Only fail for real problems (wrong, broken, missing requirement) — not style nitpicks.',
      'First line: `SUMMARY: <one sentence>`. Last line exactly `VERDICT: PASS` or `VERDICT: FAIL`.',
    ].join('\n'),
  ].join('\n\n')
}

export function reviewUserMessage(opts: {
  goal: string
  target: { task: Task; artifact: Artifact }
  testReport?: string
  round: number
  instructions?: string[]
}): string {
  const { goal, target, testReport, round, instructions } = opts
  return [
    `# Captain's goal\n${goal}`,
    `# Work under review: "${target.task.title}" by ${CREW[target.task.role].name} (review round ${round})`,
    `## Task description\n${target.task.description}`,
    `## Submitted work\n${truncate(target.artifact.content, 14000)}`,
    testReport ? `## Automated sandbox test report (real execution)\n${testReport}` : '## Automated tests\nNot applicable for this work.',
    instructions?.length ? `## Captain's instructions for this review\n${instructions.map((i) => `- ${i}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function planSystemPrompt(maxTasks: number): string {
  return [
    persona('planner', 'balanced'),
    [
      'Break the captain\'s goal into a small plan the crew can execute. Return ONLY a JSON object — no prose, no code fences — with this shape:',
      '{"title": "short project title (max 6 words)", "summary": "2-3 sentences: approach and what the captain gets", "deliverable": "one sentence describing the final deliverable", "tasks": [{"key": "t1", "title": "max 6 words", "role": "researcher|coder|writer|designer|analyst|qa", "description": "1-3 sentences: exactly what to produce", "dependsOn": [], "estimateMinutes": 2}]}',
      'Rules:',
      `- 3 to ${maxTasks} tasks. Each task is one specialist's single sitting (one model response).`,
      '- Maximize parallelism: add a dependency only when a task truly needs another task\'s output.',
      '- Roles: researcher = facts/options/sources; coder = code + tests (JavaScript preferred so tests can run); writer = prose/docs/copy; designer = visual direction, wireframes, SVG; analyst = numbers, pricing, comparisons, tables; qa = fact-check or review of NON-code work.',
      '- Do NOT add a final assemble/compile task — Juno assembles the deliverable automatically once all tasks finish.',
      '- Do NOT add QA for code — every coder task automatically gets Rook\'s test-and-review step.',
      '- Use each role at most twice. Keys must be unique ("t1", "t2", …) and dependsOn must reference earlier keys.',
    ].join('\n'),
  ].join('\n\n')
}

export function planUserMessage(goal: string, memories: MemoryEntry[], feedback?: string): string {
  return [`# Captain's goal\n${goal}`, memoryBlock(memories), feedback ? `# Fix this in your plan\n${feedback}` : '']
    .filter(Boolean)
    .join('\n\n')
}

export function deliverSystemPrompt(trait: TraitId): string {
  return [
    persona('planner', trait),
    [
      'Assemble the crew\'s outputs into ONE polished final deliverable for the captain.',
      '- Start with `SUMMARY: <one sentence>`, then a `#` title and a short executive summary.',
      '- Integrate and de-duplicate; organize by what the captain needs, not by who did what.',
      '- Keep code blocks, SVG blocks and chart blocks intact (copy them verbatim) when they are part of the result.',
      '- Note any open risks or unverified claims honestly. End with a short "Next steps" list.',
    ].join('\n'),
  ].join('\n\n')
}

export function deliverUserMessage(goal: string, planSummary: string | undefined, parts: { task: Task; artifact: Artifact }[], feedback: string[]): string {
  return [
    `# Captain's goal\n${goal}`,
    planSummary ? `# Plan summary\n${planSummary}` : '',
    handoffBlock(parts, 40000),
    feedback.length ? `# Captain's feedback on the previous version — address all of it\n${feedback.map((f) => `- ${f}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function memorySystemPrompt(): string {
  return [
    persona('archivist', 'concise'),
    [
      'Extract durable knowledge from a teammate\'s finished work. Return ONLY a JSON array (no prose, no fences):',
      '[{"text": "self-contained note", "kind": "fact|decision|discovery|lesson", "tags": ["2-4 lowercase keywords"]}]',
      '- At most 3 notes. Each must make sense on its own months from now, be specific, and be useful for future tasks.',
      '- Prefer decisions made, verified facts, reusable insights, and lessons from failures. Skip trivia and restatements of the goal.',
      '- Return [] if nothing is worth remembering.',
    ].join('\n'),
  ].join('\n\n')
}

export function memoryUserMessage(goal: string, task: Task, artifact: Artifact): string {
  return [
    `# Project goal\n${goal}`,
    `# Finished work: "${task.title}" by ${CREW[task.role].name}`,
    truncate(artifact.content, 8000),
    artifact.discoveries?.length ? `# Insights the author flagged\n${artifact.discoveries.map((d) => `- ${d}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function chatSystemPrompt(role: RoleId, trait: TraitId): string {
  return [
    persona(role, trait),
    'The captain is asking you a follow-up question. Answer in character in 2-6 sentences, honestly and specifically. If you do not know or the work is not done yet, say so plainly. Do not invent progress.',
  ].join('\n\n')
}

export function chatContext(opts: {
  role: RoleId
  status: string
  task?: Task
  artifact?: Artifact
  memories: MemoryEntry[]
  goal?: string
}): string {
  const { task, artifact, status, memories, goal } = opts
  return [
    goal ? `# Current project goal\n${goal}` : '# No active project right now.',
    `# Your current status\n${status}`,
    task ? `# Your current/last task: ${task.title} (${task.status})\n${task.description}` : '',
    task?.streamText ? `# Your work in progress (latest)\n${truncate(task.streamText, 3000)}` : '',
    artifact ? `# Your last finished output: ${artifact.title}\n${truncate(artifact.content, 5000)}` : '',
    memoryBlock(memories),
  ]
    .filter(Boolean)
    .join('\n\n')
}
