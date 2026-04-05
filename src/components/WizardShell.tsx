import { useNavigate } from 'react-router-dom'
import CostSummary from './CostSummary'
import { useProject } from '../store/ProjectContext'
import { useTranslation } from '../i18n'

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

  const STEPS = [
    { n: 1, label: t('step1_label') },
    { n: 2, label: t('step2_label') },
    { n: 3, label: t('step3_label') },
    { n: 4, label: t('step4_label') },
    { n: 5, label: t('step5_label') },
    { n: 6, label: t('step6_label') },
    { n: 7, label: t('step7_label') },
  ]

  const canBack = step > 1
  const canNext = step < 7

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20 lg:pb-6">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <button
                onClick={() => navigate(`/wizard/${s.n}`)}
                className="flex flex-col items-center gap-1 flex-1"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                  style={{
                    background: s.n === step
                      ? 'var(--gx-accent)'
                      : s.n < step
                        ? 'var(--gx-accent)'
                        : 'var(--gx-bg-alt)',
                    color: s.n <= step ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                    border: `2px solid ${s.n <= step ? 'transparent' : 'var(--gx-border)'}`,
                    opacity: s.n < step ? 0.7 : 1,
                  }}
                >
                  {s.n < step ? '✓' : s.n}
                </div>
                <span
                  className="text-xs hidden sm:block"
                  style={{ color: s.n === step ? 'var(--gx-accent)' : 'var(--gx-text-muted)' }}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className="h-0.5 w-4 sm:w-6 flex-shrink-0"
                  style={{ background: s.n < step ? 'var(--gx-accent)' : 'var(--gx-border)' }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

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
        className="lg:hidden fixed bottom-0 left-0 right-0 px-4 py-2 z-10 flex items-center justify-between"
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
