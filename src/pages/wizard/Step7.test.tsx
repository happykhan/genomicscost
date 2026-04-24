import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config'
import { ProjectProvider } from '../../store/ProjectContext'
import Step8 from './Step8'

// Import config.ts first so the global i18n instance is initialized before components render
void i18n

function renderStep8() {
  return render(
    <MemoryRouter>
      <ProjectProvider>
        <Step8 />
      </ProjectProvider>
    </MemoryRouter>
  )
}

describe('Step8 PDF export', () => {
  beforeEach(async () => {
    vi.stubGlobal('print', vi.fn())
    await i18n.changeLanguage('en')
  })

  it('renders the export PDF button', () => {
    renderStep8()
    expect(screen.getByTestId('print-btn')).toBeTruthy()
  })

  it('calls window.print() when export button is clicked', async () => {
    const user = userEvent.setup()
    renderStep8()
    await user.click(screen.getByTestId('print-btn'))
    expect(window.print).toHaveBeenCalledOnce()
  })

  it('has French translation for export button', () => {
    // Test i18n directly — react-i18next hook in jsdom returns keys on first render
    expect(i18n.t('btn_print', { lng: 'fr' })).toBe('Exporter en PDF (imprimer)')
  })

  it('has Spanish translation for export button', () => {
    expect(i18n.t('btn_print', { lng: 'es' })).toBe('Exportar PDF (imprimir)')
  })
})
