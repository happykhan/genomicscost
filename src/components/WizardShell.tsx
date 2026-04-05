import { useNavigate } from 'react-router-dom'
import CostSummary from './CostSummary'
import { useProject } from '../store/ProjectContext'
import { useTranslation } from 'react-i18next'

interface WizardShellProps {
  step: number
  children: React.ReactNode
}

function MobileCostPerSample() {
  const { costs } = useProject()
  return <>${costs.costPerSample.toLocaleString('en-US', { maximumFractionDigits: 0 })}</>
}

export default function WizardShell({ step, children }: WizardShellProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const canBack = step > 1
  const canNext = step < 7

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 lg:pb-6">
      {/* Main layout: content + sidebar */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Wizard content */}
        <div className="flex-1 min-w-0">
          {children}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8 pt-4" style={{ borderTop: '1px solid var(--gx-border)' }}>
            <button
              onClick={() => navigate(`/wizard/${step - 1}`)}
              disabled={!canBack}
              className="px-4 py-2 rounded text-sm font-medium transition-opacity"
              style={{
                background: 'var(--gx-bg-alt)',
                color: 'var(--gx-text)',
                border: '1px solid var(--gx-border)',
                opacity: canBack ? 1 : 0.3,
                cursor: canBack ? 'pointer' : 'not-allowed',
              }}
            >
              {t('btn_back')}
            </button>

            {canNext && (
              <button
                onClick={() => navigate(`/wizard/${step + 1}`)}
                className="px-6 py-2 rounded text-sm font-semibold"
                style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', cursor: 'pointer', border: 'none' }}
              >
                {t('btn_next')}
              </button>
            )}
          </div>
        </div>

        {/* Desktop sidebar cost summary */}
        <div className="hidden lg:block lg:w-72 flex-shrink-0">
          <div className="lg:sticky lg:top-4">
            <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--gx-text-muted)' }}>
              Live cost estimate
            </h3>
            <CostSummary />
          </div>
        </div>
      </div>

      {/* Mobile cost summary bottom bar */}
      <div
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 px-4 py-2 z-10 flex items-center justify-between"
        style={{ background: 'var(--gx-bg-alt)', borderTop: '1px solid var(--gx-border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_cost_per_sample')}</span>
        <span className="font-bold text-lg" style={{ color: 'var(--gx-accent)' }}>
          <MobileCostPerSample />
        </span>
      </div>
    </div>
  )
}
