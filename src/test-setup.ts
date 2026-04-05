import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Ensure DOM is cleaned up between tests
afterEach(() => {
  cleanup()
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
