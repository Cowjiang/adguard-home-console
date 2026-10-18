/**
 * Upstream DNS benchmark sub-page (mobile). The benchmark displays measurement
 * results, i.e. browsing content, so on mobile it gets a full page while
 * desktop keeps the centered sheet (see docs/web-interaction.md).
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useAuth } from '../../lib/session/auth'
import { swrFetcher, type DnsInfo } from '../../lib/api'
import { PageHeader, Screen } from '../../components/ui/primitives'
import { Loading } from '../../components/ui/atoms'
import { UpstreamBenchmark } from '../../components/dns/UpstreamBenchmark'
import { markBenchmarkApply } from '../../lib/dns/benchmarkIntent'
import { navBack } from '../../lib/nav/backNav'

export function DnsBenchmarkPage() {
  const { cfg } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { data } = useSWR<DnsInfo>(cfg ? ['dns', cfg, '/dns_info'] : null, swrFetcher)

  return (
    <Screen>
      <PageHeader back title={t('advanced.benchmarkTitle')} />
      {data ? (
        <UpstreamBenchmark
          initialUpstreams={data.upstream_dns ?? []}
          onApply={(bestUpstreams) => markBenchmarkApply(bestUpstreams)}
          onClose={() => navBack(nav, pathname)}
        />
      ) : (
        <Loading />
      )}
    </Screen>
  )
}
