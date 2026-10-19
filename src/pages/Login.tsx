/** Log in / connect to a server: Direct Mode vs Managed Mode */
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '../components/ui/primitives'
import { Ambient } from '../components/layout/Layout'
import { APP_NAME } from '../lib/constants'
import DirectLoginForm from '../components/login/DirectLoginForm'
import ManagedLoginView from '../components/login/ManagedLoginView'

export type { ManagedInstanceMeta } from '../lib/session/managedService'

export default function Login() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'direct' | 'managed'>('direct')

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
            onChange={setMode}
            options={[
              { value: 'direct', label: t('login.directMode') },
              { value: 'managed', label: t('login.managedMode') },
            ]}
          />
        </div>

        {/* Dynamic Mode Form */}
        {mode === 'direct' ? <DirectLoginForm /> : <ManagedLoginView />}

        <p className="mt-5 text-center text-[12px] leading-relaxed text-t3">
          {t('login.credentialNote')}
          <br />
          {t('login.versionNote')}
        </p>
      </div>
    </div>
  )
}
