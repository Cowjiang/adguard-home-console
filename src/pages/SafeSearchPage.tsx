/**
 * SafeSearch sub-page (mobile): mobile shows no floating panels, so the
 * switches live on a page. Desktop keeps the centered sheet.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../lib/session/auth'
import { api, swrFetcher } from '../lib/api'
import { PageHeader, Screen } from '../components/ui/primitives'
import { Loading } from '../components/ui/atoms'
import { SafeSearchSheet, SAFE_ENGINES } from '../components/protection/SafeSearchSheet'
import { runMutation } from '../lib/mutation'
import { navBack } from '../lib/nav/backNav'

export function SafeSearchPage() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { data: sb, mutate } = useSWR<any>(
    cfg ? ['sb', cfg, '/safesearch/status'] : null,
    swrFetcher
  )

  if (!sb) {
    return (
      <Screen>
        <PageHeader back title={t('protection.safeSearchRow')} />
        <Loading />
      </Screen>
    )
  }

  const engines: Record<string, boolean> = {}
  for (const e of SAFE_ENGINES) engines[e.key] = !!sb[e.key]
  // SafeSearchSheet owns the toggle state; onChange mirrors the latest values
  // for the save action below
  const latest = { enabled: !!sb.enabled, engines: { ...engines } }

  async function save() {
    if (!cfg) return
    const ok = await runMutation({
      action: () =>
        api(cfg, '/safesearch/settings', {
          method: 'PUT',
          body: { enabled: latest.enabled, ...latest.engines },
        }),
      invalidate: mutate,
      okKey: 'protection.safeSearchSaved',
    })
    if (ok) navBack(nav, pathname)
  }

  return (
    <Screen>
      <PageHeader back title={t('protection.safeSearchRow')} />
      <SafeSearchSheet
        initial={!!sb.enabled}
        engines={engines}
        onChange={(enabled, next) => {
          latest.enabled = enabled
          latest.engines = next
        }}
        onSave={save}
      />
    </Screen>
  )
}
