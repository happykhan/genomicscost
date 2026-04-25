import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { getEffectiveCatalogue } from '../../lib/catalogue'
import type { EquipmentStatus } from '../../types'
import Tooltip from '../../components/Tooltip'
import { fmt } from '../../lib/format'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

/** Abbreviated labels for workflow step badges. */
const WORKFLOW_STEP_LABELS: Record<string, string> = {
  sample_receipt: 'SR',
  nucleic_acid_extraction: 'NA',
  pcr_testing: 'PCR',
  ngs_library_preparation: 'Lib',
  sequencing: 'Seq',
}

const CAT_LABEL_KEYS: Record<string, string> = {
  sequencing_platform: 'cat_sequencing_platform',
  lab_equipment: 'cat_lab_equipment',
  facility: 'cat_facility',
  bioinformatics: 'cat_bioinformatics',
}

export default function Step4() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const catalogue = getEffectiveCatalogue()
  const { equipment } = project

  const STATUS_OPTIONS: { value: EquipmentStatus; labelKey: string }[] = [
    { value: 'buy', labelKey: 'opt_buy' },
    { value: 'have', labelKey: 'opt_have' },
    { value: 'skip', labelKey: 'opt_skip' },
  ]

  function updateItem(index: number, patch: Partial<typeof equipment[0]>) {
    const next = equipment.map((e, i) => i === index ? { ...e, ...patch } : e)
    updateProject({ equipment: next })
  }

  function addEquipmentItem() {
    updateProject({
      equipment: [
        ...equipment,
        { name: 'Custom equipment', category: 'lab_equipment', status: 'buy', quantity: 1, unitCostUsd: 0, lifespanYears: 5, ageYears: 0, pctSequencing: 100 },
      ],
    })
  }

  function removeItem(index: number) {
    updateProject({ equipment: equipment.filter((_, i) => i !== index) })
  }

  // Add item from catalogue; ignore if already present
  function addFromCatalogue(name: string) {
    const cat = catalogue.equipment.find(e => e.name === name)
    if (!cat || cat.category === 'sequencing_platform') return
    if (equipment.some(e => e.name === name)) return
    updateProject({
      equipment: [
        ...equipment,
        {
          name: cat.name,
          category: cat.category,
          status: 'have',
          quantity: cat.recommended_quantity ?? 1,
          unitCostUsd: cat.unit_cost_usd ?? 0,
          lifespanYears: 5,
          ageYears: 0,
          pctSequencing: 100,
        },
      ],
    })
  }

  // WHO GCT: depreciation (age-adjusted) + 15% maintenance × pctSequencing
  const annualTotal = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => {
      const lifespan = Math.max(1, e.lifespanYears ?? 5)
      const age = Math.max(0, Math.min(e.ageYears ?? 0, lifespan - 1))
      const remainingLife = Math.max(1, lifespan - age)
      const totalCost = e.unitCostUsd * e.quantity
      const pct = (e.pctSequencing ?? 100) / 100
      return sum + (totalCost / remainingLife) * pct + totalCost * 0.15 * pct
    }, 0)

  const establishmentTotal = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + e.unitCostUsd * e.quantity, 0)

  // Potential purchases: additional cost to reach catalogue recommended quantity
  const potentialPurchases = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => {
      const catItem = catalogue.equipment.find(c => c.name === e.name)
      const recommended = catItem?.recommended_quantity ?? 0
      if (recommended > 0 && e.quantity < recommended) {
        return sum + (recommended - e.quantity) * e.unitCostUsd
      }
      return sum
    }, 0)

  const categoriesPresent = Array.from(new Set(equipment.map(e => e.category)))
  const grouped = categoriesPresent.map(cat => ({
    cat,
    label: t(CAT_LABEL_KEYS[cat] ?? cat),
    items: equipment.map((e, idx) => ({ ...e, idx })).filter(e => e.category === cat),
  }))

  const catalogueEquipmentNames = catalogue.equipment
    .filter(e => e.category !== 'sequencing_platform')
    .map(e => e.name)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step4_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step4_desc')}
      </p>

      {grouped.map(group => (
        <div key={group.cat} className="mb-6">
          <div className="flex flex-col gap-2">
            {group.items.map(item => {
              const lifespan = Math.max(1, item.lifespanYears ?? 5)
              const age = Math.max(0, Math.min(item.ageYears ?? 0, lifespan - 1))
              const remainingLife = Math.max(1, lifespan - age)
              const totalCost = item.unitCostUsd * item.quantity
              const pct = (item.pctSequencing ?? 100) / 100
              const annual = item.status === 'buy' ? ((totalCost / remainingLife) * pct + totalCost * 0.15 * pct) : 0
              return (
                <div
                  key={item.idx}
                  className="card p-3 flex flex-wrap gap-3 items-center"
                  style={{ opacity: item.status === 'skip' ? 0.4 : 1 }}
                >
                  {/* Name + workflow step badges + recommended quantity badge */}
                  <div className="flex-1 min-w-36">
                    <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>
                      {item.name}
                    </div>
                    {(() => {
                      const catItem = catalogue.equipment.find(c => c.name === item.name)
                      const steps = catItem?.workflow_steps as string[] | undefined
                      if (steps && steps.length > 0) {
                        return (
                          <div className="inline-flex gap-1 mt-0.5 flex-wrap">
                            {steps.map(s => (
                              <span
                                key={s}
                                style={{
                                  background: 'var(--gx-bg-alt)',
                                  color: 'var(--gx-text-muted)',
                                  borderRadius: 'var(--gx-radius)',
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.35rem',
                                  lineHeight: 1.3,
                                }}
                              >
                                {WORKFLOW_STEP_LABELS[s] ?? s}
                              </span>
                            ))}
                          </div>
                        )
                      }
                      return null
                    })()}
                    {(() => {
                      const catItem = catalogue.equipment.find(c => c.name === item.name)
                      const recommended = catItem?.recommended_quantity ?? 0
                      if (recommended > 0 && item.status === 'buy' && item.quantity < recommended) {
                        return (
                          <span className="text-xs px-2 py-0.5 rounded-full inline-block mt-0.5" style={{
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fcd34d',
                          }}>
                            {t('label_buy_more', { recommended })}
                          </span>
                        )
                      }
                      if (recommended > 0 && item.status === 'buy') {
                        return (
                          <span className="text-xs mt-0.5 block" style={{ color: 'var(--gx-text-muted)' }}>
                            {t('label_recommended_qty', { count: recommended })}
                          </span>
                        )
                      }
                      return null
                    })()}
                  </div>

                  {/* Status segmented control */}
                  <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--gx-border)' }}>
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => updateItem(item.idx, { status: opt.value })}
                        className="px-3 py-1 text-xs font-medium"
                        style={{
                          background: item.status === opt.value ? 'var(--gx-accent)' : 'var(--gx-bg-alt)',
                          color: item.status === opt.value ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {t(opt.labelKey)}
                      </button>
                    ))}
                  </div>

                  {/* Qty + Cost + Lifespan (only if buying) */}
                  {item.status === 'buy' && (
                    <>
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</label>
                        <input
                          type="number"
                          value={item.quantity}
                          min={1}
                          onChange={e => updateItem(item.idx, { quantity: (v => isNaN(v) ? 1 : v)(parseInt(e.target.value)) })}
                          className={inputClass}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)', display: 'flex', alignItems: 'center' }}>{t('col_price_each')}<Tooltip content={t('tooltip_unit_cost_equip')} /></label>
                        <input
                          type="number"
                          value={item.unitCostUsd}
                          min={0}
                          onChange={e => updateItem(item.idx, { unitCostUsd: parseFloat(e.target.value) || 0 })}
                          className={inputClass}
                          style={{ width: 100, textAlign: 'right' }}
                        />
                      </div>
                      {/* Feature 2: editable lifespan */}
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)', display: 'flex', alignItems: 'center' }}>{t('col_life_yr')}<Tooltip content={t('tooltip_life_yr')} /></label>
                        <input
                          type="number"
                          value={item.lifespanYears ?? 5}
                          min={1}
                          max={30}
                          onChange={e => updateItem(item.idx, { lifespanYears: (v => isNaN(v) ? 5 : v)(parseInt(e.target.value)) })}
                          className={inputClass}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      </div>
                      {/* WHO GCT: age of equipment */}
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_age_yr')}</label>
                        <input
                          type="number"
                          value={item.ageYears ?? 0}
                          min={0}
                          max={item.lifespanYears ? item.lifespanYears - 1 : 29}
                          onChange={e => updateItem(item.idx, { ageYears: parseInt(e.target.value) || 0 })}
                          className={inputClass}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      </div>
                      {/* WHO GCT: % use for sequencing */}
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pct_seq')}</label>
                        <input
                          type="number"
                          value={item.pctSequencing ?? 100}
                          min={0}
                          max={100}
                          onChange={e => updateItem(item.idx, { pctSequencing: parseInt(e.target.value) || 0 })}
                          className={inputClass}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      </div>
                      <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                        ${fmt(annual)}/yr
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => removeItem(item.idx)}
                    className="text-xs px-2 py-0.5 rounded ml-auto"
                    style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Add from catalogue */}
      <div className="flex flex-wrap gap-2 mt-4 mb-4">
        <input
          type="text"
          list="catalogue-equipment"
          placeholder={t('label_add_catalogue')}
          className={inputClass}
          style={{ flex: 1, minWidth: 200 }}
          onChange={e => {
            const name = e.target.value
            if (catalogueEquipmentNames.includes(name)) {
              addFromCatalogue(name)
              e.target.value = ''
            }
          }}
        />
        <datalist id="catalogue-equipment">
          {catalogueEquipmentNames.map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button
          onClick={addEquipmentItem}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_custom_item')}
        </button>
      </div>

      {/* Totals */}
      <div className="card p-4 flex justify-between items-center flex-wrap gap-3 mt-4">
        <div>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_annual_amortised')}</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(annualTotal)}</div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_establishment')}</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(establishmentTotal)}</div>
        </div>
        {potentialPurchases > 0 && (
          <div>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_potential_purchases')}</div>
            <div className="text-lg font-semibold" style={{ color: '#92400e' }}>${fmt(potentialPurchases)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
