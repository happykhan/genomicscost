import { useEffect } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { getEffectiveCatalogue } from '../../lib/catalogue'
import type { EquipmentStatus, SequencerConfig } from '../../types'
import Tooltip from '../../components/Tooltip'
import { fmt } from '../../lib/format'

function guessInstrumentName(seq: SequencerConfig): string | null {
  const kit = seq.reagentKitName.toLowerCase()
  const p = seq.platformId
  if (p === 'illumina') {
    if (kit.includes('novaseq')) return 'Illumina NovaSeq 6000'
    if (kit.includes('nextseq 2000 p3') || kit.includes('nextseq 2000 p4')) return 'Illumina NextSeq 2000'
    if (kit.includes('nextseq 1000/2000') || kit.includes('nextseq 2000')) return 'Illumina NextSeq 2000'
    if (kit.includes('nextseq 1000')) return 'Illumina NextSeq 1000'
    if (kit.includes('miniseq')) return 'Illumina MiniSeq'
    if (kit.includes('miseq')) return 'Illumina MiSeq'
    if (kit.includes('iseq')) return 'Illumina iSeq 100'
  }
  if (p === 'ont') {
    if (kit.includes('promethion')) return 'ONT PromethION 2 Solo (Starter Pack)'
    if (kit.includes('gridion')) return 'ONT GridION (Project Pack)'
    if (kit.includes('flongle')) return 'ONT Flongle (Starter Pack)'
    if (kit.includes('minion') || kit.includes('minion or gridion') || kit.includes('flow cell')) return 'ONT MinION Mk1B'
  }
  if (p === 'thermofisher') {
    if (kit.includes('prime')) return 'ThermoFisher Ion GeneStudio S5 Prime System'
    if (kit.includes('plus')) return 'ThermoFisher Ion GeneStudio S5 Plus System'
    return 'ThermoFisher Ion GeneStudio S5 System'
  }
  if (p === 'mgi') {
    if (kit.includes('g99')) return 'MGI DNBSEQ-G99ARS (with bioinformatics module)'
    if (kit.includes('g400')) return 'MGI DNBSEQ-G400RS'
    if (kit.includes('g50')) return 'MGI DNBSEQ-G50RS (Config 2)'
    return 'MGI DNBSEQ-E25RS (standard model)'
  }
  return null
}

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

const WORKFLOW_STEP_LABELS: Record<string, string> = {
  sample_receipt: 'SR',
  nucleic_acid_extraction: 'NA',
  pcr_testing: 'PCR',
  ngs_library_preparation: 'Lib',
  sequencing: 'Seq',
}

