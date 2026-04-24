import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { getEffectiveCatalogue } from '../../lib/catalogue'
import { fmt } from '../../lib/format'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

const WORKFLOW_KEYS: Record<string, string> = {
  sample_receipt: 'wf_sample_receipt',
  nucleic_acid_extraction: 'wf_nucleic_acid_extraction',
  pcr_testing: 'wf_pcr_testing',
  general_lab: 'wf_general_lab',
  null: 'wf_other',
}

// Keywords that indicate a viral-specific reagent
const VIRAL_KEYWORDS = ['viral transport', 'vtm', 'rna extraction', 'rt-pcr']

function isViralReagent(name: string): boolean {
  const lower = name.toLowerCase()
  return VIRAL_KEYWORDS.some(kw => lower.includes(kw))
}

export default function Step3() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const catalogue = getEffectiveCatalogue()
  const { consumables } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

  // Determine if all pathogens are bacterial
  const allBacterial = project.pathogens.length > 0 &&
    project.pathogens.every(p => p.pathogenType === 'bacterial')

  function updateConsumable(index: number, patch: Partial<typeof consumables[0]>) {
    const next = consumables.map((c, i) => i === index ? { ...c, ...patch } : c)
    updateProject({ consumables: next })
  }

  function addConsumable() {
    updateProject({
      consumables: [
        ...consumables,
        { name: '', unitCostUsd: 0, quantityPerSample: 1, enabled: true },
      ],
    })
  }

  function removeConsumable(index: number) {
    updateProject({ consumables: consumables.filter((_, i) => i !== index) })
  }

  // Auto-fill from catalogue when a datalist item is selected
  function handleNameChange(index: number, newName: string) {
    const catItem = catalogue.reagents.find(r => r.name === newName)
    if (catItem) {
      const packSize = catItem.pack_size ?? 1
      const qtyPerSample = packSize > 1
        ? parseFloat(((catItem.quantity_per_sample ?? 1) / packSize).toFixed(4))
        : (catItem.quantity_per_sample ?? 1)
      updateConsumable(index, {
        name: newName,
        unitCostUsd: 5, // placeholder — user must enter local price
        quantityPerSample: qtyPerSample,
        workflow: catItem.workflow ?? undefined,
      })
    } else {
      updateConsumable(index, { name: newName })
    }
  }

  // Group consumables by their catalogue workflow if possible
  const withWorkflow = consumables.map((c, idx) => {
    const catalogueItem = catalogue.reagents.find(r => r.name === c.name)
    return { ...c, workflow: catalogueItem?.workflow ?? null, idx }
  })

  const groups = Array.from(new Set(withWorkflow.map(c => c.workflow ?? 'null')))
  const grouped = groups.map(wf => ({
    workflow: wf,
    label: t(WORKFLOW_KEYS[wf] ?? 'wf_other'),
    items: withWorkflow.filter(c => (c.workflow ?? 'null') === wf),
  }))

  const total = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + Math.ceil(samplesPerYear * c.quantityPerSample) * c.unitCostUsd, 0)

  // Build datalist options from catalogue reagents
  const catalogueReagentNames = catalogue.reagents.map(r => r.name)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step3_title')}</h2>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm" style={{ color: 'var(--gx-text-muted)' }}>
          {t('step3_desc')}
        </p>
        <span className="text-xs px-2 py-1 rounded-full flex-shrink-0" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-accent)', border: '1px solid var(--gx-border)' }}>
          {samplesPerYear.toLocaleString()} {t('label_samples_per_yr')}
        </span>
      </div>

      {/* Datalist for catalogue autocomplete */}
      <datalist id="catalogue-reagents">
        {catalogueReagentNames.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {grouped.map(group => (
        <div key={group.workflow} className="mb-6">
          <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            {group.label}
          </div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_item')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty_sample')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_unit_cost')}</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                  <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => {
                  const annualCost = item.enabled
                    ? Math.ceil(samplesPerYear * item.quantityPerSample) * item.unitCostUsd
                    : 0
                  const showViralWarning = allBacterial && item.enabled && isViralReagent(item.name)
                  return (
                    <tr
                      key={item.idx}
                      style={{
                        borderBottom: '1px solid var(--gx-border)',
                        opacity: item.enabled ? 1 : 0.4,
                      }}
                    >
                      <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            list="catalogue-reagents"
                            value={item.name}
                            placeholder="Type to search catalogue..."
                            onChange={e => handleNameChange(item.idx, e.target.value)}
                            className={inputClass}
                            style={{ width: '100%', minWidth: 120 }}
                          />
                          {showViralWarning && (
                            <span className="text-xs px-2 py-0.5 rounded-full inline-block" style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fcd34d',
                              width: 'fit-content',
                            }}>
                              Viral reagent — may not apply to bacterial pathogens
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.quantityPerSample}
                          min={0}
                          step={0.001}
                          onChange={e => updateConsumable(item.idx, { quantityPerSample: parseFloat(e.target.value) || 0 })}
                          className={inputClass}
                          style={{ width: 80, textAlign: 'right' }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.unitCostUsd}
                          min={0}
                          step={0.01}
                          onChange={e => updateConsumable(item.idx, { unitCostUsd: parseFloat(e.target.value) || 0 })}
                          className={inputClass}
                          style={{ width: 80, textAlign: 'right' }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                        {fmt(annualCost)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={e => updateConsumable(item.idx, { enabled: e.target.checked })}
                          style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeConsumable(item.idx)}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={addConsumable}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_add')}
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>
          {t('label_total_consumables')}: <span style={{ color: 'var(--gx-accent)' }}>${fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}
