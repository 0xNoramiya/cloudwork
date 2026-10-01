// Live-mode e2e against dev/mock-llm.mjs (see README → Testing). Generated from demo_run.mjs.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'
const [, , goalIdx = '0', outPrefix = '/tmp/run', total = '150'] = process.argv
mkdirSync(dirname(outPrefix), { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
if (!process.env.TOUR) await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('unmount a root')) errs.push('[console] ' + m.text().slice(0, 300)) })
await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.click('.welcome .btn-primary')
await p.waitForTimeout(800)
await p.evaluate(async (i) => {
  const { engine, mutate } = window.__cw
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  mutate((s) => { s.settings.defaultModel = { providerId: 'anthropic', model: 'claude-opus-5-5' }; const l = s.settings.providers.find((p) => p.id === 'local'); l.baseUrl = 'http://localhost:5299/v1'; s.agents.writer.loadout.model = { providerId: 'local', model: 'llama3.2' }; s.agents.designer.loadout.model = { providerId: 'local', model: 'llama3.2' } })
  engine.startProject('Plan a launch for a tiny tea shop called Leaf & Ladle')
}, Number(goalIdx))
const shots = [4, 12, 25, 45, 70, 100, 130]
let n = 0
for (let t = 0; t < Number(total); t++) {
  await p.waitForTimeout(1000)
  // answer questions / approvals like a captain would
  await p.evaluate(() => {
    const W = window.__cw
    const s = W.world()
    for (const t of Object.values(s.tasks)) if (t.status === 'needs_input') W.engine.answer(t.id, 'B — bold, modern & minimal')
    for (const a of Object.values(s.approvals)) if (a.status === 'pending' && (Date.now() - a.createdAt > 3000)) W.engine.decide(a.id, true)
  })
  if (shots.includes(t)) {
    await p.screenshot({ path: `${outPrefix}-${String(t).padStart(3, '0')}.png` })
    n++
  }
  const done = await p.evaluate(() => { const s = window.__cw.world(); const pr = s.projects[s.activeProjectId]; return pr ? pr.status : 'none' })
  if (done === 'done') { await p.waitForTimeout(3000); await p.screenshot({ path: `${outPrefix}-done.png` }); break }
}
const summary = await p.evaluate(() => {
  const s = window.__cw.world()
  const pr = s.projects[s.activeProjectId]
  return {
    status: pr?.status, title: pr?.title, tasks: pr?.taskIds.map((id) => `${s.tasks[id].title} [${s.tasks[id].role}] ${s.tasks[id].status} a${s.tasks[id].attempts}`),
    memories: Object.keys(s.memories).length, achievements: Object.keys(s.game.achievements), level: s.game.level, xp: s.game.xp,
    log: s.log.slice(-60).map((l) => l.text),
  }
})
console.log(JSON.stringify(summary, null, 2))
console.log(errs.slice(0, 20).join('\n'))
await b.close()
