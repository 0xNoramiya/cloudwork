// Runs a quick demo project, then opens Replay and screenshots the world mid-playback.
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
  window.__cw.mutate((s) => { s.settings.demoSpeed = 4; s.settings.autoApproveWeb = true })
  window.__cw.engine.startProject(SAMPLE_GOALS[1].goal)
})
for (let i = 0; i < 150; i++) {
  await p.waitForTimeout(1000)
  const st = await p.evaluate(() => {
    const W = window.__cw, s = W.world()
    for (const t of Object.values(s.tasks)) if (t.status === 'needs_input') W.engine.answer(t.id, 'A')
    for (const a of Object.values(s.approvals)) if (a.status === 'pending') W.engine.decide(a.id, true)
    return s.projects[s.activeProjectId]?.status
  })
  if (st === 'done') break
}
await p.waitForTimeout(2500)
await p.evaluate(() => window.__cw.mutate((s) => { s.ui.celebrate = null; s.ui.panel = 'replay' }))
await p.waitForTimeout(6000)
await p.screenshot({ path: out })
console.log(errs.slice(0, 5).join('\n'))
await b.close()
