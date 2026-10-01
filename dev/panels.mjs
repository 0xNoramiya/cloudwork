// Visual QA: run a demo project partway, then screenshot each drawer and inspector tab.
import { chromium } from 'playwright'
const out = process.argv[2] || '/tmp/panels'
const goal = Number(process.argv[3] || 1)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
if (!process.env.TOUR) await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('unmount a root')) errs.push('[console] ' + m.text().slice(0, 200)) })
await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 60000 })
await p.click('.welcome .btn-primary')
await p.evaluate(async (i) => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => { s.settings.demoSpeed = 3 })
  window.__cw.engine.startProject(SAMPLE_GOALS[i].goal)
}, goal)
const handle = async () => p.evaluate(() => {
  const W = window.__cw, s = W.world()
  for (const t of Object.values(s.tasks)) if (t.status === 'needs_input') W.engine.answer(t.id, 'A: cozy & handcrafted pastel')
  for (const a of Object.values(s.approvals)) if (a.status === 'pending' && a.kind !== 'ship' && Date.now() - a.createdAt > 2500) W.engine.decide(a.id, true)
})
for (let i = 0; i < 26; i++) { await p.waitForTimeout(1000); await handle() }
await p.screenshot({ path: `${out}-world.png` })
const panels = (process.env.PANELS || 'tasks,memory,artifacts,log,stats,achievements,discoveries,ideas,decorate,customize,settings,projects').split(',')
for (const panel of panels) {
  await p.evaluate((pn) => window.__cw.mutate((s) => { s.ui.panel = pn }), panel)
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `${out}-${panel}.png` })
  await handle()
}
await p.evaluate(() => window.__cw.mutate((s) => { s.ui.panel = null; s.ui.selection = { kind: 'agent', id: 'researcher' } }))
await p.waitForTimeout(800)
await p.screenshot({ path: `${out}-agent-overview.png` })
for (const tab of ['Work', 'Ask', 'Loadout']) {
  await p.click(`.rightpanel .tab:has-text("${tab}")`).catch((e) => errs.push('tab ' + tab + ' ' + e.message.slice(0, 80)))
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${out}-agent-${tab.toLowerCase()}.png` })
}
console.log(errs.slice(0, 20).join('\n'))
await b.close()
