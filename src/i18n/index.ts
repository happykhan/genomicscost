import { createContext, useContext, useState, createElement } from 'react'
import type { ReactNode } from 'react'
import en from './translations/en'
import ru from './translations/ru'
import es from './translations/es'
import fr from './translations/fr'
import tr from './translations/tr'

export const LANGUAGES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  tr: 'Türkçe',
}

type LangCode = keyof typeof LANGUAGES

const TRANSLATIONS: Record<LangCode, Record<string, string>> = { en, ru, es, fr, tr }

const STORAGE_KEY = 'gx-lang'

function detectLang(): LangCode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && stored in LANGUAGES) return stored as LangCode
  return 'en'
}

interface I18nContextValue {
  t: (key: string) => string
  lang: LangCode
  setLang: (lang: LangCode) => void
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => key,
  lang: 'en',
  setLang: () => {},
})

interface LanguageProviderProps {
  children: ReactNode
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [lang, setLangState] = useState<LangCode>(detectLang)

  function setLang(newLang: LangCode) {
    setLangState(newLang)
    localStorage.setItem(STORAGE_KEY, newLang)
  }

  function t(key: string): string {
    return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key
  }

  return createElement(I18nContext.Provider, { value: { t, lang, setLang } }, children)
}

export function useTranslation() {
  return useContext(I18nContext)
}
