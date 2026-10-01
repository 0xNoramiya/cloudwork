import { Bell, Cloud, Menu, PanelsLeftRight, Pause, Play, Settings, Square, Sun, Video, Volume2, VolumeX } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { engine } from '../engine/engine'
import { levelForXp, momentumTier, xpForLevel } from '../engine/game/defs'
import { ROLE_IDS } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { Bar, money, compact as compactNum } from './common'
import { openGoal } from './ActionBar'
import { toggleSheet, useCompact } from './layout'

export function useRunMode(): 'demo' | 'live' | 'mixed' {
  return useWorld((s) => {
    const providers = ROLE_IDS.map((r) => (s.agents[r].loadout.model ?? s.settings.defaultModel).providerId)
    const demo = providers.filter((p) => p === 'demo').length
    return demo === providers.length ? 'demo' : demo === 0 ? 'live' : 'mixed'
  })
}

export const MODE_HELP = {
  demo: 'Demo mode: model outputs are scripted stand-ins. Planning, scheduling, hand-offs, approvals, sandboxed tests, memory and delivery are real. Add an API key to go live.',
  live: 'Live: every crew member calls a real model (BYOK).',
  mixed: 'Mixed: some crew members use real models, others the demo stand-in.',
}

function useObjective() {
  return useWorld(
    useShallow((s) => {
      const pr = s.activeProjectId ? s.projects[s.activeProjectId] : null
      if (!pr) return null
      const tasks = pr.taskIds.map((id) => s.tasks[id]).filter(Boolean)
      return {
        title: pr.title,
        goal: pr.goal,
        status: pr.status,
        total: tasks.length,
        done: tasks.filter((t) => t.status === 'done').length,
        running: tasks.filter((t) => t.status === 'running').length,
        waiting: tasks.filter((t) => t.status === 'awaiting_approval' || t.status === 'needs_input').length,
        failed: tasks.filter((t) => t.status === 'failed').length,
      }
    }),
  )
}

export function cancelProject() {
  if (window.confirm('Cancel this project? Running work will be stopped.')) engine.cancelProject()
}

function Objective({ compact }: { compact: boolean }) {
  const p = useObjective()
  if (!p || ['done', 'cancelled', 'failed'].includes(p.status)) {
    const title = p ? (p.status === 'done' ? `Delivered: ${p.title}` : `Last project ${p.status}: ${p.title}`) : 'The crew is waiting for a goal'
    return (
      <div className="objective">
        <div className="grow">
          <div className="objective-title truncate">{title}</div>
          <div className="objective-goal truncate">{p ? 'Start a new goal whenever you’re ready.' : 'Describe what to build, research or write.'}</div>
        </div>
        {!compact && (
          <button className="btn btn-primary" onClick={openGoal}>
            New goal
          </button>
        )}
      </div>
    )
  }
  const statusLabel =
    p.status === 'planning' ? 'Planning' : p.status === 'paused' ? 'Paused' : p.status === 'delivering' ? 'Ready to ship' : p.waiting ? `${p.waiting} waiting on you` : `${p.running} working`
  const tone = p.status === 'paused' ? 'tone-idle' : p.waiting || p.status === 'delivering' ? 'tone-wait' : p.failed ? 'tone-bad' : 'tone-busy'
  const pauseBtn =
    p.status === 'paused' ? (
      <button className="icon-btn" aria-label="Resume project" title="Resume" onClick={() => engine.resumeProject()}>
        <Play size={16} />
      </button>
    ) : (
      <button className="icon-btn" aria-label="Pause project" title="Pause (cancels in-flight calls)" onClick={() => engine.pauseProject()}>
        <Pause size={16} />
      </button>
    )
  if (compact) {
    return (
      <div className="objective is-compact" title={p.goal}>
        <div className="grow">
          <div className="objective-title truncate">{p.title}</div>
          <div className={`objective-status truncate ${tone}`}>
            <span className="status-dot" />
            {statusLabel} · <span className="num">{p.done}/{p.total}</span>
          </div>
        </div>
        {pauseBtn}
        <div className="objective-progress" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
      </div>
    )
  }
  return (
    <div className="objective" title={p.goal}>
      <div className="grow">
        <div className="row">
          <span className="objective-title truncate">{p.title}</span>
          <span className={`chip tone ${tone}`}>{statusLabel}</span>
        </div>
        <div className="row" style={{ marginTop: 5 }}>
          <Bar value={p.total ? p.done / p.total : 0} className="grow" color="var(--tone-good)" />
          <span className="tiny num objective-count">
            {p.done}/{p.total} tasks
          </span>
        </div>
      </div>
      {pauseBtn}
      <button className="icon-btn" aria-label="Cancel project" title="Cancel project" onClick={cancelProject}>
        <Square size={14} />
      </button>
    </div>
  )
}

export function useWorkspaceStats() {
  const g = useWorld(useShallow((s) => ({ xp: s.game.xp, sparks: s.game.sparks, momentum: s.game.momentum, boost: s.game.boostUntil > Date.now() })))
  const spend = useWorld(
    useShallow((s) => {
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      return { cost: p?.costUsd ?? 0, tokens: p?.tokens ?? 0, cap: s.settings.budgetUsd }
    }),
  )
  const level = levelForXp(g.xp)
  const cur = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { ...g, spend, level, xpInto: g.xp - cur, xpNeed: next - cur, tier: momentumTier(g.momentum) }
}

