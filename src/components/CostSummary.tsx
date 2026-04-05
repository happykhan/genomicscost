import { useProject } from '../store/ProjectContext'

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function CostSummary() {
  const { costs } = useProject()

  const rows = [
    { label: 'Sequencing reagents', value: costs.sequencingReagents },
    { label: 'Library prep', value: costs.libraryPrep },
    { label: 'Consumables', value: costs.consumables },
    { label: 'Equipment (amortised)', value: costs.equipment },
    { label: 'Personnel', value: costs.personnel },
    { label: 'Training', value: costs.training },
    { label: 'Facility', value: costs.facility },
    { label: 'Transport', value: costs.transport },
    { label: 'Bioinformatics', value: costs.bioinformatics },
    { label: 'QMS', value: costs.qms },
  ].filter(r => r.value > 0)

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-lg p-4 text-center"
        style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ opacity: 0.8 }}>
          Cost per sample
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
          <span>Total annual</span>
          <span>${fmt(costs.total)}</span>
        </div>
      </div>

      {costs.establishmentCost > 0 && (
        <div className="card p-3 text-sm" style={{ border: '1px solid var(--gx-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--gx-text-muted)' }}>
            Establishment (one-off)
          </div>
          <div className="font-semibold">${fmt(costs.establishmentCost)}</div>
        </div>
      )}
    </div>
  )
}
