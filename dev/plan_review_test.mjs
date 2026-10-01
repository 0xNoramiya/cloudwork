// Plan review: wait for Juno's plan approval, edit it (remove + reassign), screenshot, approve, verify.
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.click('.welcome .btn-primary')
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => { s.settings.demoSpeed = 4; s.settings.reviewPlan = true })
  window.__cw.engine.startProject(SAMPLE_GOALS[1].goal)
})
await p.waitForFunction(() => Object.values(window.__cw.world().approvals).some((a) => a.kind === 'plan' && a.status === 'pending'), null, { timeout: 60000 })
await p.waitForTimeout(800)
const before = await p.evaluate(() => {
  const W = window.__cw, s = W.world(), pr = s.projects[s.activeProjectId]
  const tasks = pr.taskIds.map((id) => s.tasks[id])
  const fact = tasks.find((t) => /fact-check/i.test(t.title))
  const pricing = tasks.find((t) => /pricing/i.test(t.title))
  W.engine.editPlanTask(fact.id, { remove: true })
  W.engine.editPlanTask(pricing.id, { role: 'researcher' })
  return tasks.map((t) => `${t.title} [${t.role}] ${t.status}`)
})
await p.waitForTimeout(800)
await p.screenshot({ path: out })
const after = await p.evaluate(() => {
  const W = window.__cw, s = W.world(), pr = s.projects[s.activeProjectId]
  const a = Object.values(s.approvals).find((x) => x.kind === 'plan' && x.status === 'pending')
  W.engine.decide(a.id, true)
  return pr.taskIds.map((id) => { const t = s.tasks[id]; return `${t.title} [${t.role}] deps=${t.dependsOn.length}` })
})
await p.waitForTimeout(6000)
const running = await p.evaluate(() => { const s = window.__cw.world(); return { status: s.projects[s.activeProjectId].status, busy: Object.values(s.agents).filter((a) => a.taskId).map((a) => a.id) } })
console.log(JSON.stringify({ before, after, running }, null, 1))
console.log(errs.slice(0, 5).join('\n'))
await b.close()
