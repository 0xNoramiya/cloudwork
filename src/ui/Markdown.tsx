import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'
import type { ChartSpec } from '../engine/parse'
import { safeJson } from '../engine/parse'

marked.setOptions({ gfm: true, breaks: false })

type Segment = { kind: 'md'; text: string } | { kind: 'svg'; svg: string } | { kind: 'chart'; spec: ChartSpec }

function split(text: string): Segment[] {
  const out: Segment[] = []
  const re = /```(svg|chart)[^\n]*\n([\s\S]*?)```/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'md', text: text.slice(last, m.index) })
    if (m[1] === 'svg') out.push({ kind: 'svg', svg: m[2] })
    else {
      const v = safeJson(m[2]) as Partial<ChartSpec> | undefined
      if (v && Array.isArray(v.labels) && Array.isArray(v.values)) {
        out.push({ kind: 'chart', spec: { type: 'bar', title: v.title, labels: v.labels.map(String), values: v.values.map(Number), unit: v.unit } })
      } else out.push({ kind: 'md', text: '```json\n' + m[2] + '```' })
    }
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ kind: 'md', text: text.slice(last) })
  return out
}

function fmt(v: number, unit?: string): string {
  const abs = Math.abs(v)
  const n = abs >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : abs >= 10_000 ? `${Math.round(v / 1000)}k` : abs >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100)
  if (!unit) return n
  return unit === '$' ? `$${n}` : `${n} ${unit}`
}

/** Horizontal bar chart for ```chart blocks produced by the analyst. */
export function BarChart({ spec }: { spec: ChartSpec }) {
  const max = Math.max(...spec.values, 0) || 1
  const rowH = 26
  const labelW = 110
  const w = 420
  const h = spec.values.length * rowH + 8
  return (
    <figure className="chart-frame" style={{ margin: 0 }}>
      {spec.title && <figcaption style={{ font: '600 13px var(--font-display)', marginBottom: 8 }}>{spec.title}</figcaption>}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={spec.title ?? 'Bar chart'}>
        {spec.values.map((v, i) => {
          const bw = Math.max(2, ((w - labelW - 70) * Math.max(0, v)) / max)
          const y = i * rowH + 4
          return (
            <g key={i}>
              <text x={labelW - 8} y={y + 14} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--ink-2)">
                {(spec.labels[i] ?? '').slice(0, 16)}
              </text>
              <rect x={labelW} y={y + 2} width={bw} height={rowH - 10} rx="5" fill="var(--accent)" opacity={0.85} />
              <text x={labelW + bw + 6} y={y + 14} fontSize="12" fontWeight="700" fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(v, spec.unit)}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function Markdown({ text }: { text: string }) {
  const segs = useMemo(() => split(text), [text])
  return (
    <div className="md">
      {segs.map((s, i) => {
        if (s.kind === 'svg') {
          const clean = DOMPurify.sanitize(s.svg, { USE_PROFILES: { svg: true, svgFilters: true } })
          return <div key={i} className="svg-frame" dangerouslySetInnerHTML={{ __html: clean }} />
        }
        if (s.kind === 'chart') return <BarChart key={i} spec={s.spec} />
        const html = DOMPurify.sanitize(marked.parse(s.text, { async: false }) as string)
        return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </div>
  )
}
