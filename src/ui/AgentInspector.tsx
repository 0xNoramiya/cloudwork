import { Ban, Hammer, Medal, MessageCircle, Navigation, Pause, Send, Settings2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { sfx } from '../audio/sfx'
import { CREW, TRAITS } from '../engine/crew'
import { engine } from '../engine/engine'
import { RANKS, pairKey, rankFor, synergyLevel } from '../engine/game/defs'
import { priceFor } from '../engine/providers/models'
import { providerReady } from '../engine/providers'
import { ROLE_IDS, type Effort, type RoleId, type TraitId } from '../engine/types'
import { mutate, useWorld } from '../state/store'
import { ACTIVITY_LABEL, TASK_STATUS_LABEL, taskTone } from './icons'
import { Bar, Empty, Portrait, ProvBadge, compact, money, timeAgo } from './common'

type Tab = 'overview' | 'work' | 'chat' | 'loadout'

export function CloseButton() {
  return (
    <button
      className="icon-btn"
      aria-label="Close inspector"
      style={{ alignSelf: 'flex-start' }}
      onClick={() => {
        sfx('close')
        mutate((s) => void (s.ui.selection = { kind: null, id: null }))
      }}
    >
      <X size={17} />
    </button>
  )
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

function Overview({ role }: { role: RoleId }) {
  const a = useWorld((s) => s.agents[role])
  const task = useWorld((s) => (s.agents[role].taskId ? s.tasks[s.agents[role].taskId!] : undefined))
  const deps = useWorld(useShallow((s) => (task ? task.dependsOn.map((id) => s.tasks[id]).filter(Boolean) : [])))
  const queued = useWorld(
    useShallow((s) => {
      const p = s.activeProjectId ? s.projects[s.activeProjectId] : null
      return p ? p.taskIds.map((id) => s.tasks[id]).filter((t) => t && t.role === role && ['ready', 'pending', 'handoff', 'blocked', 'paused'].includes(t.status)) : []
    }),
  )
  const others = ROLE_IDS.filter((r) => r !== role)
  const synergyPts = useWorld(useShallow((s) => others.map((r) => s.game.synergy[pairKey(r, role)] ?? 0)))
  const synergy = others.map((r, i) => ({ r, pts: synergyPts[i], lvl: synergyLevel(synergyPts[i]) }))
  const model = useWorld((s) => s.agents[role].loadout.model ?? s.settings.defaultModel)
  const now = useNow()
  const [redirect, setRedirect] = useState('')
  const rank = rankFor(a.xp)
  let eta = ''
  if (task?.status === 'running' && task.startedAt) {
    const el = (now - task.startedAt) / 1000
    const left = task.progress > 0.12 ? (el / task.progress) * (1 - task.progress) : Math.max(5, task.estimateSec - el)
    eta = `~${Math.max(1, Math.round(left))}s left (estimate)`
  }
  const inputs = deps.map((d) => ({ d, from: d.kind === 'review' ? 'qa' : d.role }))
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="chip" title={`${model.providerId}/${model.model}`}>
          {model.providerId === 'demo' ? 'Demo model (simulated)' : `${model.providerId} · ${model.model}`}
        </span>
        <span className="chip">{TRAITS[a.loadout.trait].label}</span>
      </div>
      <div className="section-title">Current task</div>
      {task ? (
        <div className="card">
          <button className="row" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left' }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'task', id: task.id }))}>
            <strong className="grow" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {task.title}
            </strong>
            <span className={`chip tone tone-${taskTone(task.status)}`}>{TASK_STATUS_LABEL[task.status]}</span>
          </button>
          <p className="small" style={{ margin: '6px 0', fontWeight: 600, color: 'var(--ink-2)' }}>
            {task.description}
          </p>
          <Bar value={task.progress} color={CREW[role].color} />
          <div className="row tiny muted" style={{ marginTop: 5, fontWeight: 800, justifyContent: 'space-between' }}>
            <span>
              {(task.reworks ?? 0) > 0 ? `Rework ${task.reworks} · ` : ''}
              {task.feedback.length ? `${task.feedback.length} feedback note(s)` : `Run ${task.attempts}`}
            </span>
            <span>{eta}</span>
          </div>
          {inputs.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              <span className="tiny muted" style={{ fontWeight: 800 }}>
                Inputs from
              </span>
              {inputs.map(({ d, from }) => (
                <button key={d.id} className="chip chip-btn" onClick={() => mutate((s) => void (s.ui.selection = { kind: 'task', id: d.id }))}>
                  {CREW[from].name}: {d.title}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => engine.pauseTask(task.id)}>
              <Pause size={13} /> Pause task
            </button>
            <button className="btn btn-sm btn-bad" onClick={() => engine.cancelTask(task.id)}>
              <Ban size={13} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="quiet-note">
          {a.directive ? `No active task. Holding your instruction: “${a.directive}”.` : `${CREW[role].name} is free.${queued.length ? ` ${queued.length} queued next.` : ''}`}
        </p>
      )}
      <div className="section-title">Redirect {CREW[role].name}</div>
      <form
        className="col"
        onSubmit={(e) => {
          e.preventDefault()
          engine.redirect(role, redirect)
          setRedirect('')
          sfx('pop')
        }}
      >
        <textarea
          className="textarea"
          style={{ minHeight: 56, fontSize: 14 }}
          placeholder={task ? `e.g. “Focus on budget options”. Restarts the current task with this direction.` : 'Standing instruction applied to their next task'}
          value={redirect}
          onChange={(e) => setRedirect(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit()
          }}
        />
        <button className="btn btn-sm btn-primary" type="submit" disabled={!redirect.trim()} style={{ alignSelf: 'flex-start' }}>
          <Navigation size={13} /> {task ? 'Redirect now' : 'Save instruction'}
        </button>
      </form>
      {queued.length > 0 && (
        <>
          <div className="section-title">Queue</div>
          <div className="col" style={{ gap: 5 }}>
            {queued.map((t) => (
              <button key={t.id} className="card clickable row" style={{ padding: '7px 10px', textAlign: 'left' }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'task', id: t.id }))}>
                <span className="grow small truncate" style={{ fontWeight: 800 }}>
                  {t.title}
                </span>
                <span className={`chip tone tone-${taskTone(t.status)}`}>{TASK_STATUS_LABEL[t.status]}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="section-title">Rank & specialty</div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {rank.name} {CREW[role].specialty}
          </strong>
          <span className="tiny muted num" style={{ fontWeight: 800 }}>
            {a.xp} XP{rank.next ? ` / ${rank.next}` : ''}
          </span>
        </div>
        <Bar value={rank.next ? (a.xp - RANKS[rank.index].xp) / (rank.next - RANKS[rank.index].xp) : 1} color="var(--gold)" />
        {a.badges.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {a.badges.map((b) => (
              <span key={b} className="chip">
                <Medal size={12} aria-hidden /> {b}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="section-title">Stats</div>
      <dl className="kv">
        <dt>Tasks done</dt>
        <dd className="num">{a.stats.tasksDone}</dd>
        <dt>Failures / reworks</dt>
        <dd className="num">
          {a.stats.tasksFailed} / {a.stats.reworks}
        </dd>
        <dt>Hand-offs given</dt>
        <dd className="num">{a.stats.handoffs}</dd>
        <dt>Tokens in → out</dt>
        <dd className="num">
          {compact(a.stats.tokensIn)} → {compact(a.stats.tokensOut)}
        </dd>
        <dt>Spend</dt>
        <dd className="num">{money(a.stats.costUsd)}</dd>
        <dt>Time working</dt>
        <dd className="num">{Math.round(a.stats.workMs / 1000)}s</dd>
      </dl>
      <div className="section-title">Synergy</div>
      <div className="col" style={{ gap: 4 }}>
        {synergy
          .filter((x) => x.pts > 0)
          .sort((x, y) => y.pts - x.pts)
          .map((x) => (
            <div key={x.r} className="row small" style={{ fontWeight: 800 }}>
              <Portrait role={x.r} size="sm" />
              <span className="grow">{CREW[x.r].name}</span>
              <span style={{ color: 'var(--tone-wait)' }}>{'♥'.repeat(x.lvl) || '·'}</span>
              <span className="tiny muted num">{x.pts} hand-offs</span>
            </div>
          ))}
        {synergy.every((x) => x.pts === 0) && <span className="small muted" style={{ fontWeight: 700 }}>Builds as crew members hand work to each other. Higher synergy = faster hand-offs.</span>}
      </div>
      <div className="section-title">Recent actions</div>
      <div className="col" style={{ gap: 3 }}>
        {a.recent.length === 0 && <span className="small muted">Nothing yet.</span>}
        {a.recent.slice(0, 8).map((r, i) => (
          <div key={i} className="row small" style={{ fontWeight: 700 }}>
            <span className="grow">{r.text}</span>
            <span className="tiny muted">{timeAgo(r.at, now)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Work({ role }: { role: RoleId }) {
  const task = useWorld((s) => (s.agents[role].taskId ? s.tasks[s.agents[role].taskId!] : undefined))
  const arts = useWorld(useShallow((s) => Object.values(s.artifacts).filter((x) => x.agentId === role).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12)))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [task?.streamText])
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="section-title" style={{ marginTop: 4 }}>
        Live output {task && <span className="chip">{task.title}</span>}
      </div>
      {task?.streamText ? (
        <div className="stream" ref={ref}>
          {task.streamText}
          {task.status === 'running' && <span className="cursor" />}
        </div>
      ) : (
        <div className="card soft small" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
          {task ? 'Waiting for the first tokens…' : 'Not working on anything right now.'}
        </div>
      )}
      {task && task.toolCalls.length > 0 && (
        <>
          <div className="section-title">Tool calls</div>
          <div className="col" style={{ gap: 5 }}>
            {task.toolCalls.map((tc) => (
              <details key={tc.id} className="card" style={{ padding: '8px 10px' }}>
                <summary className="row small" style={{ fontWeight: 800, cursor: 'pointer' }}>
                  <span className="mono">{tc.tool}</span>
                  <span className="grow truncate muted">{String(Object.values(tc.input)[0] ?? '')}</span>
                  <span className={`chip tone tone-${tc.status === 'ok' ? 'good' : tc.status === 'running' ? 'busy' : tc.status === 'pending_approval' ? 'wait' : 'bad'}`}>{tc.status}</span>
                </summary>
                {tc.output && (
                  <pre className="stream" style={{ marginTop: 8, maxHeight: 180 }}>
                    {tc.output}
                  </pre>
                )}
              </details>
            ))}
          </div>
        </>
      )}
      <div className="section-title">Outputs</div>
      {arts.length === 0 ? (
        <span className="small muted">No artifacts yet.</span>
      ) : (
        <div className="col" style={{ gap: 5 }}>
          {arts.map((x) => (
            <button key={x.id} className="card clickable" style={{ padding: '8px 10px', textAlign: 'left' }} onClick={() => mutate((s) => void (s.ui.selection = { kind: 'artifact', id: x.id }))}>
              <div className="row">
                <strong className="grow truncate small" style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {x.title}
                </strong>
                <ProvBadge p={x.provenance} />
              </div>
              <div className="tiny muted truncate" style={{ fontWeight: 700, marginTop: 3 }}>
                {x.summary}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Chat({ role }: { role: RoleId }) {
  const chat = useWorld((s) => s.agents[role].chat)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [chat.length, chat[chat.length - 1]?.text])
  const c = CREW[role]
  const prompts = ['What are you working on?', 'Why did you choose that approach?', 'How long until you finish?', 'What did you learn so far?']
  return (
    <div className="col" style={{ height: '100%', minHeight: 300 }}>
      <div ref={ref} className="chat scroll grow" style={{ minHeight: 200, maxHeight: 'calc(100vh - 470px)', paddingTop: 4 }}>
        {chat.length === 0 && (
          <Empty title={`Ask ${c.name} anything`}>Follow-ups use {c.name}'s model with their current task, output and relevant memory as context.</Empty>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg from-${m.from}`}>
            {m.pending ? (
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            ) : (
              m.text
            )}
            {m.from === 'agent' && !m.pending && (
              <div style={{ marginTop: 5 }}>
                <ProvBadge p={m.provenance} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
        {prompts.map((p) => (
          <button key={p} className="chip chip-btn" onClick={() => void engine.askAgent(role, p)}>
            {p}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void engine.askAgent(role, q)
          setQ('')
          sfx('pop')
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask ${c.name} a follow-up…`} style={{ fontSize: 14 }} />
        <button className="btn btn-primary" type="submit" disabled={!q.trim()} aria-label="Send">
          <Send size={14} />
        </button>
      </form>
    </div>
  )
}

function Loadout({ role }: { role: RoleId }) {
  const loadout = useWorld((s) => s.agents[role].loadout)
  const providers = useWorld((s) => s.settings.providers)
  const def = useWorld((s) => s.settings.defaultModel)
  const cur = loadout.model
  const value = cur ? `${cur.providerId}::${cur.model}` : ''
  const effective = cur ?? def
  const price = priceFor(effective.model)
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="section-title" style={{ marginTop: 4 }}>
        Model (BYOK)
      </div>
      <select
        className="select"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (!v) engine.setLoadout(role, { model: null })
          else {
            const [providerId, ...rest] = v.split('::')
            engine.setLoadout(role, { model: { providerId, model: rest.join('::') } })
          }
          sfx('click')
        }}
      >
        <option value="">Workspace default ({def.providerId === 'demo' ? 'Demo' : `${def.providerId}/${def.model}`})</option>
        {providers
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
      <div className="small muted" style={{ fontWeight: 700 }}>
        {effective.providerId === 'demo'
          ? 'Scripted stand-in. Free, instant-ish, clearly labeled as simulated.'
          : price
            ? `$${price.in}/M in · $${price.out}/M out${price.est ? ' (estimated price)' : ''}`
            : 'Price unknown for this model, so spend shows as n/a.'}
      </div>
      <div className="section-title">Working style</div>
      <div className="grid-auto" style={{ ['--min' as string]: '150px' }}>
        {(Object.keys(TRAITS) as TraitId[]).map((t) => (
          <button key={t} className={`shop-item${loadout.trait === t ? ' is-on' : ''}`} style={{ alignItems: 'flex-start', textAlign: 'left' }} onClick={() => engine.setLoadout(role, { trait: t })}>
            <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{TRAITS[t].label}</strong>
            <span className="tiny muted" style={{ fontWeight: 700 }}>
              {TRAITS[t].blurb}
            </span>
          </button>
        ))}
      </div>
      <div className="small muted" style={{ fontWeight: 700 }}>
        Traits add a real instruction to {CREW[role].name}'s system prompt.
      </div>
      <div className="section-title">Effort</div>
      <div className="tabs">
        {(['low', 'medium', 'high'] as Effort[]).map((e) => (
          <button key={e} className={`tab${loadout.effort === e ? ' is-on' : ''}`} onClick={() => engine.setLoadout(role, { effort: e })}>
            {e}
          </button>
        ))}
      </div>
      <div className="small muted" style={{ fontWeight: 700 }}>
        Sent as <span className="mono">output_config.effort</span> on Claude models that support it; ignored elsewhere.
      </div>
    </div>
  )
}

export function AgentInspector({ role }: { role: RoleId }) {
  const [tab, setTab] = useState<Tab>('overview')
  const c = CREW[role]
  const activity = useWorld((s) => s.agents[role].activity)
  return (
    <>
      <div className="inspector-hero" style={{ ['--role' as string]: c.color }}>
        <Portrait role={role} size="lg" />
        <div className="grow">
          <div className="inspector-title">
            {c.title} · the {c.animal}
          </div>
          <div className="inspector-name">{c.name}</div>
          <div className="small muted" style={{ fontWeight: 700 }}>
            {c.island} · {ACTIVITY_LABEL[activity]}
          </div>
        </div>
        <CloseButton />
      </div>
      <div style={{ padding: '0 14px 10px' }}>
        <div className="tabs" role="tablist">
          {(
            [
              ['overview', 'Overview', User],
              ['work', 'Work', Hammer],
              ['chat', 'Ask', MessageCircle],
              ['loadout', 'Loadout', Settings2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="rightpanel-body scroll">
        {tab === 'overview' && <Overview role={role} />}
        {tab === 'work' && <Work role={role} />}
        {tab === 'chat' && <Chat role={role} />}
        {tab === 'loadout' && <Loadout role={role} />}
      </div>
    </>
  )
}
