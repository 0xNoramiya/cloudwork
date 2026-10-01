// Headless screenshot helper for visual QA: node dev/shot_app.mjs <url> <out.png> [w] [h] [waitMs]
// Env: EVAL (JS evaluated in page before the shot), WAIT2 (extra wait after EVAL), CLICK (css selector to click first)
import { chromium } from 'playwright'
const [, , url, out, w = '1600', h = '900', wait = '6000'] = process.argv
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +w, height: +h } })
if (!process.env.TOUR) await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const logs = []
p.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`)
})
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message))
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(+wait)
if (process.env.CLICK) {
  for (const sel of process.env.CLICK.split('||')) {
    await p.click(sel, { timeout: 5000 }).catch((e) => logs.push('[click-fail] ' + sel + ' ' + e.message.slice(0, 120)))
    await p.waitForTimeout(600)
  }
}
if (process.env.EVAL) {
  const r = await p.evaluate(process.env.EVAL)
  if (r !== undefined) console.log('eval:', JSON.stringify(r).slice(0, 800))
}
if (process.env.WAIT2) await p.waitForTimeout(+process.env.WAIT2)
await p.screenshot({ path: out })
console.log(logs.slice(0, 30).join('\n'))
await b.close()
