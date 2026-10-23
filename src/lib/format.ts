/** Number and time formatting: values/dates use Intl with the current UI
 *  language, unit words use the i18n dictionary */
import { i18n } from './i18n'

/** BCP-47 tag of the current UI language */
function lang(): string {
  return i18n.language || 'en'
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat(lang()).format(n)
}

export function fmtNum(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return fmtInt(n)
}

export function fmtCompact(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1) + 'k'
  return fmtInt(n)
}

export function fmtPct(part: number, total: number, digits = 1): string {
  if (!total) return '0%'
  return ((part / total) * 100).toFixed(digits) + '%'
}

export function fmtMs(sec: number | undefined | null): string {
  if (sec == null || Number.isNaN(sec)) return '—'
  const ms = sec < 1 ? sec * 1000 : sec
  if (ms < 1000) return ms.toFixed(ms < 10 ? 2 : 0) + ' ms'
  return (ms / 1000).toFixed(2) + ' s'
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return (bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

export function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString(lang(), { hour12: false })
}

export function fmtTimeFull(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(lang(), { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return i18n.t('units.second', { count: 0 })
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d) parts.push(i18n.t('units.day', { count: d }))
  if (h) parts.push(i18n.t('units.hour', { count: h }))
  if (m) parts.push(i18n.t('units.minute', { count: m }))
  if (!d && !h && s) parts.push(i18n.t('units.second', { count: s }))
  return parts.slice(0, 2).join(' ') || i18n.t('units.second', { count: 0 })
}

export function fmtUptime(startMs: number): string {
  return fmtDuration((Date.now() - startMs) / 1000)
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return i18n.t('units.never')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(lang(), { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Date without time, for narrow metadata rows */
export function fmtDateShort(iso: string | undefined): string {
  if (!iso) return i18n.t('units.never')
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang(), { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return iso
  const diff = (Date.now() - d) / 1000
  if (diff < 10) return i18n.t('units.now')
  if (diff < 60) return i18n.t('units.secAgo', { count: Math.floor(diff) })
  if (diff < 3600) return i18n.t('units.minAgo', { count: Math.floor(diff / 60) })
  if (diff < 86400) return i18n.t('units.hourAgo', { count: Math.floor(diff / 3600) })
  return i18n.t('units.dayAgo', { count: Math.floor(diff / 86400) })
}

/** Compact relative time for stat values ("now" / "45s" / "12m" / "26h" / "3d"):
 *  the tile caption carries the "ago" ("Last update"), which is what keeps the
 *  value inside a narrow column — the spelled-out form overflowed it in English */
export function relTimeShort(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return iso
  const diff = (Date.now() - d) / 1000
  if (diff < 10) return i18n.t('units.nowShort')
  if (diff < 60) return i18n.t('units.secShort', { count: Math.floor(diff) })
  if (diff < 3600) return i18n.t('units.minShort', { count: Math.floor(diff / 60) })
  if (diff < 86400) return i18n.t('units.hourShort', { count: Math.floor(diff / 3600) })
  return i18n.t('units.dayShort', { count: Math.floor(diff / 86400) })
}

export function hoursLabel(h: number): string {
  if (h === 0) return i18n.t('units.disabled')
  if (h < 1) return i18n.t('units.minute', { count: Math.round(h * 60) })
  if (h < 24) return i18n.t('units.hour', { count: h })
  if (h % 24 === 0) return i18n.t('units.day', { count: h / 24 })
  return i18n.t('units.hour', { count: h })
}
