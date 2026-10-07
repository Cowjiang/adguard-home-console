/** Desktop client table: click a row to open the detail modal; name/source/requests are
 *  sortable. Row model and sort key are shared with the page's sorting logic */
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Laptop, Smartphone, UserRound } from 'lucide-react'
import type { AghClient } from '../../lib/api'
import { fmtNum } from '../../lib/format'
import { Card } from '../ui/primitives'
import { Badge, SourceBadge } from '../ui/atoms'

export type SortKey = 'requests' | 'name' | 'source'

/** Row model shared by both platforms: merged display view of persistent + auto-detected
 *  clients */
export interface ClientRowModel {
  key: string
  name: string
  ip?: string
  ids: string[]
  source?: string
  whois?: Record<string, string>
  /** Country + ISP, same style as the official UI: "CN CHINANET-GD" */
  whoisText?: string
  /** Request count within the stats period (from /stats top_clients) */
  requests?: number
  persistent?: AghClient
}

export function IconB({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: 'var(--glass)', color: 'var(--t2)' }}>
      {children}
    </div>
  )
}

const TBL_COLS = 'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_104px_minmax(0,1.1fr)_88px_92px] items-center gap-3'

function SortTh({ label, k, sortKey, sortAsc, onSort, align }: {
  label: string; k: SortKey; sortKey: SortKey; sortAsc: boolean; onSort: (k: SortKey) => void; align?: 'right'
}) {
  const active = sortKey === k
  return (
    <button
      onClick={() => onSort(k)}
      className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${active ? 'text-accent' : 'hover:text-t1'}`}
    >
      {label}
      {active && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

export function ClientTable({ rows, sortKey, sortAsc, onSort, onRow }: {
  rows: ClientRowModel[]
  sortKey: SortKey
  sortAsc: boolean
  onSort: (k: SortKey) => void
  onRow: (r: ClientRowModel) => void
}) {
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden !rounded-2xl">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          <div
            className={`${TBL_COLS} px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-t3`}
            style={{ borderBottom: '1px solid var(--glass-border)' }}
          >
            <SortTh label={t('clients.colName')} k="name" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} />
            <span>{t('clients.colIds')}</span>
            <SortTh label={t('clients.colSource')} k="source" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} />
            <span>WHOIS</span>
            <SortTh label={t('clients.colRequests')} k="requests" sortKey={sortKey} sortAsc={sortAsc} onSort={onSort} align="right" />
            <span className="flex justify-end">{t('clients.colStatus')}</span>
          </div>
          {rows.map((r) => (
            <button
              key={r.key}
              onClick={() => onRow(r)}
              className={`${TBL_COLS} w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.035]`}
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px]"
                  style={r.persistent
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : { background: 'var(--glass)', color: 'var(--t2)' }}
                >
                  {/phone|mobile|iphone|android|pad/i.test(r.name) ? <Smartphone size={14} /> : r.persistent ? <Laptop size={14} /> : <UserRound size={14} />}
                </span>
                <span className="truncate text-[13.5px] font-medium text-t1">{r.name}</span>
              </span>
              <span className="num truncate text-[12.5px] text-t2">{r.ids.join(' · ')}</span>
              <span>{r.source ? <SourceBadge source={r.source} /> : <span className="text-[12.5px] text-t3">–</span>}</span>
              <span className="truncate text-[12.5px] text-t2" title={r.whoisText}>{r.whoisText || '–'}</span>
              <span className="num text-right text-[12.5px] text-t2">{r.requests != null ? fmtNum(r.requests) : '–'}</span>
              <span className="flex justify-end">
                {r.persistent ? <Badge kind="ok">{t('clients.configuredBadge')}</Badge> : <Badge kind="warn">{t('clients.unsetBadge')}</Badge>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}
