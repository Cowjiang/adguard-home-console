/** i18n 初始化与语言状态:i18next 单例;zh 为基准词典,en 与其类型同构(见 locales/) */
import i18next, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'

export type Lang = 'zh' | 'en'
/** 本机语言偏好存储键,与 index.html 首帧引导共用 */
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

/** 显式设置 > 系统语言顺序匹配 > zh 兜底;存储不可用(隐私模式等)时静默回退 */
export function resolveLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* 存储不可用时继续按系统语言匹配 */ }
  const tags = typeof navigator === 'undefined' ? [] : navigator.languages ?? []
  for (const tag of tags) {
    const t = tag.toLowerCase()
    if (t.startsWith('zh')) return 'zh'
    if (t.startsWith('en')) return 'en'
  }
  return 'zh'
}

export const i18n: I18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLang(),
  fallbackLng: 'zh',
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
})

/** 同步 html lang 与文档标题;首帧由 index.html 内联引导负责,这里负责切换后与引导缺席的场合 */
export function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = i18n.t('common.docTitle')
}

/** 切换语言:写本机偏好、换 i18next 语言并同步文档语言与标题 */
export function setAppLang(lang: Lang): void {
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* 存储不可用时仅切换当前会话 */ }
  void i18n.changeLanguage(lang).then(() => applyDocumentLang(lang))
}

applyDocumentLang(i18n.language === 'en' ? 'en' : 'zh')
