/** 查询日志单条记录详情(桌面弹窗与移动端详情页共用) */
import { useState } from 'react'
import { Ban, CheckCircle2, Copy } from 'lucide-react'
import { Badge, Button, toast } from './ui'
import { copyText } from '../lib/clipboard'
import { REASON_META, qtypeColor } from '../lib/constants'
import { fmtTimeFull, fmtMs } from '../lib/format'
import type { QueryLogItem, FilteringStatus } from '../lib/api'

export function reasonMeta(reason: string) {
  return REASON_META[reason] ?? { label: reason, kind: 'info' as const }
}

export function LogDetail({
  item, filtering, onSaveRule,
}: {
  item: QueryLogItem
  filtering?: FilteringStatus
  onSaveRule: (rule: string, block: boolean) => void
}) {
  const meta = reasonMeta(item.reason)
  const domain = item.question.name
  const blocked = meta.kind === 'blocked'
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyText(domain)
    if (ok) {
      setCopied(true)
      toast('已复制域名')
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast('复制失败', 'err')
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
        <DetailRow label="客户端" value={`${item.client_info?.name || '未知'} (${item.client})${item.client_proto ? ' · ' + item.client_proto.toUpperCase() : ''}`} />
        <DetailRow label="响应状态" value={item.status || '—'} />
        <DetailRow label="解析耗时" value={fmtMs(Number(item.elapsedMs))} />
        {item.service_name && <DetailRow label="匹配服务" value={item.service_name} />}
        {item.ecs && <DetailRow label="ECS 子网" value={item.ecs} />}
        {item.upstream && <DetailRow label="上游服务器" value={item.upstream} />}
        <DetailRow label="缓存" value={item.cached ? '命中' : '未命中'} />
        {item.answer_dnssec && <DetailRow label="DNSSEC" value="已验证" />}
      </div>

      <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">解析结果</p>
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
          <p className="py-1 text-center text-t3">无记录(NXDOMAIN 或被拦截)</p>
        )}
      </div>

      {item.rules?.length ? (
        <>
          <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">命中规则</p>
          <div className="glass mb-3 rounded-2xl px-4 py-3">
            {item.rules.map((r, i) => (
              <p key={i} className="break-all py-0.5 font-mono text-[12px] text-t2">
                {r.text}
                <span className="ml-2 text-t3">(列表 {r.filter_list_id})</span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        <Button variant="glass" size="md" onClick={copy} className="flex-1">
          <Copy size={15} /> {copied ? '已复制' : '复制域名'}
        </Button>
        {!blocked ? (
          <Button variant="danger" size="md" className="flex-1" onClick={() => onSaveRule(`||${domain}^`, true)}>
            <Ban size={15} /> 拦截此域名
          </Button>
        ) : (
          <Button variant="glass" size="md" className="flex-1" onClick={() => onSaveRule(`@@||${domain}^$important`, false)}>
            <CheckCircle2 size={15} /> 加入白名单
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
