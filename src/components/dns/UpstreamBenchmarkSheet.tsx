/**
 * Upstream DNS latency benchmark sheet:
 * Runs concurrent multi-round RTT measurements, evaluates jitter & status,
 * and surfaces recommendations across single or multiple AGH instances.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCw, Zap, Check, Copy, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../lib/session/auth'
import { Button } from '../ui/primitives'
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

interface UpstreamBenchmarkSheetProps {
  initialUpstreams: string[]
  onApply?: (bestUpstreams: string[]) => void
  onClose: () => void
}

export function UpstreamBenchmarkSheet({
  initialUpstreams,
  onApply,
  onClose,
}: UpstreamBenchmarkSheetProps) {
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
        const targets = availableInstances
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
    onApply?.(best)
    toast(t('advanced.benchmarkApplied'), 'ok')
    onClose()
  }

  function statusBadge(status: UpstreamStatus) {
    switch (status) {
      case 'fast':
        return (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--ok)]" style={{ background: 'var(--ok-soft)' }}>
            {t('advanced.benchmarkFast')}
          </span>
        )
      case 'good':
        return (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-sky-400 bg-sky-400/10">
            {t('advanced.benchmarkGood')}
          </span>
        )
      case 'slow':
        return (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--warn)]" style={{ background: 'var(--warn-soft)' }}>
            {t('advanced.benchmarkSlow')}
          </span>
        )
      case 'poor':
        return (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-orange-400 bg-orange-400/10">
            {t('advanced.benchmarkPoor')}
          </span>
        )
      case 'error':
      default:
        return (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--err)]" style={{ background: 'var(--err-soft)' }}>
            {t('advanced.benchmarkError')}
          </span>
        )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-t2">
        {t('advanced.benchmarkSub')}
      </p>

      {/* Control bar */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          {hasMultipleInstances && (
            <select
              disabled={testing}
              className="field h-8 text-[12px] py-0"
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
            >
              <option value="all">⚡ 全部在线节点 (跨实例对比)</option>
              {availableInstances.map((inst) => {
                const view = instances.find((x) => x.id === inst.id)
                const isDown = view?.online === 'down'
                return (
                  <option key={inst.id} value={inst.id}>
                    {inst.label || inst.id} {isDown ? '(离线)' : ''}
                  </option>
                )
              })}
            </select>
          )}

          {/* Rounds selector */}
          <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: 'var(--glass)' }}>
            <span className="px-2 text-[11.5px] text-t3">{t('advanced.benchmarkRounds')}</span>
            {[1, 3, 5].map((r) => (
              <button
                key={r}
                type="button"
                disabled={testing}
                onClick={() => setRounds(r)}
                className={`h-7 w-7 rounded-md text-[12px] font-medium transition-colors ${
                  rounds === r ? 'bg-white/10 text-t1' : 'text-t3 hover:text-t2'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleStart}
          disabled={testing || !cleanList.length}
          className="h-8 gap-1.5 px-4 text-[12.5px]"
        >
          {testing ? <RotateCw size={13} className="animate-spin" /> : <Play size={13} />}
          {testing ? t('advanced.benchmarkTesting') : t('advanced.benchmarkStart')}
        </Button>
      </div>

      {/* Progress display */}
      {testing && progress && (
        <div className="glass flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[12px] text-t2">
            <span className="truncate">{progress.current ? `正在测试: ${progress.current}` : t('advanced.benchmarkTesting')}</span>
            <span className="num font-medium">
              {progress.completed} / {progress.total} ({Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--glass)' }}>
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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {multiResults.map((m) => {
            const isSelected = activeTab === m.instanceId
            return (
              <button
                key={m.instanceId}
                type="button"
                onClick={() => setActiveTab(m.instanceId)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors ${
                  isSelected
                    ? 'bg-white/15 text-t1 font-semibold shadow-sm'
                    : 'text-t3 hover:text-t2 hover:bg-white/5'
                }`}
              >
                <span>{m.instanceLabel}</span>
                {m.fastestUpstream && (
                  <span className="rounded-full px-1.5 py-0.2 text-[10px] text-[var(--ok)]" style={{ background: 'var(--ok-soft)' }}>
                    {m.results.find((r) => r.upstream === m.fastestUpstream)?.medianLatencyMs}ms
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Recommendation banner */}
      {fastest && !testing && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ok)]/30 p-3.5" style={{ background: 'var(--ok-soft)' }}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'var(--ok)', color: '#000' }}>
              <Zap size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--ok)]">{t('advanced.benchmarkFastest')}</span>
                <span className="num text-[12px] font-bold text-t1">{fastest.medianLatencyMs} ms</span>
              </div>
              <p className="max-w-[260px] truncate text-[13px] font-medium text-t1 sm:max-w-md">
                {fastest.upstream}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyBest}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-t2 hover:bg-white/10"
            >
              <Copy size={12} /> {t('advanced.benchmarkCopyFastest')}
            </button>
            {onApply && (
              <Button variant="glass" onClick={handleApplyBest} className="h-7 gap-1 px-3 text-[12px]">
                <Check size={12} /> {t('advanced.benchmarkApply')}
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
                      <span className="w-16 text-right text-[12px] text-[var(--err)]">Failed</span>
                    )}
                  </div>
                </div>

                {/* Latency & reliability details */}
                <div className="flex items-center gap-3">
                  <div className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--glass)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        background:
                          r.status === 'fast'
                            ? 'var(--ok)'
                            : r.status === 'good'
                            ? '#38bdf8'
                            : r.status === 'slow'
                            ? 'var(--warn)'
                            : 'var(--err)',
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] num text-t3">
                    {r.jitterMs !== undefined && <span>±{r.jitterMs}ms</span>}
                    {r.successRate < 1 && (
                      <span className="text-orange-400 font-semibold">{Math.round(r.successRate * 100)}%</span>
                    )}
                  </div>
                </div>

                {r.errorMessage && (
                  <p className="flex items-center gap-1 text-[11.5px] text-[var(--err)]">
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
            {cleanList.length > 0 ? '点击上方按钮开始测试各上游延迟' : t('common.noData')}
          </div>
        )
      )}
    </div>
  )
}
