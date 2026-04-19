import { useProject } from '../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { fmt } from '../lib/format'

export default function CostSummary() {
  const { costs } = useProject()
  const { t } = useTranslation()

  // Equipment depreciation excluded — capital cost shown separately as establishment cost
  const rows = [
    { label: t('label_sequencing_reagents'), value: costs.sequencingReagents },
    { label: t('label_library_prep'), value: costs.libraryPrep },
    { label: t('label_consumables'), value: costs.consumables },
    { label: t('label_personnel'), value: costs.personnel },
    { label: t('label_training'), value: costs.training },
    { label: t('label_facility'), value: costs.facility },
    { label: t('label_transport'), value: costs.transport },
    { label: t('label_bioinformatics'), value: costs.bioinformatics },
    { label: t('label_qms'), value: costs.qms },
  ].filter(r => r.value > 0)

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg p-4 text-center"
        style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ opacity: 0.8 }}>
          {t('label_cost_per_sample')}
        </div>
        <div className="text-3xl font-bold">
          ${fmt(costs.costPerSample)}
        </div>
      </div>

      <div className="card p-3 flex flex-col gap-1">
        {rows.map(row => (
          <div key={row.label} className="flex justify-between items-center text-sm py-1" style={{ borderBottom: '1px solid var(--gx-border)' }}>
            <span style={{ color: 'var(--gx-text-muted)' }}>{row.label}</span>
            <span className="font-medium">${fmt(row.value)}</span>
          </div>
        ))}
        <div className="flex justify-between items-center text-sm pt-2 font-semibold">
          <span>{t('label_total_annual')}</span>
          <span>${fmt(costs.total)}</span>
        </div>
      </div>

      {costs.establishmentCost > 0 && (
        <div className="card p-3 text-sm" style={{ border: '1px solid var(--gx-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gx-text-muted)' }}>
            {t('label_establishment')}
          </div>
          <div className="font-semibold">${fmt(costs.establishmentCost)}</div>
        </div>
      )}
    </div>
  )
}
