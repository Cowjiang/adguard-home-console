/**
 * 客户端详情视图:移动端(/clients/detail 独立子页)与桌面端(居中弹窗)共用。
 * 信息面对齐官方后台;持久客户端支持 DNS 设置页式内联即时编辑(名称/标识/防护开关,
 * 无独立编辑按钮,行内改动即时保存并刷新列表缓存)。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR, { useSWRConfig } from 'swr'
import { Laptop, Pencil, Smartphone, UserRound } from 'lucide-react'
import { api, swrFetcher, type AghClient, type Stats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtCompact, fmtNum } from '../lib/format'
import { Badge, Button, CopyIconButton, Group, GroupTitle, Row, Rows, Switch, toast } from './ui'

export interface ClientDetailData {
  ip?: string
  name?: string
  source?: string
  whois?: Record<string, string>
  /** 命中持久客户端时带出完整配置 */
  persistent?: AghClient
}

/** top_clients 的键可能是 "name" / "IP" / "name|IP",按候选键取近期请求次数(列表页共用) */
export function kvCount(map: Stats['top_clients'] | undefined, keys: (string | undefined)[]): number | undefined {
  if (!map) return undefined
  const want = keys.filter((x): x is string => !!x)
  let total: number | undefined
  for (const o of Array.isArray(map) ? map : [map]) {
    for (const k in o) {
      if (want.includes(k) || want.includes(k.split('|')[0])) total = (total ?? 0) + o[k]
    }
  }
  return total
}

/** on/off 指示:开启为绿色徽标,关闭为灰色文字(全局设置下的只读展示) */
function OnOff({ on }: { on: boolean }) {
  const { t } = useTranslation()
  return on ? <Badge kind="ok">{t('clients.onBadge')}</Badge> : <span className="flex-none text-[13px] text-t3">{t('clients.offText')}</span>
}

/** 行内文本编辑行(DNS 设置页模式):点行进入编辑,Enter/保存即时提交,Esc 取消 */
function EditableTextRow({ title, value, placeholder, onSave, extraRight }: {
  title: string
  value: string
  placeholder?: string
  onSave: (v: string) => void
  extraRight?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)

  function commit() {
    const next = v.trim()
    if (!next) return
    setEditing(false)
    if (next !== value) onSave(next)
  }

  if (!editing) {
    return (
      <Row
        title={title}
        subtitle={value || placeholder}
        onClick={() => { setV(value); setEditing(true) }}
        right={
          <span className="flex flex-none items-center gap-2.5">
            {extraRight}
            <Pencil size={14} className="text-t3" />
          </span>
        }
      />
    )
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <input
        className="field min-w-0 flex-1"
        value={v}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <button className="press flex-none text-[13px] font-semibold text-accent" onClick={commit}>{t('common.save')}</button>
      <button className="press flex-none text-[13px] text-t3" onClick={() => setEditing(false)}>{t('common.cancel')}</button>
    </div>
  )
}

