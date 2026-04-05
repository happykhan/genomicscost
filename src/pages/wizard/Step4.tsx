import { useProject } from '../../store/ProjectContext'
import catalogue from '../../data/catalogue.json'
import type { EquipmentStatus } from '../../types'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const STATUS_OPTIONS: { value: EquipmentStatus; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'have', label: 'Have' },
  { value: 'skip', label: 'Skip' },
]

// Category display labels
const CAT_LABELS: Record<string, string> = {
  sequencing_platform: 'Sequencing platform',
  lab_equipment: 'Lab equipment',
  facility: 'Facility equipment',
  bioinformatics: 'Bioinformatics hardware',
}

export default function Step4() {
  const { project, updateProject } = useProject()
  const { equipment } = project

  function updateItem(index: number, patch: Partial<typeof equipment[0]>) {
    const next = equipment.map((e, i) => i === index ? { ...e, ...patch } : e)
    updateProject({ equipment: next })
  }

  function addEquipmentItem() {
    updateProject({
      equipment: [
        ...equipment,
        { name: 'Custom equipment', category: 'lab_equipment', status: 'buy', quantity: 1, unitCostUsd: 0, lifespanYears: 5 },
      ],
    })
  }

  function removeItem(index: number) {
    updateProject({ equipment: equipment.filter((_, i) => i !== index) })
  }

  // Add items from catalogue not already in list
  function addFromCatalogue(name: string) {
    const cat = catalogue.equipment.find(e => e.name === name)
    if (!cat) return
    updateProject({
      equipment: [
        ...equipment,
        {
          name: cat.name,
          category: cat.category,
          status: 'buy',
          quantity: cat.recommended_quantity ?? 1,
          unitCostUsd: cat.unit_cost_usd ?? 0,
          lifespanYears: cat.category === 'sequencing_platform' ? 10 : 5,
        },
      ],
    })
  }

  // Feature 2: use per-item lifespan for annualisation
  const annualTotal = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + e.unitCostUsd * e.quantity / Math.max(1, e.lifespanYears ?? 5), 0)

  const establishmentTotal = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + e.unitCostUsd * e.quantity, 0)

  const categoriesPresent = Array.from(new Set(equipment.map(e => e.category)))
  const grouped = categoriesPresent.map(cat => ({
    cat,
    label: CAT_LABELS[cat] ?? cat,
    items: equipment.map((e, idx) => ({ ...e, idx })).filter(e => e.category === cat),
  }))

  const catalogueNames = catalogue.equipment.map(e => e.name)
  const existingNames = equipment.map(e => e.name)
  const availableToAdd = catalogueNames.filter(n => !existingNames.includes(n))

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 4: Equipment</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        For each item, indicate if you need to buy it, already have it, or will skip it. Costs are amortised over the item's lifespan.
      </p>

      {grouped.map(group => (
        <div key={group.cat} className="mb-6">
          <div className="text-xs uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            {group.label}
          </div>
          <div className="flex flex-col gap-2">
            {group.items.map(item => {
              const lifespan = Math.max(1, item.lifespanYears ?? 5)
              const annual = item.status === 'buy' ? item.unitCostUsd * item.quantity / lifespan : 0
              return (
                <div
                  key={item.idx}
                  className="card p-3 flex flex-wrap gap-3 items-center"
                  style={{ opacity: item.status === 'skip' ? 0.4 : 1 }}
                >
                  {/* Name */}
                  <div className="flex-1 text-sm font-medium min-w-36" style={{ color: 'var(--gx-text)' }}>
                    {item.name}
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
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Qty + Cost + Lifespan (only if buying) */}
                  {item.status === 'buy' && (
                    <>
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Qty</label>
                        <input
                          type="number"
                          value={item.quantity}
                          min={1}
                          onChange={e => updateItem(item.idx, { quantity: parseInt(e.target.value) || 1 })}
                          className={inputClass}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>$ each</label>
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
                        <label className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Life (yr)</label>
                        <input
                          type="number"
                          value={item.lifespanYears ?? 5}
                          min={1}
                          max={30}
                          onChange={e => updateItem(item.idx, { lifespanYears: parseInt(e.target.value) || 5 })}
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
        <select
          className={inputClass}
          defaultValue=""
          onChange={e => { if (e.target.value) { addFromCatalogue(e.target.value); e.target.value = '' } }}
          style={{ flex: 1, minWidth: 200 }}
        >
          <option value="">Add from catalogue…</option>
          {availableToAdd.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <button
          onClick={addEquipmentItem}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          + Custom item
        </button>
      </div>

      {/* Totals */}
      <div className="card p-4 flex justify-between items-center flex-wrap gap-3 mt-4">
        <div>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Annual (amortised by lifespan)</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(annualTotal)}</div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Establishment (one-off)</div>
          <div className="text-lg font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(establishmentTotal)}</div>
        </div>
      </div>
    </div>
  )
}
