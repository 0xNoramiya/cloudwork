import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sfx } from '../audio/sfx'
import { CREW } from '../engine/crew'
import { rankFor } from '../engine/game/defs'
import { ROLE_IDS, type RoleId } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { agentPositions } from '../world/Agent'
import { ISLAND_LIST, PLAZA_CENTER, PLAZA_RADIUS, home } from '../world/layout'
import { ACTIVITY_LABEL, activityTone } from './icons'
import { Bar, PanelHead, Portrait } from './common'
import { useCompact, useNarrow } from './layout'

function shortModel(m: string): string {
  return m.replace(/^claude-/, '').replace(/^cloudworks-sim-1$/, 'demo').replace(/^.*\//, '')
}

export function CrewCard({ role }: { role: RoleId }) {
  const v = useWorld(
    useShallow((s) => {
      const a = s.agents[role]
      const t = a.taskId ? s.tasks[a.taskId] : undefined
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      const queued = p ? p.taskIds.filter((id) => s.tasks[id]?.role === role && ['ready', 'pending', 'handoff'].includes(s.tasks[id]?.status)).length : 0
      const model = a.loadout.model ?? s.settings.defaultModel
      return {
        activity: a.activity,
        task: t?.title,
        progress: t?.progress ?? 0,
        running: t?.status === 'running',
        queued,
        xp: a.xp,
        model: shortModel(model.model),
        selected: s.ui.selection.kind === 'agent' && s.ui.selection.id === role,
        directive: Boolean(a.directive),
      }
    }),
  )
  const c = CREW[role]
  const tone = activityTone(v.activity)
  const rank = rankFor(v.xp)
  return (
    <button
      className={`crew-card tone-${tone}${v.selected ? ' is-selected' : ''}${tone === 'wait' ? ' needs-you' : ''}`}
      style={{ ['--role' as string]: c.color }}
      onClick={() => {
        sfx('click')
        mutate((s) => {
          s.ui.selection = { kind: 'agent', id: role }
          s.ui.focus = role
          s.ui.sheet = null
        })
      }}
    >
      <Portrait role={role} />
      <div className="grow">
        <div className="crew-line">
          <span className="crew-name truncate">{c.name}</span>
          <span className="stars" title={rank.name} aria-label={rank.name}>
            {'★'.repeat(rank.index + 1)}
          </span>
          <span className="grow" />
          <span className="crew-role">{c.title}</span>
        </div>
        <div className="crew-line crew-status" title={v.task ? `${ACTIVITY_LABEL[v.activity]}: ${v.task}` : `Model: ${v.model}`}>
          <span className="status-dot" />
          <span className="truncate grow">
            {ACTIVITY_LABEL[v.activity]}
            {v.task ? <span className="muted"> · {v.task}</span> : v.directive ? <span className="muted"> · holding your instruction</span> : null}
          </span>
          <span className="workload" title={`${v.queued} task(s) queued for ${c.name}`}>
            {[0, 1, 2].map((i) => (
              <i key={i} className={i < v.queued ? 'on' : ''} />
            ))}
          </span>
        </div>
        {v.running && <Bar value={v.progress} color={c.color} className="crew-progress" />}
      </div>
    </button>
  )
}

export function Roster() {
  const compact = useCompact()
  const narrow = useNarrow()
  const open = useWorld((s) => s.ui.sheet === 'crew')
  if (compact || (narrow && !open)) return null
  return (
    <aside className="roster panel" aria-label="Crew roster" data-tour="crew">
      <PanelHead title="Crew" />
      <div className="roster-list scroll">
        {ROLE_IDS.map((r) => (
          <CrewCard key={r} role={r} />
        ))}
      </div>
    </aside>
  )
}

/** Project world (x,z) onto the same iso orientation as the camera. */
function iso(x: number, z: number): [number, number] {
  return [(x - z) * Math.SQRT1_2, (x + z) * Math.SQRT1_2]
}

export function Minimap() {
  const hide = useNarrow()
  if (hide) return null
  return <MinimapInner />
}

function MinimapInner() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 250)
    return () => window.clearInterval(id)
  }, [])
  const acts = useWorld(useShallow((s) => ROLE_IDS.map((r) => s.agents[r].activity)))
  const pending = useWorld((s) => Object.values(s.approvals).some((a) => a.status === 'pending'))
  const focus = (target: RoleId | 'dock' | 'plaza') =>
    mutate((s) => {
      s.ui.focus = target
      if (target !== 'dock' && target !== 'plaza') s.ui.selection = { kind: 'agent', id: target }
    })
  const S = 5.2
  const [pcx, pcy] = iso(PLAZA_CENTER.x, PLAZA_CENTER.z)
  return (
    <div className="minimap panel" aria-label="Minimap">
      <svg viewBox="-95 -80 190 160" preserveAspectRatio="xMidYMid meet">
        {ISLAND_LIST.map((i) => {
          const [x, y] = iso(i.center.x, i.center.z)
          return <line key={i.id} x1={pcx * S} y1={pcy * S * 0.62} x2={x * S} y2={y * S * 0.62} stroke="var(--edge)" strokeWidth="3" strokeDasharray="3 3" />
        })}
        <ellipse cx={pcx * S} cy={pcy * S * 0.62} rx={PLAZA_RADIUS * S} ry={PLAZA_RADIUS * S * 0.62} fill="var(--panel-3)" stroke="var(--edge)" strokeWidth="2" onClick={() => focus('plaza')} style={{ cursor: 'pointer' }}>
          <title>Command Plaza</title>
        </ellipse>
        {ISLAND_LIST.map((i) => {
          const [x, y] = iso(i.center.x, i.center.z)
          const role = i.id === 'dock' ? null : (i.id as RoleId)
          const flash = i.id === 'dock' && pending
          return (
            <g key={i.id} onClick={() => focus(role ?? 'dock')} style={{ cursor: 'pointer' }}>
              <ellipse
                cx={x * S}
                cy={y * S * 0.62}
                rx={i.radius * S}
                ry={i.radius * S * 0.62}
                fill={role ? `color-mix(in oklab, ${CREW[role].color} 22%, var(--panel))` : flash ? 'color-mix(in oklab, var(--tone-wait) 35%, var(--panel))' : 'var(--panel-2)'}
                stroke={role ? CREW[role].color : 'var(--edge)'}
                strokeWidth="2"
              >
                {flash && <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite" />}
              </ellipse>
              <title>{i.name}</title>
            </g>
          )
        })}
        {ROLE_IDS.map((r, idx) => {
          const p = agentPositions[r] ?? home(r).pos
          const [x, y] = iso(p.x, p.z)
          const tone = activityTone(acts[idx])
          return (
            <g key={r} onClick={() => focus(r)} style={{ cursor: 'pointer' }}>
              <circle cx={x * S} cy={y * S * 0.62} r={5.5} fill={CREW[r].color} stroke="#fff" strokeWidth="1.8" />
              {(tone === 'wait' || tone === 'bad') && (
                <circle cx={x * S} cy={y * S * 0.62} r={8.5} fill="none" stroke={`var(--tone-${tone})`} strokeWidth="2">
                  <animate attributeName="r" values="7;11;7" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
