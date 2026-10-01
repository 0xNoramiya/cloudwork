import { CheckCircle2, Eye, EyeOff, FolderKanban, KeyRound, Loader2, Settings as SettingsIcon, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CREW } from '../../engine/crew'
import { exportWorld, importWorld, resetWorld } from '../../engine/persist'
import { complete, keyFor, providerReady, saveKey } from '../../engine/providers'
import { ROLE_IDS, type ProviderConfig } from '../../engine/types'
import { getWorld, mutate, useWorld } from '../../state/store'
import { Empty, PanelHead, download, duration, money, timeAgo } from '../common'

function ProviderCard({ p }: { p: ProviderConfig }) {
  const [key, setKey] = useState(keyFor(p.id))
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' })
  const [model, setModel] = useState(p.models[0] ?? '')
  const [newModel, setNewModel] = useState('')
  const proxy = useWorld((s) => s.ui.proxyAvailable)
  useWorld((s) => s.ui.keysVersion)
  const update = (patch: Partial<ProviderConfig>) =>
    mutate((s) => {
      const x = s.settings.providers.find((y) => y.id === p.id)
      if (x) Object.assign(x, patch)
    })
  const runTest = async () => {
    setTest({ state: 'running' })
    const started = performance.now()
    try {
      const res = await complete(getWorld().settings, { providerId: p.id, model }, {
        system: 'You are a connection test. Reply with exactly: OK',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        maxTokens: 40,
        meta: { purpose: 'chat', role: 'planner' },
      })
      setTest({ state: 'ok', msg: `“${res.text.trim().slice(0, 40)}” from ${res.model} in ${Math.round(performance.now() - started)}ms · ${res.inputTokens}→${res.outputTokens} tokens` })
    } catch (e) {
      setTest({ state: 'fail', msg: e instanceof Error ? e.message : String(e) })
    }
  }
  const ready = providerReady(p)
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <KeyRound size={16} />
        <strong style={{ flex: '1 0 auto', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{p.label}</strong>
        {p.serverKey && <span className="chip tone tone-good">Key found in server .env</span>}
        <span className={`chip tone ${ready ? 'tone-good' : 'tone-idle'}`}>{ready ? 'Ready' : 'Needs setup'}</span>
        <label className="toggle">
          <input type="checkbox" checked={p.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        </label>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor={`key-${p.id}`}>
            API key {p.kind === 'openai-compatible' ? '(optional for local servers)' : ''}
          </label>
          <div className="row">
            <input
              id={`key-${p.id}`}
              className="input mono"
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder={p.serverKey ? 'Using the key from the server environment' : p.kind === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => {
                saveKey(p.id, key.trim())
                mutate((s) => void s.ui.keysVersion++)
              }}
              style={{ fontSize: 14 }}
            />
            <button className="icon-btn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <span className="tiny muted" style={{ fontWeight: 700 }}>
            Stored only in this browser's localStorage. Never saved in the world file, logs or exports.
          </span>
        </div>
      {(p.kind === 'openai-compatible' || p.kind === 'openrouter') && (
        <div className="field">
          <label className="label">Base URL</label>
          <input className="input mono" value={p.baseUrl ?? ''} onChange={(e) => update({ baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" style={{ fontSize: 14 }} />
        </div>
      )}
      <div className="field">
        <label className="label">Models</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
          {p.models.map((m) => (
            <span key={m} className="chip">
              {m}
              <button className="chip-btn" style={{ border: 0, background: 'none', padding: 0, marginLeft: 2, color: 'var(--ink-3)' }} aria-label={`Remove ${m}`} onClick={() => update({ models: p.models.filter((x) => x !== m) })}>
                ×
              </button>
            </span>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (newModel.trim() && !p.models.includes(newModel.trim())) update({ models: [...p.models, newModel.trim()] })
              setNewModel('')
            }}
          >
            <input className="input mono" value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="add model id" style={{ fontSize: 13, padding: '4px 8px', width: 170 }} />
          </form>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label className="toggle small" title={proxy ? 'Route through the local dev server (avoids browser CORS limits, can use server .env keys)' : 'The local API server is not running; requests go direct from the browser'}>
          <input type="checkbox" checked={p.useProxy} disabled={!proxy} onChange={(e) => update({ useProxy: e.target.checked })} />
          Use local proxy
        </label>
        <span className="grow" />
        <select className="select" value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 190, fontSize: 13, padding: '5px 8px' }}>
          {p.models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={() => void runTest()} disabled={test.state === 'running' || !p.enabled}>
          {test.state === 'running' ? <Loader2 size={13} className="spin" /> : null} Test connection
        </button>
      </div>
      {test.state !== 'idle' && test.state !== 'running' && (
        <div className={`small row`} style={{ marginTop: 8, fontWeight: 800, color: test.state === 'ok' ? 'var(--tone-good)' : 'var(--tone-bad)', alignItems: 'flex-start' }}>
          {test.state === 'ok' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          <span style={{ overflowWrap: 'anywhere' }}>{test.msg}</span>
        </div>
      )}
    </div>
  )
}

export function Settings({ onClose }: { onClose: () => void }) {
  const s = useWorld(useShallow((st) => st.settings))
  const proxy = useWorld((st) => st.ui.proxyAvailable)
  const file = useRef<HTMLInputElement>(null)
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => mutate((d) => void (d.settings[k] = v))
  const allModels = s.providers.filter((p) => p.enabled).flatMap((p) => p.models.map((m) => ({ p, m })))
  return (
    <>
      <PanelHead title="Settings" icon={<SettingsIcon size={19} />} onClose={onClose} />
      <div className="drawer-body scroll">
        <div className="section-title" style={{ marginTop: 0 }}>
          Models and API keys
        </div>
        <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginTop: 0 }}>
          Cloudworks is model-agnostic: pick a workspace default here and override any crew member's model in their Loadout tab. Anthropic calls use the official SDK (with server-side refusal fallback on supported models); OpenAI, OpenRouter and local servers use the OpenAI-compatible API.{' '}
          {proxy === false && <b style={{ color: 'var(--tone-wait)' }}>The local API proxy is not running, so requests go straight from the browser, and some providers block that (CORS). Run `npm run dev` to start the proxy.</b>}
        </p>
        <div className="field">
          <label className="label">Workspace default model</label>
          <select
            className="select"
            value={`${s.defaultModel.providerId}::${s.defaultModel.model}`}
            onChange={(e) => {
              const [providerId, ...rest] = e.target.value.split('::')
              set('defaultModel', { providerId, model: rest.join('::') })
            }}
          >
            {s.providers
              .filter((p) => p.enabled)
              .map((p) => (
                <optgroup key={p.id} label={`${p.label}${providerReady(p) ? '' : ' (needs key)'}`}>
                  {p.models.map((m) => (
                    <option key={m} value={`${p.id}::${m}`}>
                      {m === 'cloudworks-sim-1' ? 'Demo (simulated)' : m}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            className="btn btn-sm"
            onClick={() =>
              mutate((d) => {
                for (const r of ROLE_IDS) d.agents[r].loadout.model = null
              })
            }
          >
            Reset every crew member to the default
          </button>
          <span className="tiny muted" style={{ fontWeight: 700 }}>
            Overrides: {ROLE_IDS.filter((r) => getWorld().agents[r].loadout.model).map((r) => CREW[r].name).join(', ') || 'none'}
          </span>
        </div>
        {s.providers
          .filter((p) => p.kind !== 'demo')
          .map((p) => (
            <ProviderCard key={p.id} p={p} />
          ))}
        <div className="section-title">Orchestration</div>
        <div className="grid-auto" style={{ ['--min' as string]: '260px' }}>
          <div className="field">
            <label className="label">Budget cap per project (USD)</label>
            <input className="input" type="number" min={0} step={0.5} value={s.budgetUsd} onChange={(e) => set('budgetUsd', Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="field">
            <label className="label">Max tasks in parallel: {s.maxParallel}</label>
            <input className="range" type="range" min={1} max={8} value={s.maxParallel} onChange={(e) => set('maxParallel', Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Demo pacing: {s.demoSpeed}×</label>
            <input className="range" type="range" min={0.5} max={4} step={0.5} value={s.demoSpeed} onChange={(e) => set('demoSpeed', Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="label">Webhook for “Post to webhook” (optional, https)</label>
            <input className="input mono" value={s.webhookUrl} onChange={(e) => set('webhookUrl', e.target.value.trim())} placeholder="https://hooks.slack.com/…" style={{ fontSize: 14 }} />
          </div>
        </div>
        <div className="col">
          <label className="toggle">
            <input type="checkbox" checked={s.autoApproveWeb} onChange={(e) => set('autoApproveWeb', e.target.checked)} />
            Auto-approve read-only web requests (search & fetch). Shipping always asks.
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.reviewPlan} onChange={(e) => set('reviewPlan', e.target.checked)} />
            Review and edit Juno's plan before the crew starts
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.turbo} onChange={(e) => set('turbo', e.target.checked)} />
            Turbo: skip hand-off ceremonies and the kickoff huddle (pure speed)
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.refusalFallback} onChange={(e) => set('refusalFallback', e.target.checked)} />
            Anthropic server-side refusal fallback (<span className="mono">fallbacks: "default"</span>) on supported models
          </label>
        </div>
        <div className="section-title">Your data</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => download('cloudworks-save.json', exportWorld(), 'application/json')}>
            Export save file
          </button>
          <button className="btn btn-sm" onClick={() => file.current?.click()}>
            Import save file
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await importWorld(await f.text())
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err))
              }
            }}
          />
          <button
            className="btn btn-sm btn-bad"
            onClick={() => {
              if (window.confirm('Reset the whole world? Projects, memories, progress and settings are deleted. API keys stay.')) void resetWorld()
            }}
          >
            Reset world
          </button>
          <button
            className="btn btn-sm btn-bad"
            onClick={() => {
              if (!window.confirm('Remove all API keys stored in this browser?')) return
              for (const p of getWorld().settings.providers) saveKey(p.id, '')
              window.location.reload()
            }}
          >
            Forget API keys
          </button>
        </div>
        <div className="section-title">What's real, what's simulated</div>
        <div className="card soft small" style={{ fontWeight: 700, lineHeight: 1.55 }}>
          <b>Real:</b> planning into a dependency graph, parallel scheduling with per-agent queues, hand-offs of actual outputs between agents, tool calls (web search/fetch through the local proxy, sandboxed JavaScript), approval gates, QA reviews that run the code's tests in an isolated worker and send failures back for rework, shared memory with retrieval and conflict detection, persistence across sessions, replay, token and cost accounting, every event in the log.
          <br />
          <b>Simulated in Demo mode:</b> only the text a model would write. It’s scripted per goal type and badged “Simulated”.
          <br />
          <b>Cosmetic:</b> random events like golden hour, supply drops and the cloud cat; XP, sparks and decorations. Momentum and synergy affect rewards and hand-off speed, never model quality.
          <br />
          <b>Not built yet:</b> multi-user workspaces, server-side durable execution (work pauses if you close the tab), native provider tool-calling (tools use a portable text protocol), vector-embedding memory, file uploads.
        </div>
        <p className="tiny muted" style={{ fontWeight: 700 }}>
          {allModels.length} models configured · local proxy {proxy ? 'online' : proxy === false ? 'offline' : 'checking…'}
        </p>
      </div>
    </>
  )
}

export function Projects({ onClose }: { onClose: () => void }) {
  const projects = useWorld(useShallow((s) => s.projectOrder.map((id) => s.projects[id]).filter(Boolean)))
  return (
    <>
      <PanelHead title="Projects" icon={<FolderKanban size={19} />} onClose={onClose} />
      <div className="drawer-body scroll">
        {projects.length === 0 ? (
          <Empty title="No projects yet">Your project history lives here.</Empty>
        ) : (
          <div className="col">
            {projects.map((p) => (
              <div key={p.id} className="card">
                <div className="row">
                  <strong className="grow" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    {p.title}
                  </strong>
                  <span className={`chip tone ${p.status === 'done' ? 'tone-good' : p.status === 'cancelled' || p.status === 'failed' ? 'tone-bad' : 'tone-busy'}`}>{p.status}</span>
                  <span className={`mode-chip mode-${p.mode}`} style={{ cursor: 'default' }}>
                    {p.mode}
                  </span>
                </div>
                <div className="small muted" style={{ fontWeight: 700, margin: '4px 0 8px' }}>
                  {p.goal}
                </div>
                <div className="row tiny" style={{ fontWeight: 800, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                  <span>{timeAgo(p.createdAt)}</span>·<span>{p.taskIds.length} tasks</span>·<span>{duration((p.finishedAt ?? Date.now()) - p.createdAt)}</span>·<span>{money(p.costUsd)}</span>
                  <span className="grow" />
                  {p.deliverableId && (
                    <button className="btn btn-sm" onClick={() => mutate((s) => void (s.ui.selection = { kind: 'artifact', id: p.deliverableId! }))}>
                      Deliverable
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => mutate((s) => void (s.ui.panel = 'replay'))}>
                    Replay
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
