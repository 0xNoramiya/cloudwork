import {
  BarChart3,
  Brush,
  Clapperboard,
  FileStack,
  FolderKanban,
  GitBranch,
  Lightbulb,
  MoreHorizontal,
  Palette,
  Plus,
  ScrollText,
  Settings as SettingsIcon,
  Sparkles,
  TreeDeciduous,
  Trophy,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sfx } from '../audio/sfx'
import { mutate, useWorld, type PanelId } from '../state/store'
import { isCompact, toggleSheet, useCompact, useNarrow } from './layout'

type Item = { id: PanelId; label: string; icon: LucideIcon; key?: string }

const PANELS: Record<string, Item> = {
  tasks: { id: 'tasks', label: 'Tasks', icon: GitBranch, key: 'T' },
  artifacts: { id: 'artifacts', label: 'Outputs', icon: FileStack, key: 'O' },
  memory: { id: 'memory', label: 'Memory', icon: TreeDeciduous, key: 'M' },
  log: { id: 'log', label: 'Log', icon: ScrollText, key: 'L' },
  replay: { id: 'replay', label: 'Replay', icon: Clapperboard, key: 'R' },
  stats: { id: 'stats', label: 'Stats', icon: BarChart3, key: 'S' },
  projects: { id: 'projects', label: 'Projects', icon: FolderKanban, key: 'P' },
  achievements: { id: 'achievements', label: 'Trophies', icon: Trophy, key: 'A' },
  discoveries: { id: 'discoveries', label: 'Finds', icon: Sparkles, key: 'F' },
  ideas: { id: 'ideas', label: 'Ideas', icon: Lightbulb, key: 'I' },
  decorate: { id: 'decorate', label: 'Decorate', icon: Brush, key: 'D' },
  customize: { id: 'customize', label: 'Style', icon: Palette, key: 'C' },
  settings: { id: 'settings', label: 'Settings', icon: SettingsIcon },
}

/** Desktop bar: the work panels up front, the rest one click away in "More". */
const BAR_GROUPS: Item[][] = [
  [PANELS.tasks, PANELS.artifacts, PANELS.memory, PANELS.log],
  [PANELS.replay, PANELS.achievements, PANELS.decorate],
]
const BAR_MORE: Item[] = [PANELS.discoveries, PANELS.ideas, PANELS.stats, PANELS.projects, PANELS.customize, PANELS.settings]

/** Phone tab bar, and what the "More" sheet holds. */
const TABS: Item[] = [PANELS.tasks, PANELS.artifacts, PANELS.memory]
export const SHEET_MORE: Item[] = [PANELS.log, PANELS.replay, PANELS.discoveries, PANELS.achievements, PANELS.decorate, PANELS.ideas, PANELS.stats, PANELS.projects, PANELS.customize, PANELS.settings]

export const PANEL_KEYS: Record<string, PanelId> = Object.fromEntries(Object.values(PANELS).flatMap((i) => (i.key ? [[i.key.toLowerCase(), i.id]] : [])))

export function togglePanel(id: PanelId) {
  sfx('open')
  mutate((s) => {
    s.ui.panel = s.ui.panel === id ? null : id
    if (id !== 'decorate') s.ui.decorSlot = null
    s.ui.sheet = null
    // Phones: a panel replaces the inspector sheet (tapping something inside the panel brings it back).
    if (isCompact()) s.ui.selection = { kind: null, id: null }
  })
}

export function useBadges() {
  const counts = useWorld(
    useShallow((s) => ({
      discoveries: s.game.discoveries.filter((d) => !d.collected).length,
      crates: s.game.crates,
      conflicts: Object.values(s.memories).filter((m) => m.conflictWith).length,
    })),
  )
  return (id: PanelId) => (id === 'discoveries' ? counts.discoveries : id === 'decorate' ? counts.crates : id === 'memory' ? counts.conflicts : 0)
}

export function openGoal() {
  sfx('open')
  mutate((s) => {
    s.ui.goalOpen = true
    s.ui.sheet = null
  })
}

