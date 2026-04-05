import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import { ProjectProvider } from '../../store/ProjectContext'
import Step7 from './Step7'

function renderStep7() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ProjectProvider>
          <Step7 />
        </ProjectProvider>
      </LanguageProvider>
    </MemoryRouter>
  )
}

describe('Step7 PDF export', () => {
  beforeEach(() => {
    vi.stubGlobal('print', vi.fn())
  })

  it('renders the export PDF button', () => {
    renderStep7()
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeTruthy()
  })

  it('calls window.print() when export button is clicked', async () => {
    const user = userEvent.setup()
    renderStep7()
    const btn = screen.getByRole('button', { name: /export pdf/i })
    await user.click(btn)
    expect(window.print).toHaveBeenCalledOnce()
  })

  it('renders export button in French', () => {
    localStorage.setItem('gx-lang', 'fr')
    renderStep7()
    // French: 'Exporter en PDF (imprimer)'
    expect(screen.getByRole('button', { name: /exporter en pdf/i })).toBeTruthy()
  })

  it('renders export button in Spanish', () => {
    localStorage.setItem('gx-lang', 'es')
    renderStep7()
    // Spanish: 'Exportar PDF (imprimir)'
    expect(screen.getByRole('button', { name: /exportar pdf/i })).toBeTruthy()
  })
})
