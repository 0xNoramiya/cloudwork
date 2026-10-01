import { useEffect, useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { playMusic } from '../audio/music'
import { setVolumes, sfx } from '../audio/sfx'
import { mutate, useWorld } from '../state/store'
import { ActionBar, PANEL_KEYS } from './ActionBar'
import { ReaderModal } from './ArtifactView'
import { GoalDialog } from './GoalDialog'
import { Celebration, EventCards, EventsPill, ReplayBadge, SpectateBadge, Toasts, Welcome } from './Overlays'
import { DrawerHeadExtra } from './common'
import { RightPanel } from './RightPanel'
import { useCompact } from './layout'
import { Minimap, Roster } from './Roster'
import { Sheets } from './Sheets'
import { TopBar } from './TopBar'
import { Tour } from './Tour'
import { ActivityLog } from './panels/ActivityLog'
import { MemoryVault } from './panels/MemoryVault'
import { Outputs } from './panels/Outputs'
import { Achievements, Customize, Decorate, Discoveries, IdeaWall } from './panels/Progression'
import { Replay } from './panels/Replay'
import { Projects, Settings } from './panels/Settings'
import { Stats } from './panels/Stats'
import { TaskBoard } from './panels/TaskBoard'

function Drawer() {
  const panel = useWorld((s) => s.ui.panel)
  const phone = useCompact()
  if (!panel) return null
  const close = () =>
    mutate((s) => {
      s.ui.panel = null
      s.ui.decorSlot = null
    })
  const body = {
    tasks: <TaskBoard onClose={close} />,
    memory: <MemoryVault onClose={close} />,
    artifacts: <Outputs onClose={close} />,
    log: <ActivityLog onClose={close} />,
    replay: <Replay onClose={close} />,
    stats: <Stats onClose={close} />,
    budget: <Stats onClose={close} />,
    achievements: <Achievements onClose={close} />,
    discoveries: <Discoveries onClose={close} />,
    ideas: <IdeaWall onClose={close} />,
    decorate: <Decorate onClose={close} />,
    customize: <Customize onClose={close} />,
    settings: <Settings onClose={close} />,
    projects: <Projects onClose={close} />,
  }[panel]
  const short = panel === 'decorate' || panel === 'customize' || panel === 'replay'
  return (
    <section className={`drawer panel${short ? ' short' : ''}`} aria-label={panel} key={panel}>
      <DrawerHeadExtra.Provider value={short || phone ? null : <EventsPill />}>{body}</DrawerHeadExtra.Provider>
    </section>
  )
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'escape') {
        mutate((s) => {
          if (s.ui.goalOpen) s.ui.goalOpen = false
          else if (s.ui.reader) s.ui.reader = null
          else if (s.ui.sheet) s.ui.sheet = null
          else if (s.ui.panel) s.ui.panel = null
          else s.ui.selection = { kind: null, id: null }
        })
        return
      }
      if (!useWorld.getState().ui.started) return
      if (k === 'h') {
        mutate((s) => void (s.ui.panelsHidden = !s.ui.panelsHidden))
        return
      }
      if (k === 'g') {
        e.preventDefault()
        sfx('open')
        mutate((s) => void (s.ui.goalOpen = true))
        return
      }
      const panel = PANEL_KEYS[k]
      if (panel) {
        sfx('open')
        mutate((s) => void (s.ui.panel = s.ui.panel === panel ? null : panel))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useAudioBinding() {
  const a = useWorld(useShallow((s) => ({ volume: s.settings.volume, muted: s.ui.muted, music: s.game.music, started: s.ui.started })))
  useEffect(() => setVolumes(a.volume, a.muted), [a.volume, a.muted])
  useEffect(() => {
    if (a.started) playMusic(a.music)
  }, [a.music, a.started])
}

/** Compact layout bookkeeping: selecting something swaps list sheets for the inspector, and the camera learns how much of
 * the screen the open sheet covers (via --sheet-h + a 'cw-layout' event) so the islands stay centered above it. */
function useCompactLayout(compact: boolean) {
  useEffect(
    () =>
      useWorld.subscribe((s, prev) => {
        if (s.ui.selection !== prev.ui.selection && s.ui.selection.kind && s.ui.sheet && s.ui.sheet !== 'desk') mutate((d) => void (d.ui.sheet = null))
      }),
    [],
  )
  const layoutKey = useWorld((s) => `${s.ui.sheet}|${s.ui.selection.kind}|${s.ui.panel}`)
  useLayoutEffect(() => {
    const sheet = compact ? document.querySelector<HTMLElement>('.hud .sheet') : null
    const h = sheet ? Math.round(window.innerHeight - sheet.getBoundingClientRect().top) : 0
    document.documentElement.style.setProperty('--sheet-h', `${h}px`)
    window.dispatchEvent(new Event('cw-layout'))
  }, [compact, layoutKey])
}

export function Hud() {
  const started = useWorld((s) => s.ui.started)
  const hidden = useWorld((s) => s.ui.panelsHidden)
  const compact = useCompact()
  useShortcuts()
  useAudioBinding()
  useCompactLayout(compact)
  return (
    <div className={`hud${hidden ? ' panels-hidden' : ''}${compact ? ' compact' : ''}`}>
      {started && (
        <>
          <TopBar />
          <Roster />
          <Minimap />
          <RightPanel />
          <ActionBar />
          <Drawer />
          <Sheets />
          <EventCards />
          <Toasts />
          <ReplayBadge />
          <SpectateBadge />
          <GoalDialog />
          <ReaderModal />
          <Celebration />
          <Tour />
        </>
      )}
      <Welcome />
    </div>
  )
}
