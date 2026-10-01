import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import { ROLE_IDS } from '../../engine/types'
import { mutate, useWorld } from '../../state/store'
import { Bar, Empty, PanelHead, Portrait, compact, duration, money } from '../common'

function Sparkline({ values, max, color, height = 54 }: { values: number[]; max: number; color: string; height?: number }) {
  if (values.length < 2) return <div className="small muted">Not enough data yet.</div>
  const w = 600
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - (v / (max || 1)) * (height - 4) - 2}`)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${height} ${pts.join(' ')} ${w},${height}`} fill={color} opacity={0.18} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Stats({ onClose }: { onClose: () => void }) {
  const p = useWorld((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null))
  const tasks = useWorld(useShallow((s) => (p ? p.taskIds.map((id) => s.tasks[id]).filter(Boolean) : [])))
  const agents = useWorld((s) => s.agents)
  const budget = useWorld((s) => s.settings.budgetUsd)
  const allProjects = useWorld(useShallow((s) => s.projectOrder.map((id) => s.projects[id]).filter(Boolean)))
  const perAgent = useMemo(
    () =>
      ROLE_IDS.map((r) => {
        const ts = tasks.filter((t) => t.role === r)
        const work = ts.reduce((n, t) => n + (t.startedAt ? (t.finishedAt ?? Date.now()) - t.startedAt : 0), 0)
        return { r, tasks: ts.length, done: ts.filter((t) => t.status === 'done').length, tin: ts.reduce((n, t) => n + t.tokensIn, 0), tout: ts.reduce((n, t) => n + t.tokensOut, 0), cost: ts.reduce((n, t) => n + t.costUsd, 0), work }
      }),
    [tasks],
  )
  const providers = useMemo(() => {
    const m = new Map<string, { cost: number; tokens: number; calls: number }>()
    for (const t of tasks) {
      if (!t.providerUsed) continue
      const k = `${t.providerUsed}/${t.modelUsed}`
      const v = m.get(k) ?? { cost: 0, tokens: 0, calls: 0 }
      v.cost += t.costUsd
      v.tokens += t.tokensIn + t.tokensOut
      v.calls += 1
      m.set(k, v)
    }
    return [...m.entries()]
  }, [tasks])
  const parallel = useMemo(() => (p ? p.timeline.map((f) => Object.values(f.a).filter(([a]) => ['thinking', 'working', 'tool', 'memory'].includes(a)).length) : []), [p])
  const momentum = useMemo(() => (p ? p.timeline.map((f) => f.m) : []), [p])
  const elapsed = p ? (p.finishedAt ?? Date.now()) - p.createdAt : 0
  const maxCost = Math.max(...perAgent.map((a) => a.cost), 0.000001)
  const maxTok = Math.max(...perAgent.map((a) => a.tin + a.tout), 1)
  const allTime = {
    projects: allProjects.length,
    delivered: allProjects.filter((x) => x.status === 'done').length,
    cost: allProjects.reduce((n, x) => n + x.costUsd, 0),
    tokens: allProjects.reduce((n, x) => n + x.tokens, 0),
    tasks: Object.values(agents).reduce((n, a) => n + a.stats.tasksDone, 0),
  }
  return (
    <>
      <PanelHead title="Stats, budget & model usage" icon={<BarChart3 size={19} />} onClose={onClose} />
      <div className="drawer-body scroll">
        <div className="big-stats" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginTop: 0 }}>
          <div className="big-stat">
            <b>{p ? duration(elapsed) : '—'}</b>
            <span>elapsed</span>
          </div>
          <div className="big-stat">
            <b>
              {tasks.filter((t) => t.status === 'done').length}/{tasks.length}
            </b>
            <span>tasks done</span>
          </div>
          <div className="big-stat">
            <b>{p?.peakParallel ?? 0}</b>
            <span>peak parallel</span>
          </div>
          <div className="big-stat">
            <b>{compact(p?.tokens ?? 0)}</b>
            <span>tokens</span>
          </div>
          <div className="big-stat">
            <b>{money(p?.costUsd ?? 0)}</b>
            <span>spend</span>
          </div>
          <div className="big-stat">
            <b>
              {p?.memoriesUsed ?? 0}
              {p?.memoriesFromEarlierSessions ? <small style={{ fontSize: 12 }}> ({p.memoriesFromEarlierSessions} old)</small> : ''}
            </b>
            <span>memories used</span>
          </div>
        </div>
        <div className="section-title">Budget</div>
        <div className="card">
          <div className="row">
            <span className="small grow" style={{ fontWeight: 800 }}>
              {money(p?.costUsd ?? 0)} of {money(budget)} cap for this project
            </span>
            <label className="row small" style={{ fontWeight: 800 }}>
              Cap $
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={budget}
                onChange={(e) => mutate((s) => void (s.settings.budgetUsd = Math.max(0, Number(e.target.value) || 0)))}
                style={{ width: 90, fontSize: 14, padding: '5px 8px' }}
              />
            </label>
          </div>
          <Bar value={(p?.costUsd ?? 0) / Math.max(budget, 0.0001)} color={(p?.costUsd ?? 0) > budget * 0.8 ? 'var(--tone-bad)' : 'var(--tone-good)'} />
          <p className="tiny muted" style={{ fontWeight: 700, marginBottom: 0 }}>
            The project auto-pauses when real spend reaches the cap. Costs use published per-token prices where known; demo calls cost $0. Token counts come from provider usage fields (estimated when a provider doesn't report them).
          </p>
        </div>
        <div className="section-title">Crew workload</div>
        {!p ? (
          <Empty title="No project yet" />
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {perAgent.map((a) => (
              <div key={a.r} className="row small" style={{ fontWeight: 800 }}>
                <Portrait role={a.r} size="sm" />
                <span style={{ width: 70 }}>{CREW[a.r].name}</span>
                <span className="muted num" style={{ width: 58 }}>
                  {a.done}/{a.tasks} tasks
                </span>
                <div className="grow" title={`Busy ${duration(a.work)} of ${duration(elapsed)}`}>
                  <Bar value={elapsed ? a.work / elapsed : 0} color={CREW[a.r].color} />
                </div>
                <span className="num muted" style={{ width: 54, textAlign: 'right' }}>
                  {elapsed ? Math.round((a.work / elapsed) * 100) : 0}% busy
                </span>
                <div style={{ width: 80 }} title={`${a.tin} in / ${a.tout} out`}>
                  <Bar value={(a.tin + a.tout) / maxTok} color="var(--tone-info)" />
                </div>
                <span className="num" style={{ width: 64, textAlign: 'right' }} title="spend">
                  {a.cost ? money(a.cost) : '—'}
                </span>
                <div style={{ width: 50 }}>
                  <Bar value={a.cost / maxCost} color="var(--gold)" />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="section-title">Parallelism over time (crew working at once)</div>
        <Sparkline values={parallel} max={Math.max(3, ...parallel)} color="#f08c00" />
        <div className="section-title">Momentum over time</div>
        <Sparkline values={momentum} max={100} color="#26a269" />
        <div className="section-title">Model / provider usage</div>
        {providers.length === 0 ? (
          <span className="small muted">No model calls yet in this project.</span>
        ) : (
          <table className="md" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Provider / model</th>
                <th>Tasks</th>
                <th>Tokens</th>
                <th>Spend</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(([k, v]) => (
                <tr key={k}>
                  <td className="mono">{k}</td>
                  <td className="num">{v.calls}</td>
                  <td className="num">{compact(v.tokens)}</td>
                  <td className="num">{money(v.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="section-title">All time</div>
        <dl className="kv">
          <dt>Projects</dt>
          <dd className="num">
            {allTime.projects} ({allTime.delivered} delivered)
          </dd>
          <dt>Tasks completed</dt>
          <dd className="num">{allTime.tasks}</dd>
          <dt>Tokens</dt>
          <dd className="num">{compact(allTime.tokens)}</dd>
          <dt>Spend</dt>
          <dd className="num">{money(allTime.cost)}</dd>
        </dl>
      </div>
    </>
  )
}
