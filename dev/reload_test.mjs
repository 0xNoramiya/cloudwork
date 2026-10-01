// Persistence: start a project, reload mid-flight, verify it restores paused, resume, and finish.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } })
const p = await ctx.newPage()
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
const boot = async () => {
  await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
  await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
  await p.click('.welcome .btn-primary')
}
const handle = () => p.evaluate(() => {
  const W = window.__cw, s = W.world()
  for (const t of Object.values(s.tasks)) if (t.status === 'needs_input') W.engine.answer(t.id, 'A')
  for (const a of Object.values(s.approvals)) if (a.status === 'pending') W.engine.decide(a.id, true)
  const pr = s.projects[s.activeProjectId]
  return pr ? `${pr.status} ${pr.taskIds.filter((id) => s.tasks[id].status === 'done').length}/${pr.taskIds.length}` : 'none'
})
await boot()
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => { s.settings.demoSpeed = 3 })
  window.__cw.engine.startProject(SAMPLE_GOALS[0].goal)
})
for (let i = 0; i < 14; i++) { await p.waitForTimeout(1000); await handle() }
const beforeReload = await handle()
await p.waitForTimeout(3000) // let autosave flush
await boot()
await p.waitForTimeout(1500)
const afterReload = await p.evaluate(() => {
  const s = window.__cw.world(), pr = s.projects[s.activeProjectId]
  return { status: pr?.status, tasks: pr?.taskIds.map((id) => `${s.tasks[id].title}:${s.tasks[id].status}`), memories: Object.keys(s.memories).length, toast: s.ui.toasts.map((t) => t.title) }
})
await p.evaluate(() => window.__cw.engine.resumeProject())
let final = ''
for (let i = 0; i < 150; i++) { await p.waitForTimeout(1000); final = await handle(); if (final.startsWith('done')) break }
console.log(JSON.stringify({ beforeReload, afterReload, final }, null, 1))
console.log(errs.slice(0, 5).join('\n'))
await b.close()
