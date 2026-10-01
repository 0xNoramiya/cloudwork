import { Html } from '@react-three/drei'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../engine/crew'
import type { RoleId } from '../engine/types'
import { useWorld } from '../state/store'
import { ACTIVITY_ICON, ACTIVITY_LABEL, activityTone } from '../ui/icons'
import { replayFrameAt } from './replay'

export function AgentLabel({ role }: { role: RoleId }) {
  const v = useWorld(
    useShallow((s) => {
      const a = s.agents[role]
      const replay = s.ui.replay
      const activity = replay ? (replayFrameAt(replay.projectId, replay.t)?.a[role]?.[0] ?? 'idle') : a.activity
      const task = a.taskId ? s.tasks[a.taskId] : undefined
      return {
        activity,
        bubble: replay ? null : a.bubble,
        progress: replay ? null : task && ['running'].includes(task.status) ? Math.round(task.progress * 20) / 20 : null,
        labels: s.settings.showLabels,
        selected: s.ui.selection.kind === 'agent' && s.ui.selection.id === role,
      }
    }),
  )
  const c = CREW[role]
  const Icon = ACTIVITY_ICON[v.activity]
  const tone = activityTone(v.activity)
  const attention = tone === 'wait' || tone === 'bad'
  if (!v.labels && !attention && !v.bubble && !v.selected) return null
  const r = 9
  const circ = 2 * Math.PI * r
  return (
    <Html position={[0, 1.95, 0]} center zIndexRange={[40, 10]} style={{ pointerEvents: 'none' }}>
      <div className={`agent-tag tone-${tone}${v.selected ? ' is-selected' : ''}`} style={{ ['--role' as string]: c.color }}>
        {v.bubble && (
          <div className={`agent-bubble kind-${v.bubble.kind}`} key={v.bubble.at}>
            {v.bubble.text}
          </div>
        )}
        <div className="agent-plate">
          <span className="agent-status" title={ACTIVITY_LABEL[v.activity]}>
            {v.progress !== null && (
              <svg className="agent-ring" viewBox="0 0 22 22" aria-hidden>
                <circle cx="11" cy="11" r={r} className="ring-bg" />
                <circle cx="11" cy="11" r={r} className="ring-fg" strokeDasharray={circ} strokeDashoffset={circ * (1 - v.progress)} />
              </svg>
            )}
            <Icon size={12} strokeWidth={2.5} />
          </span>
          <span className="agent-name">{c.name}</span>
          {attention && <span className="agent-alert">{ACTIVITY_LABEL[v.activity]}</span>}
        </div>
      </div>
    </Html>
  )
}
