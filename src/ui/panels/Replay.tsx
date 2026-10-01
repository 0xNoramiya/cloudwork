import { Clapperboard, Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import { unlockAchievement } from '../../engine/game/progression'
import { ROLE_IDS, type AgentActivity, type Project } from '../../engine/types'
import { getWorld, mutate, useWorld } from '../../state/store'
import { Empty, PanelHead, Portrait, duration } from '../common'

const SEG_COLOR: Partial<Record<AgentActivity, string>> = {
  thinking: '#b08cff',
  working: '#f08c00',
  tool: '#3b7ff5',
  awaiting_approval: '#e8457f',
  needs_input: '#e8457f',
  memory: '#1fa38a',
  handoff: '#8ab4ff',
  error: '#dc3d43',
  meeting: '#c9b28a',
  celebrating: '#26a269',
}

interface Seg {
  a: AgentActivity
  from: number
  to: number
}

function segments(p: Project): Record<string, Seg[]> {
  const out: Record<string, Seg[]> = Object.fromEntries(ROLE_IDS.map((r) => [r, []]))
  const tl = p.timeline
  for (const r of ROLE_IDS) {
    let cur: Seg | null = null
    for (const f of tl) {
      const a = (f.a[r]?.[0] ?? 'idle') as AgentActivity
      if (cur && cur.a === a) {
        cur.to = f.t
        continue
      }
      if (cur && SEG_COLOR[cur.a]) out[r].push(cur)
      cur = { a, from: f.t, to: f.t + 1000 }
    }
    if (cur && SEG_COLOR[cur.a]) out[r].push(cur)
  }
  return out
}

export function Replay({ onClose }: { onClose: () => void }) {
  const projects = useWorld(useShallow((s) => s.projectOrder.map((id) => s.projects[id]).filter((p) => p && p.timeline.length > 2)))
  const replay = useWorld((s) => s.ui.replay)
  const [pid, setPid] = useState<string | null>(projects[0]?.id ?? null)
  const p = projects.find((x) => x.id === pid) ?? null
  const start = p?.timeline[0]?.t ?? 0
  const end = p?.timeline[p.timeline.length - 1]?.t ?? 0
  const segs = useMemo(() => (p ? segments(p) : null), [p])
  const raf = useRef(0)

  const projectId = p?.id
  useEffect(() => {
    if (!projectId) return
    mutate((s) => {
      // Aim for a ~30 second time-lapse whatever the project's length.
      const span = Math.max(1, end - start)
      const speed = [1, 4, 12, 30].reduce((best, sp) => (Math.abs(span / sp - 30000) < Math.abs(span / best - 30000) ? sp : best), 1)
      s.ui.replay = { projectId, t: start, playing: true, speed }
      unlockAchievement(s, 'time_traveler')
    })
    return () => mutate((s) => void (s.ui.replay = null))
  }, [projectId, start, end])

  useEffect(() => {
    let last = performance.now()
    const loop = (now: number) => {
      const dt = now - last
      last = now
      const r = getWorld().ui.replay
      if (r?.playing) {
        mutate((s) => {
          if (!s.ui.replay) return
          s.ui.replay.t = Math.min(end, s.ui.replay.t + dt * s.ui.replay.speed)
          if (s.ui.replay.t >= end) s.ui.replay.playing = false
        })
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [end])

  const t = replay?.t ?? start
  const span = Math.max(1, end - start)
  const pct = (x: number) => `${((x - start) / span) * 100}%`
  return (
    <>
      <PanelHead title="Replay & time-lapse" icon={<Clapperboard size={19} />} onClose={onClose}>
        <select className="select" style={{ width: 240, fontSize: 14 }} value={pid ?? ''} onChange={(e) => setPid(e.target.value)}>
          {projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title} · {x.status}
            </option>
          ))}
        </select>
      </PanelHead>
      <div className="drawer-body scroll">
        {!p || !segs ? (
          <Empty title="Nothing to replay yet">Every project records a frame per second of who was doing what. Run a goal, then come back to watch it unfold.</Empty>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="icon-btn" aria-label={replay?.playing ? 'Pause' : 'Play'} onClick={() => mutate((s) => {
                if (!s.ui.replay) return
                if (s.ui.replay.t >= end) s.ui.replay.t = start
                s.ui.replay.playing = !s.ui.replay.playing
              })}>
                {replay?.playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <input
                className="range grow"
                type="range"
                min={start}
                max={end}
                value={t}
                onChange={(e) => mutate((s) => void (s.ui.replay && ((s.ui.replay.t = Number(e.target.value)), (s.ui.replay.playing = false))))}
                aria-label="Replay position"
              />
              <span className="small num" style={{ fontWeight: 800, width: 110, textAlign: 'right' }}>
                {duration(t - start)} / {duration(span)}
              </span>
              <div className="tabs" style={{ width: 200 }}>
                {[1, 4, 12, 30].map((sp) => (
                  <button key={sp} className={`tab${replay?.speed === sp ? ' is-on' : ''}`} onClick={() => mutate((s) => void (s.ui.replay && (s.ui.replay.speed = sp)))}>
                    {sp}×
                  </button>
                ))}
              </div>
            </div>
            <div className="gantt">
              {ROLE_IDS.map((r) => (
                <div key={r} style={{ display: 'contents' }}>
                  <div className="row">
                    <Portrait role={r} size="sm" />
                    <span>{CREW[r].name}</span>
                  </div>
                  <div className="gantt-lane">
                    {segs[r].map((sg, i) => (
                      <div key={i} className="gantt-seg" title={`${sg.a} · ${duration(sg.to - sg.from)}`} style={{ left: pct(sg.from), width: `calc(${pct(sg.to)} - ${pct(sg.from)})`, background: SEG_COLOR[sg.a] }} />
                    ))}
                    <div className="gantt-cursor" style={{ left: pct(t) }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="row tiny" style={{ flexWrap: 'wrap', margin: '8px 0 0 100px', fontWeight: 800, color: 'var(--ink-3)' }}>
              {Object.entries(SEG_COLOR).map(([k, c]) => (
                <span key={k} className="row" style={{ gap: 4 }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />
                  {k.replace('_', ' ')}
                </span>
              ))}
            </div>
            <div className="section-title">Key moments</div>
            <div className="col" style={{ gap: 4 }}>
              {p.moments.map((m, i) => (
                <button
                  key={i}
                  className="card clickable row"
                  style={{ padding: '6px 10px', textAlign: 'left', borderColor: Math.abs(m.t - t) < 1500 ? 'var(--accent)' : undefined }}
                  onClick={() => mutate((s) => void (s.ui.replay && ((s.ui.replay.t = Math.max(start, m.t - 500)), (s.ui.replay.playing = false))))}
                >
                  <span className="log-time" style={{ width: 52 }}>
                    +{duration(m.t - p.createdAt)}
                  </span>
                  {m.agentId ? <Portrait role={m.agentId} size="sm" /> : <span style={{ width: 30 }} />}
                  <span className="chip">{m.kind}</span>
                  <span className="small grow" style={{ fontWeight: 700 }}>
                    {m.text}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