function ActButton({ it, on, badge, onClick }: { it: Item; on: boolean; badge: number; onClick: () => void }) {
  return (
    <button className={`act${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on} title={it.key ? `${it.label} (${it.key})` : it.label}>
      <it.icon size={19} aria-hidden />
      <span className="act-label">{it.label}</span>
      {badge > 0 && <span className="badge-count num">{badge}</span>}
    </button>
  )
}

function MoreMenu({ onClose }: { onClose: () => void }) {
  const panel = useWorld((s) => s.ui.panel)
  const badge = useBadges()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.act-more')) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="more-menu panel" role="menu" ref={ref}>
      {BAR_MORE.map((it) => (
        <button
          key={it.id}
          role="menuitem"
          className={`more-item${panel === it.id ? ' is-on' : ''}`}
          onClick={() => {
            togglePanel(it.id)
            onClose()
          }}
        >
          <it.icon size={17} aria-hidden />
          <span className="grow">{it.label}</span>
          {badge(it.id) > 0 && <span className="chip tone tone-wait num">{badge(it.id)}</span>}
          {it.key && <span className="kbd">{it.key}</span>}
        </button>
      ))}
    </div>
  )
}

export function ActionBar() {
  const compact = useCompact()
  const narrow = useNarrow()
  const panel = useWorld((s) => s.ui.panel)
  const sheet = useWorld((s) => s.ui.sheet)
  const badge = useBadges()
  const [more, setMore] = useState(false)

  if (compact) {
    const moreBadge = SHEET_MORE.reduce((n, it) => n + badge(it.id), 0)
    return (
      <nav className="tabbar panel" aria-label="Actions">
        <button className="tab-new" onClick={openGoal} aria-label="New goal" data-tour="goal">
          <Plus size={22} strokeWidth={3} aria-hidden />
        </button>
        <button className={`act${sheet === 'crew' ? ' is-on' : ''}`} onClick={() => toggleSheet('crew')} aria-pressed={sheet === 'crew'} data-tour="crew">
          <Users size={19} aria-hidden />
          <span className="act-label">Crew</span>
        </button>
        {TABS.map((it) => (
          <ActButton key={it.id} it={it} on={panel === it.id} badge={badge(it.id)} onClick={() => togglePanel(it.id)} />
        ))}
        <button className={`act${sheet === 'more' ? ' is-on' : ''}`} onClick={() => toggleSheet('more')} aria-pressed={sheet === 'more'}>
          <MoreHorizontal size={19} aria-hidden />
          <span className="act-label">More</span>
          {moreBadge > 0 && <span className="badge-count num">{moreBadge}</span>}
        </button>
      </nav>
    )
  }

  const moreOn = more || BAR_MORE.some((it) => it.id === panel)
  const moreBadge = BAR_MORE.reduce((n, it) => n + badge(it.id), 0)
  return (
    <nav className="actionbar" aria-label="Actions">
      <div className="actionbar-inner panel">
        <button className="btn btn-primary goal-btn" onClick={openGoal} title="New goal (G)" data-tour="goal">
          <Plus size={19} strokeWidth={3} aria-hidden /> <span className="goal-label">New goal</span>
        </button>
        {narrow && (
          <div className="act-group">
            <button className={`act${sheet === 'crew' ? ' is-on' : ''}`} onClick={() => toggleSheet('crew')} aria-pressed={sheet === 'crew'} title="Crew roster" data-tour="crew">
              <Users size={19} aria-hidden />
              <span className="act-label">Crew</span>
            </button>
          </div>
        )}
        {BAR_GROUPS.map((group, gi) => (
          <div key={gi} className="act-group">
            {group.map((it) => (
              <ActButton key={it.id} it={it} on={panel === it.id} badge={badge(it.id)} onClick={() => togglePanel(it.id)} />
            ))}
          </div>
        ))}
        <div className="act-group">
          <button className={`act act-more${moreOn ? ' is-on' : ''}`} onClick={() => setMore((m) => !m)} aria-haspopup="menu" aria-expanded={more} title="More panels">
            <MoreHorizontal size={19} aria-hidden />
            <span className="act-label">More</span>
            {moreBadge > 0 && <span className="badge-count num">{moreBadge}</span>}
          </button>
        </div>
        {more && <MoreMenu onClose={() => setMore(false)} />}
      </div>
    </nav>
  )
}
