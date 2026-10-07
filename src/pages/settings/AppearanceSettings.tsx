/** Appearance: theme, language */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../lib/session/auth'
import { PageHeader, Screen, Group, GroupTitle, Rows, Row } from '../../components/ui/primitives'
import { usePick, PickSelect } from '../../components/ui/menu'
import { setAppLang, getLangSetting, type LangSetting } from '../../lib/i18n'
import { isAppleMobile } from '../../lib/native/shell'

/* ================= Appearance ================= */

export function AppearanceSettings() {
  const { theme, setTheme } = useAuth()
  const { t } = useTranslation()
  const pick = usePick()
  const apple = isAppleMobile()
  // Local state drives the language row value; picking may not change
  // i18n.language (auto can resolve to the already-active language)
  const [lang, setLang] = useState<LangSetting>(getLangSetting)
  const themeOptions = [
    { value: 'auto' as const, label: t('settings.themeAuto') },
    { value: 'light' as const, label: t('settings.themeLight') },
    { value: 'dark' as const, label: t('settings.themeDark') },
  ]
  const langOptions: { label: string; value: LangSetting }[] = [
    { value: 'auto', label: t('settings.langAuto') },
    // Language names are shown in their own language (Chinese / English), never
    // translated with the UI language
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ]
  const applyLang = (v: LangSetting) => {
    setAppLang(v)
    setLang(v)
  }
  const themeLabel = themeOptions.find((o) => o.value === theme)?.label
  const langLabel = langOptions.find((o) => o.value === lang)?.label
  // Apple mobile gets a real native <select> in the row (PickSelect); desktop
  // opens the anchored dropdown from the row itself
  const pickRow = <T extends string>(opts: {
    title: string
    value: T
    valueLabel?: string
    options: { label: string; value: T }[]
    onPick: (v: T) => void
    last?: boolean
  }) => (
    <Row
      title={opts.title}
      value={apple ? undefined : opts.valueLabel}
      right={apple ? (
        <div className="w-28 flex-none">
          <PickSelect
            className="field num !py-1.5 !pr-8 text-right"
            ariaLabel={opts.title}
            value={opts.value}
            options={opts.options}
            onPick={opts.onPick}
          />
        </div>
      ) : undefined}
      onClick={apple ? undefined : (e) => {
        pick({
          title: opts.title,
          anchor: e.currentTarget,
          align: 'right',
          value: opts.value,
          options: opts.options,
          onPick: opts.onPick,
        })
      }}
      last={opts.last}
    />
  )

  return (
    <Screen>
      <PageHeader back title={t('settings.appearance')} />

      <GroupTitle>{t('settings.appearance')}</GroupTitle>
      <Group>
        <Rows>
          {pickRow({
            title: t('settings.appTheme'),
            value: theme,
            valueLabel: themeLabel,
            options: themeOptions,
            onPick: setTheme,
          })}
          {pickRow({
            title: t('settings.language'),
            value: lang,
            valueLabel: langLabel,
            options: langOptions,
            onPick: applyLang,
            last: true,
          })}
        </Rows>
      </Group>
    </Screen>
  )
}

