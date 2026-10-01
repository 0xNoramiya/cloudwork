import { Check, Globe, HelpCircle, Map as MapIcon, Rocket, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sfx } from '../audio/sfx'
import { CREW } from '../engine/crew'
import { engine } from '../engine/engine'
import { WORK_ROLES, type ApprovalRequest, type RoleId, type Task } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { Empty, Portrait, clock, timeAgo } from './common'
import { logIcon } from './icons'

function PlanEditor({ projectId }: { projectId: string }) {
  const tasks = useWorld(useShallow((s) => (s.projects[projectId]?.taskIds ?? []).map((id) => s.tasks[id]).filter((t) => t && t.kind !== 'plan' && t.kind !== 'deliver')))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return (
    <div className="col" style={{ gap: 5, margin: '6px 0 10px' }}>
      {tasks.map((t) => (
        <div key={t.id} className="card" style={{ padding: '7px 9px', ['--role' as string]: CREW[t.role].color, borderLeft: `5px solid ${CREW[t.role].color}` }}>
          <div className="row">
            <strong className="grow small" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {t.title}
            </strong>
            {t.kind === 'work' ? (
              <select
                className="select"
                aria-label={`Owner of ${t.title}`}
                value={t.role}
                onChange={(e) => engine.editPlanTask(t.id, { role: e.target.value as RoleId })}
                style={{ width: 118, fontSize: 12, padding: '3px 6px' }}
              >
                {WORK_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {CREW[r].name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip">{CREW[t.role].name} · QA</span>
            )}
            <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`Remove ${t.title}`} onClick={() => engine.editPlanTask(t.id, { remove: true })}>
              <Trash2 size={13} />
            </button>
          </div>
          <div className="tiny muted" style={{ fontWeight: 700, marginTop: 3 }}>
            {t.description}
            {t.dependsOn.length > 0 && ` · after ${t.dependsOn.map((d) => byId.get(d)?.title ?? 'review').join(', ')}`}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ApprovalCard({ a }: { a: ApprovalRequest }) {
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const c = CREW[a.agentId]
  const Icon = a.kind === 'ship' ? Rocket : a.kind === 'plan' ? MapIcon : a.kind === 'web_search' ? Search : Globe
  const decided = a.status !== 'pending'
  return (
    <div className={`approval-card${a.kind === 'ship' ? ' ship' : ''}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Portrait role={a.agentId} size="sm" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <Icon size={15} />
            <strong className="approval-title">{a.title}</strong>
          </div>
          <div className="small muted" style={{ fontWeight: 700 }}>
            {c.name} · {timeAgo(a.createdAt)} · risk: {a.risk}
          </div>
        </div>
      </div>
      <p className="small" style={{ margin: '8px 0', fontWeight: 600, lineHeight: 1.45 }}>
        {a.detail}
      </p>
      {a.kind === 'plan' && !decided && typeof a.payload.projectId === 'string' && <PlanEditor projectId={a.payload.projectId} />}
      {a.kind === 'ship' && typeof a.payload.artifactId === 'string' && (
        <button className="btn btn-sm" style={{ marginBottom: 8 }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'artifact', id: a.payload.artifactId as string }))}>
          Review the deliverable first
        </button>
      )}
      {decided ? (
        <div className={`chip tone ${a.status === 'approved' ? 'tone-good' : 'tone-bad'}`}>
          {a.status === 'approved' ? 'Approved' : 'Rejected'} {a.decidedAt ? clock(a.decidedAt) : ''} {a.note ? `· “${a.note}”` : ''}
        </div>
      ) : rejecting ? (
        <div className="col">
          <textarea
            className="textarea"
            style={{ minHeight: 60 }}
            placeholder={
              a.kind === 'ship' ? 'What should Juno change? (sent as revision feedback)' : a.kind === 'plan' ? 'How should Juno re-plan?' : 'Optional note for the agent'
            }
            value={note}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row">
            <button className="btn btn-bad btn-sm" onClick={() => engine.decide(a.id, false, note.trim() || undefined)}>
              <X size={14} /> {a.kind === 'ship' ? 'Request revision' : a.kind === 'plan' ? 'Re-plan' : 'Reject'}
            </button>
            <button className="btn btn-sm" onClick={() => setRejecting(false)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn btn-good btn-sm" onClick={() => engine.decide(a.id, true)}>
            <Check size={14} /> {a.kind === 'ship' ? 'Approve & ship' : a.kind === 'plan' ? 'Start the crew' : 'Approve'}
          </button>
          <button className="btn btn-bad btn-sm" onClick={() => setRejecting(true)}>
            <X size={14} /> {a.kind === 'ship' ? 'Revise…' : a.kind === 'plan' ? 'Send back…' : 'Reject…'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Pull "(A) …, or (B) …" style options out of a question so they can be answered in one click. */
function parseChoices(q: string): string[] {
  const marks = [...q.matchAll(/\(([A-Z])\)/g)]
  return marks.map((m, i) => {
    const from = m.index! + m[0].length
    const to = i + 1 < marks.length ? marks[i + 1].index! : q.length
    const text = q
      .slice(from, to)
      .replace(/[,;]?\s*(?:\bor\b)?\s*$/i, '')
      .replace(/[?.!]+\s*$/, '')
      .trim()
    return `${m[1]}: ${text}`
  })
}

export function QuestionCard({ t }: { t: Task }) {
  const [answer, setAnswer] = useState('')
  const c = CREW[t.role]
  const suggestions = parseChoices(t.question ?? '')
  return (
    <div className="approval-card">
      <div className="row">
        <Portrait role={t.role} size="sm" />
        <div className="grow">
          <div className="row" style={{ gap: 6 }}>
            <HelpCircle size={15} />
            <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{c.name} has a question</strong>
          </div>
          <div className="small muted" style={{ fontWeight: 700 }}>
            for “{t.title}”
          </div>
        </div>
      </div>
      <p className="small" style={{ margin: '8px 0', fontWeight: 700, lineHeight: 1.45 }}>
        {t.question}
      </p>
      {suggestions.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {suggestions.map((s) => (
            <button key={s} className="chip chip-btn" onClick={() => engine.answer(t.id, s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          engine.answer(t.id, answer)
        }}
      >
        <input className="input" placeholder="Type your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ fontSize: 14, padding: '7px 10px' }} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!answer.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export function CaptainDesk() {
  const approvals = useWorld(useShallow((s) => Object.values(s.approvals).filter((a) => a.status === 'pending')))
  const questions = useWorld(useShallow((s) => Object.values(s.tasks).filter((t) => t.status === 'needs_input')))
  const recent = useWorld(
    useShallow((s) =>
      s.log
        .filter((l) => l.level !== 'debug')
        .slice(-9)
        .reverse(),
    ),
  )
  const hasProject = useWorld((s) => Boolean(s.activeProjectId))
  const webPending = approvals.filter((a) => a.kind === 'web_search' || a.kind === 'fetch_url').length
  return (
    <div className="rightpanel-body scroll">
      <div className="section-title" style={{ marginTop: 4 }}>
        Needs you {approvals.length + questions.length > 0 && <span className="chip tone tone-wait">{approvals.length + questions.length}</span>}
      </div>
      {approvals.length + questions.length === 0 ? (
        <p className="quiet-note">Nothing needs you. Approvals and crew questions show up here and at the Sky Dock.</p>
      ) : (
        <div className="col">
          {webPending > 1 && (
            <button className="btn btn-sm" onClick={() => engine.approveAllWeb()}>
              Approve all {webPending} web requests
            </button>
          )}
          {questions.map((t) => (
            <QuestionCard key={t.id} t={t} />
          ))}
          {approvals.map((a) => (
            <ApprovalCard key={a.id} a={a} />
          ))}
        </div>
      )}
      <div className="section-title">Happening now</div>
      {recent.length === 0 ? (
        <Empty title="Quiet skies">{hasProject ? 'Waiting for activity…' : 'Start a goal to wake the crew.'}</Empty>
      ) : (
        <div className="feed">
          {recent.map((l) => {
            const TypeIcon = logIcon(l.type)
            return (
              <button
                key={l.id}
                className="feed-row"
                onClick={() => {
                  const artId = l.data?.artifactId as string | undefined
                  mutate((s) => {
                    if (artId) s.ui.selection = { kind: 'artifact', id: artId }
                    else if (l.taskId) s.ui.selection = { kind: 'task', id: l.taskId }
                    else if (l.agentId) s.ui.selection = { kind: 'agent', id: l.agentId }
                  })
                  sfx('click')
                }}
              >
                {l.agentId ? (
                  <Portrait role={l.agentId} size="sm" />
                ) : (
                  <span className="feed-icon" aria-hidden>
                    <TypeIcon size={15} />
                  </span>
                )}
                <span className="feed-text">
                  {l.text}
                  <span className="feed-time">{timeAgo(l.at)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
