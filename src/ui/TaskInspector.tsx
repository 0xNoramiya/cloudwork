import { ArrowDown, ArrowUp, Ban, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../engine/crew'
import { engine } from '../engine/engine'
import { WORK_ROLES, type RoleId } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { CloseButton } from './AgentInspector'
import { QuestionCard } from './Desk'
import { TASK_STATUS_LABEL, taskTone } from './icons'
import { Bar, Portrait, ProvBadge, compact, duration, money } from './common'

export function TaskInspector({ id }: { id: string }) {
  const t = useWorld((s) => s.tasks[id])
  const deps = useWorld(useShallow((s) => (t ? t.dependsOn.map((d) => s.tasks[d]).filter(Boolean) : [])))
  const dependents = useWorld(useShallow((s) => (t ? Object.values(s.tasks).filter((x) => x.projectId === t.projectId && x.dependsOn.includes(id)) : [])))
  const art = useWorld((s) => (t?.outputArtifactId ? s.artifacts[t.outputArtifactId] : undefined))
  const review = useWorld((s) => (t?.reviewOf ? s.tasks[t.reviewOf] : undefined))
  if (!t) return null
  const c = CREW[t.role]
  const active = ['running', 'awaiting_approval', 'needs_input'].includes(t.status)
  const canRetry = ['failed', 'cancelled', 'blocked'].includes(t.status)
  const select = (tid: string) => mutate((s) => void (s.ui.selection = { kind: 'task', id: tid }))
  return (
    <>
      <div className="inspector-hero" style={{ ['--role' as string]: c.color }}>
        <Portrait role={t.role} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="inspector-title">
            {t.kind === 'review' ? 'Review' : t.kind === 'deliver' ? 'Delivery' : t.kind === 'plan' ? 'Planning' : 'Task'} · {c.name}
          </div>
          <div className="inspector-name" style={{ fontSize: 18 }}>
            {t.title}
          </div>
          <span className={`chip tone tone-${taskTone(t.status)}`} style={{ marginTop: 5 }}>
            {TASK_STATUS_LABEL[t.status]}
          </span>
        </div>
        <CloseButton />
      </div>
      <div className="rightpanel-body scroll">
        <p className="small" style={{ fontWeight: 600, color: 'var(--ink-2)', marginTop: 0 }}>
          {t.description}
        </p>
        {t.status === 'running' && <Bar value={t.progress} color={c.color} />}
        {t.status === 'needs_input' && <QuestionCard t={t} />}
        {t.error && (
          <div className="card" style={{ borderColor: 'var(--tone-bad)', marginTop: 8 }}>
            <ProvBadge p="error" /> <span className="small" style={{ fontWeight: 700 }}>{t.error}</span>
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {active && (
            <button className="btn btn-sm" onClick={() => engine.pauseTask(id)}>
              <Pause size={13} /> Pause
            </button>
          )}
          {t.status === 'paused' && (
            <button className="btn btn-sm" onClick={() => engine.resumeTask(id)}>
              <Play size={13} /> Resume
            </button>
          )}
          {canRetry && (
            <button className="btn btn-sm btn-primary" onClick={() => engine.retry(id)}>
              <RotateCcw size={13} /> Retry
            </button>
          )}
          {t.status === 'blocked' && (
            <button className="btn btn-sm" onClick={() => engine.skipDependency(id)} title="Run without the failed input">
              <SkipForward size={13} /> Skip failed input
            </button>
          )}
          {!['done', 'cancelled'].includes(t.status) && (
            <button className="btn btn-sm btn-bad" onClick={() => engine.cancelTask(id)}>
              <Ban size={13} /> Cancel
            </button>
          )}
        </div>
        {!['done', 'cancelled'].includes(t.status) && (
          <>
            <div className="section-title">Priority & assignment</div>
            <div className="row">
              <button className="icon-btn" aria-label="Raise priority" onClick={() => engine.reprioritize(id, 10)}>
                <ArrowUp size={15} />
              </button>
              <button className="icon-btn" aria-label="Lower priority" onClick={() => engine.reprioritize(id, -10)}>
                <ArrowDown size={15} />
              </button>
              <span className="small num" style={{ fontWeight: 800 }}>
                Priority {t.priority}
              </span>
              <span className="grow" />
              {t.kind === 'work' && !active && (
                <select className="select" style={{ width: 150, fontSize: 13, padding: '5px 8px' }} value={t.role} onChange={(e) => engine.reassign(id, e.target.value as RoleId)} aria-label="Reassign to">
                  {WORK_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {CREW[r].name} ({CREW[r].title})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
        {(deps.length > 0 || dependents.length > 0 || review) && <div className="section-title">Dependencies</div>}
        {review && (
          <button className="card clickable row" style={{ padding: '7px 10px', width: '100%', textAlign: 'left', marginBottom: 5 }} onClick={() => select(review.id)}>
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              Reviews
            </span>
            <span className="grow small truncate" style={{ fontWeight: 800 }}>
              {review.title}
            </span>
            <span className={`chip tone tone-${taskTone(review.status)}`}>{TASK_STATUS_LABEL[review.status]}</span>
          </button>
        )}
        {deps.map((d) => (
          <button key={d.id} className="card clickable row" style={{ padding: '7px 10px', width: '100%', textAlign: 'left', marginBottom: 5 }} onClick={() => select(d.id)}>
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              Needs
            </span>
            <span className="grow small truncate" style={{ fontWeight: 800 }}>
              {d.title}
            </span>
            <span className={`chip tone tone-${taskTone(d.status)}`}>{TASK_STATUS_LABEL[d.status]}</span>
          </button>
        ))}
        {dependents.map((d) => (
          <button key={d.id} className="card clickable row" style={{ padding: '7px 10px', width: '100%', textAlign: 'left', marginBottom: 5 }} onClick={() => select(d.id)}>
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              Feeds
            </span>
            <span className="grow small truncate" style={{ fontWeight: 800 }}>
              {d.title}
            </span>
            <span className={`chip tone tone-${taskTone(d.status)}`}>{TASK_STATUS_LABEL[d.status]}</span>
          </button>
        ))}
        {t.feedback.length > 0 && (
          <>
            <div className="section-title">Feedback history</div>
            {t.feedback.map((f, i) => (
              <div key={i} className="card soft small" style={{ marginBottom: 5, fontWeight: 700 }}>
                <span className="chip" style={{ marginRight: 6 }}>
                  {f.from === 'qa' ? 'Rook (QA)' : f.from === 'user' ? 'You' : 'System'}
                </span>
                {f.text}
              </div>
            ))}
          </>
        )}
        {t.streamText && t.status === 'running' && (
          <>
            <div className="section-title">Live output</div>
            <div className="stream">
              {t.streamText}
              <span className="cursor" />
            </div>
          </>
        )}
        {art && (
          <>
            <div className="section-title">Output</div>
            <button className="card clickable" style={{ width: '100%', textAlign: 'left' }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'artifact', id: art.id }))}>
              <div className="row">
                <strong className="grow truncate" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {art.title}
                </strong>
                <ProvBadge p={art.provenance} />
              </div>
              <div className="small muted" style={{ fontWeight: 700, marginTop: 4 }}>
                {art.summary}
              </div>
            </button>
          </>
        )}
        <div className="section-title">Telemetry</div>
        <dl className="kv">
          <dt>Model</dt>
          <dd>{t.modelUsed ? `${t.providerUsed}/${t.modelUsed}` : '—'}</dd>
          <dt>Runs · failures · reworks</dt>
          <dd className="num">
            {t.attempts} · {t.failures ?? 0}/{t.maxAttempts} · {t.reworks ?? 0}
          </dd>
          <dt>Tokens</dt>
          <dd className="num">
            {compact(t.tokensIn)} in · {compact(t.tokensOut)} out
          </dd>
          <dt>Spend</dt>
          <dd className="num">{money(t.costUsd)}</dd>
          <dt>Duration</dt>
          <dd className="num">{t.startedAt ? duration((t.finishedAt ?? Date.now()) - t.startedAt) : '—'}</dd>
          <dt>Tools used</dt>
          <dd>{t.toolCalls.length ? t.toolCalls.map((x) => x.tool).join(', ') : 'none'}</dd>
        </dl>
      </div>
    </>
  )
}
