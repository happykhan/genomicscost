import { useState, useId, useMemo } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { getEffectiveCatalogue } from '../../lib/catalogue'
import { fmt } from '../../lib/format'
import { createDefaultFixedConsumables } from '../../lib/defaults'
import type { ConsumableWorkflowStep } from '../../types'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

/** The 5 consumable workflow step keys in display order. */
const WF_STEPS: ConsumableWorkflowStep[] = [
  'sample_receipt',
  'nucleic_acid_extraction',
  'pcr_testing',
  'ngs_library_preparation',
  'sequencing',
]

/** Abbreviated column headers for the 5 workflow checkboxes. */
const WF_ABBREV: Record<ConsumableWorkflowStep, string> = {
  sample_receipt: 'R',
  nucleic_acid_extraction: 'N',
  pcr_testing: 'P',
  ngs_library_preparation: 'L',
  sequencing: 'S',
}

/** Full names for tooltip on abbreviated headers. */
const WF_FULL: Record<ConsumableWorkflowStep, string> = {
  sample_receipt: 'Sample receipt',
  nucleic_acid_extraction: 'Nucleic acid extraction',
  pcr_testing: 'PCR testing',
  ngs_library_preparation: 'NGS library preparation',
  sequencing: 'Sequencing',
}

// Keywords that indicate a viral-specific reagent
const VIRAL_KEYWORDS = ['viral transport', 'vtm', 'rna extraction', 'rt-pcr']

function isViralReagent(name: string): boolean {
  const lower = name.toLowerCase()
  return VIRAL_KEYWORDS.some(kw => lower.includes(kw))
}

