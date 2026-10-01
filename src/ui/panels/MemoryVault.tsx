import { nanoid } from 'nanoid'
import { Pin, PinOff, Plus, Trash2, TreeDeciduous } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import { retrieveMemories, suggestTags } from '../../engine/memory'
import type { MemoryEntry, MemoryKind } from '../../engine/types'
import { mutate, useWorld } from '../../state/store'
import { Empty, PanelHead, Portrait, ProvBadge, timeAgo } from '../common'
import { engine } from '../../engine/engine'

export const KIND_COLOR: Record<MemoryKind, string> = {
  fact: '#3b8fd9',
  decision: '#d99a00',
  discovery: '#e0569a',
  lesson: '#e0782a',
  preference: '#8a63e0',
  summary: '#1fa38a',
}

function MemoryCard({ m, other }: { m: MemoryEntry; other?: MemoryEntry }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.text)
  return (
    <div className={`memory-card${m.conflictWith ? ' conflict' : ''}`}>
      <div className="row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
        <span className="memory-kind" style={{ background: KIND_COLOR[m.kind] }}>
          {m.kind}
        </span>
        <ProvBadge p={m.provenance} />
        {m.source.agent !== 'user' && <Portrait role={m.source.agent} size="sm" />}
        <span className="tiny muted grow truncate" style={{ fontWeight: 800 }}>
          {m.source.projectTitle ?? (m.source.agent === 'user' ? 'Added by you' : '')} · {timeAgo(m.createdAt)} · used {m.uses}×
        </span>
        <button
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          aria-label={m.pinned ? 'Unpin' : 'Pin (always included in prompts)'}
          title={m.pinned ? 'Unpin' : 'Pin: include in every prompt'}
          onClick={() => mutate((s) => void (s.memories[m.id].pinned = !m.pinned))}
        >
          {m.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          aria-label="Delete memory"
          onClick={() =>
            mutate((s) => {
              delete s.memories[m.id]
            })
          }
        >
          <Trash2 size={14} />
        </button>
      </div>
      {editing ? (
        <div className="col">
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 60, fontSize: 14 }} />
          <div className="row">
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                mutate((s) => {
                  s.memories[m.id].text = text
                  s.memories[m.id].provenance = 'user'
                })
                setEditing(false)
              }}
            >
              Save
            </button>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="small" style={{ fontWeight: 700, lineHeight: 1.45, cursor: 'text' }} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
          {m.text}
        </div>
      )}
      {m.tags.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6, gap: 4 }}>
          {m.tags.map((t) => (
            <span key={t} className="chip">
              #{t}
            </span>
          ))}
        </div>
      )}
      {m.conflictWith && other && (
        <div className="card soft small" style={{ marginTop: 8, fontWeight: 700 }}>
          Conflicts with: “{other.text}”
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => resolveConflict(m, other, 'new')}>
              Keep this
            </button>
            <button className="btn btn-sm" onClick={() => resolveConflict(m, other, 'old')}>
              Keep other
            </button>
            <button className="btn btn-sm" onClick={() => resolveConflict(m, other, 'both')}>
              Keep both
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function resolveConflict(m: MemoryEntry, other: MemoryEntry, keep: 'new' | 'old' | 'both') {
  const ev = Object.values(useWorld.getState().game.events).find((e) => e.kind === 'memory_conflict' && e.data?.newId === m.id)
  if (ev) {
    engine.resolveEvent(ev.id, keep === 'new' ? 'keep-new' : keep === 'old' ? 'keep-old' : 'keep-both')
    return
  }
  mutate((s) => {
    if (keep === 'new') delete s.memories[other.id]
    if (keep === 'old') delete s.memories[m.id]
    if (keep !== 'old' && s.memories[m.id]) s.memories[m.id].conflictWith = undefined
  })
}

function Timeline({ memories }: { memories: MemoryEntry[] }) {
  const groups = useMemo(() => {
    const byProject = new Map<string, MemoryEntry[]>()
    for (const m of [...memories].sort((a, b) => a.createdAt - b.createdAt)) {
      const k = m.source.projectTitle ?? 'Captain\'s notes'
      byProject.set(k, [...(byProject.get(k) ?? []), m])
    }
    return [...byProject.entries()]
  }, [memories])
  if (!memories.length) return <Empty title="The tree is still a sapling">Memories appear here as the crew finishes work.</Empty>
  return (
    <div className="col" style={{ gap: 14 }}>
      {groups.map(([title, list]) => (
        <div key={title}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="status-dot" style={{ ['--tone' as string]: '#1fa38a' }} />
            <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{title}</strong>
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              {new Date(list[0].createdAt).toLocaleDateString()} · {list.length} note{list.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ borderLeft: '3px solid var(--line)', marginLeft: 3, paddingLeft: 14 }} className="col">
            {list.map((m) => (
              <div key={m.id} className="small" style={{ fontWeight: 700 }}>
                <span className="memory-kind" style={{ background: KIND_COLOR[m.kind], marginRight: 6 }}>
                  {m.kind}
                </span>
                {m.text}
                <span className="tiny muted"> · {m.source.agent === 'user' ? 'you' : CREW[m.source.agent].name}, {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function MemoryVault({ onClose }: { onClose: () => void }) {
  const memories = useWorld(useShallow((s) => Object.values(s.memories)))
  const queue = useWorld((s) => s.memoryQueue.length)
  const sessionId = useWorld((s) => s.sessionId)
  const [tab, setTab] = useState<'browse' | 'timeline'>('browse')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<MemoryKind | 'all'>('all')
  const [note, setNote] = useState('')
  const byId = useMemo(() => new Map(memories.map((m) => [m.id, m])), [memories])
  const shown = useMemo(() => {
    let list = q.trim() ? retrieveMemories(memories, q, 60).map((r) => r.entry) : [...memories].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
    if (kind !== 'all') list = list.filter((m) => m.kind === kind)
    return list
  }, [memories, q, kind])
  const earlier = memories.filter((m) => m.sessionId !== sessionId).length
  return (
    <>
      <PanelHead title="Memory Vault" icon={<TreeDeciduous size={19} />} onClose={onClose}>
        <span className="chip">{memories.length} memories</span>
        {earlier > 0 && <span className="chip tone tone-info">{earlier} from earlier sessions</span>}
        {queue > 0 && <span className="chip tone tone-busy">Moss filing {queue}…</span>}
      </PanelHead>
      <div className="drawer-body scroll">
        <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginTop: 0 }}>
          Shared, persistent memory. Moss distills notes from every finished task; relevant notes are retrieved into prompts (keyword match, pins always included). Stored in this browser (IndexedDB) and survives reloads.
        </p>
        <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="tabs" style={{ width: 290 }}>
            <button className={`tab${tab === 'browse' ? ' is-on' : ''}`} onClick={() => setTab('browse')}>
              Browse
            </button>
            <button className={`tab${tab === 'timeline' ? ' is-on' : ''}`} onClick={() => setTab('timeline')}>
              Knowledge timeline
            </button>
          </div>
          {tab === 'browse' && (
            <>
              <input className="input grow" placeholder="Search memories (same retrieval the crew uses)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 14, maxWidth: 360 }} />
              <select className="select" style={{ width: 140, fontSize: 14 }} value={kind} onChange={(e) => setKind(e.target.value as MemoryKind | 'all')}>
                <option value="all">All kinds</option>
                {Object.keys(KIND_COLOR).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {tab === 'timeline' ? (
          <Timeline memories={memories} />
        ) : (
          <>
            <form
              className="row"
              style={{ marginBottom: 12 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                mutate((s) => {
                  const id = nanoid(10)
                  s.memories[id] = {
                    id,
                    text: note.trim(),
                    kind: 'preference',
                    tags: suggestTags(note),
                    source: { agent: 'user' },
                    createdAt: Date.now(),
                    sessionId: s.sessionId,
                    uses: 0,
                    pinned: true,
                    provenance: 'user',
                  }
                })
                setNote('')
              }}
            >
              <input className="input grow" placeholder="Teach the crew a preference, e.g. “Always write in British English”" value={note} onChange={(e) => setNote(e.target.value)} style={{ fontSize: 14 }} />
              <button className="btn btn-primary btn-sm" type="submit" disabled={!note.trim()}>
                <Plus size={14} /> Add (pinned)
              </button>
            </form>
            {shown.length === 0 ? (
              <Empty title={memories.length ? 'No matches' : 'No memories yet'}>{memories.length ? 'Try another search.' : 'Finish a task and watch Moss file notes into the Memory Tree.'}</Empty>
            ) : (
              <div className="grid-auto" style={{ ['--min' as string]: '300px' }}>
                {shown.map((m) => (
                  <MemoryCard key={m.id} m={m} other={m.conflictWith ? byId.get(m.conflictWith) : undefined} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
