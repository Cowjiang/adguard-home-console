/** 数字与时间格式化 */

export function fmtNum(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('zh-CN')
}

export function fmtCompact(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString('zh-CN')
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
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

export function fmtTimeFull(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '0 秒'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d) parts.push(d + ' 天')
  if (h) parts.push(h + ' 小时')
  if (m) parts.push(m + ' 分钟')
  if (!d && !h && s) parts.push(s + ' 秒')
  return parts.slice(0, 2).join(' ') || '0 秒'
}

export function fmtUptime(startMs: number): string {
  return fmtDuration((Date.now() - startMs) / 1000)
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '从未'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return iso
  const diff = (Date.now() - d) / 1000
  if (diff < 10) return '刚刚'
  if (diff < 60) return Math.floor(diff) + ' 秒前'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  return Math.floor(diff / 86400) + ' 天前'
}

export function hoursLabel(h: number): string {
  if (h === 0) return '已禁用'
  if (h < 1) return `${h * 60} 分钟`
  if (h < 24) return `${h} 小时`
  if (h % 24 === 0) return `${h / 24} 天`
  return `${h} 小时`
}