function ConsumableNameInput({ value, allNames, onChange, placeholder }: {
  value: string
  allNames: string[]
  onChange: (name: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState(value)
  const id = useId()

  const filtered = query.length >= 2
    ? allNames.filter(n => n.toLowerCase().includes(query.toLowerCase())).slice(0, 50)
    : []

  return (
    <>
      <input
        type="text"
        list={id}
        value={query}
        placeholder={placeholder ?? 'Type to search catalogue…'}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        className={inputClass}
        style={{ width: '100%', minWidth: 120 }}
      />
      <datalist id={id}>
        {filtered.map(n => <option key={n} value={n} />)}
      </datalist>
    </>
  )
}

export default function Step3() {
  const { project, updateProject, costs } = useProject()
  const { t } = useTranslation()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClearFixed, setConfirmClearFixed] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const { consumables } = project
  const fixedConsumables = project.fixedConsumables ?? []

  // WHO GCT default prices/quantities by name (from defaults.ts)
  const fixedDefaults = useMemo(() => {
    const map = new Map<string, { unitCostUsd: number; quantityPerYear: number }>()
    createDefaultFixedConsumables().forEach(d => map.set(d.name, { unitCostUsd: d.unitCostUsd, quantityPerYear: d.quantityPerYear }))
    return map
  }, [])
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

  // Determine if all pathogens are bacterial
  const allBacterial = project.pathogens.length > 0 &&
    project.pathogens.every(p => p.pathogenType === 'bacterial')

  // ── Fixed-qty consumables handlers ──────────────────────────────────────────
  function updateFixed(index: number, patch: Partial<typeof fixedConsumables[0]>) {
    const next = fixedConsumables.map((c, i) => i === index ? { ...c, ...patch } : c)
    updateProject({ fixedConsumables: next })
  }

  function addFixed() {
    updateProject({
      fixedConsumables: [
        ...fixedConsumables,
        { name: '', unitCostUsd: 0, quantityPerYear: 0, enabled: true },
      ],
    })
  }

  function removeFixed(index: number) {
    updateProject({ fixedConsumables: fixedConsumables.filter((_, i) => i !== index) })
  }

  function toggleFixedWorkflow(index: number, step: ConsumableWorkflowStep) {
    const c = fixedConsumables[index]
    const current = c.workflows ?? {}
    const updated = { ...current, [step]: !current[step] }
    updateFixed(index, { workflows: updated })
  }

  function handleFixedNameChange(index: number, newName: string) {
    const catItem = catalogue.reagents.find(r => r.name === newName)
    if (catItem) {
      const VALID_STEPS: ConsumableWorkflowStep[] = [
        'sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing',
      ]
      let workflows: Partial<Record<ConsumableWorkflowStep, boolean>> | undefined
      if (Array.isArray(catItem.workflows) && catItem.workflows.length > 0) {
        workflows = {}
        for (const w of catItem.workflows) {
          if (VALID_STEPS.includes(w as ConsumableWorkflowStep)) {
            workflows[w as ConsumableWorkflowStep] = true
          }
        }
      } else if (catItem.workflow && VALID_STEPS.includes(catItem.workflow as ConsumableWorkflowStep)) {
        workflows = { [catItem.workflow as ConsumableWorkflowStep]: true }
      }
      const defaults = fixedDefaults.get(newName)
      updateFixed(index, {
        name: newName,
        unitCostUsd: catItem.unit_price_usd ?? defaults?.unitCostUsd ?? 0,
        quantityPerYear: defaults?.quantityPerYear ?? 0,
        workflows,
      })
    } else {
      updateFixed(index, { name: newName })
    }
  }

  // ── Per-sample consumables handlers ─────────────────────────────────────────
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

  // Toggle a single workflow step checkbox for a consumable
  function toggleWorkflow(index: number, step: ConsumableWorkflowStep) {
    const c = consumables[index]
    const current = c.workflows ?? {}
    const updated = { ...current, [step]: !current[step] }
    updateConsumable(index, { workflows: updated })
  }

  // Auto-fill from catalogue when a datalist item is selected
  function handleNameChange(index: number, newName: string) {
    const catItem = catalogue.reagents.find(r => r.name === newName)
    if (catItem) {
      const packSize = catItem.pack_size ?? 1
      const qtyPerSample = packSize > 1
        ? parseFloat(((catItem.quantity_per_sample ?? 1) / packSize).toFixed(4))
        : (catItem.quantity_per_sample ?? 1)

      // Build workflows from catalogue item
      const VALID_STEPS: ConsumableWorkflowStep[] = [
        'sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing',
      ]
      let workflows: Partial<Record<ConsumableWorkflowStep, boolean>> | undefined
      if (Array.isArray(catItem.workflows) && catItem.workflows.length > 0) {
        workflows = {}
        for (const w of catItem.workflows) {
          if (VALID_STEPS.includes(w as ConsumableWorkflowStep)) {
            workflows[w as ConsumableWorkflowStep] = true
          }
        }
      } else if (catItem.workflow && VALID_STEPS.includes(catItem.workflow as ConsumableWorkflowStep)) {
        workflows = { [catItem.workflow as ConsumableWorkflowStep]: true }
      }

      updateConsumable(index, {
        name: newName,
        unitCostUsd: 0,
        quantityPerSample: qtyPerSample,
        workflows,
      })
    } else {
      updateConsumable(index, { name: newName })
    }
  }

  // Derive item type from catalogue category
  function getItemType(name: string): 'Reagent' | 'Consumable' {
    const catItem = catalogue.reagents.find(r => r.name === name)
    if (catItem?.category === 'consumable') return 'Consumable'
    return 'Reagent'
  }

  // Calculate totals
  const fixedTotal = fixedConsumables
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + (c.quantityPerYear ?? 0) * c.unitCostUsd, 0)

  const consumableTotal = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + Math.ceil(samplesPerYear * c.quantityPerSample) * c.unitCostUsd, 0)

  const sequencingReagentsTotal = costs.sequencingReagents + costs.libraryPrep

  // Build datalist options from catalogue reagents
  const catalogueReagentNames = catalogue.reagents.map(r => r.name)

  // Enabled sequencers for Section A
  const enabledSequencers = project.sequencers.filter(s => s.enabled)

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

      {/* Section A: Sequencing & Library Prep Reagents (read-only from Step 2) */}
      {enabledSequencers.length > 0 && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            A. Sequencing &amp; Library Prep Reagents
          </div>
          <div className="card" style={{ border: '1px solid var(--gx-border)', borderRadius: 'var(--gx-radius)', background: 'var(--gx-bg-alt)', padding: '12px 16px' }}>
            {enabledSequencers.map((seq, idx) => {
              const hasAssignments = Array.isArray(seq.assignments) && seq.assignments.length > 0
              const assignedSamples = hasAssignments
                ? seq.assignments.reduce((sum, a) => sum + (a.samples ?? 0), 0)
                : samplesPerYear
              const samplesWithRetests = assignedSamples * (1 + (seq.retestPct ?? 0) / 100)
              const maxSPR = Math.max(1, seq.samplesPerRun ?? 1)
              const effectiveSPR = Math.max(1, seq.avgSamplesPerRun ?? maxSPR)
              const runsPerYear = Math.ceil(samplesWithRetests / effectiveSPR)
              const packsPerRun = seq.customKitPacksPerRun ?? 1
              const kitsPerYear = Math.ceil(runsPerYear * packsPerRun)
              const reagentCostAnnual = runsPerYear * (seq.reagentKitPrice ?? 0)

              const platform = catalogue.platforms.find(p => p.id === seq.platformId)
              const platformName = platform?.name ?? seq.platformId

              // Library prep kits per year (controls also prepped each run — matches Excel)
              const selectedLibKit = catalogue.library_prep_kits.find(k => k.name === seq.libPrepKitName)
              const libPackSize = seq.libPrepKitName === 'Other library preparation kit'
                ? (seq.customLibPrepBarcodesPerPack ?? 0)
                : (selectedLibKit?.pack_size ?? 0)
              const libKitsPerYear = libPackSize > 0
                ? Math.ceil((samplesWithRetests + runsPerYear * (seq.controlsPerRun ?? 0)) / libPackSize)
                : null
              const kitPrice = libPackSize > 0 ? (seq.libPrepCostPerSample ?? 0) * libPackSize : 0
              const libPrepCostAnnual = libKitsPerYear != null && kitPrice > 0
                ? libKitsPerYear * kitPrice
                : samplesWithRetests * (seq.libPrepCostPerSample ?? 0)

              return (
                <div key={idx} className={idx > 0 ? 'mt-3 pt-3' : ''} style={idx > 0 ? { borderTop: '1px solid var(--gx-border)' } : undefined}>
                  <div className="text-sm font-medium mb-1" style={{ color: 'var(--gx-text)' }}>
                    {seq.label} — {platformName}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                    <div>Reagent kit: {(seq.reagentKitName === 'Other sequencing kit' ? seq.customKitDisplayName : null) || seq.reagentKitName || '—'}</div>
                    <div className="text-right">
                      {runsPerYear} runs/yr · {kitsPerYear} kits/yr = <span style={{ color: 'var(--gx-accent)' }}>${fmt(reagentCostAnnual)}</span>
                    </div>
                    <div>Library prep: {(seq.libPrepKitName === 'Other library preparation kit' ? seq.customLibPrepDisplayName : null) || seq.libPrepKitName || '—'}</div>
                    <div className="text-right">
                      {libKitsPerYear !== null && <span>{libKitsPerYear} kits/yr · </span>}
                      ${fmt(seq.libPrepCostPerSample ?? 0)}/sample = <span style={{ color: 'var(--gx-accent)' }}>${fmt(libPrepCostAnnual)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}



      {/* Section B: Fixed-Quantity Reagents & Consumables (shopping list, absolute annual qty) */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
          B. Reagents &amp; Consumables
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                {WF_STEPS.map(step => (
                  <th key={step} className="px-2 py-1 text-center text-xs font-medium" style={{ color: 'var(--gx-text-muted)', width: 24 }} title={WF_FULL[step]}>
                    {WF_ABBREV[step]}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--gx-text-muted)', width: 60 }}>Type</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Item</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Qty/yr</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_unit_cost')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)', whiteSpace: 'nowrap' }}>Cost/workflow step</th>
                <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {fixedConsumables.map((item, idx) => {
                const annualCost = item.enabled ? (item.quantityPerYear ?? 0) * item.unitCostUsd : 0
                const checkedCount = WF_STEPS.filter(s => item.workflows?.[s]).length
                const distPerWf = item.enabled && checkedCount > 0 ? annualCost / checkedCount : 0
                const isCatalogueItem = catalogue.reagents.some(r => r.name === item.name)
                const itemType = catalogue.reagents.find(r => r.name === item.name)?.category === 'consumable' ? 'Cons.' : 'Reag.'

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: item.enabled ? 1 : 0.4 }}>
                    {WF_STEPS.map(step => {
                      const active = !!item.workflows?.[step]
                      return (
                        <td key={step} className="px-2 py-1 text-center">
                          {isCatalogueItem ? (
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: active ? 'var(--gx-accent)' : 'var(--gx-border)', flexShrink: 0 }} title={WF_FULL[step]} />
                          ) : (
                            <input type="checkbox" checked={active} onChange={() => toggleFixedWorkflow(idx, step)} title={WF_FULL[step]} style={{ accentColor: 'var(--gx-accent)', width: 14, height: 14 }} />
                          )}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', whiteSpace: 'nowrap' }}>
                        {itemType}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                      <ConsumableNameInput value={item.name} allNames={catalogueReagentNames} onChange={name => handleFixedNameChange(idx, name)} />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={item.quantityPerYear ?? 0}
                        min={0}
                        step={1}
                        onChange={e => updateFixed(idx, { quantityPerYear: parseInt(e.target.value) || 0 })}
                        className={inputClass}
                        style={{ width: 72, textAlign: 'right' }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={item.unitCostUsd}
                        min={0}
                        step={0.01}
                        onChange={e => updateFixed(idx, { unitCostUsd: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>{fmt(annualCost)}</td>
                    <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                      {checkedCount > 0 ? fmt(distPerWf) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={item.enabled} onChange={e => updateFixed(idx, { enabled: e.target.checked })} style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }} />
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeFixed(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>
                        &times;
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Section B: Add/Clear buttons */}
        <div className="flex items-center gap-2 mt-3">
          <button onClick={addFixed} className="px-4 py-2 rounded text-sm font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>
            + Add item
          </button>
          {!confirmClearFixed ? (
            <button onClick={() => setConfirmClearFixed(true)} className="px-4 py-2 rounded text-sm font-medium" style={{ background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>
              Clear all
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <span style={{ color: '#92400e' }}>Remove all {fixedConsumables.length} items?</span>
              <button onClick={() => { updateProject({ fixedConsumables: [] }); setConfirmClearFixed(false) }} className="px-3 py-1 rounded text-xs font-medium" style={{ background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}>Yes, clear</button>
              <button onClick={() => setConfirmClearFixed(false)} className="px-3 py-1 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>Cancel</button>
            </span>
          )}
          <span className="ml-auto text-sm font-medium" style={{ color: 'var(--gx-text-muted)' }}>
            Subtotal: <span style={{ color: 'var(--gx-accent)' }}>${fmt(fixedTotal)}</span>
          </span>
        </div>
      </div>

      {/* Section C: Per-Sample Reagents & Consumables (volume-dependent, starts blank) */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
          C. Per-Sample Reagent Usage (optional — for volume-dependent items)
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                {WF_STEPS.map(step => (
                  <th key={step} className="px-2 py-1 text-center text-xs font-medium" style={{ color: 'var(--gx-text-muted)', width: 24 }} title={WF_FULL[step]}>
                    {WF_ABBREV[step]}
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'var(--gx-text-muted)', width: 60 }}>Type</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_item')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Qty/sample · units/yr</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_unit_cost')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)', whiteSpace: 'nowrap' }}>Cost/workflow step</th>
                <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {consumables.map((item, idx) => {
                const annualCost = item.enabled
                  ? Math.ceil(samplesPerYear * item.quantityPerSample) * item.unitCostUsd
                  : 0
                const checkedCount = WF_STEPS.filter(s => item.workflows?.[s]).length
                const distPerWf = item.enabled && checkedCount > 0
                  ? annualCost / checkedCount
                  : 0
                const showViralWarning = allBacterial && item.enabled && isViralReagent(item.name)
                const itemType = getItemType(item.name)

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid var(--gx-border)',
                      opacity: item.enabled ? 1 : 0.4,
                    }}
                  >
                    {/* 5 workflow step indicators — read-only dot for catalogue items, editable checkbox for custom */}
                    {(() => {
                      const isCatalogueItem = catalogue.reagents.some(r => r.name === item.name)
                      return WF_STEPS.map(step => {
                        const active = !!item.workflows?.[step]
                        return (
                          <td key={step} className="px-2 py-1 text-center">
                            {isCatalogueItem ? (
                              <span
                                title={WF_FULL[step]}
                                style={{
                                  display: 'inline-block',
                                  width: 10, height: 10,
                                  borderRadius: '50%',
                                  background: active ? 'var(--gx-accent)' : 'var(--gx-border)',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggleWorkflow(idx, step)}
                                title={WF_FULL[step]}
                                style={{ accentColor: 'var(--gx-accent)', width: 14, height: 14 }}
                              />
                            )}
                          </td>
                        )
                      })
                    })()}

                    {/* Type badge */}
                    <td className="px-3 py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{
                        background: 'var(--gx-bg-alt)',
                        color: 'var(--gx-text-muted)',
                        border: '1px solid var(--gx-border)',
                        whiteSpace: 'nowrap',
                      }}>
                        {itemType === 'Consumable' ? 'Cons.' : 'Reag.'}
                      </span>
                    </td>

                    {/* Item name */}
                    <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                      <div className="flex flex-col gap-1">
                        <ConsumableNameInput
                          value={item.name}
                          allNames={catalogueReagentNames}
                          onChange={name => handleNameChange(idx, name)}
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

                    {/* Qty/sample ↕ Samples/unit (synced inverses) */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={item.quantityPerSample}
                            min={0}
                            step={0.001}
                            title="Units consumed per sample"
                            onChange={e => updateConsumable(idx, { quantityPerSample: parseFloat(e.target.value) || 0 })}
                            className={inputClass}
                            style={{ width: 72, textAlign: 'right' }}
                          />
                          <span className="text-xs" style={{ color: 'var(--gx-text-muted)', whiteSpace: 'nowrap' }}>/sample</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={item.quantityPerSample > 0 ? Math.round(1 / item.quantityPerSample) : ''}
                            min={1}
                            step={1}
                            title="Samples covered per unit"
                            onChange={e => {
                              const n = parseInt(e.target.value)
                              if (n > 0) updateConsumable(idx, { quantityPerSample: parseFloat((1 / n).toFixed(4)) })
                            }}
                            className={inputClass}
                            style={{ width: 72, textAlign: 'right' }}
                          />
                          <span className="text-xs" style={{ color: 'var(--gx-text-muted)', whiteSpace: 'nowrap' }}>/unit</span>
                        </div>
                        {samplesPerYear > 0 && item.quantityPerSample > 0 && (
                          <div className="text-xs font-medium" style={{ color: 'var(--gx-accent)', whiteSpace: 'nowrap' }}>
                            = {Math.ceil(samplesPerYear * item.quantityPerSample)} units/yr
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Unit cost */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={item.unitCostUsd}
                        min={0}
                        step={0.01}
                        onChange={e => updateConsumable(idx, { unitCostUsd: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    </td>

                    {/* Annual cost */}
                    <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                      {fmt(annualCost)}
                    </td>

                    {/* Distributed per workflow */}
                    <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                      {checkedCount > 0 ? fmt(distPerWf) : '—'}
                    </td>

                    {/* Enabled toggle */}
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={e => updateConsumable(idx, { enabled: e.target.checked })}
                        style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }}
                      />
                    </td>

                    {/* Remove button */}
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeConsumable(idx)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section C: Add/Clear buttons */}
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={addConsumable}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_add')}
        </button>
        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{ background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
          >
            Clear all
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <span style={{ color: '#92400e' }}>Remove all {consumables.length} items?</span>
            <button
              onClick={() => { updateProject({ consumables: [] }); setConfirmClear(false) }}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Yes, clear
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Section D: Cost breakdown summary */}
      <div className="card mt-4" style={{ border: '1px solid var(--gx-border)', borderRadius: 'var(--gx-radius)', overflow: 'hidden' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
                Calculated costs — Reagents &amp; Consumables
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>Annual cost</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Sequencing & library preparation reagents', value: sequencingReagentsTotal },
              { label: 'Reagents & consumables (Section B)', value: fixedTotal },
              { label: 'Per-sample reagents & consumables (Section C)', value: consumableTotal },
              { label: 'Incidentals (waste bags, PPE, ethanol, etc.)', value: costs.incidentals },
            ].map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                <td className="px-4 py-2 text-xs" style={{ color: 'var(--gx-text-muted)' }}>{row.label}</td>
                <td className="px-4 py-2 text-right text-xs" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
              <td className="px-4 py-2 text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>Total annual reagent &amp; consumable cost</td>
              <td className="px-4 py-2 text-right text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>
                ${fmt(sequencingReagentsTotal + fixedTotal + consumableTotal + costs.incidentals)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                Cost per sample ({samplesPerYear.toLocaleString()} samples/yr)
              </td>
              <td className="px-4 py-2 text-right text-xs font-medium" style={{ color: 'var(--gx-text)' }}>
                {samplesPerYear > 0
                  ? `$${fmt((sequencingReagentsTotal + consumableTotal + costs.incidentals) / samplesPerYear)}`
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
