/** Query log entry detail (shared by the desktop modal and the mobile detail page) */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, CheckCircle2, Copy } from 'lucide-react'
import { Badge, Button, toast } from './ui'
import { copyText } from '../lib/clipboard'
import { REASON_META, qtypeColor, type ReasonLabelKey } from '../lib/constants'
import { fmtTimeFull, fmtMs } from '../lib/format'
import type { QueryLogItem, FilteringStatus } from '../lib/api'

type TFn = (key: ReasonLabelKey) => string

/** Unregistered reasons (e.g. new enums from the newer API) are shown as-is; registered
 *  ones are translated via the dictionary */
export function reasonMeta(reason: string, t: TFn) {
  const meta = REASON_META[reason]
  return meta
    ? { label: t(meta.labelKey), kind: meta.kind }
    : { label: reason, kind: 'info' as const }
}

export function LogDetail({
  item, filtering, onSaveRule,
}: {
  item: QueryLogItem
  filtering?: FilteringStatus
  onSaveRule: (rule: string, block: boolean) => void
}) {
  const { t } = useTranslation()
  const meta = reasonMeta(item.reason, t)
  const domain = item.question.name
  const blocked = meta.kind === 'blocked'
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyText(domain)
    if (ok) {
      setCopied(true)
      toast(t('querylog.copiedDomain'))
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast(t('common.copyFailed'), 'err')
    }
  }

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="break-all text-[17px] font-bold text-t1">{domain}</p>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <Badge kind={meta.kind}>{meta.label}</Badge>
          <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold num" style={{ color: qtypeColor(item.question.type), background: 'var(--glass)' }}>
            {item.question.type} · {item.question.class}
          </span>
          <span className="text-[11.5px] num text-t3">{fmtTimeFull(item.time)}</span>
        </div>
      </div>

      <div className="glass mb-3 rounded-2xl px-4 py-3 text-[13px]">
        <DetailRow label={t('querylog.client')} value={`${item.client_info?.name || t('agh.unknown')} (${item.client})${item.client_proto ? ' · ' + item.client_proto.toUpperCase() : ''}`} />
        <DetailRow label={t('querylog.status')} value={item.status || '—'} />
        <DetailRow label={t('querylog.elapsed')} value={fmtMs(Number(item.elapsedMs))} />
        {item.service_name && <DetailRow label={t('querylog.matchedService')} value={item.service_name} />}
        {item.ecs && <DetailRow label={t('querylog.ecs')} value={item.ecs} />}
        {item.upstream && <DetailRow label={t('querylog.upstream')} value={item.upstream} />}
        <DetailRow label={t('querylog.cache')} value={item.cached ? t('agh.cacheHit') : t('agh.cacheMiss')} />
        {item.answer_dnssec && <DetailRow label="DNSSEC" value={t('agh.dnssecVerified')} />}
      </div>

      <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">{t('querylog.resultGroup')}</p>
      <div className="glass mb-3 max-h-[180px] overflow-y-auto rounded-2xl px-4 py-3 text-[13px]">
        {item.answer?.length ? (
          item.answer.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1">
              <span className="font-semibold num" style={{ color: qtypeColor(a.type) }}>{a.type}</span>
              <span className="min-w-0 flex-1 break-all text-right num text-t1">{a.value}</span>
              <span className="flex-none text-[11px] text-t3 num">TTL {a.ttl}</span>
            </div>
          ))
        ) : (
          <p className="py-1 text-center text-t3">{t('querylog.noRecord')}</p>
        )}
      </div>

      {item.rules?.length ? (
        <>
          <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">{t('querylog.rulesGroup')}</p>
          <div className="glass mb-3 rounded-2xl px-4 py-3">
            {item.rules.map((r, i) => (
              <p key={i} className="break-all py-0.5 font-mono text-[12px] text-t2">
                {r.text}
                <span className="ml-2 text-t3">{t('querylog.listId', { id: r.filter_list_id })}</span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        {/* nowrap + tighter padding keeps both labels on one line at 360px viewports */}
        <Button variant="glass" size="md" onClick={copy} className="flex-1 whitespace-nowrap !px-3">
          <Copy size={15} /> {copied ? t('querylog.copied') : t('querylog.copyDomain')}
        </Button>
        {!blocked ? (
          <Button variant="danger" size="md" className="flex-1 whitespace-nowrap !px-3" onClick={() => onSaveRule(`||${domain}^`, true)}>
            <Ban size={15} /> {t('querylog.blockDomain')}
          </Button>
        ) : (
          <Button variant="glass" size="md" className="flex-1 whitespace-nowrap !px-3" onClick={() => onSaveRule(`@@||${domain}^$important`, false)}>
            <CheckCircle2 size={15} /> {t('querylog.whitelistDomain')}
          </Button>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="flex-none text-t3">{label}</span>
      <span className="min-w-0 break-all text-right text-t1">{value}</span>
    </div>
  )
}
