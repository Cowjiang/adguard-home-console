/**
 * Cluster health and latency matrix card for multi-instance environments.
 * Displays real-time RTT latency, core protection states, and version consistency across all instances.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Server, RefreshCw, Shield, ShieldAlert, ArrowRight } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { Card } from '../ui/primitives'
import { Badge } from '../ui/atoms'

export function ClusterHealthCard() {
  const { instances, activeId, switchInstance, probeAll } = useAuth()
  const { t } = useTranslation()
  const [probing, setProbing] = useState(false)

  if (instances.length <= 1) return null

  const onlineCount = instances.filter((i) => i.online === 'ok').length
  const totalCount = instances.length
  const allOnline = onlineCount === totalCount
  // Consistent core protection: all online instances must have protection enabled
  const allProtected = instances
    .filter((i) => i.online === 'ok')
    .every((i) => i.protectionEnabled !== false)

  const isHealthy = allOnline && allProtected

  const handleRefresh = async () => {
    if (probing) return
    setProbing(true)
    try {
      await probeAll(true)
    } finally {
      setProbing(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={17} className="text-accent" />
          <h3 className="text-[15px] font-semibold text-t1">
            {t('dashboard.clusterHealthTitle')}
          </h3>
          <Badge kind={isHealthy ? 'ok' : 'warn'}>
            {isHealthy
              ? t('dashboard.clusterHealthyBadge')
              : t('dashboard.clusterDegradedBadge')}
          </Badge>
        </div>
        <button
          onClick={handleRefresh}
          disabled={probing}
          className="press flex items-center gap-1 text-[12px] font-medium text-t3 hover:text-t1 disabled:opacity-60"
          aria-label={probing ? t('dashboard.probing') : t('dashboard.probeAll')}
        >
          <RefreshCw size={13} className={probing ? 'animate-spin text-accent' : ''} />
          <span>{probing ? t('dashboard.probing') : t('dashboard.probeAll')}</span>
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {instances.map((inst) => {
          const isActive = inst.id === activeId
          const isOk = inst.online === 'ok'
          const latency = inst.latencyMs

          let latencyKind: 'ok' | 'warn' | 'blocked' = 'ok'
          if (!isOk) latencyKind = 'blocked'
          else if (latency && latency >= 300) latencyKind = 'warn'

          return (
            <div
              key={inst.id}
              className={`flex items-center justify-between rounded-xl border p-2.5 transition-colors ${
                isActive
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border-sub bg-bg-card-sub'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 flex-none rounded-full ${
                      isOk ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="truncate text-[13.5px] font-semibold text-t1">
                    {inst.label}
                  </span>
                  {isActive && (
                    <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">
                      {t('dashboard.activeInstance')}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 truncate text-[11px] text-t3 num">
                  <span className="truncate">{inst.url}</span>
                  {inst.version && <span>· {inst.version}</span>}
                </div>

                {isOk && inst.protectionEnabled !== undefined && (
                  <div className="mt-1 flex items-center gap-1 text-[11px]">
                    {inst.protectionEnabled ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <Shield size={11} />
                        <span>{t('dashboard.protectionOn')}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <ShieldAlert size={11} />
                        <span>{t('dashboard.protectionOff')}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-none items-center gap-2 pl-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold num ${
                    latencyKind === 'ok'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : latencyKind === 'warn'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {isOk
                    ? latency !== undefined
                      ? `${latency} ms`
                      : '-'
                    : t('dashboard.offline')}
                </span>

                {!isActive && (
                  <button
                    onClick={() => switchInstance(inst.id)}
                    className="press flex h-8 w-8 items-center justify-center rounded-lg text-t3 hover:bg-bg-card-sub hover:text-accent"
                    title={t('dashboard.switchInstance')}
                    aria-label={t('dashboard.switchInstance')}
                  >
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
