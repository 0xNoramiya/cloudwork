import { BellRing, Pause, Play, Settings, Square, Video, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { engine } from '../engine/engine'
import { ROLE_IDS } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { SHEET_MORE, togglePanel, useBadges } from './ActionBar'
import { Bar, money, compact as compactNum } from './common'
import { closeSheets, useCompact } from './layout'
import { CrewCard } from './Roster'
import { MODE_HELP, cancelProject, usePendingCount, useRunMode, useWorkspaceStats } from './TopBar'

/** Bottom sheet for the compact layout. Tap the handle to close, or drag it down. */
export function Sheet({ label, onClose, className, children }: { label: string; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)
  const moved = useRef(false)
  // Non-modal, so no focus trap: just move focus in on open and give it back on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected && !document.activeElement?.closest('.sheet')) opener.focus({ preventScroll: true })
    }
  }, [])
  const down = (e: ReactPointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 }
    moved.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    ref.current?.classList.add('is-dragging')
  }
  const move = (e: ReactPointerEvent) => {
    if (!drag.current || !ref.current) return
    const dy = Math.max(0, e.clientY - drag.current.y)
    drag.current.dy = dy
    if (dy > 4) moved.current = true
    ref.current.style.transform = `translateY(${dy}px)`
  }
  const up = () => {
    const dy = drag.current?.dy ?? 0
    drag.current = null
    if (!ref.current) return
    ref.current.classList.remove('is-dragging')
    ref.current.style.transform = ''
    if (dy > 70) onClose()
  }
  return (
    <section className={`sheet panel ${className ?? ''}`} aria-label={label} ref={ref} tabIndex={-1}>
      <button
        className="sheet-handle"
        aria-label={`Close ${label}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          if (!moved.current) onClose()
        }}
      />
      {children}
    </section>
  )
}

function CrewSheet() {
  return (
    <Sheet label="Crew" onClose={closeSheets} className="crew-sheet">
      <h2 className="panel-title sheet-title">Crew</h2>
      <div className="crew-grid scroll">
        {ROLE_IDS.map((r) => (
          <CrewCard key={r} role={r} />
        ))}
      </div>
    </Sheet>
  )
}

function MoreSheet() {
  const panel = useWorld((s) => s.ui.panel)
  const badge = useBadges()
  return (
    <Sheet label="More panels" onClose={closeSheets}>
      <h2 className="panel-title sheet-title">More</h2>
      <div className="more-grid">
        {SHEET_MORE.map((it) => (
          <button key={it.id} className={`more-tile${panel === it.id ? ' is-on' : ''}`} onClick={() => togglePanel(it.id)}>
            <it.icon size={21} aria-hidden />
            <span>{it.label}</span>
            {badge(it.id) > 0 && <span className="badge-count num">{badge(it.id)}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function MenuSheet() {
  const st = useWorkspaceStats()
  const mode = useRunMode()
  const pending = usePendingCount()
  const muted = useWorld((s) => s.ui.muted)
  const spectate = useWorld((s) => s.ui.spectate)
  const project = useWorld((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null))
  const live = project && !['done', 'cancelled', 'failed'].includes(project.status)
  return (
    <Sheet label="Workspace menu" onClose={closeSheets}>
      <h2 className="panel-title sheet-title">Workspace</h2>
      <div className="menu-sheet scroll">
        <div className="menu-stats">
          <button className="menu-stat" onClick={() => togglePanel('achievements')}>
            <span className="level-badge num">{st.level}</span>
            <span className="grow">
              <span className="stat-label">Level {st.level}</span>
              <Bar value={st.xpInto / Math.max(1, st.xpNeed)} color="var(--gold)" />
              <span className="tiny muted num">
                {st.xpInto}/{st.xpNeed} XP{st.boost ? ' · ×2 golden hour' : ''}
              </span>
            </span>
          </button>
          <div className="menu-stat">
            <span className="grow">
              <span className="stat-label">Momentum</span>
              <Bar value={st.momentum / 100} color={st.tier.color} />
              <span className="tiny" style={{ color: st.tier.color, fontWeight: 800 }}>
                {st.tier.label} · XP ×{st.tier.mult}
              </span>
            </span>
          </div>
          <button className="menu-stat" onClick={() => togglePanel('customize')}>
            <span className="spark-icon" aria-hidden>
              ✦
            </span>
            <span className="grow">
              <span className="stat-label">Sparks</span>
              <span className="stat-value num">{compactNum(Math.floor(st.sparks))}</span>
            </span>
          </button>
          <button className="menu-stat" onClick={() => togglePanel('stats')}>
            <span className="grow">
              <span className="stat-label">Spend / cap</span>
              <span className="stat-value num">
                {money(st.spend.cost)} <span className="muted">/ {money(st.spend.cap)}</span>
              </span>
            </span>
          </button>
        </div>
        <button className={`mode-chip mode-${mode} menu-mode`} onClick={() => togglePanel('settings')}>
          {mode} mode
        </button>
        <p className="tiny muted menu-mode-help">{MODE_HELP[mode]}</p>
        <div className="menu-list">
          {pending > 0 && (
            <button
              className="menu-row"
              onClick={() =>
                mutate((s) => {
                  s.ui.sheet = 'desk'
                  s.ui.selection = { kind: null, id: null }
                })
              }
            >
              <BellRing size={18} aria-hidden /> <span className="grow">{pending} waiting on you</span>
            </button>
          )}
          <button
            className="menu-row"
            aria-pressed={spectate}
            onClick={() =>
              mutate((s) => {
                s.ui.spectate = !s.ui.spectate
                s.ui.sheet = null
              })
            }
          >
            <Video size={18} aria-hidden /> <span className="grow">Spectate: camera follows the action</span>
            <span className={`toggle-dot${spectate ? ' on' : ''}`} />
          </button>
          <button className="menu-row" aria-pressed={!muted} onClick={() => mutate((s) => void (s.ui.muted = !s.ui.muted))}>
            {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />} <span className="grow">Sound</span>
            <span className={`toggle-dot${muted ? '' : ' on'}`} />
          </button>
          {live && project.status === 'paused' && (
            <button className="menu-row" onClick={() => engine.resumeProject()}>
              <Play size={18} aria-hidden /> <span className="grow">Resume project</span>
            </button>
          )}
          {live && project.status !== 'paused' && (
            <button className="menu-row" onClick={() => engine.pauseProject()}>
              <Pause size={18} aria-hidden /> <span className="grow">Pause project</span>
            </button>
          )}
          {live && (
            <button className="menu-row is-danger" onClick={cancelProject}>
              <Square size={16} aria-hidden /> <span className="grow">Cancel project</span>
            </button>
          )}
          <button className="menu-row" onClick={() => togglePanel('settings')}>
            <Settings size={18} aria-hidden /> <span className="grow">Settings & API keys</span>
          </button>
        </div>
      </div>
    </Sheet>
  )
}

/** Crew / More / Workspace sheets for the compact layout (the inspector sheet lives in RightPanel). */
export function Sheets() {
  const sheet = useWorld((s) => s.ui.sheet)
  const compact = useCompact()
  if (!compact) return null
  if (sheet === 'crew') return <CrewSheet />
  if (sheet === 'more') return <MoreSheet />
  if (sheet === 'menu') return <MenuSheet />
  return null
}
