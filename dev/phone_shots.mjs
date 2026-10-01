// Phone screenshots for the README: world, crew sheet, task board, inspector (390x844, touch).
// usage: node dev/phone_shots.mjs <outPrefix>
import { chromium } from 'playwright'
const out = process.argv[2] || '/tmp/phone'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
await p.goto(`${process.env.BASE ?? 'http://localhost:5199'}/?lowq`)
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => {
    s.ui.started = true
    s.settings.demoSpeed = 3
  })
  window.__cw.engine.startProject(SAMPLE_GOALS[0].goal)
})
const handle = () =>
  p.evaluate(() => {
    const W = window.__cw
    for (const a of Object.values(W.world().approvals)) if (a.status === 'pending' && a.kind !== 'ship') W.engine.decide(a.id, true)
  })
for (let i = 0; i < 26; i++) {
  await p.waitForTimeout(1000)
  await handle()
}
const shot = async (name, fn) => {
  await p.evaluate(fn)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${out}-${name}.png` })
}
await shot('world', () => window.__cw.mutate((s) => void ((s.ui.sheet = null), (s.ui.selection = { kind: null, id: null }))))
await shot('crew', () => window.__cw.mutate((s) => void (s.ui.sheet = 'crew')))
await shot('tasks', () => window.__cw.mutate((s) => void ((s.ui.sheet = null), (s.ui.panel = 'tasks'))))
await shot('inspector', () =>
  window.__cw.mutate((s) => {
    s.ui.panel = null
    const busy = Object.values(s.agents).find((a) => a.taskId)
    s.ui.selection = { kind: 'agent', id: busy ? busy.id : 'coder' }
  }),
)
await b.close()
console.log('ok')