export function usePendingCount() {
  return useWorld((s) => Object.values(s.approvals).filter((a) => a.status === 'pending').length + Object.values(s.tasks).filter((t) => t.status === 'needs_input').length)
}

export function TopBar() {
  const compact = useCompact()
  const st = useWorkspaceStats()
  const pending = usePendingCount()
  const muted = useWorld((s) => s.ui.muted)
  const spectate = useWorld((s) => s.ui.spectate)
  const hidden = useWorld((s) => s.ui.panelsHidden)
  const menuOpen = useWorld((s) => s.ui.sheet === 'menu')
  const mode = useRunMode()
  const open = (panel: 'settings' | 'stats' | 'achievements' | 'customize') =>
    mutate((s) => {
      s.ui.panel = s.ui.panel === panel ? null : panel
    })
  const bell = (
    <button
      className="icon-btn"
      aria-label={`Captain's desk: ${pending} waiting on you`}
      title="Approvals & questions"
      onClick={() => {
        if (compact) toggleSheet('desk')
        else mutate((s) => void (s.ui.selection = { kind: null, id: null }))
      }}
    >
      <Bell size={17} />
      {pending > 0 && <span className="badge-count num">{pending}</span>}
    </button>
  )
  if (compact) {
    return (
      <header className="topbar panel">
        <div className="brand-mark" aria-hidden>
          <Cloud size={20} strokeWidth={2.6} />
        </div>
        <Objective compact />
        <span className="tour-anchor" data-tour="desk">
          {bell}
        </span>
        <button className={`icon-btn${menuOpen ? ' is-on' : ''}`} aria-label="Workspace menu" aria-expanded={menuOpen} onClick={() => toggleSheet('menu')} data-tour="mode">
          <Menu size={18} />
        </button>
      </header>
    )
  }
  return (
    <header className="topbar panel">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <Cloud size={22} strokeWidth={2.6} />
        </div>
        <div className="brand-name hide-md">Cloudworks</div>
      </div>
      <Objective compact={false} />
      <div
        className="stat-pill"
        title={`Workflow momentum: ${Math.round(st.momentum)}/100. Parallel work raises it; waiting approvals, failures and queues drain it. It multiplies XP (×${st.tier.mult}). It never changes model behavior.`}
      >
        <div className="momentum">
          <span className="stat-label">Momentum</span>
          <div className="row" style={{ gap: 7, marginTop: 4 }}>
            <Bar value={st.momentum / 100} color={st.tier.color} className="grow" />
            <span className="momentum-tier" style={{ color: st.tier.color }}>
              {st.tier.label}
            </span>
          </div>
        </div>
      </div>
      <button className="stat-pill clickable" onClick={() => open('achievements')} title={`Workspace level ${st.level}: ${st.xpInto}/${st.xpNeed} XP to the next level`}>
        <div className="level-badge num">{st.level}</div>
        <div className="xp-meter hide-narrow">
          <div className="stat-label">
            {st.boost ? (
              <>
                <Sun size={11} /> XP ×2
              </>
            ) : (
              'Workspace XP'
            )}
          </div>
          <Bar value={st.xpInto / Math.max(1, st.xpNeed)} color="var(--gold)" />
        </div>
      </button>
      <button className="stat-pill clickable hide-narrow" onClick={() => open('customize')} title="Sparks: earned from tasks and events; spend them on decorations">
        <span className="spark-icon" aria-hidden>
          ✦
        </span>
        <span className="stat-value">{compactNum(Math.floor(st.sparks))}</span>
      </button>
      <button className="stat-pill clickable hide-md" onClick={() => open('stats')} title="This project's spend and token usage (click for the full budget panel)">
        <div>
          <div className="stat-label">Spend / cap</div>
          <div className="stat-value small-value">
            {money(st.spend.cost)} <span className="muted">/ {money(st.spend.cap)}</span>
          </div>
        </div>
        <div className="hide-xl">
          <div className="stat-label">Tokens</div>
          <div className="stat-value small-value">{compactNum(st.spend.tokens)}</div>
        </div>
      </button>
      <button className={`mode-chip mode-${mode}`} onClick={() => open('settings')} title={MODE_HELP[mode]} data-tour="mode">
        {mode}
      </button>
      {bell}
      <button
        className={`icon-btn${spectate ? ' is-on' : ''}`}
        aria-label="Spectate"
        aria-pressed={spectate}
        title="Spectate: the camera follows whatever the crew just did (drag the map to stop)"
        onClick={() => mutate((s) => void (s.ui.spectate = !s.ui.spectate))}
      >
        <Video size={17} />
      </button>
      <button
        className={`icon-btn${hidden ? ' is-on' : ''}`}
        aria-label={hidden ? 'Show side panels' : 'Hide side panels'}
        aria-pressed={hidden}
        title="Hide/show the side panels (H)"
        onClick={() => mutate((s) => void (s.ui.panelsHidden = !s.ui.panelsHidden))}
      >
        <PanelsLeftRight size={17} />
      </button>
      <button className="icon-btn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => mutate((s) => void (s.ui.muted = !s.ui.muted))}>
        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
      </button>
      <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => open('settings')}>
        <Settings size={17} />
      </button>
    </header>
  )
}
