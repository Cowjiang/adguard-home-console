/**
 * Upstream DNS latency benchmark: concurrent multi-round RTT measurements,
 * jitter & status evaluation, recommendations across single or multiple AGH
 * instances. Shared by the desktop centered sheet and the mobile
 * /settings/dns/benchmark sub-page (browsing content stays out of mobile
 * overlays, see docs/web-interaction.md).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCw, Zap, Check, Copy, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { Badge, Chip } from '../ui/atoms'
import { Button, Segmented } from '../ui/primitives'
import { toast } from '../ui/toast'
import { copyText } from '../../lib/clipboard'
import {
  benchmarkUpstreams,
  benchmarkMultiInstance,
  toBenchmarkTarget,
  type UpstreamBenchmarkResult,
  type InstanceBenchmarkResult,
  type UpstreamStatus,
} from '../../lib/dns/benchmark'

interface UpstreamBenchmarkProps {
  initialUpstreams: string[]
  onApply?: (bestUpstreams: string[]) => void
  onClose: () => void
}

export function UpstreamBenchmark({
  initialUpstreams,
  onApply,
  onClose,
}: UpstreamBenchmarkProps) {
  const { t } = useTranslation()
  const { cfg, store, activeId, instances } = useAuth()

  const [rounds, setRounds] = useState<number>(3)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(activeId || 'current')
  const [testing, setTesting] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number; current?: string } | null>(null)
  const [results, setResults] = useState<UpstreamBenchmarkResult[]>([])
  const [multiResults, setMultiResults] = useState<InstanceBenchmarkResult[]>([])
  const [activeTab, setActiveTab] = useState<string>('all')

  const availableInstances = store?.instances ?? []
  const hasMultipleInstances = availableInstances.length > 1

  const cleanList = initialUpstreams.map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))

  async function handleStart() {
    if (!cleanList.length) {
      toast(t('common.noData'), 'err')
      return
    }

    setTesting(true)
    setProgress({ completed: 0, total: cleanList.length * rounds })

    try {
      if (hasMultipleInstances && selectedInstanceId === 'all') {
        const onlineInstances = availableInstances.filter((inst) => {
          const view = instances.find((x) => x.id === inst.id)
          return view?.online !== 'down'
        })

        if (!onlineInstances.length) {
          toast(t('common.noData'), 'err')
          setTesting(false)
          return
        }

        const targets = onlineInstances
          .map((inst) => toBenchmarkTarget(inst))
          .filter((tgt): tgt is NonNullable<typeof tgt> => tgt !== null)

        const multi = await benchmarkMultiInstance(targets, cleanList, {
          rounds,
          onProgress: (completed, total, current) => {
            setProgress({ completed, total, current })
          },
        })
        setMultiResults(multi)
        // Default to the first instance's results or empty
        if (multi.length > 0) {
          setResults(multi[0].results)
          setActiveTab(multi[0].instanceId)
        }
      } else {
        // Benchmark specific instance or current active cfg
        let targetCfg = cfg
        if (selectedInstanceId !== 'current' && selectedInstanceId !== activeId) {
          const inst = availableInstances.find((i) => i.id === selectedInstanceId)
          if (inst) {
            const tgt = toBenchmarkTarget(inst)
            if (tgt) targetCfg = tgt.cfg
          }
        }

        if (!targetCfg) {
          toast(t('common.opFailed', { msg: '' }), 'err')
          setTesting(false)
          return
        }

        const res = await benchmarkUpstreams(targetCfg, cleanList, {
          rounds,
          onProgress: (completed, total, current) => {
            setProgress({ completed, total, current })
          },
        })
        setResults(res)
        setMultiResults([])
      }
      toast(t('advanced.testAllOk'), 'ok')
    } catch (err: any) {
      toast(err?.message || t('common.testFailed', { msg: '' }), 'err')
    } finally {
      setTesting(false)
      setProgress(null)
    }
  }

  // Active results depending on tab
  const activeResults =
    multiResults.length > 0
      ? multiResults.find((m) => m.instanceId === activeTab)?.results ?? results
      : results

  const validUpstreams = activeResults.filter((r) => r.status !== 'error')
  const fastest = validUpstreams.length > 0 ? validUpstreams[0] : null
  const maxLatency = Math.max(1, ...validUpstreams.map((r) => r.medianLatencyMs ?? 0))

  async function handleCopyBest() {
    const best = validUpstreams.slice(0, 3).map((r) => r.upstream)
    if (!best.length) return
    const ok = await copyText(best.join('\n'))
    if (ok) toast(t('advanced.benchmarkCopied'), 'ok')
  }

  function handleApplyBest() {
    const best = validUpstreams.slice(0, 4).map((r) => r.upstream)
    if (!best.length) return
    // Safely preserve domain-routing rules (e.g. [/example.com/]10.0.0.1) and comment lines
    const preserved = initialUpstreams.filter((line) => {
      const s = line.trim()
      return s.startsWith('#') || s.startsWith('[/')
    })
    const merged = [...preserved, ...best]
    onApply?.(merged)
    toast(t('advanced.benchmarkApplied'), 'ok')
    onClose()
  }

  function statusBadge(status: UpstreamStatus) {
    // fast → ok, good → info (accent-2), slow → warn; poor / error share the danger tone
    const meta: Record<
      UpstreamStatus,
      {
        kind: 'ok' | 'info' | 'warn' | 'blocked'
        labelKey:
          | 'advanced.benchmarkFast'
          | 'advanced.benchmarkGood'
          | 'advanced.benchmarkSlow'
          | 'advanced.benchmarkPoor'
          | 'advanced.benchmarkError'
      }
    > = {
      fast: { kind: 'ok', labelKey: 'advanced.benchmarkFast' },
      good: { kind: 'info', labelKey: 'advanced.benchmarkGood' },
      slow: { kind: 'warn', labelKey: 'advanced.benchmarkSlow' },
      poor: { kind: 'blocked', labelKey: 'advanced.benchmarkPoor' },
      error: { kind: 'blocked', labelKey: 'advanced.benchmarkError' },
    }
    const m = meta[status]
    return <Badge kind={m.kind}>{t(m.labelKey)}</Badge>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-t2">
        {t('advanced.benchmarkSub')}
      </p>

      {/* Control bar */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          {hasMultipleInstances && (
            <select
              disabled={testing}
              className="field !h-9 !w-auto !py-0 !pr-8 text-[12px]"
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
            >
              <option value="all">⚡ {t('advanced.benchmarkAllOnlineNodes')}</option>
              {availableInstances.map((inst) => {
                const view = instances.find((x) => x.id === inst.id)
                const isDown = view?.online === 'down'
                return (
                  <option key={inst.id} value={inst.id}>
                    {inst.label || inst.id} {isDown ? t('advanced.benchmarkOffline') : ''}
                  </option>
                )
              })}
            </select>
          )}

          {/* Rounds selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-t3">{t('advanced.benchmarkRounds')}</span>
            <Segmented
              size="sm"
              fit
              value={String(rounds)}
              onChange={(v) => setRounds(Number(v))}
              options={[1, 3, 5].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        </div>

        <Button
          onClick={handleStart}
          disabled={testing || !cleanList.length}
          className="h-9 gap-1.5 px-4 text-[13px]"
        >
          {testing ? <RotateCw size={13} className="animate-spin" /> : <Play size={13} />}
          {testing ? t('advanced.benchmarkTesting') : t('advanced.benchmarkStart')}
        </Button>
      </div>

      {/* Progress display */}
      {testing && progress && (
        <div className="glass flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[12px] text-t2">
            <span className="truncate">
              {progress.current
                ? t('advanced.benchmarkTestingCurrent', { current: progress.current })
                : t('advanced.benchmarkTesting')}
            </span>
            <span className="num font-medium">
              {progress.completed} / {progress.total} ({Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--glass-border)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(progress.completed / Math.max(1, progress.total)) * 100}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      {/* Multi-instance tab selector */}
      {multiResults.length > 0 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
          {multiResults.map((m) => {
            const fastestMs = m.results.find((r) => r.upstream === m.fastestUpstream)?.medianLatencyMs
            return (
              <Chip
                key={m.instanceId}
                active={activeTab === m.instanceId}
                onClick={() => setActiveTab(m.instanceId)}
              >
                <span className="flex items-center gap-1.5">
                  <span>{m.instanceLabel}</span>
                  {fastestMs !== undefined && (
                    <span className="num text-[10px] font-semibold" style={{ color: 'var(--ok)' }}>
                      {fastestMs}ms
                    </span>
                  )}
                </span>
              </Chip>
            )
          })}
        </div>
      )}

      {/* Recommendation banner */}
      {fastest && !testing && (
        <div
          className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5"
          style={{
            background: 'var(--ok-soft)',
            border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)',
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px]"
              style={{ background: 'var(--ok)', color: 'var(--bg)' }}
            >
              <Zap size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold" style={{ color: 'var(--ok)' }}>
                  {t('advanced.benchmarkFastest')}
                </span>
                <span className="num text-[12px] font-bold text-t1">{fastest.medianLatencyMs} ms</span>
              </div>
              <p className="max-w-[260px] truncate text-[13px] font-medium text-t1 sm:max-w-md">
                {fastest.upstream}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" onClick={handleCopyBest}>
              <Copy size={13} /> {t('advanced.benchmarkCopyFastest')}
            </Button>
            {onApply && (
              <Button size="sm" onClick={handleApplyBest}>
                <Check size={13} /> {t('advanced.benchmarkApply')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Results list */}
      {activeResults.length > 0 ? (
        <div className="glass flex max-h-[380px] flex-col gap-1 overflow-y-auto rounded-2xl p-2">
          {activeResults.map((r, idx) => {
            const rtt = r.medianLatencyMs
            const barWidth = rtt ? Math.min(100, Math.max(6, Math.round((rtt / maxLatency) * 100))) : 0

            return (
              <div
                key={r.upstream}
                className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="num text-[11px] font-semibold text-t3">#{idx + 1}</span>
                    <span className="truncate text-[13px] font-medium text-t1">{r.upstream}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    {rtt !== undefined ? (
                      <span className="num w-16 text-right text-[13px] font-bold text-t1">{rtt} ms</span>
                    ) : (
                      <span className="w-16 text-right text-[12px] text-danger">{t('advanced.benchmarkFailed')}</span>
                    )}
                  </div>
                </div>

                {/* Latency & reliability details */}
                <div className="flex items-center gap-3">
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass-border)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        background:
                          r.status === 'fast'
                            ? 'var(--ok)'
                            : r.status === 'good'
                            ? 'var(--accent-2)'
                            : r.status === 'slow'
                            ? 'var(--warn)'
                            : 'var(--danger)',
                      }}
                    />
                  </div>
                  <div className="num flex items-center gap-2 text-[11px] text-t3">
                    {r.jitterMs !== undefined && <span>±{r.jitterMs}ms</span>}
                    {r.successRate < 1 && (
                      <span className="text-warn font-semibold">{Math.round(r.successRate * 100)}%</span>
                    )}
                  </div>
                </div>

                {r.errorMessage && (
                  <p className="text-danger flex items-center gap-1 text-[11.5px]">
                    <AlertTriangle size={11} /> {r.errorMessage}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        !testing && (
          <div className="py-8 text-center text-[13px] text-t3">
            {cleanList.length > 0 ? t('advanced.benchmarkPromptStart') : t('common.noData')}
          </div>
        )
      )}
    </div>
  )
}
