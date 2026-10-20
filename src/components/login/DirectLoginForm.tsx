import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Server, User, KeyRound, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { Button } from '../ui/primitives'
import { ErrorBox } from '../ui/atoms'
import { getTauriInvoke } from '../../lib/native/shell'

/**
 * Direct Mode login form: server URL, username, password.
 * Supports Tauri shell debug autofill and `/api/config` default URL prefill.
 */
export default function DirectLoginForm() {
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

  async function submitDirect(e?: FormEvent) {
    e?.preventDefault()
    if (!url.trim() || !username.trim()) return
    const ok = await connect({ url: url.trim(), username: username.trim(), password })
    if (ok) nav('/', { replace: true })
  }

  return (
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
  )
}
