/** General settings: query log / stats retention and ignored domains */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig } from '../../lib/api'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row, Switch, Button } from '../../components/ui/primitives'
import { toast } from '../../components/ui/toast'
import { Loading } from '../../components/ui/atoms'
import { usePick, PickSelect } from '../../components/ui/menu'
import { isAppleMobile } from '../../lib/native/shell'
import { hoursLabel } from '../../lib/format'

/* ================= General settings ================= */

export function GeneralSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const { data: ql, mutate: mQl, isLoading: qlLoading } = useSWR<QueryLogConfig>(cfg ? ['qlc', cfg, '/querylog/config'] : null, swrFetcher)
  const { data: sc, mutate: mSc, isLoading: scLoading } = useSWR<StatsConfig>(cfg ? ['stc', cfg, '/stats/config'] : null, swrFetcher)
  // 与 DNS 设置页一致的「草稿 + 页头保存」：所有行编辑本地草稿，右上角出现
  // 保存按钮时才整体下发；被忽略的域名在保存时按行拆分、trim、去空行并去重
  const [qlDraft, setQlDraft] = useState<QueryLogConfig | null>(null)
  const [scDraft, setScDraft] = useState<StatsConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ql && qlDraft === null) setQlDraft(structuredClone(ql))
  }, [ql, qlDraft])
  useEffect(() => {
    if (sc && scDraft === null) setScDraft(structuredClone(sc))
  }, [sc, scDraft])

  const setQl = (patch: Partial<QueryLogConfig>) => setQlDraft((s) => (s ? { ...s, ...patch } : s))
  const setSc = (patch: Partial<StatsConfig>) => setScDraft((s) => (s ? { ...s, ...patch } : s))
  const normList = (s: string) => [...new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))]
  const qlDirty = !!qlDraft && !!ql && JSON.stringify(qlDraft) !== JSON.stringify(ql)
  const scDirty = !!scDraft && !!sc && JSON.stringify(scDraft) !== JSON.stringify(sc)
  const dirty = qlDirty || scDirty

  // Newer v0.107.79 API: interval is in ms (GET returns 604800000 = 7 days)
  const HOUR = 3_600_000
  const DAY = 86_400_000
  // Retention labels use hoursLabel directly (units dictionary), consistent with the
  // formatted output
  const QL_RETENTIONS = [6, 24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * HOUR }))
  const STAT_RETENTIONS = [24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * DAY }))

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      // 等 refetch 拿到服务端新值再回填草稿：先置 null 会立即用旧数据重填，
      // 之后数据更新不再同步，dirty 永远清不掉
      if (qlDirty && qlDraft) {
        await api(cfg, '/querylog/config/update', { method: 'PUT', body: { ...qlDraft, ignored: normList(qlDraft.ignored.join('\n')) } })
        const fresh = await mQl()
        setQlDraft(fresh ? structuredClone(fresh) : null)
      }
      if (scDirty && scDraft) {
        await api(cfg, '/stats/config/update', { method: 'PUT', body: { ...scDraft, ignored: normList(scDraft.ignored.join('\n')) } })
        const fresh = await mSc()
        setScDraft(fresh ? structuredClone(fresh) : null)
      }
      toast(t('settings.generalSaved'))
    } catch (e: any) {
      toast(t('common.saveFailed', { msg: e.message }), 'err')
    } finally {
      setSaving(false)
    }
  }

  if (qlLoading || scLoading || !qlDraft || !scDraft) {
    return <Screen><PageHeader back title={t('settings.itemQueryStats')} /><Loading /></Screen>
  }

  return (
    <Screen>
      <PageHeader back title={t('settings.itemQueryStats')} right={
        dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined
      } />

      <div className="grid gap-x-4 lg:grid-cols-2 lg:items-start">
        <div>
          <GroupTitle>{t('settings.queryLogGroup')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('settings.enableQueryLog')}
            subtitle={t('settings.enableQueryLogSub')}
            right={<Switch on={qlDraft.enabled} onChange={(v) => setQl({ enabled: v })} />}
          />
          <Row
            title={t('settings.logRetention')}
            value={isAppleMobile() ? undefined : hoursLabel(qlDraft.interval / HOUR)}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={qlDraft.interval}
                  options={QL_RETENTIONS}
                  onPick={(v) => setQl({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.logRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: qlDraft.interval,
                options: QL_RETENTIONS,
                onPick: (v) => setQl({ interval: v }),
              })
            }}
          />
          <Row
            title={t('settings.anonymizeIp')}
            subtitle={t('settings.anonymizeIpSub')}
            right={<Switch on={qlDraft.anonymize_client_ip} onChange={(v) => setQl({ anonymize_client_ip: v })} />}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubQl')}
            right={<Switch on={qlDraft.ignored_enabled} onChange={(v) => setQl({ ignored_enabled: v })} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={qlDraft.ignored.join('\n')}
              onChange={(e) => setQl({ ignored: e.target.value.split('\n') })}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>
        </div>
        <div>
          <GroupTitle>{t('settings.statsGroupTitle')}</GroupTitle>
          <Group>
        <Rows>
          <Row
            title={t('settings.enableStats')}
            subtitle={t('settings.enableStatsSub')}
            right={<Switch on={scDraft.enabled} onChange={(v) => setSc({ enabled: v })} />}
          />
          <Row
            title={t('settings.statsRetention')}
            value={isAppleMobile() ? undefined : hoursLabel(scDraft.interval / HOUR)}
            right={isAppleMobile() ? (
              <div className="w-28 flex-none">
                <PickSelect
                  className="field num !py-1.5 !pr-8 text-right"
                  value={scDraft.interval}
                  options={STAT_RETENTIONS}
                  onPick={(v) => setSc({ interval: v })}
                />
              </div>
            ) : undefined}
            onClick={isAppleMobile() ? undefined : (e) => {
              pick({
                title: t('settings.statsRetention'),
                anchor: e.currentTarget,
                align: 'right',
                value: scDraft.interval,
                options: STAT_RETENTIONS,
                onPick: (v) => setSc({ interval: v }),
              })
            }}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubStats')}
            right={<Switch on={scDraft.ignored_enabled} onChange={(v) => setSc({ ignored_enabled: v })} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={scDraft.ignored.join('\n')}
              onChange={(e) => setSc({ ignored: e.target.value.split('\n') })}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>
        </div>
      </div>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        {t('settings.retentionHint')}
      </p>
    </Screen>
  )
}

