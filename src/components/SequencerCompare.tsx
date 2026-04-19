import { useTranslation } from 'react-i18next'
import { fmt, fmtCurrency } from '../lib/format'
import type { Project } from '../types'

interface Props {
  project: Project
}

export default function SequencerCompare({ project }: Props) {
  const { t } = useTranslation()
  const { sequencers } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

  const enabled = sequencers.filter(s => s.enabled)
  if (enabled.length < 2) return null

  const rows: Array<{ label: string; values: (string | number)[] }> = [
    {
      label: t('label_platform'),
      values: enabled.map(s => s.platformId),
    },
    {
      label: t('field_reagent_kit'),
      values: enabled.map(s => s.reagentKitName || '—'),
    },
    {
      label: t('field_lib_prep_kit'),
      values: enabled.map(s => s.libPrepKitName || '—'),
    },
    {
      label: t('field_samples_per_run'),
      values: enabled.map(s => s.samplesPerRun),
    },
    {
      label: t('label_runs_per_yr'),
      values: enabled.map(s => {
        if (s.samplesPerRun <= 0 || samplesPerYear <= 0) return '—'
        const runsNeeded = Math.ceil(samplesPerYear / s.samplesPerRun)
        return runsNeeded
      }),
    },
    {
      label: t('label_reagent_kit_cost_per_run'),
      values: enabled.map(s => `$${fmt(s.reagentKitPrice)}`),
    },
    {
      label: t('label_lib_prep_cost_per_sample'),
      values: enabled.map(s => `$${fmtCurrency(s.libPrepCostPerSample, 2)}`),
    },
    {
      label: t('field_coverage'),
      values: enabled.map(s => s.captureAll ? t('opt_capture_all_display') : `${s.coverageX}×`),
    },
  ]

  const labelCol = enabled.map(s => s.label || t('label_sequencer_n', { n: enabled.indexOf(s) + 1 }))

  return (
    <div className="card p-4">
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--gx-text)', marginBottom: 8, lineHeight: 1.3 }}>
        {t('chart_sequencer_compare')}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--gx-border)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--gx-text-muted)', fontWeight: 500, width: '40%' }}>
              </th>
              {labelCol.map((lbl, i) => (
                <th key={i} style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--gx-accent)', fontWeight: 700 }}>
                  {lbl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                <td style={{ padding: '4px 8px', color: 'var(--gx-text-muted)' }}>{row.label}</td>
                {row.values.map((val, vi) => (
                  <td key={vi} style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--gx-text)', fontWeight: 500 }}>
                    {String(val)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
