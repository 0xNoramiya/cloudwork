import { chromium } from 'playwright'
const [,, out, theme = 'theme-starlight', goal = '2', secs = '30', q = 'lowq', w = '1600', h = '900'] = process.argv
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +w, height: +h } })
if (!process.env.TOUR) await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('unmount a root')) errs.push('[console] ' + m.text().slice(0, 200)) })
await p.goto(`http://localhost:5199/?${q}`, { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.click('.welcome .btn-primary')
await p.evaluate(async ([th, i]) => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => { s.settings.demoSpeed = 2; s.game.theme = th; if (!s.game.unlocked.includes(th)) s.game.unlocked.push(th); s.game.unlocked.push('facility-fountain', 'facility-fairylights', 'facility-balloon', 'facility-rainbow') })
  if (i >= 0) window.__cw.engine.startProject(SAMPLE_GOALS[i].goal)
}, [theme, Number(goal)])
for (let i = 0; i < Number(secs); i++) {
  await p.waitForTimeout(1000)
  await p.evaluate(() => { const W = window.__cw, s = W.world(); for (const a of Object.values(s.approvals)) if (a.status === 'pending' && a.kind !== 'ship' && Date.now() - a.createdAt > 6000) W.engine.decide(a.id, true) })
}
await p.screenshot({ path: out })
console.log(errs.slice(0, 10).join('\n'))
await b.close()
