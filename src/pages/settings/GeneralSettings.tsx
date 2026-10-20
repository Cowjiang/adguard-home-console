/** General settings: query log / stats retention and ignored domains */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../../lib/session/auth'
import { api, swrFetcher, type QueryLogConfig, type StatsConfig } from '../../lib/api'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row, Switch, Button } from '../../components/ui/primitives'
import { Loading } from '../../components/ui/atoms'
import { usePick, PickSelect } from '../../components/ui/menu'
import { isAppleMobile } from '../../lib/native/shell'
import { hoursLabel } from '../../lib/format'
import { runMutation } from '../../lib/mutation'
import { useDraftForm } from '../../lib/useDraftForm'

/* ================= General settings ================= */

export function GeneralSettings() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const { data: qlData, mutate: mQl, isLoading: qlLoading } = useSWR<QueryLogConfig>(cfg ? ['qlc', cfg, '/querylog/config'] : null, swrFetcher)
  const { data: scData, mutate: mSc, isLoading: scLoading } = useSWR<StatsConfig>(cfg ? ['stc', cfg, '/stats/config'] : null, swrFetcher)
  // Same draft + header-save idiom as the DNS page (useDraftForm): rows edit a
  // local draft and the save button appears once dirty; ignored domains are
  // split per line, trimmed and deduped on save
  const [saving, setSaving] = useState(false)
  const ql = useDraftForm(qlData)
  const sc = useDraftForm(scData)
  const dirty = ql.dirty || sc.dirty

  const normList = (s: string) => [...new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))]

  // Newer v0.107.79 API: interval is in ms (GET returns 604800000 = 7 days)
  const HOUR = 3_600_000
  const DAY = 86_400_000
  // Retention labels use hoursLabel directly (units dictionary), consistent with the
  // formatted output
  const QL_RETENTIONS = [6, 24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * HOUR }))
  const STAT_RETENTIONS = [24, 168, 720, 2160].map((h) => ({ label: hoursLabel(h), value: h * DAY }))

  async function save() {
    if (!cfg) return
    await runMutation({
      action: async () => {
        // Refetch before refilling each draft: the server copy becomes its
        // dirty baseline, so a successful save clears the button
        if (ql.dirty && ql.draft) {
          await api(cfg, '/querylog/config/update', { method: 'PUT', body: { ...ql.draft, ignored: normList((ql.draft.ignored ?? []).join('\n')) } })
          ql.reset(await mQl())
        }
        if (sc.dirty && sc.draft) {
          await api(cfg, '/stats/config/update', { method: 'PUT', body: { ...sc.draft, ignored: normList((sc.draft.ignored ?? []).join('\n')) } })
          sc.reset(await mSc())
        }
      },
      okKey: 'settings.generalSaved',
      setBusy: setSaving,
    })
  }

  if (qlLoading || scLoading || !ql.draft || !sc.draft) {
    return <Screen><PageHeader back title={t('settings.itemQueryStats')} /><Loading /></Screen>
  }
  const qlDraft = ql.draft
  const scDraft = sc.draft

  return (
    <Screen>
      <PageHeader back title={t('settings.itemQueryStats')} right={
        dirty ? <Button size="header" loading={saving} onClick={save} native={{ label: t('common.save'), foreground: 'accent' }}>{t('common.save')}</Button> : undefined
      } />

      <GroupTitle>{t('settings.queryLogGroup')}</GroupTitle>
      <Group>
        <Rows>
          <Row
            title={t('settings.enableQueryLog')}
            subtitle={t('settings.enableQueryLogSub')}
            right={<Switch on={qlDraft.enabled} onChange={(v) => ql.patch('enabled', v)} />}
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
                  onPick={(v) => ql.patch('interval', v)}
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
                onPick: (v) => ql.patch('interval', v),
              })
            }}
          />
          <Row
            title={t('settings.anonymizeIp')}
            subtitle={t('settings.anonymizeIpSub')}
            right={<Switch on={qlDraft.anonymize_client_ip} onChange={(v) => ql.patch('anonymize_client_ip', v)} />}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubQl')}
            right={<Switch on={qlDraft.ignored_enabled} onChange={(v) => ql.patch('ignored_enabled', v)} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={(qlDraft.ignored ?? []).join('\n')}
              onChange={(e) => ql.patch('ignored', e.target.value.split('\n'))}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>

      <GroupTitle>{t('settings.statsGroupTitle')}</GroupTitle>
      <Group>
        <Rows>
          <Row
            title={t('settings.enableStats')}
            subtitle={t('settings.enableStatsSub')}
            right={<Switch on={scDraft.enabled} onChange={(v) => sc.patch('enabled', v)} />}
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
                  onPick={(v) => sc.patch('interval', v)}
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
                onPick: (v) => sc.patch('interval', v),
              })
            }}
          />
          <Row
            title={t('settings.ignoredDomains')}
            subtitle={t('settings.ignoredDomainsSubStats')}
            right={<Switch on={scDraft.ignored_enabled} onChange={(v) => sc.patch('ignored_enabled', v)} />}
          />
          <div className="px-4 pb-4 pt-2">
            <textarea
              className="field"
              value={(scDraft.ignored ?? []).join('\n')}
              onChange={(e) => sc.patch('ignored', e.target.value.split('\n'))}
              placeholder={t('settings.ignoredDomainsPlaceholder')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </Rows>
      </Group>

      <p className="mt-4 px-2 text-[12px] leading-relaxed text-t3">
        {t('settings.retentionHint')}
      </p>
    </Screen>
  )
}
