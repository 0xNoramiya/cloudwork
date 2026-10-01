// Tiny synthesized sound kit (WebAudio). No audio files: everything is generated on the fly.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
const levels = { master: 0.7, sfx: 0.7, music: 0.35, muted: false }

export function buses() {
  return { ctx, master, sfxBus, musicBus }
}

export function initAudio() {
  if (ctx) {
    void ctx.resume()
    return
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  sfxBus = ctx.createGain()
  musicBus = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 3
  sfxBus.connect(master)
  musicBus.connect(master)
  master.connect(comp)
  comp.connect(ctx.destination)
  applyLevels()
}

function applyLevels() {
  if (!ctx || !master || !sfxBus || !musicBus) return
  const t = ctx.currentTime
  master.gain.setTargetAtTime(levels.muted ? 0 : levels.master, t, 0.05)
  sfxBus.gain.setTargetAtTime(levels.sfx, t, 0.05)
  musicBus.gain.setTargetAtTime(levels.music, t, 0.2)
}

export function setVolumes(v: { master: number; sfx: number; music: number }, muted: boolean) {
  levels.master = v.master
  levels.sfx = v.sfx
  levels.music = v.music
  levels.muted = muted
  applyLevels()
}

function tone(
  freq: number,
  start: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; slideTo?: number; attack?: number; bus?: GainNode | null } = {},
) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, start)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, start + dur)
  const peak = opts.gain ?? 0.18
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(opts.bus ?? sfxBus!)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

function noise(start: number, dur: number, gain = 0.08, hp = 2000) {
  if (!ctx) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = hp
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(f)
  f.connect(g)
  g.connect(sfxBus!)
  src.start(start)
}

export type Sfx =
  | 'click'
  | 'pop'
  | 'open'
  | 'close'
  | 'done'
  | 'achievement'
  | 'levelup'
  | 'event'
  | 'sparkle'
  | 'error'
  | 'approval'
  | 'stamp'
  | 'handoff'
  | 'memory'
  | 'coin'
  | 'deliver'
  | 'question'

const lastPlayed = new Map<Sfx, number>()

export function sfx(name: Sfx) {
  if (!ctx || ctx.state !== 'running') return
  const nowMs = performance.now()
  if ((lastPlayed.get(name) ?? 0) > nowMs - 70) return
  lastPlayed.set(name, nowMs)
  const t = ctx.currentTime + 0.01
  switch (name) {
    case 'click':
      tone(880, t, 0.05, { type: 'triangle', gain: 0.08 })
      break
    case 'pop':
      tone(520, t, 0.09, { type: 'sine', gain: 0.14, slideTo: 980 })
      break
    case 'open':
      tone(440, t, 0.08, { type: 'triangle', gain: 0.08, slideTo: 660 })
      break
    case 'close':
      tone(660, t, 0.08, { type: 'triangle', gain: 0.07, slideTo: 440 })
      break
    case 'done':
      ;[659, 988].forEach((f, i) => tone(f, t + i * 0.08, 0.22, { type: 'triangle', gain: 0.12 }))
      break
    case 'coin':
      tone(988, t, 0.07, { type: 'square', gain: 0.05 })
      tone(1319, t + 0.07, 0.2, { type: 'square', gain: 0.05 })
      break
    case 'achievement':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, { type: 'triangle', gain: 0.12 }))
      noise(t + 0.3, 0.4, 0.03, 6000)
      break
    case 'levelup':
      ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.07, 0.5, { type: 'square', gain: 0.05 }))
      ;[523, 659, 784].forEach((f) => tone(f, t + 0.5, 0.9, { type: 'triangle', gain: 0.09 }))
      break
    case 'event':
      tone(740, t, 0.15, { type: 'sine', gain: 0.12 })
      tone(988, t + 0.12, 0.25, { type: 'sine', gain: 0.1 })
      break
    case 'sparkle':
      for (let i = 0; i < 5; i++) tone(1400 + Math.random() * 1200, t + i * 0.05, 0.12, { type: 'sine', gain: 0.05 })
      break
    case 'error':
      tone(220, t, 0.18, { type: 'sawtooth', gain: 0.07, slideTo: 150 })
      tone(196, t + 0.16, 0.25, { type: 'sawtooth', gain: 0.06, slideTo: 110 })
      break
    case 'approval':
      tone(587, t, 0.12, { type: 'triangle', gain: 0.1 })
      tone(880, t + 0.1, 0.12, { type: 'triangle', gain: 0.1 })
      tone(587, t + 0.2, 0.16, { type: 'triangle', gain: 0.1 })
      break
    case 'question':
      tone(660, t, 0.12, { type: 'sine', gain: 0.1, slideTo: 880 })
      tone(880, t + 0.14, 0.18, { type: 'sine', gain: 0.1, slideTo: 1100 })
      break
    case 'stamp':
      noise(t, 0.08, 0.25, 300)
      tone(120, t, 0.12, { type: 'sine', gain: 0.25, slideTo: 60 })
      break
    case 'handoff':
      tone(400, t, 0.18, { type: 'sine', gain: 0.07, slideTo: 800 })
      break
    case 'memory':
      ;[1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.6, { type: 'sine', gain: 0.05, attack: 0.05 }))
      break
    case 'deliver':
      ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.4, { type: 'triangle', gain: 0.1 }))
      noise(t + 0.6, 0.8, 0.04, 5000)
      break
  }
}