const CAT_LABEL_KEYS: Record<string, string> = {
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

  function handleEquipmentNameChange(index: number, newName: string) {
    const catItem = catalogue.equipment.find(e => e.name === newName)
    if (catItem) {
      updateItem(index, {
        name: newName,
        category: catItem.category,
        unitCostUsd: catItem.unit_cost_usd ?? equipment[index].unitCostUsd,
        lifespanYears: equipment[index].lifespanYears,
      })
    } else {
      updateItem(index, { name: newName })
    }
  }

  function removeItem(index: number) {
    updateProject({ equipment: equipment.filter((_, i) => i !== index) })
  }

  function addInstrumentFromCatalogue(name: string) {
    const cat = catalogue.equipment.find(e => e.name === name && e.category === 'sequencing_platform')
    if (!cat) return
    if (equipment.some(e => e.name === name)) return
    updateProject({
      equipment: [
        ...equipment,
        {
          name: cat.name,
          category: 'sequencing_platform',
          status: 'buy',
          quantity: 1,
          unitCostUsd: cat.unit_cost_usd ?? 0,
          lifespanYears: 10,
          ageYears: 0,
          pctSequencing: 100,
        },
      ],
    })
  }

  function addCustomInstrument() {
    updateProject({
      equipment: [
        ...equipment,
        { name: 'Custom sequencing instrument', category: 'sequencing_platform', status: 'buy', quantity: 1, unitCostUsd: 0, lifespanYears: 10, ageYears: 0, pctSequencing: 100 },
      ],
    })
  }

  function addEquipmentItem() {
    updateProject({
      equipment: [
        ...equipment,
        { name: 'Custom equipment', category: 'lab_equipment', status: 'buy', quantity: 1, unitCostUsd: 0, lifespanYears: 5, ageYears: 0, pctSequencing: 100 },
      ],
    })
  }

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

  const instrumentItems = equipment.map((e, idx) => ({ ...e, idx })).filter(e => e.category === 'sequencing_platform')

  // Auto-populate sequencing instruments from Step 2 choices when none are present
  useEffect(() => {
    if (equipment.some(e => e.category === 'sequencing_platform')) return
    const toAdd = project.sequencers
      .filter(s => s.enabled !== false)
      .map(s => guessInstrumentName(s))
      .filter((name, i, arr): name is string => !!name && arr.indexOf(name) === i)
      .filter(name => !equipment.some(e => e.name === name))
      .map(name => {
        const cat = catalogue.equipment.find(e => e.name === name)
        return cat ? {
          name: cat.name,
          category: 'sequencing_platform' as const,
          status: 'buy' as const,
          quantity: 1,
          unitCostUsd: cat.unit_cost_usd ?? 0,
          lifespanYears: 10,
          ageYears: 0,
          pctSequencing: 100,
        } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (toAdd.length > 0) {
      updateProject({ equipment: [...equipment, ...toAdd] })
    }
  }, [project.sequencers]) // eslint-disable-line react-hooks/exhaustive-deps
  const otherItems = equipment.map((e, idx) => ({ ...e, idx })).filter(e => e.category !== 'sequencing_platform')

  const categoriesPresent = Array.from(new Set(otherItems.map(e => e.category)))
  const grouped = categoriesPresent.map(cat => ({
    cat,
    label: t(CAT_LABEL_KEYS[cat] ?? cat),
    items: otherItems.filter(e => e.category === cat),
  }))

  const catalogueInstrumentNames = catalogue.equipment
    .filter(e => e.category === 'sequencing_platform' && e.name !== 'Other sequencing platform')
    .map(e => e.name)

  const catalogueEquipmentNames = catalogue.equipment
    .filter(e => e.category !== 'sequencing_platform')
    .map(e => e.name)

  function renderItemCard(item: typeof instrumentItems[0]) {
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
        <div className="flex-1 min-w-36">
          <input
            type="text"
            value={item.name}
            list={`equip-names-${item.idx}`}
            onChange={e => handleEquipmentNameChange(item.idx, e.target.value)}
            className={inputClass}
            style={{ width: '100%', fontWeight: 500, fontSize: '0.875rem' }}
            placeholder="Equipment name"
          />
          <datalist id={`equip-names-${item.idx}`}>
            {catalogueEquipmentNames.map(n => <option key={n} value={n} />)}
          </datalist>
          {(() => {
            const catItem = catalogue.equipment.find(c => c.name === item.name)
            const steps = catItem?.workflow_steps as string[] | undefined
            if (steps && steps.length > 0) {
              return (
                <div className="inline-flex gap-1 mt-0.5 flex-wrap">
                  {steps.map(s => (
                    <span key={s} style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', borderRadius: 'var(--gx-radius)', fontSize: '0.65rem', padding: '0.1rem 0.35rem', lineHeight: 1.3 }}>
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
                <span className="text-xs px-2 py-0.5 rounded-full inline-block mt-0.5" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                  {t('label_buy_more', { recommended })}
                </span>
              )
            }
            if (recommended > 0 && item.status === 'buy') {
              return <span className="text-xs mt-0.5 block" style={{ color: 'var(--gx-text-muted)' }}>{t('label_recommended_qty', { count: recommended })}</span>
            }
            return null
          })()}
        </div>

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

        {item.status === 'buy' && (
          <>
            <div className="flex items-center gap-1">
              <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</label>
              <input type="number" value={item.quantity} min={1}
                onChange={e => updateItem(item.idx, { quantity: (v => isNaN(v) ? 1 : v)(parseInt(e.target.value)) })}
                className={inputClass} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs" style={{ color: 'var(--gx-text-muted)', display: 'flex', alignItems: 'center' }}>{t('col_price_each')}<Tooltip content={t('tooltip_unit_cost_equip')} /></label>
              <input type="number" value={item.unitCostUsd} min={0}
                onChange={e => updateItem(item.idx, { unitCostUsd: parseFloat(e.target.value) || 0 })}
                className={inputClass} style={{ width: 100, textAlign: 'right' }} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs" style={{ color: 'var(--gx-text-muted)', display: 'flex', alignItems: 'center' }}>{t('col_life_yr')}<Tooltip content={t('tooltip_life_yr')} /></label>
              <input type="number" value={item.lifespanYears ?? 10} min={1} max={30}
                onChange={e => updateItem(item.idx, { lifespanYears: (v => isNaN(v) ? 10 : v)(parseInt(e.target.value)) })}
                className={inputClass} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_age_yr')}</label>
              <input type="number" value={item.ageYears ?? 0} min={0} max={item.lifespanYears ? item.lifespanYears - 1 : 29}
                onChange={e => updateItem(item.idx, { ageYears: parseInt(e.target.value) || 0 })}
                className={inputClass} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pct_seq')}</label>
              <input type="number" value={item.pctSequencing ?? 100} min={0} max={100}
                onChange={e => updateItem(item.idx, { pctSequencing: parseInt(e.target.value) || 0 })}
                className={inputClass} style={{ width: 60, textAlign: 'center' }} />
            </div>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>${fmt(annual)}/yr</div>
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
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step4_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step4_desc')}
      </p>

      {/* A. Sequencing Instruments */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
          A. Sequencing Instruments
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {instrumentItems.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--gx-text-muted)' }}>No sequencing instruments added yet.</p>
          )}
          {instrumentItems.map(item => renderItemCard(item))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className={inputClass}
            style={{ flex: 1, minWidth: 200 }}
            value=""
            onChange={e => { if (e.target.value) { addInstrumentFromCatalogue(e.target.value); e.target.value = '' } }}
          >
            <option value="">Add from catalogue…</option>
            {catalogueInstrumentNames.map(name => (
              <option key={name} value={name} disabled={equipment.some(e => e.name === name)}>
                {name}{equipment.some(e => e.name === name) ? ' (added)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={addCustomInstrument}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
          >
            Custom instrument
          </button>
        </div>
      </div>

      {/* B. Other Equipment */}
      <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
        B. Other Equipment
      </div>

      {grouped.map(group => (
        <div key={group.cat} className="mb-6">
          <div className="flex flex-col gap-2">
            {group.items.map(item => renderItemCard(item))}
          </div>
        </div>
      ))}

      {/* Add from catalogue (non-instrument) */}
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
