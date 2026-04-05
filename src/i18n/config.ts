import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import ru from './locales/ru.json'

export const LANGUAGES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
}

function detectLng(): string {
  try {
    const stored = localStorage.getItem('gx-lang')
    if (stored && stored in LANGUAGES) return stored
  } catch { /* no localStorage in SSR/test envs */ }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      ru: { translation: ru },
    },
    lng: detectLng(),
    fallbackLng: 'en',
    supportedLngs: Object.keys(LANGUAGES),
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

// Persist language changes to localStorage
i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem('gx-lang', lng) } catch { /* ignore */ }
})

export default i18n
