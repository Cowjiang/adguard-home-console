import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, RefreshCw, Lock, Plus, KeyRound, ArrowRight, Server, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { Button, Card } from '../ui/primitives'
import { ErrorBox, Loading } from '../ui/atoms'
import { api, type Status } from '../../lib/api'
import { newId, labelFromUrl } from '../../lib/session/instances'
import {
  ManagedSessionService,
  type ManagedInstanceMeta,
} from '../../lib/session/managedService'
import { pullRemoteSnapshots } from '../../lib/snapshot/outboxSync'

export type { ManagedInstanceMeta }

/**
 * Mutually exclusive FSM phases for Managed Login.
 * Eliminates arbitrary boolean combinations and ghost UI states.
 */
export type ManagedPhase =
  | { type: 'list' }
  | { type: 'activate'; instance: ManagedInstanceMeta }
  | { type: 'register' }

export default function ManagedLoginView() {
  const { connect } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()

  // Console Server Address
  const [consoleUrl, setConsoleUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }
    return 'http://localhost:3000'
  })

  // FSM Phase state
  const [phase, setPhase] = useState<ManagedPhase>({ type: 'list' })

  // Instances list state
  const [managedInstances, setManagedInstances] = useState<ManagedInstanceMeta[]>([])
  const [fetchingInstances, setFetchingInstances] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Activation phase state
  const [activationPassword, setActivationPassword] = useState('')
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  // Register phase state
  const [regUrl, setRegUrl] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regLabel, setRegLabel] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

  // Auto-fetch managed instances when entering managed view
  useEffect(() => {
    void fetchManagedInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchManagedInstances(customServerUrl?: string) {
    const targetBase = (customServerUrl || consoleUrl).trim().replace(/\/+$/, '')
    setFetchingInstances(true)
    setFetchError(null)
    try {
      const res = await fetch(`${targetBase}/api/managed/instances`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      setManagedInstances(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setFetchError(t('login.fetchFailed', { msg: err?.message || String(err) }))
    } finally {
      setFetchingInstances(false)
    }
  }

  function startActivation(instance: ManagedInstanceMeta) {
    setActivationPassword('')
    setActivationError(null)
    setPhase({ type: 'activate', instance })
  }

  function startRegister() {
    setRegUrl('')
    setRegUsername('')
    setRegPassword('')
    setRegLabel('')
    setRegisterError(null)
    setPhase({ type: 'register' })
  }

  function cancelPhase() {
    setPhase({ type: 'list' })
  }

  async function handleActivateSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (phase.type !== 'activate' || !activationPassword) return
    const currentInstance = phase.instance
    setActivating(true)
    setActivationError(null)
    const cleanServer = consoleUrl.trim().replace(/\/+$/, '')

    try {
      const ok = await connect(
        {
          url: currentInstance.url,
          username: currentInstance.username,
          password: activationPassword,
        },
        {
          id: currentInstance.id,
          label: currentInstance.label,
          managedAction: {
            type: 'set',
            metadata: {
              serverUrl: cleanServer,
              salt: currentInstance.salt,
            },
          },
        }
      )

      if (!ok) {
        setActivationError(t('login.badCredentials'))
        return
      }

      // Locally derive and temporarily cache CryptoKey in memory KeyVault via domain service
      const key = await ManagedSessionService.activateManagedInstance(currentInstance, activationPassword)
      // Eagerly pull remote snapshots in background
      void pullRemoteSnapshots(currentInstance.id, cleanServer, { key, password: activationPassword }).catch(() => {})

      nav('/', { replace: true })
    } catch (err: any) {
      setActivationError(err?.message || t('login.cannotConnect'))
    } finally {
      setActivating(false)
    }
  }

  async function handleRegisterSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (phase.type !== 'register') return
    if (!regUrl.trim() || !regUsername.trim()) return
    setRegistering(true)
    setRegisterError(null)
    const cleanServer = consoleUrl.trim().replace(/\/+$/, '')
    const cleanAghUrl = regUrl.trim().replace(/\/+$/, '')
    const id = newId()
    const label = regLabel.trim() || labelFromUrl(cleanAghUrl)

    try {
      // 1. Verify AGH connection directly
      const s = await api<Status>(
        { url: cleanAghUrl, username: regUsername.trim(), password: regPassword },
        '/status'
      )
      if (!s || !s.version) throw new Error(t('login.notAgh'))

      // 2. Register metadata on console server & cache derived key via ManagedSessionService
      const metadata = await ManagedSessionService.enroll({
        instanceId: id,
        label,
        url: cleanAghUrl,
        username: regUsername.trim(),
        serverUrl: cleanServer,
        password: regPassword,
      })

      // 3. Connect locally and store endpoint in client session
      const ok = await connect(
        { url: cleanAghUrl, username: regUsername.trim(), password: regPassword },
        {
          id,
          label,
          managedAction: { type: 'set', metadata },
        }
      )

      if (!ok) {
        ManagedSessionService.unenroll(id)
        throw new Error(t('login.badCredentials'))
      }

      nav('/', { replace: true })
    } catch (err: any) {
      setRegisterError(err?.message || t('login.cannotConnect'))
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Console server address bar */}
      <div className="glass-strong specular relative rounded-[24px] p-4">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-t2">
            <Globe size={13} /> {t('login.consoleServerAddress')}
          </span>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={consoleUrl}
              onChange={(e) => setConsoleUrl(e.target.value)}
              placeholder="http://192.168.1.100:3000"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="url"
            />
            <Button
              variant="glass"
              size="sm"
              loading={fetchingInstances}
              onClick={() => fetchManagedInstances()}
              className="flex-none px-3"
              label={t('login.fetchInstances')}
            >
              <RefreshCw size={14} className={fetchingInstances ? 'animate-spin' : ''} />
            </Button>
          </div>
        </label>

        {fetchError && (
          <div className="mt-2.5">
            <ErrorBox>{fetchError}</ErrorBox>
          </div>
        )}
      </div>

      {/* ================= PHASE: ACTIVATE ================= */}
      {phase.type === 'activate' && (
        <form
          onSubmit={handleActivateSubmit}
          className="glass-strong specular relative rounded-[26px] p-5 border border-accent/30"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-t1">
              <Lock size={15} className="text-accent" />
              {t('login.activateInstanceTitle')}
            </span>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">
              {phase.instance.label}
            </span>
          </div>

          <p className="mb-3.5 text-[12px] leading-relaxed text-t3">
            {t('login.activateInstanceDesc')}
          </p>

          <div className="mb-3 flex flex-col gap-1 text-[12px] text-t2 bg-white/5 p-2.5 rounded-xl">
            <div>
              <span className="text-t3">URL: </span>
              <span className="font-mono text-t1">{phase.instance.url}</span>
            </div>
            <div>
              <span className="text-t3">User: </span>
              <span className="font-medium text-t1">{phase.instance.username}</span>
            </div>
          </div>

          <label className="block mb-3.5">
            <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-t2">
              <KeyRound size={13} /> {t('login.password')}
            </span>
            <input
              className="field"
              type="password"
              autoFocus
              value={activationPassword}
              onChange={(e) => setActivationPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {activationError && (
            <div className="mb-3">
              <ErrorBox>{activationError}</ErrorBox>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="glass"
              onClick={cancelPhase}
              className="flex-1"
            >
              {t('login.cancel')}
            </Button>
            <Button
              type="submit"
              loading={activating}
              disabled={!activationPassword}
              className="flex-1"
            >
              {t('login.activateAndConnect')} <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      )}

      {/* ================= PHASE: REGISTER ================= */}
      {phase.type === 'register' && (
        <form
          onSubmit={handleRegisterSubmit}
          className="glass-strong specular relative rounded-[26px] p-5 border border-accent/20"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-t1">
              <Plus size={15} className="text-accent" />
              {t('login.registerNewInstance')}
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-t2">
                <Server size={13} /> {t('login.serverAddress')}
              </span>
              <input
                className="field"
                value={regUrl}
                onChange={(e) => setRegUrl(e.target.value)}
                placeholder="http://192.168.1.2:3000"
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="url"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <User size={13} /> {t('login.username')}
                </span>
                <input
                  className="field"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="admin"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-t2">
                  <KeyRound size={13} /> {t('login.password')}
                </span>
                <input
                  className="field"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-t2">
                {t('login.instanceNameOptional')}
              </span>
              <input
                className="field"
                value={regLabel}
                onChange={(e) => setRegLabel(e.target.value)}
                placeholder={t('login.instanceNameOptional')}
                autoCapitalize="off"
              />
            </label>

            {registerError && <ErrorBox>{registerError}</ErrorBox>}

            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                variant="glass"
                onClick={cancelPhase}
                className="flex-1"
              >
                {t('login.cancel')}
              </Button>
              <Button
                type="submit"
                loading={registering}
                disabled={!regUrl.trim() || !regUsername.trim()}
                className="flex-1"
              >
                {t('login.registerAndConnect')} <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* ================= PHASE: LIST ================= */}
      {phase.type === 'list' && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[13px] font-semibold text-t2">
              {t('login.managedInstances')}
            </span>
            <Button
              variant="glass"
              size="sm"
              onClick={startRegister}
              className="h-7 px-2.5 text-[12px]"
            >
              <Plus size={13} /> {t('login.registerNewInstance')}
            </Button>
          </div>

          {fetchingInstances ? (
            <div className="p-8">
              <Loading />
            </div>
          ) : managedInstances.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-[13.5px] font-medium text-t2">
                {t('login.noManagedInstances')}
              </p>
              <Button
                variant="glass"
                size="sm"
                onClick={startRegister}
                className="mt-3.5"
              >
                <Plus size={14} /> {t('login.registerNewInstance')}
              </Button>
            </Card>
          ) : (
            managedInstances.map((inst) => (
              <Card
                key={inst.id}
                onClick={() => startActivation(inst)}
                className="p-3.5 hover:border-accent/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-bold text-t1 truncate">
                        {inst.label}
                      </span>
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">
                        Managed
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-t3 truncate">
                      <span className="truncate">{inst.url}</span>
                      <span>•</span>
                      <span className="font-medium">{inst.username}</span>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-t3 ml-2 flex-none" />
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