export function ClientDetail({ data, onDelete, onAdd, onOpenLog }: {
  data: ClientDetailData
  onDelete?: () => void
  onAdd?: () => void
  /** 跳转查询日志;由调用方注入 nav——桌面弹窗经 SheetProvider 渲染在 Router 之外 */
  onOpenLog?: (key: string) => void
}) {
  const { t } = useTranslation()
  const { cfg } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()
  const c = data.persistent
  const w = data.whois ?? {}
  const name = c?.name ?? data.name ?? ''
  const ids = c?.ids ?? (data.ip ? [data.ip] : [])
  const whoisText = [w.country, w.city, w.orgname].filter(Boolean).join(' · ')
  const { data: stats } = useSWR<Stats>(cfg ? ['stats', cfg, '/stats'] : null, swrFetcher)
  const queries = kvCount(stats?.top_clients, [data.ip, data.name, ...ids])

  // 本地镜像配置:乐观更新开关/文本,保存失败回滚(桌面弹窗内容不随列表重渲,需自持状态)
  const [draft, setDraft] = useState<AghClient | undefined>(c)
  useEffect(() => setDraft(c), [c])
  const displayName = draft?.name ?? name

  const icon = /phone|mobile|iphone|android|pad/i.test(displayName)
    ? <Smartphone size={19} />
    : c ? <Laptop size={19} /> : <UserRound size={19} />

  /** DNS 设置页式即时保存:更新持久客户端并刷新列表缓存;乐观更新,失败回滚 */
  async function saveClient(patch: Partial<AghClient>) {
    if (!cfg || !draft) return
    const prev = draft
    setDraft({ ...draft, ...patch })
    try {
      await api(cfg, '/clients/update', { method: 'POST', body: { name: prev.name, data: { ...prev, ...patch } } })
      globalMutate(['clients', cfg, '/clients'])
      toast(t('common.saved'))
    } catch (e: any) {
      setDraft(prev)
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    }
  }

  const independent = !!draft && draft.use_global_settings === false

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[17px] font-bold text-t1">{displayName || data.ip}</span>
            {draft
              ? (independent ? <Badge kind="rewrite">{t('clients.independentBadge')}</Badge> : <Badge kind="info">{t('clients.globalBadge')}</Badge>)
              : <Badge kind="warn">{t('clients.unsetBadge')}</Badge>}
          </div>
          {name && (
            <p className="num mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-t2">
              <span className="truncate">{ids.join(' · ')}</span>
              <CopyIconButton text={ids[0]} label="IP" />
            </p>
          )}
        </div>
      </div>

      <GroupTitle className="mt-4">{t('clients.basicInfo')}</GroupTitle>
      <Group>
        <Rows>
          {draft ? (
            <>
              <EditableTextRow
                title={t('clients.name')}
                value={draft.name}
                placeholder={t('clients.detailNamePlaceholder')}
                onSave={(v) => saveClient({ name: v })}
              />
              <EditableTextRow
                title={t('clients.ids')}
                value={draft.ids.join(', ')}
                placeholder={t('clients.idsPlaceholder')}
                onSave={(v) => saveClient({ ids: v.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean) })}
                extraRight={ids[0] ? <CopyIconButton text={ids[0]} label={t('clients.ids')} /> : undefined}
              />
            </>
          ) : (
            <Row
              title={t('clients.ids')}
              subtitle={ids.join(' · ')}
              right={ids[0] ? <CopyIconButton text={ids[0]} label={t('clients.ids')} /> : undefined}
            />
          )}
          <Row title={t('clients.source')} value={data.source ?? '–'} />
          <Row
            title="WHOIS"
            subtitle={whoisText || '–'}
            right={whoisText ? <CopyIconButton text={whoisText} label={t('clients.whois')} /> : undefined}
          />
          {draft?.tags && draft.tags.length > 0 && <Row title={t('clients.tags')} subtitle={draft.tags.join(' · ')} />}
        </Rows>
      </Group>

      <GroupTitle className="mt-3">{t('clients.statsGroup')}</GroupTitle>
      <Group>
        <Rows>
          <Row
            title={t('clients.recentQueries')}
            value={queries != null ? fmtCompact(queries) : '–'}
            subtitle={queries != null ? t('clients.times', { n: fmtNum(queries) }) : t('clients.noClientStats')}
          />
          <Row title={t('clients.openLog')} onClick={() => onOpenLog?.(displayName || data.ip || '')} />
        </Rows>
      </Group>

      {draft && (
        <>
          <GroupTitle className="mt-3">{t('clients.protectionGroup')}</GroupTitle>
          <Group>
            <Rows>
              <Row
                title={t('clients.useGlobal')}
                subtitle={t('clients.useGlobalSub')}
                right={<Switch on={!independent} onChange={(v) => saveClient({ use_global_settings: v })} />}
              />
              {independent ? (
                <>
                  <Row title={t('clients.filterLabel')} right={<Switch on={!!draft.filtering_enabled} onChange={(v) => saveClient({ filtering_enabled: v })} />} />
                  <Row title={t('clients.safeBrowsingLabel')} right={<Switch on={!!draft.safebrowsing_enabled} onChange={(v) => saveClient({ safebrowsing_enabled: v })} />} />
                  <Row title={t('clients.parentalLabel')} right={<Switch on={!!draft.parental_enabled} onChange={(v) => saveClient({ parental_enabled: v })} />} />
                </>
              ) : (
                <>
                  <Row title={t('clients.filterLabel')} right={<OnOff on={!!draft.filtering_enabled} />} />
                  <Row title={t('clients.safeBrowsingLabel')} right={<OnOff on={!!draft.safebrowsing_enabled} />} />
                  <Row title={t('clients.parentalLabel')} right={<OnOff on={!!draft.parental_enabled} />} />
                </>
              )}
              {(draft.ignore_querylog || draft.ignore_statistics) && (
                <>
                  {draft.ignore_querylog && <Row title={t('clients.ignoreQuerylog')} right={<Badge kind="warn">{t('clients.ignoredBadge')}</Badge>} />}
                  {draft.ignore_statistics && <Row title={t('clients.ignoreStats')} right={<Badge kind="warn">{t('clients.ignoredBadge')}</Badge>} />}
                </>
              )}
            </Rows>
          </Group>
        </>
      )}

      {(draft ? onDelete : onAdd) && (
        <div className="mt-4 flex gap-2.5">
          {draft && onDelete && (
            <Button variant="glass" size="lg" className="flex-1 !text-danger" onClick={onDelete}>
              {t('common.delete')}
            </Button>
          )}
          {!draft && onAdd && (
            <Button size="lg" className="flex-1" onClick={onAdd}>
              {t('clients.addPersistent')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
