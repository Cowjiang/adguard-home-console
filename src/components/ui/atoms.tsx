/** Atoms and feedback: badges, status dot, chips, search bar, copy button,
 *  pagination, spinner/loading/empty/error states */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Search, X } from 'lucide-react'
import { toast } from './toast'
import { usePick } from './menu'
import { copyText } from '../../lib/clipboard'

export function Badge({ children, kind = 'ok' }: { children: ReactNode; kind?: 'ok' | 'blocked' | 'warn' | 'rewrite' | 'info' }) {
  const map = {
    ok: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
    blocked: { c: 'var(--danger)', bg: 'var(--danger-soft)' },
    warn: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
    rewrite: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
    info: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  }[kind]
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: map.c, background: map.bg }}
    >
      {children}
    </span>
  )
}

/** Online dot for an instance's /status probe result (shared by the switcher
 *  and the instance list); ok pulses like the protection dot */
export function StatusDot({ online, size = 10 }: { online: 'ok' | 'down' | 'unknown'; size?: number }) {
  const color = online === 'ok' ? 'var(--ok)' : online === 'down' ? 'var(--danger)' : 'var(--t3)'
  return (
    <span
      className={`inline-block flex-none rounded-full ${online === 'ok' ? 'pulse-dot' : ''}`}
      style={{ width: size, height: size, background: color }}
    />
  )
}

const SOURCE_STYLE: Record<string, { c: string; bg: string }> = {
  ARP: { c: 'var(--accent-2)', bg: 'color-mix(in srgb, var(--accent-2) 14%, transparent)' },
  DHCP: { c: 'var(--violet)', bg: 'var(--violet-soft)' },
  rDNS: { c: 'var(--warn)', bg: 'var(--warn-soft)' },
  WHOIS: { c: 'var(--ok)', bg: 'var(--ok-soft)' },
  'etc/hosts': { c: 'var(--t2)', bg: 'var(--glass)' },
}

export function SourceBadge({ source }: { source: string }) {
  const st = SOURCE_STYLE[source] ?? { c: 'var(--t2)', bg: 'var(--glass)' }
  return (
    <span
      className="inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: st.c, background: st.bg }}
    >
      {source}
    </span>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`press flex-none rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${active ? 'font-semibold' : 'glass text-t2'}`}
      style={active ? { background: 'var(--accent-soft)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
    >
      {children}
    </button>
  )
}

export function SearchBar({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={`glass flex items-center gap-2 rounded-full px-4 py-2.5 ${className}`}>
      <Search size={16} className="flex-none text-t3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className="w-full min-w-0 bg-transparent text-[15px] text-t1 outline-none"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="search"
      />
      {value && (
        <button onClick={() => onChange('')} className="press flex-none text-t3" aria-label={t('common.clear')}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/** Icon copy button: copies text on tap, briefly turns into a check on
 *  success; used at the end of detail-page rows like IP/WHOIS */
export function CopyIconButton({ text, label = '', className = '' }: { text?: string; label?: string; className?: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)
  if (!text) return null
  const what = label || t('common.content')
  return (
    <button
      onClick={async (e: any) => {
        e.stopPropagation()
        const ok = await copyText(text)
        if (ok) {
          setDone(true)
          toast(t('common.copiedLabel', { what }))
          setTimeout(() => setDone(false), 1500)
        } else {
          toast(t('common.copyFailed'), 'err')
        }
      }}
      className={`press flex-none text-t3 transition-colors hover:text-accent ${className}`}
      aria-label={t('common.copyLabel', { what })}
      title={t('common.copyLabel', { what })}
    >
      {done ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
    </button>
  )
}

/**
 * Lightweight pagination: prev/next + page number, shared by both platforms;
 * desktop additionally shows the total count and a page-size picker.
 * Not rendered at all with a single page (mobile); on desktop the summary row
 * still shows when total is passed.
 */
export function Pagination({
  page, pages, onChange, total, pageSize, onPageSize,
}: {
  page: number
  pages: number
  onChange: (p: number) => void
  total?: number
  pageSize?: number
  onPageSize?: (n: number) => void
}) {
  const pick = usePick()
  const { t } = useTranslation()
  const pagesSafe = Math.max(1, pages)
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:justify-between">
      <p className="hidden text-[12px] text-t3 lg:block">
        {t('common.totalItems', { n: total ?? 0 })}{pagesSafe > 1 ? ' · ' + t('common.pageXofY', { page, pages: pagesSafe }) : ''}
      </p>
      {pagesSafe > 1 && (
        <div className="glass flex items-center gap-0.5 rounded-full p-1">
          <button
            onClick={() => onChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label={t('common.prevPage')}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="num px-1.5 text-[12.5px] text-t2">{page} / {pagesSafe}</span>
          <button
            onClick={() => onChange(Math.min(pagesSafe, page + 1))}
            disabled={page >= pagesSafe}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-t2 disabled:opacity-30"
            aria-label={t('common.nextPage')}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      {onPageSize && pageSize != null && (
        <button
          onClick={(e: any) =>
            pick({
              options: [20, 50, 100].map((n) => ({ value: n, label: t('common.perPageOption', { n }) })),
              value: pageSize,
              title: t('common.perPageTitle'),
              anchor: e.currentTarget,
              onPick: onPageSize,
            })
          }
          className="press glass hidden items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-t2 lg:inline-flex"
        >
          {t('common.perPageOption', { n: pageSize })} <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-t2" />
}

export function Loading({ text }: { text?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-t2">
      <Spinner size={24} />
      <span className="text-[13px]">{text ?? t('common.loading')}</span>
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="mb-1 opacity-60">{icon}</div>}
      <p className="text-[15px] font-semibold text-t2">{title}</p>
      {subtitle && <p className="max-w-[280px] text-[13px] text-t3">{subtitle}</p>}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="glass flex items-center justify-between gap-3 rounded-2xl border-l-4 px-4 py-3" style={{ borderLeftColor: 'var(--danger)' }}>
      <span className="text-[13.5px] text-t2">{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="press flex-none text-[13px] font-semibold text-accent">
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

/** Rounded icon bubble used across status rows and entry cards */
export function IconBubble({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ color, background: bg }}>
      {children}
    </div>
  )
}
