import { useEffect, useLayoutEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { mutate, useWorld } from '../state/store'
import { Portrait } from './common'

const STEPS: { target: string; title: string; body: string; place: 'right' | 'left' | 'below' | 'above' }[] = [
  {
    target: 'crew',
    title: 'Meet the crew',
    body: "Eight specialists, one island each. Click anyone to see what they're doing, which model they run on, ask them a question or redirect them.",
    place: 'right',
  },
  {
    target: 'goal',
    title: 'Give us a goal',
    body: "Tell me what you want built, researched or written. I'll break it into tasks and the crew works in parallel wherever they can.",
    place: 'above',
  },
  {
    target: 'desk',
    title: "You're the captain",
    body: 'Anything that leaves the islands waits for your OK here and at the Sky Dock: web requests, and shipping the final deliverable. Crew questions land here too.',
    place: 'left',
  },
  {
    target: 'mode',
    title: 'Demo or live',
    body: 'Without an API key the words are scripted stand-ins, clearly labeled. The planning, hand-offs, tests, reviews and memory are always real. Add a key in Settings to go live.',
    place: 'below',
  },
]

const KEY = 'cloudworks.tour.v1'

export function Tour() {
  const started = useWorld((s) => s.ui.started)
  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!started) return
    let seen = false
    try {
      seen = localStorage.getItem(KEY) === 'done'
    } catch {
      /* storage blocked: show the tour once per session */
    }
    if (!seen) {
      const t = window.setTimeout(() => setStep(0), 900)
      return () => window.clearTimeout(t)
    }
  }, [started])
  useLayoutEffect(() => {
    if (step === null) return
    const el = document.querySelector(`[data-tour="${STEPS[step].target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step])
  if (step === null || !rect) return null
  const s = STEPS[step]
  const finish = () => {
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      /* ignore */
    }
    setStep(null)
  }
  const vw = window.innerWidth
  const W = Math.min(320, vw - 24)
  let left = rect.right + 14
  let top = rect.top + 20
  if (vw < 700) {
    // Small screens: centered card above or below the target, whichever side has room.
    left = (vw - W) / 2
    top = rect.top > window.innerHeight / 2 ? rect.top - 200 : rect.bottom + 12
  } else if (s.place === 'left') left = rect.left - W - 14
  else if (s.place === 'below') {
    left = rect.left - W / 2
    top = rect.bottom + 12
  } else if (s.place === 'above') {
    left = rect.left + rect.width / 2 - W / 2
    top = rect.top - 190
  }
  left = Math.min(Math.max(12, left), vw - W - 12)
  top = Math.min(top, window.innerHeight - 220)
  return (
    <div className="tour-layer" aria-live="polite">
      <div className="tour-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
      <div className="tour-card panel" style={{ left, top: Math.max(12, top), width: W }}>
        <div className="row">
          <Portrait role="planner" size="sm" />
          <strong style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>{s.title}</strong>
        </div>
        <p className="small" style={{ fontWeight: 700, lineHeight: 1.5, color: 'var(--ink-2)', margin: '8px 0 10px' }}>
          {s.body}
        </p>
        <div className="row">
          <span className="tiny muted grow" style={{ fontWeight: 800 }}>
            {step + 1} / {STEPS.length}
          </span>
          <button className="btn btn-sm" onClick={finish}>
            Skip
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              sfx('pop')
              if (step + 1 < STEPS.length) setStep(step + 1)
              else {
                finish()
                mutate((d) => void (d.ui.goalOpen = true))
              }
            }}
          >
            {step + 1 < STEPS.length ? 'Next' : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  )
}
