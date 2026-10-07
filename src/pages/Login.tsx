/** Log in / connect to a server */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTauriInvoke } from '../lib/native/shell'
import { ShieldCheck, Server, User, KeyRound, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../lib/session/auth'
import { Button, ErrorBox } from '../components/ui'
import { Ambient } from '../components/Layout'
import { APP_NAME } from '../lib/constants'

export default function Login() {
  const { connect, connecting, error } = useAuth()
  const { t } = useTranslation()
  const nav = useNavigate()
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        if (d?.defaultUrl) setUrl((u) => u || d.defaultUrl)
      })
      .catch(() => {})
  }, [])

  // Tauri shell debug helper: debug builds pre-fill connection info from env vars
  // (auto-connect is handled by the App-level DebugAutoLogin, avoiding a navigate after
  // this component unmounts); the release shell always returns null
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!url.trim() || !username.trim()) return
    const ok = await connect({ url: url.trim(), username: username.trim(), password })
    if (ok) nav('/', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <Ambient />
      <div className="rise-in w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="specular relative mb-4 flex h-[76px] w-[76px] items-center justify-center rounded-[24px]"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, transparent), color-mix(in srgb, var(--accent-2) 80%, transparent))',
              boxShadow: '0 18px 44px -12px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,.35)',
            }}
          >
            <ShieldCheck size={38} className="text-white" />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-t1">{APP_NAME}</h1>
        </div>

        <form onSubmit={submit} className="glass-strong specular relative rounded-[26px] p-5">
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

            <Button type="submit" size="lg" loading={connecting} disabled={!url.trim() || !username.trim()} className="mt-1 w-full">
              {t('login.connect')} <ArrowRight size={17} />
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-t3">
          {t('login.credentialNote')}
          <br />
          {t('login.versionNote')}
        </p>
      </div>
    </div>
  )
}
