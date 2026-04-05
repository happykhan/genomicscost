import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import i18n from './i18n/config'

// Ensure DOM is cleaned up between tests
afterEach(() => {
  cleanup()
})

// Reset language to English before each suite
beforeAll(() => {
  i18n.changeLanguage('en')
})

// Expose localStorage as a global in vitest's jsdom environment
Object.defineProperty(globalThis, 'localStorage', {
  value: (() => {
    let store: Record<string, string> = {}
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
    }
  })(),
  writable: true,
})
