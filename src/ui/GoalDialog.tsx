import { Rocket, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sfx } from '../audio/sfx'
import { engine } from '../engine/engine'
import { retrieveMemories } from '../engine/memory'
import { SAMPLE_GOALS, detectScenario } from '../engine/scenario'
import { mutate, useWorld } from '../state/store'
import { Dialog, MOD_KEY } from './common'
import { useRunMode } from './TopBar'

export function GoalDialog() {
  const open = useWorld((s) => s.ui.goalOpen)
  const memories = useWorld((s) => s.memories)
  const planner = useWorld((s) => s.agents.planner.loadout.model ?? s.settings.defaultModel)
  const busy = useWorld((s) => {
    const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
    return Boolean(p && !['done', 'failed', 'cancelled'].includes(p.status))
  })
  const mode = useRunMode()
  const reviewPlan = useWorld((s) => s.settings.reviewPlan)
  const [goal, setGoal] = useState('')
  const draft = useWorld((s) => s.ui.goalDraft)
  useEffect(() => {
    if (!open || !draft) return
    setGoal(draft)
    mutate((s) => void (s.ui.goalDraft = ''))
  }, [open, draft])
  const related = useMemo(() => (goal.trim().length > 8 ? retrieveMemories(Object.values(memories), goal, 4) : []), [goal, memories])
  if (!open) return null
  const close = () => {
    sfx('close')
    mutate((s) => void (s.ui.goalOpen = false))
  }
  const launch = () => {
    if (!goal.trim()) return
    const id = engine.startProject(goal)
    if (id) setGoal('')
  }
  return (
    <Dialog label="New goal" onClose={close} className="modal panel">
      <div className="panel-head">
        <Rocket size={20} />
        <h2 className="panel-title grow">Give the crew a goal</h2>
        <button className="icon-btn" aria-label="Close" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <div className="modal-body">
        <p className="small" style={{ marginTop: 0, fontWeight: 700, color: 'var(--ink-2)' }}>
          Juno breaks it into tasks, the crew works in parallel where they can, hands off where they can't, and asks you before anything leaves the islands.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            launch()
          }}
        >
          <textarea
            className="textarea"
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                launch()
              }
            }}
            placeholder="e.g. “Plan a launch for my ceramics shop: market scan, pricing, brand direction and a landing page.”"
            style={{ minHeight: 110 }}
          />
          {related.length > 0 && (
            <div className="card soft small" style={{ marginTop: 8, fontWeight: 700 }}>
              <Sparkles size={13} style={{ verticalAlign: -2 }} /> Moss will bring {related.length} related memor{related.length === 1 ? 'y' : 'ies'}: “
              {related[0].entry.text.slice(0, 110)}
              {related[0].entry.text.length > 110 ? '…' : ''}”
            </div>
          )}
          {mode === 'demo' && goal.trim().length > 12 && !SAMPLE_GOALS.some((g) => g.goal === goal.trim()) && (
            <div className="card soft small" style={{ marginTop: 10, fontWeight: 700, borderColor: 'var(--gold)' }}>
              Heads-up: in Demo mode a custom goal gets generic placeholder writing. The plan, hand-offs, approvals, tests and memory still run for real. For real answers, add an
              API key in Settings, or point the Local provider at Ollama.
            </div>
          )}
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" type="submit" disabled={!goal.trim() || busy}>
              <Rocket size={17} /> Launch
            </button>
            <span className="kbd">{MOD_KEY} + Enter</span>
            <span className="grow" />
            <span className={`mode-chip mode-${mode}`} style={{ cursor: 'default' }}>
              {mode}
            </span>
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              Planner: {planner.providerId === 'demo' ? 'Demo (simulated)' : `${planner.providerId}/${planner.model}`}
            </span>
          </div>
          <label className="toggle small" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={reviewPlan} onChange={(e) => mutate((s) => void (s.settings.reviewPlan = e.target.checked))} />
            Let me review and edit Juno's plan before the crew starts
          </label>
          {busy && (
            <p className="small" style={{ color: 'var(--tone-wait)', fontWeight: 800 }}>
              A project is already running. Finish or cancel it first.
            </p>
          )}
        </form>
        <div className="section-title">Try one of these</div>
        <div className="col">
          {SAMPLE_GOALS.map((g) => (
            <button key={g.title} className="sample-goal" onClick={() => setGoal(g.goal)} type="button">
              <strong>{g.title}</strong>
              <span className="small" style={{ fontWeight: 600, color: 'var(--ink-2)' }}>
                {g.goal}
              </span>
              <span className="tiny muted" style={{ display: 'block', fontWeight: 800, marginTop: 4 }}>
                {g.blurb}
              </span>
            </button>
          ))}
        </div>
        {mode === 'demo' && (
          <p className="tiny muted" style={{ fontWeight: 700, marginTop: 12 }}>
            Demo mode recognizes goal types ({goal.trim() ? `this one reads as “${detectScenario(goal)}”` : 'code, launch, content, research'}) and plays scripted model outputs.
            The plan graph, parallel scheduling, hand-offs, approvals, sandboxed test runs, QA rework loops, memory and delivery all run for real. Add a key in Settings for
            original output.
          </p>
        )}
      </div>
    </Dialog>
  )
}
