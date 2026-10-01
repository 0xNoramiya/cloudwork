// Tour check: step through the first-run tour at one viewport and screenshot each step.
// usage: node dev/tour_test.mjs <outPrefix> <width>x<height> [mobile]
import { chromium } from 'playwright'
const [, , out = '/tmp/tour', size = '1440x900', mobile] = process.argv
const [width, height] = size.split('x').map(Number)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto(`${process.env.BASE ?? 'http://localhost:5199'}/?lowq`)
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.started = true)))
for (let i = 0; i < 4; i++) {
  await p.waitForSelector('.tour-card', { timeout: 20000 })
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${out}-tour${i}.png` })
  await p.click('.tour-card .btn-primary')
}
console.log('ok', errs.join('\n'))
await b.close()
