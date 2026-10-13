/** Desktop table view: high-density columns; clicking a row opens the same detail
 *  overlay */
import { useTranslation } from 'react-i18next'
import type { QueryLogItem } from '../../lib/api'
import { qtypeColor } from '../../lib/constants'
import { fmtTime, fmtMs } from '../../lib/format'
import { Card } from '../ui/primitives'
import { Badge } from '../ui/atoms'
import { reasonMeta } from './LogDetail'
import { keyOf } from './LogRow'
import type { AggregatedQueryLogItem } from '../../lib/log/analytics'

const LOG_COLS = 'grid grid-cols-[88px_minmax(0,1fr)_180px_128px_72px] items-center gap-3'

function reasonDot(kind: string) {
  return kind === 'blocked' ? 'var(--danger)' : kind === 'rewrite' ? 'var(--violet)' : kind === 'warn' ? 'var(--warn)' : 'var(--ok)'
}

export function LogTable({
  items,
  onRow,
}: {
  items: (QueryLogItem | AggregatedQueryLogItem)[]
  onRow: (i: QueryLogItem | AggregatedQueryLogItem) => void
}) {
  const { t } = useTranslation()
  return (
    <Card className="overflow-hidden !rounded-2xl">
      <div
        className={`${LOG_COLS} px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-t3`}
        style={{ borderBottom: '1px solid var(--glass-border)' }}
      >
        <span>{t('querylog.colTime')}</span>
        <span>{t('querylog.colDomain')}</span>
        <span>{t('querylog.colClient')}</span>
        <span>{t('querylog.colResult')}</span>
        <span className="text-right">{t('querylog.colElapsed')}</span>
      </div>
      <div className="max-h-[calc(100dvh-330px)] overflow-y-auto">
        {items.map((item) => {
          const meta = reasonMeta(item.reason, t)
          const cname = item.client_info?.name || item.client
          const instanceLabel = (item as AggregatedQueryLogItem)._instanceLabel
          return (
            <button
              key={keyOf(item)}
              onClick={() => onRow(item)}
              className={`${LOG_COLS} w-full px-4 py-2.5 text-left transition-colors hover:bg-white/[0.035]`}
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <span className="num text-[12px] text-t3">{fmtTime(item.time)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: reasonDot(meta.kind) }} />
                <span className="truncate text-[13.5px] text-t1">{item.question.name}</span>
                <span
                  className="flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: qtypeColor(item.question.type), background: 'var(--glass)' }}
                >
                  {item.question.type}
                </span>
                {instanceLabel && (
                  <span className="flex-none rounded bg-white/10 px-1 py-0.5 text-[9.5px] text-t3">
                    {instanceLabel}
                  </span>
                )}
                {item.cached && <span className="flex-none text-[10px] text-t3">{t('querylog.cached')}</span>}
              </span>
              <span className="truncate text-[12.5px] text-t2">{cname}</span>
              <span>
                <Badge kind={meta.kind}>{meta.label}</Badge>
              </span>
              <span className="text-right num text-[12px] text-t2">{fmtMs(Number(item.elapsedMs))}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
