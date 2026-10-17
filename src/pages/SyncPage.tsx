/**
 * Sync-to-other-instances sub-page (mobile): mobile shows no floating panels
 * at all, so the target picker + confirm live on a page (desktop keeps the
 * centered sheet). Reached from the blacklist / allowlist / rules / rewrites /
 * clients pages.
 */
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../lib/session/auth'
import { swrFetcher, type ClientsData, type FilteringStatus } from '../lib/api'
import { PageHeader, Screen } from '../components/ui/primitives'
import { Loading } from '../components/ui/atoms'
import { SyncForm } from '../components/protection/SyncForm'
import {
  syncClientsToInstances,
  syncFilterListsToInstances,
  syncRewritesToInstances,
  syncUserRulesToInstances,
  type SyncExecutionSummary,
} from '../lib/session/rulesSync'
import type { Instance } from '../lib/session/instances'
import { navBack } from '../lib/nav/backNav'

/** Deep-link fallback when the page is opened with an empty history stack */
const FALLBACK: Record<string, string> = {
  filters: '/protection/filters',
  allowlist: '/protection/allowlist',
  rules: '/protection/rules',
  rewrites: '/rewrites',
  clients: '/clients',
}

export function SyncPage() {
  const { type = 'filters' } = useParams()
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { pathname } = useLocation()

  const filtering = useSWR<FilteringStatus>(
    cfg && ['filters', 'allowlist', 'rules'].includes(type)
      ? ['filtering', cfg, '/filtering/status']
      : null,
    swrFetcher
  )
  const rewrites = useSWR<any[]>(
    cfg && type === 'rewrites' ? ['rw', cfg, '/rewrite/list'] : null,
    swrFetcher
  )
  const clients = useSWR<ClientsData>(
    cfg && type === 'clients' ? ['clients', cfg, '/clients'] : null,
    swrFetcher
  )

  const loaded = filtering.data || rewrites.data || clients.data
  if (!loaded) {
    return (
      <Screen>
        <PageHeader back title={t('filters.syncModalTitle')} />
        <Loading />
      </Screen>
    )
  }

  const blacklist = filtering.data?.filters ?? []
  const allowlist = filtering.data?.whitelist_filters ?? []
  const rules = (filtering.data?.user_rules ?? []).map((r) => r.trim()).filter(Boolean)
  const rwList = Array.isArray(rewrites.data) ? rewrites.data : []
  const clientList = clients.data?.clients ?? []

  const specs: Record<
    string,
    { count: number; label: string; run: (targets: Instance[]) => Promise<SyncExecutionSummary> }
  > = {
    filters: {
      count: blacklist.length,
      label: t('filters.blacklistTitle'),
      run: (targets) => syncFilterListsToInstances(targets, blacklist, []),
    },
    allowlist: {
      count: allowlist.length,
      label: t('filters.whitelistTitle'),
      run: (targets) => syncFilterListsToInstances(targets, [], allowlist),
    },
    rules: {
      count: rules.length,
      label: t('protection.customRulesRow'),
      run: (targets) => syncUserRulesToInstances(targets, rules),
    },
    rewrites: {
      count: rwList.length,
      label: t('protection.rewritesRow'),
      run: (targets) => syncRewritesToInstances(targets, rwList),
    },
    clients: {
      count: clientList.length,
      label: t('clients.title'),
      run: (targets) => syncClientsToInstances(targets, clientList),
    },
  }
  const spec = specs[type] ?? specs.filters

  function close() {
    const idx = (window.history?.state as { idx?: number } | null)?.idx
    if (idx !== undefined && idx <= 0) {
      nav(FALLBACK[type] ?? '/protection', { replace: true })
      return
    }
    navBack(nav, pathname)
  }

  return (
    <Screen>
      <PageHeader back title={t('filters.syncModalTitle')} />
      <SyncForm itemCount={spec.count} itemTypeLabel={spec.label} onSync={spec.run} onClose={close} />
    </Screen>
  )
}
