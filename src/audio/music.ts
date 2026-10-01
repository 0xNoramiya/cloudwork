// Generative ambient music. Each "track" is a small sequencer with its own scale, tempo and voices.
import { buses } from './sfx'

interface Track {
  bpm: number
  scale: number[] // semitone offsets
  root: number // MIDI note
  chords: number[][] // scale-degree triads
  voice: 'pad' | 'pluck' | 'box' | 'keys'
  drums: boolean
  swing: number
}

const TRACKS: Record<string, Track> = {
  'music-drift': { bpm: 64, scale: [0, 2, 4, 7, 9], root: 57, chords: [[0, 2, 4], [3, 0, 2], [1, 3, 0], [4, 1, 3]], voice: 'pad', drums: false, swing: 0 },
  'music-breeze': { bpm: 92, scale: [0, 2, 4, 7, 9], root: 62, chords: [[0, 2, 4], [4, 1, 3], [3, 0, 2], [0, 2, 4]], voice: 'pluck', drums: false, swing: 0.08 },
  'music-starlight': { bpm: 84, scale: [0, 2, 4, 5, 7, 9, 11], root: 64, chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], voice: 'box', drums: false, swing: 0 },
  'music-lofi': { bpm: 76, scale: [0, 2, 3, 5, 7, 9, 10], root: 55, chords: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [4, 6, 1]], voice: 'keys', drums: true, swing: 0.16 },
}

let current: string | null = null
let timer: number | null = null
let step = 0

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

function note(track: Track, degree: number, octave = 0): number {
  const s = track.scale
  const o = Math.floor(degree / s.length)
  const d = ((degree % s.length) + s.length) % s.length
  return midi(track.root + s[d] + 12 * (o + octave))
}

function voice(freq: number, start: number, dur: number, kind: Track['voice'], gain: number) {
  const { ctx, musicBus } = buses()
  if (!ctx || !musicBus) return
  const g = ctx.createGain()
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = kind === 'pad' ? 1400 : kind === 'keys' ? 1800 : 4200
  g.connect(f)
  f.connect(musicBus)
  const oscs: OscillatorNode[] = []
  const mk = (type: OscillatorType, detune: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    o.connect(g)
    oscs.push(o)
  }
  if (kind === 'pad') {
    mk('sawtooth', -7)
    mk('sawtooth', 7)
    mk('sine', 0)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(gain * 0.35, start + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  } else if (kind === 'pluck') {
    mk('triangle', 0)
    g.gain.setValueAtTime(gain, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  } else if (kind === 'box') {
    mk('sine', 0)
    mk('sine', 1200)
    g.gain.setValueAtTime(gain * 0.8, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  } else {
    mk('triangle', -4)
    mk('sine', 4)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(gain * 0.6, start + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  }
  for (const o of oscs) {
    o.start(start)
    o.stop(start + dur + 0.1)
  }
}

function drum(kind: 'kick' | 'hat' | 'snare', start: number) {
  const { ctx, musicBus } = buses()
  if (!ctx || !musicBus) return
  if (kind === 'kick') {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(110, start)
    o.frequency.exponentialRampToValueAtTime(40, start + 0.18)
    g.gain.setValueAtTime(0.35, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.25)
    o.connect(g)
    g.connect(musicBus)
    o.start(start)
    o.stop(start + 0.3)
    return
  }
  const len = Math.floor(ctx.sampleRate * (kind === 'hat' ? 0.05 : 0.18))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = kind === 'hat' ? 'highpass' : 'bandpass'
  f.frequency.value = kind === 'hat' ? 7000 : 1800
  const g = ctx.createGain()
  g.gain.value = kind === 'hat' ? 0.06 : 0.12
  src.connect(f)
  f.connect(g)
  g.connect(musicBus)
  src.start(start)
}

function schedule() {
  const { ctx } = buses()
  if (!ctx || !current) return
  const track = TRACKS[current]
  const beat = 60 / track.bpm / 2 // eighth notes
  const bar = Math.floor(step / 8)
  const pos = step % 8
  const chord = track.chords[bar % track.chords.length]
  const swing = pos % 2 === 1 ? track.swing * beat : 0
  const t = ctx.currentTime + 0.05 + swing

  if (pos === 0) {
    if (track.voice === 'pad' || track.voice === 'keys') {
      for (const d of chord) voice(note(track, d, -1), t, beat * 8.5, track.voice, 0.07)
    }
    voice(note(track, chord[0], -2), t, beat * 6, 'pad', 0.06)
  }
  if (track.voice === 'pluck' || track.voice === 'box') {
    if (Math.random() < (track.voice === 'box' ? 0.75 : 0.6)) {
      const d = chord[Math.floor(Math.random() * 3)] + (Math.random() < 0.3 ? 2 : 0)
      voice(note(track, d, Math.random() < 0.5 ? 0 : 1), t, beat * 3, track.voice, 0.09)
    }
  } else if (Math.random() < 0.28) {
    voice(note(track, chord[Math.floor(Math.random() * 3)] + 7, 0), t, beat * 4, track.voice === 'keys' ? 'keys' : 'box', 0.045)
  }
  if (track.drums) {
    if (pos === 0 || pos === 5) drum('kick', t)
    if (pos === 4) drum('snare', t)
    if (pos % 2 === 0) drum('hat', t)
  }
  step++
  timer = window.setTimeout(schedule, beat * 1000)
}

export function playMusic(trackId: string | null) {
  if (trackId === current) return
  if (timer) window.clearTimeout(timer)
  timer = null
  current = trackId && TRACKS[trackId] ? trackId : null
  step = 0
  if (current) schedule()
}
