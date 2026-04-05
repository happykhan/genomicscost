import { useProject } from '../../store/ProjectContext'
import catalogue from '../../data/catalogue.json'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

// Group by workflow label
const WORKFLOW_LABELS: Record<string, string> = {
  sample_receipt: 'Sample receipt',
  nucleic_acid_extraction: 'Nucleic acid extraction',
  pcr_testing: 'PCR testing',
  general_lab: 'General lab',
  null: 'Other',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function Step3() {
  const { project, updateProject } = useProject()
  const { consumables, samplesPerYear } = project

  function updateConsumable(index: number, patch: Partial<typeof consumables[0]>) {
    const next = consumables.map((c, i) => i === index ? { ...c, ...patch } : c)
    updateProject({ consumables: next })
  }

  function addConsumable() {
    updateProject({
      consumables: [
        ...consumables,
        { name: 'Custom item', unitCostUsd: 0, quantityPerSample: 1, enabled: true },
      ],
    })
  }

  function removeConsumable(index: number) {
    updateProject({ consumables: consumables.filter((_, i) => i !== index) })
  }

  // Group consumables by their catalogue workflow if possible
  const withWorkflow = consumables.map((c, idx) => {
    const catalogueItem = catalogue.reagents.find(r => r.name === c.name)
    return { ...c, workflow: catalogueItem?.workflow ?? null, idx }
  })

  const groups = Array.from(new Set(withWorkflow.map(c => c.workflow ?? 'null')))
  const grouped = groups.map(wf => ({
    workflow: wf,
    label: WORKFLOW_LABELS[wf] ?? wf,
    items: withWorkflow.filter(c => (c.workflow ?? 'null') === wf),
  }))

  const total = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + Math.ceil(samplesPerYear * c.quantityPerSample) * c.unitCostUsd, 0)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 3: Consumables</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        Edit quantity per sample and unit cost for each consumable. Toggle items on/off.
      </p>

      {grouped.map(group => (
        <div key={group.workflow} className="mb-6">
          <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            {group.label}
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Item</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Qty/sample</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Unit cost ($)</th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual ($)</th>
                  <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>On</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map(item => {
                  const annualCost = item.enabled
                    ? Math.ceil(samplesPerYear * item.quantityPerSample) * item.unitCostUsd
                    : 0
                  return (
                    <tr
                      key={item.idx}
                      style={{
                        borderBottom: '1px solid var(--gx-border)',
                        opacity: item.enabled ? 1 : 0.4,
                      }}
                    >
                      <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateConsumable(item.idx, { name: e.target.value })}
                          className={inputClass}
                          style={{ width: '100%', minWidth: 120 }}
                        />
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
          + Add item
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>
          Total consumables: <span style={{ color: 'var(--gx-accent)' }}>${fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}
