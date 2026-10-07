/** SafeSearch sheet content: master switch + per-engine toggles. Engine list is
 *  shared with the Protection page's rows and save actions */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch, Button } from '../ui/primitives'

export const SAFE_ENGINES = [
  { key: 'google', label: 'Google' },
  { key: 'bing', label: 'Bing' },
  { key: 'duckduckgo', label: 'DuckDuckGo' },
  { key: 'yandex', label: 'Yandex' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'pixabay', label: 'Pixabay' },
  { key: 'ecosia', label: 'Ecosia' },
] as const

export function SafeSearchSheet({
  initial, engines, onChange, onSave,
}: {
  initial: boolean
  engines: Record<string, boolean>
  onChange: (enabled: boolean, engines: Record<string, boolean>) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(initial)
  const [eng, setEng] = useState({ ...engines })
  return (
    <div>
      <div className="glass mb-3 flex items-center justify-between rounded-2xl px-4 py-3">
        <span className="text-[15px] font-medium text-t1">{t('protection.safeSearchEnable')}</span>
        <Switch
          on={enabled}
          onChange={(v) => {
            setEnabled(v)
            onChange(v, eng)
          }}
        />
      </div>
      <p className="mb-1.5 px-2 text-[12.5px] font-semibold text-t3">{t('protection.safeSearchEngines')}</p>
      <div className="glass mb-4 rounded-2xl px-4">
        {SAFE_ENGINES.map((e, i) => (
          <div key={e.key}>
            {i > 0 && <div className="h-px" style={{ background: 'var(--glass-border)' }} />}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[14.5px] text-t1">{e.label}</span>
              <Switch
                on={eng[e.key]}
                onChange={(v) => {
                  const next = { ...eng, [e.key]: v }
                  setEng(next)
                  onChange(enabled, next)
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <Button className="w-full" size="lg" onClick={onSave}>
        {t('common.save')}
      </Button>
    </div>
  )
}
