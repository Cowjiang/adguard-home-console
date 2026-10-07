/** Mobile log row card + the row-identity key shared by the log list */
import { useTranslation } from 'react-i18next'
import type { QueryLogItem } from '../../lib/api'
import { qtypeColor } from '../../lib/constants'
import { fmtTime, fmtMs } from '../../lib/format'
import { Card } from '../ui/primitives'
import { Badge } from '../ui/atoms'
import { reasonMeta } from './LogDetail'

export const keyOf = (i: QueryLogItem) => `${i.time}|${i.question.name}|${i.client}|${i.question.type}`

export function LogRow({ item, onClick }: { item: QueryLogItem; onClick: () => void }) {
  const { t } = useTranslation()
  const meta = reasonMeta(item.reason, t)
  const cname = item.client_info?.name || item.client
  return (
    <Card onClick={onClick} className="!rounded-2xl px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-1 flex-none rounded-full"
          style={{ background: meta.kind === 'blocked' ? 'var(--danger)' : meta.kind === 'rewrite' ? 'var(--violet)' : meta.kind === 'warn' ? 'var(--warn)' : 'var(--ok)' }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium text-t1">{item.question.name}</span>
            <span
              className="flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{ color: qtypeColor(item.question.type), background: 'var(--glass)' }}
            >
              {item.question.type}
            </span>
            {item.cached && (
              <span className="flex-none text-[10px] text-t3" title={t('querylog.cachedTitle')}>
                {t('querylog.cached')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-t2">
            <span className="max-w-[45%] truncate">{cname}</span>
            <span className="num">{fmtTime(item.time)}</span>
            <span className="num text-t3">{fmtMs(Number(item.elapsedMs))}</span>
          </div>
        </div>
        <Badge kind={meta.kind}>{meta.label}</Badge>
      </div>
    </Card>
  )
}
