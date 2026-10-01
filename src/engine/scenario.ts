import type { ScenarioId } from './types'

const RULES: { id: ScenarioId; words: RegExp }[] = [
  {
    id: 'code',
    words:
      /\b(code|coding|function|script|utility|library|implement|algorithm|parser|cli|api|bug|regex|typescript|javascript|python|program|module|unit tests?|refactor)\b/i,
  },
  {
    id: 'launch',
    words: /\b(startup|launch|product|business|brand|branding|marketing|pricing|landing page|go-to-market|pitch|subscription|shop|store)\b/i,
  },
  {
    id: 'content',
    words: /\b(blog|post|article|newsletter|story|copy|essay|tweet|thread|script for|video|podcast|speech|guide|tutorial|explainer|faq|handbook|cheat ?sheet)\b/i,
  },
]

export function detectScenario(goal: string): ScenarioId {
  for (const r of RULES) if (r.words.test(goal)) return r.id
  return 'research'
}

export const SAMPLE_GOALS: { title: string; goal: string; scenario: ScenarioId; blurb: string }[] = [
  {
    title: 'Slugify utility',
    goal: 'Build a small JavaScript utility that turns any title into a clean URL slug, with unit tests and a short README.',
    scenario: 'code',
    blurb: 'Coder + QA loop with real sandboxed tests',
  },
  {
    title: 'Cozy coffee launch',
    goal: 'Create a launch plan for a cozy neighborhood coffee subscription called "Cloud Nine Beans": market snapshot, pricing, brand direction and landing page copy.',
    scenario: 'launch',
    blurb: 'Research, pricing math, brand SVG, copy',
  },
  {
    title: 'Study methods guide',
    goal: 'Write a friendly comparison guide of three note-taking methods (Cornell, Zettelkasten, outline) for first-year university students.',
    scenario: 'content',
    blurb: 'Research → writing → review',
  },
]
