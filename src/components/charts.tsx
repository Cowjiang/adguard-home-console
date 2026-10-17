/** Lightweight SVG charts: smoothed area chart + horizontal bar ranking list */
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtCompact } from '../lib/format'

function smoothPath(pts: [number, number][]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n < 3) return 'M' + pts.map((p) => p.join(',')).join('L')
  // Fritsch–Carlson monotone cubic spline: tangents are zeroed at extrema so the curve
  // never overshoots the data range (Catmull-Rom derives tangents from neighbors and
  // overshoots the other way on 0→peak jumps, dipping below the 0 axis)
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1)
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i])
    }
  }
  t[n - 1] = m[n - 2]
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i][0]
    const y1 = pts[i][1]
    const x2 = pts[i + 1][0]
    const y2 = pts[i + 1][1]
    const h = dx[i]
    const c1x = x1 + h / 3
    const c1y = y1 + (t[i] * h) / 3
    const c2x = x2 - h / 3
    const c2y = y2 - (t[i + 1] * h) / 3
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
  }
  return d
}
export function AreaChart({
  series, extra = [], height = 150, labels, showBlocked = true, tooltipLabels,
}: {
  series: { queries: number[]; blocked: number[] }
  /** Additional series sharing the queries scale (merged mobile traffic
   *  chart); values must be pre-sliced to the same length as queries */
  extra?: { values: number[]; label: string; color: string }[]
  height?: number
  labels?: string[]
  showBlocked?: boolean
  /** Hover tooltip wording for the two series; defaults to 查询/拦截. Series
   *  colors are themed by overriding --chart-1/--chart-2 on a wrapper */
  tooltipLabels?: [string, string?]
}) {
  const W = 340
  const H = height
  const PAD_T = 8
  const PAD_B = 20
  const [hover, setHover] = useState<number | null>(null)
  const { t } = useTranslation()

  const { qPts, bPts, max, ePts } = useMemo(() => {
    const q = series.queries ?? []
    const b = series.blocked ?? []
    const max = Math.max(1, ...q)
    const n = q.length
    const toPts = (arr: number[]): [number, number][] =>
      arr.map((v, i) => [(i / Math.max(1, n - 1)) * W, PAD_T + (1 - v / max) * (H - PAD_T - PAD_B)])
    return { qPts: toPts(q), bPts: toPts(b), max, ePts: extra.map((e) => toPts(e.values ?? [])) }
  }, [series, extra, H])

  // useId carries colons that break url(#…) references; strip them
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  const n = qPts.length
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round((x / W) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, idx)))
  }

  // Touch long-press preview: if not moved within 350ms of press (no scroll/drag), pin
  // the crosshair; dragging may then continue horizontally. Moving earlier cancels the
  // hold, yielding to page scroll or horizontal scrub
  const pressRef = useRef<{ startX: number; rect: DOMRect; timer: number | null; active: boolean } | null>(null)
  const clearPressTimer = () => {
    const p = pressRef.current
    if (p?.timer != null) window.clearTimeout(p.timer)
    if (p) p.timer = null
  }
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'touch') return
    clearPressTimer()
    const rect = e.currentTarget.getBoundingClientRect()
    pressRef.current = { startX: e.clientX, rect, timer: null, active: false }
    pressRef.current.timer = window.setTimeout(() => {
      const p = pressRef.current
      if (!p) return
      p.timer = null
      p.active = true
      const x = ((p.startX - p.rect.left) / p.rect.width) * W
      const idx = Math.round((x / W) * (n - 1))
      setHover(Math.max(0, Math.min(n - 1, idx)))
      navigator.vibrate?.(10)
    }, 350)
  }
  const onMoveTouch = (e: React.PointerEvent<SVGSVGElement>) => {
    onMove(e)
    const p = pressRef.current
    if (p && !p.active && p.timer != null && Math.abs(e.clientX - p.startX) > 8) {
      window.clearTimeout(p.timer)
      p.timer = null
    }
  }
  const onEnd = () => {
    clearPressTimer()
    if (pressRef.current) pressRef.current.active = false
    setHover(null)
  }

  if (!n) return <div className="skeleton" style={{ height }} />

  const hoverX = hover != null ? (hover / (n - 1)) * W : 0
  const labelStep = Math.ceil(n / 6)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-touch w-full"
        style={{ height }}
        onPointerDown={onDown}
        onPointerMove={onMoveTouch}
        onPointerLeave={() => { clearPressTimer(); setHover(null) }}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`${uid}-gq`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${uid}-gb`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.02" />
          </linearGradient>
          {extra.map((e, i) => (
            <linearGradient key={e.label} id={`${uid}-ge${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={e.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={e.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={PAD_T + f * (H - PAD_T - PAD_B)}
            y2={PAD_T + f * (H - PAD_T - PAD_B)}
            stroke="var(--glass-border)"
            strokeDasharray="3 5"
            strokeWidth={1}
          />
        ))}

        <path d={`${smoothPath(qPts)} L${W},${H - PAD_B} L0,${H - PAD_B} Z`} fill={`url(#${uid}-gq)`} />
        {showBlocked && (
          <path d={`${smoothPath(bPts)} L${W},${H - PAD_B} L0,${H - PAD_B} Z`} fill={`url(#${uid}-gb)`} opacity={0.8} />
        )}
        <path d={smoothPath(qPts)} fill="none" stroke="var(--chart-1)" strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {showBlocked && (
          <path d={smoothPath(bPts)} fill="none" stroke="var(--chart-2)" strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.85} />
        )}
        {extra.map((e, i) => (
          <g key={e.label}>
            <path d={`${smoothPath(ePts[i])} L${W},${H - PAD_B} L0,${H - PAD_B} Z`} fill={`url(#${uid}-ge${i})`} opacity={0.8} />
            <path d={smoothPath(ePts[i])} fill="none" stroke={e.color} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={0.9} />
          </g>
        ))}

        {hover != null && (
          <line x1={hoverX} x2={hoverX} y1={PAD_T} y2={H - PAD_B} stroke="var(--t3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* x-axis labels: preserveAspectRatio=none stretches <text> horizontally, so overlay
          HTML in the bottom padding area instead */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: PAD_B }}>
        {labels?.map((l, i) =>
          i % labelStep === 0 ? (
            <span
              key={i}
              className="absolute text-[9.5px] leading-none text-t3"
              style={{
                left: `${(i / Math.max(1, n - 1)) * 100}%`,
                bottom: 4,
                transform: i === 0 ? undefined : i === n - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {l}
            </span>
          ) : null
        )}
      </div>

      {/* Data points: preserveAspectRatio=none squashes <circle> into an ellipse, so overlay
          HTML dots to keep them round */}
      {hover != null && (
        <>
          <div
            className="pointer-events-none absolute"
            style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, top: qPts[hover][1], transform: 'translate(-50%, -50%)' }}
          >
            <span className="block rounded-full" style={{ width: 8, height: 8, background: 'var(--chart-1)', border: '1.5px solid var(--bg)' }} />
          </div>
          {showBlocked && (
            <div
              className="pointer-events-none absolute"
              style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, top: bPts[hover][1], transform: 'translate(-50%, -50%)' }}
            >
              <span className="block rounded-full" style={{ width: 7, height: 7, background: 'var(--chart-2)', border: '1.5px solid var(--bg)' }} />
            </div>
          )}
          {extra.map((e, i) => (
            <div
              key={e.label}
              className="pointer-events-none absolute"
              style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, top: ePts[i][hover][1], transform: 'translate(-50%, -50%)' }}
            >
              <span className="block rounded-full" style={{ width: 7, height: 7, background: e.color, border: '1.5px solid var(--bg)' }} />
            </div>
          ))}
        </>
      )}

      {hover != null && (
        <div
          className="glass-strong pointer-events-none absolute top-0 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[11px] leading-tight num"
          style={{ left: `${(hover / (n - 1)) * 100}%`, transform: `translateX(${hover > n * 0.7 ? '-105%' : hover < n * 0.2 ? '5%' : '-50%'})` }}
        >
          <div className="text-t2">{labels?.[hover]}</div>
          <div style={{ color: 'var(--chart-1)' }}>
            {tooltipLabels?.[0] ?? t('dashboard.legendQueries')} {fmtCompact(series.queries?.[hover] ?? 0)}
          </div>
          {showBlocked && (
            <div style={{ color: 'var(--chart-2)' }}>
              {tooltipLabels?.[1] ?? t('dashboard.legendBlocked')} {fmtCompact(series.blocked?.[hover] ?? 0)}
            </div>
          )}
          {extra.map((e) => (
            <div key={e.label} style={{ color: e.color }}>
              {e.label} {fmtCompact(e.values?.[hover] ?? 0)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function BarList({ items, color = 'var(--accent)', max: maxProp }: { items: [string, number][]; color?: string; max?: number }) {
  const { t } = useTranslation()
  const max = maxProp ?? Math.max(1, ...items.map((i) => i[1]))
  if (!items.length) return <p className="py-4 text-center text-[13px] text-t3">{t('charts.empty')}</p>
  return (
    <div className="flex flex-col gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center gap-2.5">
          <span className="w-[46%] shrink-0 truncate text-[13px] text-t1" title={label}>
            {label}
          </span>
          <div className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(3, (value / max) * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 60%, transparent), ${color})` }}
            />
          </div>
          <span className="w-11 shrink-0 text-right text-[12px] num text-t2">{fmtCompact(value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Donut chart: request composition as proportional segments, with legend */
export function Donut({
  segments, size = 170, thickness = 24, centerLabel, centerSub, hidePct = false,
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerSub?: string
  /** Drop the percentage column and let the count sit at the row end; narrow
   *  cards reserve the width for the label instead (the ring already shows the
   *  share, so the count is what is left to read) */
  hidePct?: boolean
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glass)" strokeWidth={thickness} />
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s) => {
                const frac = s.value / total
                const dash = `${frac * C} ${C}`
                const offset = -acc * C
                acc += frac
                return (
                  <circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeDashoffset={offset}
                    className="transition-all duration-500"
                  />
                )
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[20px] font-bold leading-tight num text-t1">{centerLabel}</span>
          {centerSub && <span className="text-[11px] text-t3">{centerSub}</span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-t2">{s.label}</span>
            <span className="num text-t1">{fmtCompact(s.value)}</span>
            {!hidePct && (
              <span className="w-12 text-right num text-t3">{total ? ((s.value / total) * 100).toFixed(1) : '0.0'}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Ranking table: rank + name + count + share bar (desktop stats page; more tabular than
 *  BarList) */
export function RankTable({ items, color = 'var(--accent)', resolve }: {
  items: [string, number][]
  color?: string
  resolve?: (key: string) => string
}) {
  const { t } = useTranslation()
  const max = Math.max(1, ...items.map((i) => i[1]))
  const total = items.reduce((s, i) => s + i[1], 0)
  if (!items.length) return <p className="py-6 text-center text-[13px] text-t3">{t('charts.empty')}</p>
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-t3">
        <span className="w-6 text-center">#</span>
        <span className="min-w-0 flex-1">{t('charts.colName')}</span>
        <span className="w-20 text-right">{t('charts.colCount')}</span>
        <span className="w-24 text-right">{t('charts.colPct')}</span>
      </div>
      {items.map(([key, value], i) => (
        <div key={key} className="flex items-center gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-white/[0.04]">
          <span
            className="w-6 flex-none text-center text-[12px] font-bold num"
            style={{ color: i < 3 ? color : 'var(--t3)' }}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-t1" title={key}>
            {resolve ? resolve(key) : key}
          </span>
          <span className="w-20 flex-none text-right text-[13px] num text-t2">{fmtCompact(value)}</span>
          <span className="flex w-24 flex-none items-center justify-end gap-2">
            <span className="text-[11.5px] num text-t3">{total ? ((value / total) * 100).toFixed(1) : '0.0'}%</span>
            <span className="h-[6px] w-10 overflow-hidden rounded-full" style={{ background: 'var(--glass)' }}>
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }}
              />
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function StatTile({ label, value, sub, accent = 'var(--accent)', onClick, className = '' }: { label: string; value: React.ReactNode; sub?: string; accent?: string; onClick?: () => void; className?: string }) {
  return (
    <div
      onClick={onClick}
      className={`glass specular relative overflow-hidden rounded-2xl px-3.5 py-3 ${onClick ? 'press cursor-pointer' : ''} ${className}`}
    >
      <div className="text-[12px] text-t2">{label}</div>
      <div className="mt-0.5 text-[22px] font-bold leading-tight num" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-t3 num">{sub}</div>}
    </div>
  )
}
