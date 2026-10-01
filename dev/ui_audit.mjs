// UI audit: run a demo project at one viewport, screenshot the main states and report text/box overflow.
// usage: node dev/ui_audit.mjs <outPrefix> <width>x<height> [mobile] [baseUrl]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'
const [, , out = '/tmp/audit', size = '1440x900', mobileArg = '', base = 'http://localhost:5199'] = process.argv
const [width, height] = size.split('x').map(Number)
const mobile = mobileArg === 'mobile'
mkdirSync(dirname(out), { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 })
const p = await ctx.newPage()
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
await p.goto(`${base}/?lowq`, { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.waitForTimeout(1500)

const report = {}
/** Elements whose text spills out of (or is hard-clipped by) their box, or that leave the viewport. */
const audit = (label) =>
  p.evaluate((label) => {
    const vw = innerWidth
    const vh = innerHeight
    const found = []
    const name = (el) => {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
    }
    const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('canvas')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50)
      if (hasOwnText(el) && el.scrollWidth > el.clientWidth + 2) {
        const clipped = cs.overflowX !== 'visible'
        const ellipsis = cs.textOverflow === 'ellipsis'
        if (!ellipsis) found.push({ kind: clipped ? 'text-clipped' : 'text-spills', el: name(el), text, w: Math.round(r.width), need: el.scrollWidth })
      }
      if (hasOwnText(el) && el.scrollHeight > el.clientHeight + 2 && cs.overflowY === 'hidden' && !cs.webkitLineClamp?.match(/\d/))
        found.push({ kind: 'text-cut-vertically', el: name(el), text, h: Math.round(r.height), need: el.scrollHeight })
      const fixedish = ['fixed', 'absolute', 'sticky'].includes(cs.position) || el.matches('.panel, .drawer, .card, button, .chip')
      if (fixedish && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1) && !el.closest('.scroll'))
        found.push({ kind: 'offscreen', el: name(el), text, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] })
    }
    // collapse duplicates
    const seen = new Set()
    const uniq = found.filter((f) => {
      const k = f.kind + f.el + f.text
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const docOverflow = document.documentElement.scrollWidth > vw + 1 ? `page scrolls horizontally: ${document.documentElement.scrollWidth}px > ${vw}px` : null
    return { label, docOverflow, issues: uniq.slice(0, 60) }
  }, label)

const shot = async (name) => {
  await p.waitForTimeout(900)
  await p.screenshot({ path: `${out}-${name}.png` })
  report[name] = await audit(name)
}
const handle = () =>
  p.evaluate(() => {
    const W = window.__cw
    const s = W.world()
    for (const t of Object.values(s.tasks)) if (t.status === 'needs_input') W.engine.answer(t.id, 'A: cozy & handcrafted pastel')
    for (const a of Object.values(s.approvals)) if (a.status === 'pending' && a.kind !== 'ship' && Date.now() - a.createdAt > 2500) W.engine.decide(a.id, true)
  })

await shot('welcome')
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.started = true)))
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.goalOpen = true)))
await shot('goal')
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => {
    s.ui.goalOpen = false
    s.settings.demoSpeed = 3
  })
  window.__cw.engine.startProject(SAMPLE_GOALS[1].goal)
})
for (let i = 0; i < 14; i++) {
  await p.waitForTimeout(1000)
  if (i < 12) await handle()
}
await shot('world')
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.selection = { kind: 'agent', id: 'researcher' })))
await shot('agent')
for (const panel of (process.env.PANELS || 'tasks,memory,artifacts,log,achievements,settings').split(',')) {
  await p.evaluate((pn) => window.__cw.mutate((s) => void (s.ui.panel = pn)), panel)
  await shot(`panel-${panel}`)
  await handle()
}
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.panel = null)))
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(1000)
  await handle()
  const done = await p.evaluate(() => Object.values(window.__cw.world().approvals).some((a) => a.kind === 'ship' && a.status === 'pending'))
  if (done) break
}
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.selection = { kind: null, id: null })))
await shot('ship')
writeFileSync(`${out}-report.json`, JSON.stringify({ size, mobile, errs, report }, null, 1))
const summary = Object.values(report).map((r) => `${r.label}: ${r.issues.length} issue(s)${r.docOverflow ? ' · ' + r.docOverflow : ''}`)
console.log(summary.join('\n'))
console.log(errs.slice(0, 5).join('\n'))
await b.close()
