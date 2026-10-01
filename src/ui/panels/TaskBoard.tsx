import { GitBranch } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import type { Task } from '../../engine/types'
import { mutate, useWorld } from '../../state/store'
import { TASK_STATUS_LABEL, taskTone } from '../icons'
import { Bar, Empty, PanelHead, Portrait } from '../common'

/** Dependencies as drawn: the plan feeds every root task, and edges implied by a longer path are dropped. */
function drawnDeps(tasks: Task[]): Map<string, string[]> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const plan = tasks.find((t) => t.kind === 'plan')
  const deps = new Map<string, string[]>()
  for (const t of tasks) {
    const own = t.dependsOn.filter((id) => byId.has(id))
    deps.set(t.id, t.kind === 'plan' ? [] : own.length || !plan ? own : [plan.id])
  }
  const reach = new Map<string, Set<string>>()
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    if (reach.has(id)) return reach.get(id)!
    const out = new Set<string>()
    if (seen.has(id)) return out
    seen.add(id)
    for (const d of deps.get(id) ?? []) {
      out.add(d)
      for (const a of ancestors(d, seen)) out.add(a)
    }
    reach.set(id, out)
    return out
  }
  const reduced = new Map<string, string[]>()
  for (const [id, ds] of deps)
    reduced.set(
      id,
      ds.filter((d) => !ds.some((o) => o !== d && ancestors(o).has(d))),
    )
  return reduced
}

function layers(tasks: Task[], deps: Map<string, string[]>): Task[][] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const depth = new Map<string, number>()
  const d = (t: Task, seen = new Set<string>()): number => {
    if (depth.has(t.id)) return depth.get(t.id)!
    if (seen.has(t.id)) return 0
    seen.add(t.id)
    const ds = deps.get(t.id) ?? []
    const v = ds.length ? 1 + Math.max(...ds.map((id) => (byId.get(id) ? d(byId.get(id)!, seen) : 0))) : 0
    depth.set(t.id, v)
    return v
  }
  tasks.forEach((t) => d(t))
  const cols: Task[][] = []
  for (const t of tasks) {
    const k = depth.get(t.id) ?? 0
    ;(cols[k] ??= []).push(t)
  }
  return cols.filter(Boolean)
}

export function TaskBoard({ onClose }: { onClose: () => void }) {
  const project = useWorld((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null))
  const tasks = useWorld(useShallow((s) => (project ? project.taskIds.map((id) => s.tasks[id]).filter(Boolean) : [])))
  const selected = useWorld((s) => (s.ui.selection.kind === 'task' ? s.ui.selection.id : null))
  const deps = useMemo(() => drawnDeps(tasks), [tasks])
  const cols = useMemo(() => layers(tasks, deps), [tasks, deps])
  const wrap = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLButtonElement>())
  const [edges, setEdges] = useState<{ d: string; key: string; active: boolean; done: boolean; long: boolean }[]>([])
  useLayoutEffect(() => {
    const host = wrap.current
    if (!host) return
    const compute = () => {
      const base = host.getBoundingClientRect()
      const out: typeof edges = []
      for (const t of tasks) {
        const to = nodes.current.get(t.id)
        if (!to) continue
        for (const dep of deps.get(t.id) ?? []) {
          const from = nodes.current.get(dep)
          if (!from) continue
          const a = from.getBoundingClientRect()
          const b = to.getBoundingClientRect()
          const x1 = a.left + a.width / 2 - base.left
          const y1 = a.bottom - base.top
          const x2 = b.left + b.width / 2 - base.left
          const y2 = b.top - base.top
          const my = (y1 + y2) / 2
          const depTask = tasks.find((x) => x.id === dep)
          out.push({
            key: `${dep}-${t.id}`,
            d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 6}`,
            active: t.status === 'handoff' || (t.status === 'running' && depTask?.status === 'done'),
            done: depTask?.status === 'done',
            // Edges that skip rows cross the nodes in between; they're drawn faint so the row-to-row flow reads first.
            long: y2 - y1 > 60,
          })
        }
      }
      setEdges(out)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(host)
    return () => ro.disconnect()
  }, [tasks, deps])
  return (
    <>
      <PanelHead title={project ? `Tasks · ${project.title}` : 'Task board'} icon={<GitBranch size={19} />} onClose={onClose}>
        {project && (
          <span className="chip">
            {tasks.filter((t) => t.status === 'done').length}/{tasks.length} done
          </span>
        )}
      </PanelHead>
      <div className="drawer-body scroll">
        {!project ? (
          <Empty title="No project yet">Give the crew a goal and Juno's plan appears here as a dependency graph.</Empty>
        ) : (
          <>
            {project.planSummary && (
              <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginTop: 0 }}>
                {project.planSummary}
              </p>
            )}
            <div className="dag-scroll">
              <div className="dag" ref={wrap}>
                <svg className="dag-edges" aria-hidden>
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)" />
                    </marker>
                  </defs>
                  {edges.map((e) => (
                    <path
                      key={e.key}
                      d={e.d}
                      fill="none"
                      stroke={e.active ? 'var(--tone-busy)' : e.done ? 'var(--tone-good)' : 'var(--edge)'}
                      strokeWidth={e.active ? 3 : 2}
                      opacity={e.long && !e.active ? 0.35 : 1}
                      strokeDasharray={e.done || e.active ? undefined : '5 5'}
                      markerEnd="url(#arrow)"
                    >
                      {e.active && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.8s" repeatCount="indefinite" />}
                    </path>
                  ))}
                </svg>
                {cols.map((col, i) => (
                  <div key={i} className="dag-col">
                    {col.map((t) => (
                      <button
                        key={t.id}
                        ref={(el) => {
                          if (el) nodes.current.set(t.id, el)
                          else nodes.current.delete(t.id)
                        }}
                        className={`task-node st-${t.status}${selected === t.id ? ' is-selected' : ''}`}
                        style={{ ['--role' as string]: CREW[t.role].color }}
                        onClick={() =>
                          mutate(
                            (s) =>
                              void (s.ui.selection = {
                                kind: 'task',
                                id: t.id,
                              }),
                          )
                        }
                      >
                        <div className="row" style={{ alignItems: 'flex-start' }}>
                          <span className="task-node-title grow">{t.title}</span>
                          <Portrait role={t.role} size="sm" />
                        </div>
                        <div className="row" style={{ marginTop: 6 }}>
                          <span className={`chip tone tone-${taskTone(t.status)}`}>{TASK_STATUS_LABEL[t.status]}</span>
                          {t.kind === 'review' && <span className="chip">QA</span>}
                          {(t.reworks ?? 0) > 0 && <span className="chip">rework {t.reworks}</span>}
                        </div>
                        {t.status === 'running' && (
                          <div style={{ marginTop: 6 }}>
                            <Bar value={t.progress} color={CREW[t.role].color} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p className="tiny muted board-hint">Tasks in the same row can run in parallel. Select a task to inspect, reprioritize, pause, reassign or retry it.</p>
          </>
        )}
      </div>
    </>
  )
}
