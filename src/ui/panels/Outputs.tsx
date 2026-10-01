import { Download, FileStack } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import { exportWorld } from '../../engine/persist'
import { mutate, useWorld } from '../../state/store'
import { Empty, PanelHead, Portrait, ProvBadge, download, slug, timeAgo } from '../common'

const KIND_ORDER = ['deliverable', 'plan', 'research', 'data', 'design', 'code', 'test_report', 'review', 'markdown']

export function Outputs({ onClose }: { onClose: () => void }) {
  const activeId = useWorld((s) => s.activeProjectId)
  const projects = useWorld(useShallow((s) => s.projectOrder.map((id) => s.projects[id]).filter(Boolean)))
  const [pid, setPid] = useState<string | 'all'>(activeId ?? 'all')
  const artifacts = useWorld(useShallow((s) => Object.values(s.artifacts)))
  const list = useMemo(
    () =>
      artifacts
        .filter((a) => pid === 'all' || a.projectId === pid)
        .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.createdAt - a.createdAt),
    [artifacts, pid],
  )
  const bundle = () => {
    const p = projects.find((x) => x.id === pid)
    const parts = list.map((a) => `\n\n---\n\n# ${a.title}\n_${CREW[a.agentId].name} · ${a.kind} · ${a.provenance}_\n\n${a.content}`)
    download(`${slug(p?.title ?? 'cloudworks-outputs')}.md`, `# ${p?.title ?? 'Cloudworks outputs'}\n${p ? `\n> Goal: ${p.goal}\n` : ''}${parts.join('')}\n`)
  }
  return (
    <>
      <PanelHead title="Outputs & artifacts" icon={<FileStack size={19} />} onClose={onClose}>
        <select className="select" style={{ width: 220, fontSize: 14 }} value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={bundle} disabled={!list.length}>
          <Download size={13} /> Bundle .md
        </button>
        <button className="btn btn-sm" onClick={() => download('cloudworks-save.json', exportWorld(), 'application/json')} title="Everything except API keys">
          <Download size={13} /> Save file
        </button>
      </PanelHead>
      <div className="drawer-body scroll">
        {list.length === 0 ? (
          <Empty title="No outputs yet">Drafts, code, test reports, reviews and final deliverables collect here.</Empty>
        ) : (
          <div className="grid-auto" style={{ ['--min' as string]: '280px' }}>
            {list.map((a) => (
              <button key={a.id} className="card clickable" style={{ textAlign: 'left' }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'artifact', id: a.id }))}>
                <div className="row">
                  <Portrait role={a.agentId} size="sm" />
                  <strong className="grow truncate" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {a.title}
                  </strong>
                </div>
                <div className="row" style={{ margin: '6px 0', flexWrap: 'wrap' }}>
                  <span className="chip">{a.kind.replace('_', ' ')}</span>
                  <ProvBadge p={a.provenance} />
                  {a.status !== 'draft' && <span className="chip">{a.status}</span>}
                  <span className="tiny muted" style={{ fontWeight: 800 }}>
                    {timeAgo(a.createdAt)}
                  </span>
                </div>
                <div className="small muted" style={{ fontWeight: 700, lineHeight: 1.4 }}>
                  {a.summary}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
