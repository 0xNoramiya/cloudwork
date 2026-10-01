// Capture Bolt mid-coding: inspector Work tab with the live stream, camera following him.
import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.click('.welcome .btn-primary')
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => { s.settings.demoSpeed = 0.5; s.settings.autoApproveWeb = true })
  window.__cw.engine.startProject(SAMPLE_GOALS[0].goal)
})
await p.waitForFunction(() => {
  const s = window.__cw.world(), a = s.agents.coder
  return a.taskId && (s.tasks[a.taskId]?.streamText.length ?? 0) > 450
}, null, { timeout: 180000, polling: 500 })
await p.evaluate(() => window.__cw.mutate((s) => { s.ui.selection = { kind: 'agent', id: 'coder' }; s.ui.focus = 'coder' }))
await p.waitForTimeout(500)
await p.click('.rightpanel .tab:has-text("Work")')
await p.waitForTimeout(4000)
await p.screenshot({ path: out })
await b.close()
