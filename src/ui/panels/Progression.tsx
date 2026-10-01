import { nanoid } from 'nanoid'
import { Brush, Gift, Lightbulb, Palette, Sparkles, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { playMusic } from '../../audio/music'
import { sfx } from '../../audio/sfx'
import { CREW } from '../../engine/crew'
import { engine } from '../../engine/engine'
import { ACHIEVEMENTS, DECOR_SLOTS, RANKS, UNLOCKABLES, levelForXp, pairKey, rankFor, synergyLevel, xpForLevel } from '../../engine/game/defs'
import { bump, pushToast, unlockAchievement } from '../../engine/game/progression'
import { ROLE_IDS } from '../../engine/types'
import { mutate, useWorld } from '../../state/store'
import { ISLANDS, type IslandId } from '../../world/layout'
import { Bar, Empty, PanelHead, Portrait, timeAgo } from '../common'
import { UnlockIcon } from '../unlockIcons'

export function Achievements({ onClose }: { onClose: () => void }) {
  const g = useWorld(useShallow((s) => ({ xp: s.game.xp, ach: s.game.achievements, synergy: s.game.synergy })))
  const agents = useWorld((s) => s.agents)
  const level = levelForXp(g.xp)
  const next = UNLOCKABLES.filter((u) => u.level > level).slice(0, 4)
  const got = Object.keys(g.ach).length
  return (
    <>
      <PanelHead title="Trophies & progression" icon={<Trophy size={19} />} onClose={onClose}>
        <span className="chip">
          {got}/{ACHIEVEMENTS.length} achievements
        </span>
      </PanelHead>
      <div className="drawer-body scroll">
        <div className="card row" style={{ gap: 14 }}>
          <div className="level-badge" style={{ width: 56, height: 56, fontSize: 24, borderRadius: 16 }}>
            {level}
          </div>
          <div className="grow">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17 }}>Workspace level {level}</strong>
              <span className="small num muted" style={{ fontWeight: 800 }}>
                {g.xp - xpForLevel(level)} / {xpForLevel(level + 1) - xpForLevel(level)} XP
              </span>
            </div>
            <Bar value={(g.xp - xpForLevel(level)) / (xpForLevel(level + 1) - xpForLevel(level))} color="var(--gold)" />
            <div className="row tiny" style={{ marginTop: 8, flexWrap: 'wrap', fontWeight: 800, color: 'var(--ink-3)' }}>
              Next unlocks:
              {next.map((u) => (
                <span key={u.id} className="chip">
                  <UnlockIcon id={u.id} size={12} /> {u.name} · Lv {u.level}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="section-title">Achievements</div>
        <div className="grid-auto" style={{ ['--min' as string]: '150px' }}>
          {ACHIEVEMENTS.map((a) => {
            const at = g.ach[a.id]
            return (
              <div key={a.id} className={`badge-tile${at ? '' : ' locked'}`} title={a.desc}>
                <img src={`/assets/badges/${a.id}.webp`} alt="" onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))} />
                <span className="badge-name">{a.title}</span>
                <span className="tiny muted" style={{ fontWeight: 700 }}>
                  {a.desc}
                </span>
                <span className="tiny" style={{ fontWeight: 800, color: at ? 'var(--tone-good)' : 'var(--ink-3)' }}>
                  {at ? `Earned ${timeAgo(at)}` : `+${a.xp} XP · +${a.sparks} ✦`}
                </span>
              </div>
            )
          })}
        </div>
        <div className="section-title">Crew ranks</div>
        <div className="grid-auto" style={{ ['--min' as string]: '220px' }}>
          {ROLE_IDS.map((r) => {
            const a = agents[r]
            const rank = rankFor(a.xp)
            return (
              <div key={r} className="card row">
                <Portrait role={r} />
                <div className="grow">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{CREW[r].name}</strong>
                    <span className="stars">{'★'.repeat(rank.index + 1)}</span>
                  </div>
                  <div className="tiny muted" style={{ fontWeight: 800 }}>
                    {rank.name} {CREW[r].specialty} · {a.xp} XP
                  </div>
                  <Bar value={rank.next ? (a.xp - RANKS[rank.index].xp) / (rank.next - RANKS[rank.index].xp) : 1} color={CREW[r].color} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="section-title">Synergy matrix (hand-offs build affinity; higher levels hand off faster)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
            <thead>
              <tr>
                <th />
                {ROLE_IDS.map((r) => (
                  <th key={r}>
                    <Portrait role={r} size="sm" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLE_IDS.map((a) => (
                <tr key={a}>
                  <td>
                    <Portrait role={a} size="sm" />
                  </td>
                  {ROLE_IDS.map((b) => {
                    const pts = a === b ? 0 : (g.synergy[pairKey(a, b)] ?? 0)
                    const lvl = synergyLevel(pts)
                    return (
                      <td key={b} title={a === b ? '' : `${CREW[a].name} × ${CREW[b].name}: ${pts} hand-offs, level ${lvl}`}>
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: a === b ? 'transparent' : `color-mix(in oklab, var(--tone-wait) ${Math.min(90, pts * 7)}%, var(--panel-2))`,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 11,
                            fontWeight: 800,
                            color: lvl >= 2 ? '#fff' : 'var(--ink-3)',
                          }}
                        >
                          {a === b ? '' : lvl ? '♥'.repeat(lvl) : pts || ''}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function Discoveries({ onClose }: { onClose: () => void }) {
  const cards = useWorld((s) => s.game.discoveries)
  return (
    <>
      <PanelHead title="Discoveries" icon={<Sparkles size={19} />} onClose={onClose}>
        <span className="chip">
          {cards.filter((c) => c.collected).length}/{cards.length} collected
        </span>
      </PanelHead>
      <div className="drawer-body scroll">
        <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginTop: 0 }}>
          When a crew member flags a surprising or reusable insight (a “DISCOVERY:” line in their work), it becomes a card here. Flip it for sparks, and a quick read while the crew works.
        </p>
        {cards.length === 0 ? (
          <Empty title="No discoveries yet">Sage usually finds the first one during research.</Empty>
        ) : (
          <div className="grid-auto" style={{ ['--min' as string]: '240px' }}>
            {cards.map((c) => (
              <div
                key={c.id}
                className={`disc-card ${c.rarity}${c.collected ? '' : ' uncollected'}`}
                onClick={() => {
                  if (c.collected) return
                  sfx('coin')
                  mutate((s) => {
                    const d = s.game.discoveries.find((x) => x.id === c.id)
                    if (d) d.collected = true
                    s.game.sparks += c.rarity === 'epic' ? 25 : c.rarity === 'rare' ? 12 : 6
                  })
                }}
              >
                <div className="row">
                  <Portrait role={c.agentId} size="sm" />
                  <span className="tiny" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: c.rarity === 'epic' ? '#9b5de5' : c.rarity === 'rare' ? '#3b7ff5' : 'var(--ink-3)' }}>
                    {c.rarity}
                  </span>
                </div>
                <div className="small" style={{ fontWeight: 800, lineHeight: 1.45 }}>
                  {c.text}
                </div>
                <div className="tiny muted" style={{ fontWeight: 800, marginTop: 'auto' }}>
                  {CREW[c.agentId].name} · {c.projectTitle}
                </div>
                {!c.collected && (
                  <div className="disc-cover">
                    <span>
                      <Gift size={16} style={{ verticalAlign: -3 }} /> Tap to reveal (+{c.rarity === 'epic' ? 25 : c.rarity === 'rare' ? 12 : 6} ✦)
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const STICKY = ['#fff3a3', '#ffd6e7', '#d6f0ff', '#dff7d0', '#eadcff']

export function IdeaWall({ onClose }: { onClose: () => void }) {
  const ideas = useWorld((s) => s.game.ideas)
  const [text, setText] = useState('')
  return (
    <>
      <PanelHead title="Idea wall" icon={<Lightbulb size={19} />} onClose={onClose} />
      <div className="drawer-body scroll">
        <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)', marginTop: 0 }}>
          Park thoughts while the crew works. Turn a note into the next goal, or teach it to the crew as a pinned memory.
        </p>
        <form
          className="row"
          style={{ marginBottom: 14 }}
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            mutate((s) => {
              s.game.ideas.unshift({ id: nanoid(8), text: text.trim(), color: STICKY[s.game.ideas.length % STICKY.length], at: Date.now() })
              if (bump(s, 'ideas') >= 5) unlockAchievement(s, 'idea_machine')
            })
            sfx('pop')
            setText('')
          }}
        >
          <input className="input grow" placeholder="Jot an idea…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
            Pin it
          </button>
        </form>
        {ideas.length === 0 ? (
          <Empty title="The wall is empty">Your sticky notes live here across sessions.</Empty>
        ) : (
          <div className="grid-auto" style={{ ['--min' as string]: '200px' }}>
            {ideas.map((n, i) => (
              <div key={n.id} className="sticky" style={{ background: n.color, ['--tilt' as string]: `${((i * 37) % 7) - 3}deg` }}>
                <div className="grow">{n.text}</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      mutate((s) => {
                        s.ui.goalDraft = n.text
                        s.ui.goalOpen = true
                        s.ui.panel = null
                        const idea = s.game.ideas.find((x) => x.id === n.id)
                        if (idea) idea.sentTo = 'goal'
                      })
                    }
                  >
                    Use as goal
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={n.sentTo === 'memory'}
                    onClick={() =>
                      mutate((s) => {
                        const id = nanoid(10)
                        s.memories[id] = { id, text: n.text, kind: 'preference', tags: [], source: { agent: 'user' }, createdAt: Date.now(), sessionId: s.sessionId, uses: 0, pinned: true, provenance: 'user' }
                        const idea = s.game.ideas.find((x) => x.id === n.id)
                        if (idea) idea.sentTo = 'memory'
                        pushToast(s, { kind: 'success', title: 'Taught to the crew', body: 'Saved as a pinned memory, so every prompt includes it.' })
                      })
                    }
                  >
                    {n.sentTo === 'memory' ? 'In memory' : 'Teach crew'}
                  </button>
                  <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Delete note" onClick={() => mutate((s) => void (s.game.ideas = s.game.ideas.filter((x) => x.id !== n.id)))}>
                    <Trash2 size={13} />
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

function islandName(id: string) {
  return id === 'planner' ? 'Command Plaza' : ISLANDS[id as IslandId]?.name ?? id
}

export function Decorate({ onClose }: { onClose: () => void }) {
  const g = useWorld(useShallow((s) => ({ decor: s.game.decor, unlocked: s.game.unlocked, sparks: s.game.sparks, crates: s.game.crates, xp: s.game.xp })))
  const slot = useWorld((s) => s.ui.decorSlot)
  const [reveal, setReveal] = useState<string | null>(null)
  const level = levelForXp(g.xp)
  const decor = UNLOCKABLES.filter((u) => u.kind === 'decor')
  const place = (id: string | null) => {
    if (!slot) return
    mutate((s) => {
      if (id) s.game.decor[slot] = id
      else delete s.game.decor[slot]
      const placed = Object.keys(s.game.decor).length
      if (bump(s, 'decorPlaced') && placed >= 5) unlockAchievement(s, 'decorator')
    })
    sfx('pop')
  }
  return (
    <>
      <PanelHead title="Decorate the islands" icon={<Brush size={19} />} onClose={onClose}>
        <span className="chip">✦ {Math.floor(g.sparks)}</span>
      </PanelHead>
      <div className="drawer-body scroll">
        <div className="card row" style={{ marginBottom: 10 }}>
          <Gift size={22} />
          <div className="grow small" style={{ fontWeight: 800 }}>
            {g.crates} supply crate{g.crates === 1 ? '' : 's'}. You earn them from level-ups, deliveries and supply drops.
            {reveal && <div style={{ color: 'var(--tone-good)' }}>{reveal}</div>}
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={g.crates <= 0}
            onClick={() => {
              const r = engine.openCrate()
              if (!r) return
              setReveal(r.kind === 'decor' ? `You found: ${UNLOCKABLES.find((u) => u.id === r.id)?.name}!` : `You found ${r.amount} ✦ sparks!`)
            }}
          >
            Open crate
          </button>
        </div>
        <p className="small" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>
          Glowing rings mark decoration spots on the islands. Click one in the world (or pick below), then choose what goes there.
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          {DECOR_SLOTS.map((s) => (
            <button key={s.id} className={`chip chip-btn${slot === s.id ? ' tone tone-info' : ''}`} onClick={() => mutate((d) => void (d.ui.decorSlot = s.id))}>
              {islandName(s.island)}
              {g.decor[s.id] ? <UnlockIcon id={g.decor[s.id]} size={12} /> : <span className="muted">· empty</span>}
            </button>
          ))}
        </div>
        {!slot ? (
          <Empty title="Pick a spot">Choose a decoration spot to place something.</Empty>
        ) : (
          <>
            <div className="section-title">Place at {islandName(DECOR_SLOTS.find((s) => s.id === slot)!.island)}</div>
            <div className="grid-auto" style={{ ['--min' as string]: '130px' }}>
              <button className={`shop-item${!g.decor[slot] ? ' is-on' : ''}`} onClick={() => place(null)}>
                <span className="shop-icon">∅</span>
                <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>Empty</strong>
              </button>
              {decor.map((u) => {
                const owned = g.unlocked.includes(u.id)
                const levelOk = level >= u.level
                const canBuy = !owned && levelOk && g.sparks >= (u.price ?? 0)
                return (
                  <button
                    key={u.id}
                    className={`shop-item${g.decor[slot] === u.id ? ' is-on' : ''}${!owned && !levelOk ? ' locked' : ''}`}
                    onClick={() => {
                      if (owned) return place(u.id)
                      if (!canBuy) return
                      mutate((s) => {
                        s.game.sparks -= u.price ?? 0
                        s.game.unlocked.push(u.id)
                      })
                      sfx('coin')
                      place(u.id)
                    }}
                  >
                    <span className="shop-icon">
                      <UnlockIcon id={u.id} size={22} />
                    </span>
                    <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>{u.name}</strong>
                    <span className="tiny muted" style={{ fontWeight: 800 }}>
                      {owned ? 'Owned' : !levelOk ? `Unlocks at Lv ${u.level}` : `Buy · ${u.price} ✦`}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

export function Customize({ onClose }: { onClose: () => void }) {
  const g = useWorld(useShallow((s) => ({ unlocked: s.game.unlocked, theme: s.game.theme, skin: s.game.skin, music: s.game.music, avatar: s.game.avatar, xp: s.game.xp })))
  const settings = useWorld(useShallow((s) => ({ volume: s.settings.volume, quality: s.settings.quality, labels: s.settings.showLabels })))
  const level = levelForXp(g.xp)
  const group = (kind: 'theme' | 'skin' | 'music') => UNLOCKABLES.filter((u) => u.kind === kind)
  const choose = (kind: 'theme' | 'skin' | 'music', id: string) => {
    sfx('click')
    mutate((s) => {
      s.game[kind] = id
    })
    if (kind === 'music') playMusic(id)
  }
  const Tile = ({ kind, id }: { kind: 'theme' | 'skin' | 'music'; id: string }) => {
    const u = UNLOCKABLES.find((x) => x.id === id)!
    const owned = g.unlocked.includes(id)
    return (
      <button className={`shop-item${g[kind] === id ? ' is-on' : ''}${owned ? '' : ' locked'}`} disabled={!owned} onClick={() => choose(kind, id)}>
        <span className="shop-icon">
                      <UnlockIcon id={u.id} size={22} />
                    </span>
        <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13 }}>{u.name}</strong>
        <span className="tiny muted" style={{ fontWeight: 800 }}>
          {owned ? u.desc : `Level ${u.level}`}
        </span>
      </button>
    )
  }
  return (
    <>
      <PanelHead title="Style & atmosphere" icon={<Palette size={19} />} onClose={onClose}>
        <span className="chip">Level {level}</span>
      </PanelHead>
      <div className="drawer-body scroll">
        <div className="section-title" style={{ marginTop: 0 }}>
          Sky theme
        </div>
        <div className="grid-auto" style={{ ['--min' as string]: '130px' }}>
          {group('theme').map((u) => (
            <Tile key={u.id} kind="theme" id={u.id} />
          ))}
        </div>
        <div className="section-title">UI skin</div>
        <div className="grid-auto" style={{ ['--min' as string]: '130px' }}>
          {group('skin').map((u) => (
            <Tile key={u.id} kind="skin" id={u.id} />
          ))}
        </div>
        <div className="section-title">Music (generative, synthesized live)</div>
        <div className="grid-auto" style={{ ['--min' as string]: '130px' }}>
          {group('music').map((u) => (
            <Tile key={u.id} kind="music" id={u.id} />
          ))}
        </div>
        <div className="section-title">Crew look</div>
        <div className="tabs" style={{ maxWidth: 360 }}>
          <button className={`tab${g.avatar === 'figurine' ? ' is-on' : ''}`} onClick={() => mutate((s) => void (s.game.avatar = 'figurine'))}>
            Vinyl figurines
          </button>
          <button className={`tab${g.avatar === 'bean' ? ' is-on' : ''}`} onClick={() => mutate((s) => void (s.game.avatar = 'bean'))}>
            Classic beans
          </button>
        </div>
        <div className="section-title">Sound</div>
        {(['master', 'music', 'sfx'] as const).map((k) => (
          <label key={k} className="row small" style={{ fontWeight: 800, marginBottom: 6 }}>
            <span style={{ width: 60, textTransform: 'capitalize' }}>{k}</span>
            <input
              className="range grow"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume[k]}
              onChange={(e) => mutate((s) => void (s.settings.volume[k] = Number(e.target.value)))}
            />
            <span className="num muted" style={{ width: 36 }}>
              {Math.round(settings.volume[k] * 100)}
            </span>
          </label>
        ))}
        <div className="section-title">Display</div>
        <div className="col">
          <label className="toggle">
            <input type="checkbox" checked={settings.labels} onChange={(e) => mutate((s) => void (s.settings.showLabels = e.target.checked))} />
            Name tags & island labels
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.quality === 'high'} onChange={(e) => mutate((s) => void (s.settings.quality = e.target.checked ? 'high' : 'low'))} />
            High quality (shadows, ambient occlusion, bloom)
          </label>
        </div>
      </div>
    </>
  )
}
