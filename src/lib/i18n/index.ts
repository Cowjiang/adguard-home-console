/** i18n init and language state: i18next singleton; zh is the base
 *  dictionary, en is type-isomorphic to it (see locales/) */
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'

export type Lang = 'zh' | 'en'
/** Storage key for the device language preference, shared with index.html's
 *  first-frame bootstrap */
export const LANG_KEY = 'agh.console.lang.v1'

const resources = {
  zh: { translation: zh },
  en: { translation: en },
}

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false
    resources: { translation: typeof zh }
  }
}

/** Explicit setting > system language order match > en fallback; silently
 *  degrades when storage is unavailable (private mode etc.) */
export function resolveLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* storage unavailable: continue with system language matching */ }
  const tags = typeof navigator === 'undefined' ? [] : navigator.languages ?? []
  for (const tag of tags) {
    const t = tag.toLowerCase()
    if (t.startsWith('zh')) return 'zh'
    if (t.startsWith('en')) return 'en'
  }
  return 'en'
}

export const i18n: I18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLang(),
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
})

/** Sync html lang and document title; the first frame is handled by
 *  index.html's inline bootstrap, this covers post-switch and
 *  bootstrap-absent cases */
export function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = i18n.t('common.docTitle')
}

/** Switch language: persist the preference, change the i18next language and
 *  sync document lang and title */
export function setAppLang(lang: Lang): void {
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* storage fails: session only */ }
  void i18n.changeLanguage(lang).then(() => applyDocumentLang(lang))
}

applyDocumentLang(i18n.language === 'en' ? 'en' : 'zh')
