import { useProject } from '../../store/ProjectContext'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export default function Step7() {
  const { project, costs, saveProject } = useProject()
  const navigate = useNavigate()

  const rows = [
    { label: 'Sequencing reagents', value: costs.sequencingReagents },
    { label: 'Library preparation', value: costs.libraryPrep },
    { label: 'Consumables', value: costs.consumables },
    { label: 'Equipment (amortised)', value: costs.equipment },
    { label: 'Personnel', value: costs.personnel },
    { label: 'Facility & overhead', value: costs.facility },
    { label: 'Transport', value: costs.transport },
    { label: 'Bioinformatics', value: costs.bioinformatics },
    { label: 'Quality management', value: costs.qms },
  ].filter(r => r.value > 0)

  const maxValue = Math.max(...rows.map(r => r.value), 1)

  function handleSave() {
    saveProject()
    toast.success('Project saved')
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 7: Results</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {project.name || 'Unnamed project'} · {project.country || 'No country'} · {project.year}
      </p>

      {/* Main cost per sample card */}
      <div
        className="rounded-xl p-8 text-center mb-8"
        style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ opacity: 0.85 }}>
          Estimated cost per sample
        </div>
        <div className="text-6xl font-bold mb-1">
          ${fmt(costs.costPerSample)}
        </div>
        <div className="text-sm" style={{ opacity: 0.75 }}>
          {project.samplesPerYear} samples/year · {project.pathogenName || 'No pathogen'}
        </div>
      </div>

      {/* Breakdown chart */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--gx-text)' }}>Cost breakdown</h3>
        <div className="flex flex-col gap-2">
          {rows.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-36 text-xs text-right flex-shrink-0" style={{ color: 'var(--gx-text-muted)' }}>
                {row.label}
              </div>
              <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ background: 'var(--gx-bg-alt)' }}>
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(row.value / maxValue) * 100}%`,
                    background: 'var(--gx-accent)',
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="w-20 text-xs text-right flex-shrink-0 font-medium" style={{ color: 'var(--gx-text)' }}>
                ${fmt(row.value)}
              </div>
              <div className="w-10 text-xs text-right flex-shrink-0" style={{ color: 'var(--gx-text-muted)' }}>
                {pct(row.value, costs.total)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary table */}
      <div className="card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Category</th>
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual cost (USD)</th>
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>% of total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{row.label}</td>
                <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>{pct(row.value, costs.total)}%</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--gx-border)', fontWeight: 700 }}>
              <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>Total annual</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>${fmt(costs.total)}</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Establishment cost */}
      {costs.establishmentCost > 0 && (
        <div className="card p-4 mb-6 flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>Establishment cost (one-off)</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
              Capital equipment to be purchased before operations begin
            </div>
          </div>
          <div className="text-xl font-bold" style={{ color: 'var(--gx-text)' }}>
            ${fmt(costs.establishmentCost)}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mt-4">
        <button
          onClick={handleSave}
          className="px-5 py-2 rounded text-sm font-semibold"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          Save project
        </button>
        <button
          onClick={handlePrint}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          Export PDF (print)
        </button>
        <button
          onClick={() => navigate('/wizard/1')}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          ← Edit inputs
        </button>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          Home
        </button>
      </div>
    </div>
  )
}
