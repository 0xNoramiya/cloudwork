import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { CREW } from '../engine/crew'
import type { Provenance, RoleId } from '../engine/types'
import { sfx } from '../audio/sfx'

export function portraitUrl(role: RoleId) {
  return `/assets/portraits/${role}.webp`
}

export function Portrait({ role, size = 'md' }: { role: RoleId; size?: 'sm' | 'md' | 'lg' }) {
  const c = CREW[role]
  return (
    <img
      className={`portrait ${size === 'md' ? '' : size}`}
      src={portraitUrl(role)}
      alt={`${c.name} the ${c.animal}`}
      style={{ ['--role' as string]: c.color, ['--soft' as string]: c.soft }}
      draggable={false}
    />
  )
}

export function ProvBadge({ p, label }: { p: Provenance | 'error' | 'draft'; label?: string }) {
  const text = label ?? { real: 'Real', simulated: 'Simulated', user: 'You', cosmetic: 'Cosmetic', error: 'Error', draft: 'Draft' }[p]
  const title = {
    real: 'Produced by a real model call or real execution',
    simulated: 'Demo mode: scripted stand-in for a model. The orchestration around it is real.',
    user: 'Written by you',
    cosmetic: 'Game flavor only; does not affect the work',
    error: 'Something failed',
    draft: 'Not final yet',
  }[p]
  return (
    <span className={`prov prov-${p}`} title={title}>
      {text}
    </span>
  )
}

export function Bar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={`bar ${className ?? ''}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, ['--fill' as string]: color }} />
    </div>
  )
}

/** Extra header content a drawer injects into its panel's head (the waiting-events pill). */
export const DrawerHeadExtra = createContext<ReactNode>(null)

export function PanelHead({ title, icon, children, onClose }: { title: ReactNode; icon?: ReactNode; children?: ReactNode; onClose?: () => void }) {
  const extra = useContext(DrawerHeadExtra)
  return (
    <div className="panel-head">
      {icon}
      <h2 className="panel-title grow truncate">{title}</h2>
      {(extra || children) && (
        <div className="panel-tools">
          {extra}
          {children}
        </div>
      )}
      {onClose && (
        <button
          className="icon-btn"
          aria-label="Close"
          onClick={() => {
            sfx('close')
            onClose()
          }}
        >
          <X size={17} />
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  )
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${String(s % 60).padStart(2, '0')}s`
}

export function money(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function download(filename: string, content: string, type = 'text/markdown') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cloudworks'
  )
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modal dialog: takes focus when it opens (its [autofocus] element, else itself), keeps Tab inside, closes on Escape,
 * and hands focus back to whatever opened it. */
export function Dialog({ label, onClose, className, scrimClassName = 'scrim', children }: { label: string; onClose: () => void; className: string; scrimClassName?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = ref.current
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus]') ?? el).focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className={scrimClassName} onClick={onClose}>
      <div ref={ref} className={className} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  )
}

/** setTimeout that only counts down while the tab is visible. Returns a cancel function. */
export function visibleTimeout(cb: () => void, ms: number): () => void {
  let left = ms
  let started = 0
  let id = 0
  const run = () => {
    started = Date.now()
    id = window.setTimeout(cb, left)
  }
  const onVisibility = () => {
    if (document.hidden) {
      window.clearTimeout(id)
      left -= Date.now() - started
    } else run()
  }
  if (!document.hidden) run()
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.clearTimeout(id)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** Modifier key label for shortcut hints on this OS. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
