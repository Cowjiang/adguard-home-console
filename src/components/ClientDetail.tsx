/**
 * 客户端详情视图:移动端(/clients/detail 独立子页)与桌面端(居中弹窗)共用。
 * 信息面对齐官方后台;持久客户端支持 DNS 设置页式内联即时编辑(名称/标识/防护开关,
 * 无独立编辑按钮,行内改动即时保存并刷新列表缓存)。
 */
import { useEffect, useState } from 'react'
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
  return on ? <Badge kind="ok">开启</Badge> : <span className="flex-none text-[13px] text-t3">关闭</span>
}

/** 行内文本编辑行(DNS 设置页模式):点行进入编辑,Enter/保存即时提交,Esc 取消 */
function EditableTextRow({ title, value, placeholder, onSave, extraRight }: {
  title: string
  value: string
  placeholder?: string
  onSave: (v: string) => void
  extraRight?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)

  function commit() {
    const t = v.trim()
    if (!t) return
    setEditing(false)
    if (t !== value) onSave(t)
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
      <button className="press flex-none text-[13px] font-semibold text-accent" onClick={commit}>保存</button>
      <button className="press flex-none text-[13px] text-t3" onClick={() => setEditing(false)}>取消</button>
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
      toast('已保存')
    } catch (e: any) {
      setDraft(prev)
      toast('保存失败:' + e.message, 'err')
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
              ? (independent ? <Badge kind="rewrite">独立设置</Badge> : <Badge kind="info">全局设置</Badge>)
              : <Badge kind="warn">未配置</Badge>}
          </div>
          {name && (
            <p className="num mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-t2">
              <span className="truncate">{ids.join(' · ')}</span>
              <CopyIconButton text={ids[0]} label="IP" />
            </p>
          )}
        </div>
      </div>

      <GroupTitle className="mt-4">基本信息</GroupTitle>
      <Group>
        <Rows>
          {draft ? (
            <>
              <EditableTextRow
                title="名称"
                value={draft.name}
                placeholder="如 我的手机"
                onSave={(v) => saveClient({ name: v })}
              />
              <EditableTextRow
                title="IP / 标识"
                value={draft.ids.join(', ')}
                placeholder="IP / MAC / CIDR,逗号分隔"
                onSave={(v) => saveClient({ ids: v.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean) })}
                extraRight={ids[0] ? <CopyIconButton text={ids[0]} label="IP / 标识" /> : undefined}
              />
            </>
          ) : (
            <Row
              title="IP / 标识"
              subtitle={ids.join(' · ')}
              right={ids[0] ? <CopyIconButton text={ids[0]} label="IP / 标识" /> : undefined}
            />
          )}
          <Row title="来源" value={data.source ?? '–'} />
          <Row
            title="WHOIS"
            subtitle={whoisText || '–'}
            right={whoisText ? <CopyIconButton text={whoisText} label="WHOIS 信息" /> : undefined}
          />
          {draft?.tags && draft.tags.length > 0 && <Row title="标签" subtitle={draft.tags.join(' · ')} />}
        </Rows>
      </Group>

      <GroupTitle className="mt-3">统计</GroupTitle>
      <Group>
        <Rows>
          <Row
            title="近期查询"
            value={queries != null ? fmtCompact(queries) : '–'}
            subtitle={queries != null ? `${fmtNum(queries)} 次` : '统计周期内无该客户端记录'}
          />
          <Row title="查看查询记录" onClick={() => onOpenLog?.(displayName || data.ip || '')} />
        </Rows>
      </Group>

      {draft && (
        <>
          <GroupTitle className="mt-3">防护设置</GroupTitle>
          <Group>
            <Rows>
              <Row
                title="使用全局设置"
                subtitle="关闭后可为该设备单独配置过滤策略"
                right={<Switch on={!independent} onChange={(v) => saveClient({ use_global_settings: v })} />}
              />
              {independent ? (
                <>
                  <Row title="过滤广告与跟踪" right={<Switch on={!!draft.filtering_enabled} onChange={(v) => saveClient({ filtering_enabled: v })} />} />
                  <Row title="浏览安全防护" right={<Switch on={!!draft.safebrowsing_enabled} onChange={(v) => saveClient({ safebrowsing_enabled: v })} />} />
                  <Row title="家长控制" right={<Switch on={!!draft.parental_enabled} onChange={(v) => saveClient({ parental_enabled: v })} />} />
                </>
              ) : (
                <>
                  <Row title="过滤广告与跟踪" right={<OnOff on={!!draft.filtering_enabled} />} />
                  <Row title="浏览安全防护" right={<OnOff on={!!draft.safebrowsing_enabled} />} />
                  <Row title="家长控制" right={<OnOff on={!!draft.parental_enabled} />} />
                </>
              )}
              {(draft.ignore_querylog || draft.ignore_statistics) && (
                <>
                  {draft.ignore_querylog && <Row title="忽略查询日志" right={<Badge kind="warn">已忽略</Badge>} />}
                  {draft.ignore_statistics && <Row title="忽略统计" right={<Badge kind="warn">已忽略</Badge>} />}
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
              删除
            </Button>
          )}
          {!draft && onAdd && (
            <Button size="lg" className="flex-1" onClick={onAdd}>
              添加为持久客户端
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
