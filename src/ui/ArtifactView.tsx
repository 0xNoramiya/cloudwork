import { BookOpen, Copy, Download, FileCode2, Send, X } from 'lucide-react'
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { CREW } from '../engine/crew'
import { findSolutionAndTests } from '../engine/parse'
import { pushToast } from '../engine/game/progression'
import { getWorld, mutate, useWorld } from '../state/store'
import { nanoid } from 'nanoid'
import { CloseButton } from './AgentInspector'
import { ApprovalCard } from './Desk'
import { Markdown } from './Markdown'
import { Portrait, ProvBadge, download, slug, timeAgo, Dialog } from './common'

const KIND_LABEL: Record<string, string> = {
  plan: 'Plan',
  research: 'Research notes',
  code: 'Code',
  markdown: 'Document',
  design: 'Design',
  data: 'Analysis',
  test_report: 'Sandbox test report',
  review: 'QA review',
  deliverable: 'Final deliverable',
}

async function postWebhook(artifactId: string) {
  const s = getWorld()
  const art = s.artifacts[artifactId]
  const url = s.settings.webhookUrl
  if (!art || !url) return
  if (!window.confirm(`Send "${art.title}" to ${url}?\n\nThis posts the deliverable to an external service.`)) return
  const payload = { title: art.title, summary: art.summary, markdown: art.content, provenance: art.provenance, source: 'cloudworks' }
  try {
    const r = await fetch('/api/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, payload }) })
    const j = (await r.json()) as { ok?: boolean; status?: number; error?: string }
    mutate((d) => {
      pushToast(d, { kind: j.ok ? 'success' : 'error', title: j.ok ? 'Posted to webhook' : 'Webhook failed', body: j.ok ? `HTTP ${j.status}` : (j.error ?? `HTTP ${j.status}`) })
      d.log.push({
        id: nanoid(8),
        at: Date.now(),
        type: 'webhook',
        level: j.ok ? 'success' : 'error',
        provenance: 'real',
        text: j.ok ? `Webhook POST of "${art.title}" succeeded (HTTP ${j.status}).` : `Webhook POST of "${art.title}" failed: ${j.error ?? j.status}`,
      })
    })
  } catch (e) {
    mutate((d) => pushToast(d, { kind: 'error', title: 'Webhook failed', body: e instanceof Error ? e.message : String(e) }))
  }
}

export function ReaderModal() {
  const id = useWorld((s) => s.ui.reader)
  const art = useWorld((s) => (s.ui.reader ? s.artifacts[s.ui.reader] : undefined))
  const approval = useWorld((s) => (id ? Object.values(s.approvals).find((a) => a.status === 'pending' && a.payload.artifactId === id) : undefined))
  if (!art) return null
  const close = () => mutate((s) => void (s.ui.reader = null))
  const c = CREW[art.agentId]
  return (
    <Dialog label={art.title} onClose={close} className="modal reader panel">
      <div className="panel-head">
        <Portrait role={art.agentId} size="sm" />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="panel-title truncate">{art.title}</h2>
          <div className="row tiny muted" style={{ fontWeight: 800 }}>
            {c.name} · {art.kind.replace('_', ' ')} · v{art.version} <ProvBadge p={art.provenance} />
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => download(`${slug(art.title)}.md`, `# ${art.title}\n\n${art.content}\n`)}>
          <Download size={13} /> .md
        </button>
        <button className="icon-btn" aria-label="Close reader" onClick={close}>
          <X size={17} />
        </button>
      </div>
      <div className="modal-body">
        {approval && (
          <div style={{ marginBottom: 14 }}>
            <ApprovalCard a={approval} />
          </div>
        )}
        <Markdown text={art.content} />
      </div>
    </Dialog>
  )
}

export function ArtifactView({ id }: { id: string }) {
  const art = useWorld((s) => s.artifacts[id])
  const approval = useWorld((s) => Object.values(s.approvals).find((a) => a.status === 'pending' && a.payload.artifactId === id))
  const webhook = useWorld((s) => s.settings.webhookUrl)
  const [copied, setCopied] = useState(false)
  if (!art) return null
  const c = CREW[art.agentId]
  const code = art.kind === 'code' ? findSolutionAndTests(art.content) : null
  return (
    <>
      <div className="inspector-hero" style={{ ['--role' as string]: c.color }}>
        <Portrait role={art.agentId} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="inspector-title">
            {KIND_LABEL[art.kind] ?? art.kind} · {c.name}
          </div>
          <div className="inspector-name" style={{ fontSize: 17 }}>
            {art.title}
          </div>
          <div className="row" style={{ marginTop: 5, flexWrap: 'wrap' }}>
            <ProvBadge p={art.provenance} />
            <ProvBadge p={art.status === 'rejected' ? 'error' : 'draft'} label={art.status} />
            <span className="tiny muted" style={{ fontWeight: 800 }}>
              v{art.version} · {timeAgo(art.createdAt)}
              {art.model ? ` · ${art.model}` : ''}
            </span>
          </div>
        </div>
        <CloseButton />
      </div>
      <div className="rightpanel-body scroll">
        {approval && (
          <div style={{ marginBottom: 12 }}>
            <ApprovalCard a={approval} />
          </div>
        )}
        {art.provenance === 'simulated' && (
          <div className="card soft tiny" style={{ fontWeight: 700, marginBottom: 10, color: 'var(--ink-2)' }}>
            Demo mode: this text is a scripted stand-in for a model response. Hand-offs, sandbox test runs, reviews and assembly around it were real.
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="btn btn-sm btn-primary" onClick={() => mutate((s) => void (s.ui.reader = art.id))}>
            <BookOpen size={13} /> Read
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              void navigator.clipboard.writeText(art.content)
              setCopied(true)
              sfx('pop')
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="btn btn-sm" onClick={() => download(`${slug(art.title)}.md`, `# ${art.title}\n\n${art.content}\n`)}>
            <Download size={13} /> .md
          </button>
          {code?.solution && (
            <button className="btn btn-sm" onClick={() => download('solution.js', code.solution!.code, 'text/javascript')}>
              <FileCode2 size={13} /> solution.js
            </button>
          )}
          {code?.tests && (
            <button className="btn btn-sm" onClick={() => download('tests.js', code.tests!.code, 'text/javascript')}>
              <FileCode2 size={13} /> tests.js
            </button>
          )}
          {art.kind === 'deliverable' && webhook && (
            <button className="btn btn-sm" onClick={() => void postWebhook(art.id)} title="External action: asks you to confirm first">
              <Send size={13} /> Post to webhook
            </button>
          )}
        </div>
        <Markdown text={art.content} />
      </div>
    </>
  )
}
