// Plan review edge cases: pause/resume and cancel/retry while the plan awaits approval must not stack
// a second task graph or start work before approval; removing a coder task keeps dependents wired upstream.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1400, height: 800 } })
await p.addInitScript(() => localStorage.setItem('cloudworks.tour.v1', 'done'))
const errs = []
p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
await p.goto('http://localhost:5199/?lowq', { waitUntil: 'load' })
await p.waitForFunction(() => window.__cw, null, { timeout: 90000 })
await p.evaluate(() => window.__cw.mutate((s) => void (s.ui.started = true)))

const waitPlan = () =>
  p.waitForFunction(() => Object.values(window.__cw.world().approvals).some((a) => a.kind === 'plan' && a.status === 'pending'), null, { timeout: 60000 })
const snapshot = () =>
  p.evaluate(() => {
    const s = window.__cw.world()
    const pr = s.projects[s.activeProjectId]
    const tasks = pr.taskIds.map((id) => s.tasks[id]).filter(Boolean)
    return {
      status: pr.status,
      total: pr.taskIds.length,
      dangling: pr.taskIds.filter((id) => !s.tasks[id]).length,
      started: tasks.filter((t) => t.kind !== 'plan' && !['pending', 'cancelled'].includes(t.status)).map((t) => `${t.title}:${t.status}`),
      delivers: tasks.filter((t) => t.kind === 'deliver').length,
    }
  })
const results = {}

// 1. Pause + resume while the plan is waiting for approval.
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.mutate((s) => {
    s.settings.demoSpeed = 4
    s.settings.reviewPlan = true
  })
  window.__cw.engine.startProject(SAMPLE_GOALS[1].goal)
})
await waitPlan()
results.firstProposal = await snapshot()
await p.evaluate(() => {
  window.__cw.engine.pauseProject()
  window.__cw.engine.resumeProject()
})
await waitPlan()
await p.waitForTimeout(500)
results.afterPauseResume = await snapshot()

// 2. Cancel + retry the plan task while the plan is waiting.
await p.evaluate(() => {
  const W = window.__cw
  W.engine.cancelProject()
  const s = W.world()
  const plan = s.projects[s.activeProjectId].taskIds.map((id) => s.tasks[id]).find((t) => t.kind === 'plan')
  W.engine.retry(plan.id)
})
await p.waitForTimeout(300)
results.afterRetryImmediate = await snapshot()
await waitPlan()
await p.waitForTimeout(1500)
results.afterRetryProposal = await snapshot()

// 3. Code scenario: remove the coder task; README/profile must inherit its upstream dependency (edge cases).
await p.evaluate(async () => {
  const { SAMPLE_GOALS } = await import('/src/engine/scenario.ts')
  window.__cw.engine.cancelProject()
  window.__cw.engine.startProject(SAMPLE_GOALS[0].goal)
})
await waitPlan()
results.coderRemoval = await p.evaluate(() => {
  const W = window.__cw
  const s0 = W.world()
  const pr0 = s0.projects[s0.activeProjectId]
  const coder = pr0.taskIds.map((id) => s0.tasks[id]).find((t) => t.role === 'coder')
  W.engine.editPlanTask(coder.id, { remove: true })
  const s = W.world()
  const pr = s.projects[s.activeProjectId]
  const title = (id) => s.tasks[id]?.title ?? `missing:${id}`
  return pr.taskIds.map((id) => s.tasks[id]).filter((t) => t.kind !== 'plan').map((t) => `${t.title} ← [${t.dependsOn.map(title).join(', ')}]`)
})
console.log(JSON.stringify(results, null, 1))
console.log(errs.slice(0, 5).join('\n') || 'no page errors')
await b.close()
