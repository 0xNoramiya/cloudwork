import { Download, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CREW } from '../../engine/crew'
import { ROLE_IDS, type LogLevel, type RoleId } from '../../engine/types'
import { mutate, useWorld } from '../../state/store'
import { Empty, PanelHead, Portrait, ProvBadge, clock, download } from '../common'

export function ActivityLog({ onClose }: { onClose: () => void }) {
  const log = useWorld((s) => s.log)
  const [agent, setAgent] = useState<RoleId | 'all'>('all')
  const [level, setLevel] = useState<LogLevel | 'all' | 'nodebug'>('nodebug')
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    let r = [...log].reverse()
    if (agent !== 'all') r = r.filter((l) => l.agentId === agent)
    if (level === 'nodebug') r = r.filter((l) => l.level !== 'debug')
    else if (level !== 'all') r = r.filter((l) => l.level === level)
    if (q.trim()) {
      const needle = q.toLowerCase()
      r = r.filter((l) => l.text.toLowerCase().includes(needle) || l.type.includes(needle))
    }
    return r.slice(0, 400)
  }, [log, agent, level, q])
  return (
    <>
      <PanelHead title="Activity log" icon={<ScrollText size={19} />} onClose={onClose}>
        <span className="chip">{log.length} events</span>
        <button className="btn btn-sm" onClick={() => download('cloudworks-log.json', JSON.stringify(log, null, 2), 'application/json')}>
          <Download size={13} /> JSON
        </button>
      </PanelHead>
      <div className="drawer-body scroll">
        <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <input className="input grow" placeholder="Filter text…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 14, maxWidth: 320 }} />
          <select className="select" style={{ width: 160, fontSize: 14 }} value={agent} onChange={(e) => setAgent(e.target.value as RoleId | 'all')}>
            <option value="all">Everyone</option>
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                {CREW[r].name}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 190, fontSize: 14 }} value={level} onChange={(e) => setLevel(e.target.value as LogLevel | 'all' | 'nodebug')}>
            <option value="nodebug">All but model calls</option>
            <option value="all">Everything (incl. model calls)</option>
            <option value="debug">Model calls only</option>
            <option value="success">Successes</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
          </select>
        </div>
        {rows.length === 0 ? (
          <Empty title="Nothing logged yet" />
        ) : (
          <div>
            {rows.map((l) => (
              <div
                key={l.id}
                className={`log-row lv-${l.level}`}
                style={{ cursor: l.taskId || l.data?.artifactId ? 'pointer' : 'default' }}
                onClick={() => {
                  const art = l.data?.artifactId as string | undefined
                  if (art) mutate((s) => void (s.ui.selection = { kind: 'artifact', id: art }))
                  else if (l.taskId) mutate((s) => void (s.ui.selection = { kind: 'task', id: l.taskId! }))
                }}
              >
                <span className="log-time">{clock(l.at)}</span>
                {l.agentId ? <Portrait role={l.agentId} size="sm" /> : <span />}
                <span>{l.text}</span>
                {l.provenance ? <ProvBadge p={l.provenance} /> : <span />}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
