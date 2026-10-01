import { AlertTriangle, Award, Cat, Gift, Info, Lightbulb, Package, Sparkles, Sun, TreeDeciduous, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { initAudio, sfx } from '../audio/sfx'
import { CREW } from '../engine/crew'
import { engine } from '../engine/engine'
import { UNLOCKABLES } from '../engine/game/defs'
import type { GameEventKind, Toast } from '../state/store'
import { mutate, useWorld } from '../state/store'
import { Dialog, Portrait, duration, money, visibleTimeout } from './common'
import { togglePanel } from './ActionBar'
import { useCompact } from './layout'
import { UnlockIcon } from './unlockIcons'

const EVENT_STYLE: Record<GameEventKind, { icon: LucideIcon; tone: string }> = {
  research_breakthrough: { icon: Lightbulb, tone: 'tone-info' },
  bottleneck: { icon: AlertTriangle, tone: 'tone-wait' },
  optimization: { icon: Zap, tone: 'tone-info' },
  model_swap: { icon: AlertTriangle, tone: 'tone-bad' },
  memory_conflict: { icon: TreeDeciduous, tone: 'tone-wait' },
  golden_hour: { icon: Sun, tone: 'tone-busy' },
  supply_drop: { icon: Package, tone: 'tone-good' },
  cat_visit: { icon: Cat, tone: 'tone-info' },
  combo: { icon: Sparkles, tone: 'tone-good' },
  approval_waiting: { icon: AlertTriangle, tone: 'tone-wait' },
}

/** Shown in a drawer's header while events wait behind it. */
export function EventsPill() {
  const n = useWorld((s) => s.game.events.length + (s.ui.levelUp ? 1 : 0))
  if (!n) return null
  return (
    <button className="events-pill" onClick={() => mutate((s) => void (s.ui.panel = null))} title="Close this panel to see them">
      <Sparkles size={14} aria-hidden /> {n} event{n === 1 ? '' : 's'}
    </button>
  )
}

/** One event card at a time, newest first, with a "1 of N" stepper for the rest. */
export function EventCards() {
  const events = useWorld((s) => s.game.events)
  const levelUp = useWorld((s) => Boolean(s.ui.levelUp) && !s.ui.celebrate)
  const drawer = useWorld((s) => Boolean(s.ui.panel) && !['decorate', 'customize', 'replay'].includes(s.ui.panel!))
  const sheetOpen = useWorld((s) => Boolean(s.ui.sheet || s.ui.selection.kind))
  const compact = useCompact()
  const [offset, setOffset] = useState(0)
  // Events wait while a drawer (or, on phones, a bottom sheet) has the user's attention.
  if (drawer || (compact && sheetOpen)) return null
  if (levelUp)
    return (
      <div className="events">
        <LevelUp />
      </div>
    )
  if (!events.length) return null
  const i = Math.min(offset, events.length - 1)
  const e = events[events.length - 1 - i]
  const st = EVENT_STYLE[e.kind]
  return (
    <div className="events">
      <div key={e.id} className={`event-card panel ${st.tone}`} role="status">
        <div className="event-icon" aria-hidden>
          <st.icon size={20} />
        </div>
        <div className="grow">
          <div className="event-head">
            <span className="event-title">{e.title}</span>
            <span className={`prov prov-${e.provenance === 'real' ? 'real' : 'cosmetic'}`}>{e.provenance === 'real' ? 'System' : 'Just for fun'}</span>
          </div>
          <div className="event-body">{e.body}</div>
          <div className="event-actions">
            {e.actions.map((a) => (
              <button
                key={a.id}
                className={`btn btn-sm${a.primary ? ' btn-primary' : ''}`}
                onClick={() => {
                  sfx('click')
                  if (a.id === 'dismiss') mutate((s) => void (s.game.events = s.game.events.filter((x) => x.id !== e.id)))
                  else engine.resolveEvent(e.id, a.id)
                }}
              >
                {a.label}
              </button>
            ))}
            {events.length > 1 && (
              <button className="event-step num" onClick={() => setOffset((i + 1) % events.length)} title="Show the next event">
                {i + 1} of {events.length} ›
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const TOAST_TONE: Record<Toast['kind'], string> = {
  info: 'tone-info',
  success: 'tone-good',
  warn: 'tone-wait',
  error: 'tone-bad',
  achievement: 'tone-busy',
  level: 'tone-busy',
  xp: 'tone-good',
}

export function Toasts() {
  const toasts = useWorld((s) => s.ui.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-4).map((t) => (
        <div
          key={t.id}
          className={`toast panel ${TOAST_TONE[t.kind]}`}
          onClick={() =>
            mutate((s) => {
              s.ui.toasts = s.ui.toasts.filter((x) => x.id !== t.id)
              if (t.agentId) s.ui.selection = { kind: 'agent', id: t.agentId }
              if (t.kind === 'achievement') s.ui.panel = 'achievements'
            })
          }
        >
          <div className="toast-icon">
            {t.icon?.startsWith('/') ? (
              <img src={t.icon} alt="" />
            ) : t.agentId ? (
              <Portrait role={t.agentId} size="sm" />
            ) : t.kind === 'achievement' ? (
              <Award size={18} />
            ) : (
              <Info size={18} />
            )}
          </div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Welcome() {
  const started = useWorld((s) => s.ui.started)
  const hydrated = useWorld((s) => s.hydrated)
  const stats = useWorld(useShallow((s) => ({ memories: Object.keys(s.memories).length, projects: s.projectOrder.length, level: s.game.level })))
  if (started) return null
  const enter = () => {
    initAudio()
    sfx('levelup')
    mutate((s) => void (s.ui.started = true))
  }
  return (
    <div className="welcome">
      <div className="welcome-card panel">
        <div className="row">
          {(['planner', 'researcher', 'coder', 'writer', 'designer', 'analyst', 'qa', 'archivist'] as const).map((r) => (
            <Portrait key={r} role={r} size="sm" />
          ))}
        </div>
        <h1 className="welcome-title">Cloudworks</h1>
        <p className="welcome-tag">Eight AI specialists on floating islands take your goal, split it into tasks and ship the result. You can watch every step.</p>
        <div className="truth-table">
          <div style={{ background: '#eafaf2', color: '#1d6b44' }}>
            <b>Real, always</b>
            <br />
            Task planning graph, parallel scheduling, hand-offs, approvals, sandboxed JS tests, QA rework loops, persistent memory, replay, costs.
          </div>
          <div style={{ background: '#fff6de', color: '#7a5200' }}>
            <b>Simulated in Demo mode</b>
            <br />
            The words the models write. Add your own API key (Anthropic, OpenAI, OpenRouter or a local server) for original output.
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-lg" onClick={enter} disabled={!hydrated} autoFocus>
            Enter the workshop
          </button>
          {stats.projects > 0 && (
            <span className="small muted" style={{ fontWeight: 800 }}>
              Welcome back. Level {stats.level}, {stats.memories} memories, {stats.projects} project{stats.projects === 1 ? '' : 's'}.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Celebration() {
  const c = useWorld((s) => s.ui.celebrate)
  const p = useWorld((s) => (c ? s.projects[c.projectId] : null))
  const tasks = useWorld(useShallow((s) => (p ? p.taskIds.map((id) => s.tasks[id]).filter(Boolean) : [])))
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!c) return
    const t = window.setTimeout(() => setShow(true), 1400)
    return () => window.clearTimeout(t)
  }, [c])
  if (!c || !p || !show) return null
  const close = () => {
    setShow(false)
    mutate((s) => void (s.ui.celebrate = null))
  }
  const crew = [...new Set(tasks.map((t) => t.role))]
  return (
    <Dialog label="Project delivered" onClose={close} className="celebrate-card panel" scrimClassName="celebrate">
      <div className="row" style={{ justifyContent: 'center' }}>
        {crew.map((r) => (
          <Portrait key={r} role={r} size="sm" />
        ))}
      </div>
      <div className="celebrate-title">Project delivered!</div>
      <div style={{ font: '600 16px var(--font-display)', color: 'var(--ink-2)' }}>{p.title}</div>
      <div className="big-stats">
        <div className="big-stat">
          <b>{tasks.length}</b>
          <span>tasks</span>
        </div>
        <div className="big-stat">
          <b>{duration((p.finishedAt ?? Date.now()) - p.createdAt)}</b>
          <span>time</span>
        </div>
        <div className="big-stat">
          <b>{p.peakParallel}</b>
          <span>peak parallel</span>
        </div>
        <div className="big-stat">
          <b>{money(p.costUsd)}</b>
          <span>{p.mode === 'demo' ? 'sim cost' : 'spend'}</span>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            close()
            mutate((s) => void (s.ui.selection = p.deliverableId ? { kind: 'artifact', id: p.deliverableId } : s.ui.selection))
          }}
        >
          Open deliverable
        </button>
        <button
          className="btn"
          onClick={() => {
            close()
            togglePanel('replay')
          }}
        >
          Watch the replay
        </button>
        <button
          className="btn"
          onClick={() => {
            close()
            mutate((s) => void (s.ui.goalOpen = true))
          }}
        >
          New goal
        </button>
      </div>
      <p className="tiny muted" style={{ fontWeight: 700, marginTop: 12 }}>
        +1 supply crate · Moss filed a project summary for future sessions.
      </p>
    </Dialog>
  )
}

/** Non-blocking level-up banner: celebrates without covering the world, then gets out of the way. */
export function LevelUp() {
  const lv = useWorld((s) => s.ui.levelUp)
  const celebrating = useWorld((s) => Boolean(s.ui.celebrate))
  const unlocks = useMemo(() => (lv ? UNLOCKABLES.filter((u) => lv.unlocks.includes(u.id)) : []), [lv])
  useEffect(() => {
    // The banner waits behind the celebration card; its 9s only start once it is actually visible.
    if (!lv || celebrating) return
    return visibleTimeout(() => mutate((s) => void (s.ui.levelUp = null)), 9000)
  }, [lv, celebrating])
  if (!lv || celebrating) return null
  const close = () => mutate((s) => void (s.ui.levelUp = null))
  return (
    <div className="levelup-banner panel" role="status" key={lv.at}>
      <div className="levelup-num">{lv.level}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="stat-label">Workspace level up · +1 supply crate</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
          {unlocks.length === 0 && (
            <span className="small muted" style={{ fontWeight: 800 }}>
              The islands grow a little cozier.
            </span>
          )}
          {unlocks.map((u) => (
            <span key={u.id} className="chip" title={u.desc}>
              <UnlockIcon id={u.id} size={12} /> {u.name}
              {u.kind === 'decor' ? ` · shop ${u.price} ✦` : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 5 }}>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => {
            close()
            togglePanel('customize')
          }}
        >
          <Gift size={13} /> Try it
        </button>
        <button className="btn btn-sm" onClick={close}>
          Later
        </button>
      </div>
    </div>
  )
}

export function SpectateBadge() {
  const v = useWorld(useShallow((s) => ({ on: s.ui.spectate, focus: s.ui.focus })))
  if (!v.on) return null
  const role = v.focus && v.focus in CREW ? (v.focus as keyof typeof CREW) : null
  return (
    <div className="spectate-badge panel" role="status">
      {role ? <Portrait role={role} size="sm" /> : <span style={{ width: 6 }} />}
      <span>Spectating{role ? ` · following ${CREW[role].name}` : ''}</span>
      <button className="btn btn-sm" onClick={() => mutate((s) => void (s.ui.spectate = false))}>
        Stop
      </button>
    </div>
  )
}

export function ReplayBadge() {
  const on = useWorld((s) => Boolean(s.ui.replay))
  if (!on) return null
  return <div className="replay-badge">REPLAY · world shows recorded history</div>
}
