/** Log in / connect to a server: Direct Mode vs Managed Mode */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTauriInvoke } from '../lib/native/shell'
import {
  ShieldCheck,
  Server,
  User,
  KeyRound,
  ArrowRight,
  RefreshCw,
  Plus,
  Lock,
  Globe,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/session/auth'
import { Button, Card, Segmented } from '../components/ui/primitives'
import { ErrorBox, Loading } from '../components/ui/atoms'
import { Ambient } from '../components/layout/Layout'
import { APP_NAME } from '../lib/constants'
import { api, type Status } from '../lib/api'
import {
  base64ToUint8Array,
  deriveMasterKey,
  generateSalt,
  uint8ArrayToBase64,
} from '../lib/crypto/e2ee'
import { setSessionKey } from '../lib/crypto/keyVault'
import { newId, labelFromUrl } from '../lib/session/instances'

export interface ManagedInstanceMeta {
  id: string
  label: string
  url: string
  username: string
  salt: string
  syncedAt?: string
}

export default function Login() {
  const { connect, connecting, error } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()

  // Mode: direct vs managed
  const [mode, setMode] = useState<'direct' | 'managed'>('direct')

  // Direct mode state
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Managed mode state
  const [consoleUrl, setConsoleUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }
    return 'http://localhost:3000'
  })
  const [managedInstances, setManagedInstances] = useState<ManagedInstanceMeta[]>([])
  const [fetchingInstances, setFetchingInstances] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Activation dialog state for managed instance
  const [activatingInstance, setActivatingInstance] = useState<ManagedInstanceMeta | null>(null)
  const [activationPassword, setActivationPassword] = useState('')
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  // Register new managed instance dialog state
  const [showRegister, setShowRegister] = useState(false)
  const [regUrl, setRegUrl] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regLabel, setRegLabel] = useState('')
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        if (d?.defaultUrl) setUrl((u) => u || d.defaultUrl)
      })
      .catch(() => {})
  }, [])

  // Tauri shell debug helper: debug builds pre-fill connection info from env vars
  useEffect(() => {
    const invoke = getTauriInvoke()
    if (!invoke) return
    invoke('get_debug_login')
      .then((d) => {
        const cfg = d as { url?: string; username?: string; password?: string } | null
        if (!cfg?.url || !cfg?.username) return
        setUrl(cfg.url)
        setUsername(cfg.username)
        setPassword(cfg.password || '')
      })
      .catch(() => {})
  }, [])

  // Auto-fetch managed instances when entering managed mode or consoleUrl changes
  useEffect(() => {
    if (mode === 'managed') {
      void fetchManagedInstances()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
      if (Array.isArray(data)) {
        setManagedInstances(data)
      } else {
        setManagedInstances([])
      }
    } catch (err: any) {
      setFetchError(t('login.fetchFailed', { msg: err?.message || String(err) }))
    } finally {
      setFetchingInstances(false)
    }
  }

  async function submitDirect(e?: FormEvent) {
    e?.preventDefault()
    if (!url.trim() || !username.trim()) return
    const ok = await connect({ url: url.trim(), username: username.trim(), password })
    if (ok) nav('/', { replace: true })
  }

  async function handleActivateSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!activatingInstance || !activationPassword) return
    setActivating(true)
    setActivationError(null)
    const cleanServer = consoleUrl.trim().replace(/\/+$/, '')
    try {
      const ok = await connect(
        {
          url: activatingInstance.url,
          username: activatingInstance.username,
          password: activationPassword,
        },
        {
          id: activatingInstance.id,
          label: activatingInstance.label,
          managed: {
            serverUrl: cleanServer,
            salt: activatingInstance.salt,
          },
        }
      )
      if (!ok) {
        setActivationError(t('login.badCredentials'))
        return
      }

      // Locally derive and temporarily cache CryptoKey in memory (never sent to server!)
      const saltBytes = base64ToUint8Array(activatingInstance.salt)
      const key = await deriveMasterKey(activationPassword, saltBytes)
      setSessionKey(activatingInstance.id, key)

      nav('/', { replace: true })
    } catch (err: any) {
      setActivationError(err?.message || t('login.cannotConnect'))
    } finally {
      setActivating(false)
    }
  }

  async function handleRegisterSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!regUrl.trim() || !regUsername.trim()) return
    setRegistering(true)
    setRegisterError(null)
    const cleanServer = consoleUrl.trim().replace(/\/+$/, '')
    const cleanAghUrl = regUrl.trim().replace(/\/+$/, '')
    const id = newId()
    const label = regLabel.trim() || labelFromUrl(cleanAghUrl)
    const saltBytes = generateSalt()
    const salt = uint8ArrayToBase64(saltBytes)

    try {
      // 1. Verify AGH connection directly
      const s = await api<Status>(
        { url: cleanAghUrl, username: regUsername.trim(), password: regPassword },
        '/status'
      )
      if (!s || !s.version) throw new Error(t('login.notAgh'))

      // 2. Register metadata on console server (STRICT REDLINE: NO password!)
      const res = await fetch(`${cleanServer}/api/managed/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          label,
          url: cleanAghUrl,
          username: regUsername.trim(),
          salt,
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Server registration failed HTTP ${res.status}: ${errText}`)
      }

      // 3. Connect locally and store endpoint in client browser
      const ok = await connect(
        { url: cleanAghUrl, username: regUsername.trim(), password: regPassword },
        {
          id,
          label,
          managed: { serverUrl: cleanServer, salt },
        }
      )

      if (!ok) {
        throw new Error(t('login.badCredentials'))
      }

      // 4. Derive and temporarily cache master key
      const key = await deriveMasterKey(regPassword, saltBytes)
      setSessionKey(id, key)

      nav('/', { replace: true })
    } catch (err: any) {
      setRegisterError(err?.message || t('login.cannotConnect'))
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <Ambient />
      <div className="rise-in w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="specular relative mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-[24px]"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, transparent), color-mix(in srgb, var(--accent-2) 80%, transparent))',
              boxShadow:
                '0 18px 44px -12px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.35)',
            }}
          >
            <ShieldCheck size={38} className="text-white" />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-t1">{APP_NAME}</h1>
        </div>

        {/* Dual Mode Switcher */}
        <div className="mb-4 flex justify-center">
          <Segmented
            size="sm"
            fit
            value={mode}
            onChange={(m) => {
              setMode(m)
              setActivatingInstance(null)
              setShowRegister(false)
            }}
            options={[
              { value: 'direct', label: t('login.directMode') },
              { value: 'managed', label: t('login.managedMode') },
            ]}
          />
        </div>

        {/* ================= DIRECT MODE ================= */}
        {mode === 'direct' && (
          <form onSubmit={submitDirect} className="glass-strong specular relative rounded-[26px] p-5">
            <div className="flex flex-col gap-3.5">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-t2">
                  <Server size={13} /> {t('login.serverAddress')}
                </span>
                <input
                  className="field"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://192.168.1.2:3000"
                  autoCapitalize="off"
                  autoCorrect="off"
                  inputMode="url"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-t2">
                  <User size={13} /> {t('login.username')}
                </span>
                <input
                  className="field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-t2">
                  <KeyRound size={13} /> {t('login.password')}
                </span>
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {error && <ErrorBox>{error}</ErrorBox>}

              <Button
                type="submit"
                size="lg"
                loading={connecting}
                disabled={!url.trim() || !username.trim()}
                className="mt-1 w-full"
              >
                {t('login.connect')} <ArrowRight size={17} />
              </Button>
            </div>
          </form>
        )}

        {/* ================= MANAGED MODE ================= */}
        {mode === 'managed' && (
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

              {fetchError && <div className="mt-2.5"><ErrorBox>{fetchError}</ErrorBox></div>}
            </div>

            {/* Instance Activation Dialog / Card */}
            {activatingInstance && (
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
                    {activatingInstance.label}
                  </span>
                </div>

                <p className="mb-3.5 text-[12px] leading-relaxed text-t3">
                  {t('login.activateInstanceDesc')}
                </p>

                <div className="mb-3 flex flex-col gap-1 text-[12px] text-t2 bg-white/5 p-2.5 rounded-xl">
                  <div>
                    <span className="text-t3">URL: </span>
                    <span className="font-mono text-t1">{activatingInstance.url}</span>
                  </div>
                  <div>
                    <span className="text-t3">User: </span>
                    <span className="font-medium text-t1">{activatingInstance.username}</span>
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

                {activationError && <div className="mb-3"><ErrorBox>{activationError}</ErrorBox></div>}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="glass"
                    onClick={() => {
                      setActivatingInstance(null)
                      setActivationPassword('')
                      setActivationError(null)
                    }}
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

            {/* Register New Managed Instance Form */}
            {showRegister && !activatingInstance && (
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

                <div className="flex flex-col gap-3">
                  <input
                    className="field"
                    value={regUrl}
                    onChange={(e) => setRegUrl(e.target.value)}
                    placeholder="http://192.168.1.2:3000"
                    autoCapitalize="off"
                    autoCorrect="off"
                    inputMode="url"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="field"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder={t('login.username')}
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                    <input
                      className="field"
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder={t('login.password')}
                    />
                  </div>
                  <input
                    className="field"
                    value={regLabel}
                    onChange={(e) => setRegLabel(e.target.value)}
                    placeholder={t('login.instanceNameOptional')}
                    autoCapitalize="off"
                  />

                  {registerError && <ErrorBox>{registerError}</ErrorBox>}

                  <div className="flex gap-2 mt-1">
                    <Button
                      type="button"
                      variant="glass"
                      onClick={() => setShowRegister(false)}
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

            {/* Managed Instances List */}
            {!activatingInstance && !showRegister && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[13px] font-semibold text-t2">
                    {t('login.managedInstances')}
                  </span>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => setShowRegister(true)}
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
                      onClick={() => setShowRegister(true)}
                      className="mt-3.5"
                    >
                      <Plus size={14} /> {t('login.registerNewInstance')}
                    </Button>
                  </Card>
                ) : (
                  managedInstances.map((inst) => (
                    <Card
                      key={inst.id}
                      onClick={() => {
                        setActivatingInstance(inst)
                        setActivationPassword('')
                        setActivationError(null)
                      }}
                      className="p-3.5 hover:border-accent/40 transition-colors"
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
        )}

        <p className="mt-5 text-center text-[12px] leading-relaxed text-t3">
          {t('login.credentialNote')}
          <br />
          {t('login.versionNote')}
        </p>
      </div>
    </div>
  )
}
