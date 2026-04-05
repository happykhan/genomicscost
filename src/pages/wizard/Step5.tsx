import { useProject } from '../../store/ProjectContext'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function Step5() {
  const { project, updateProject } = useProject()
  const { personnel } = project

  function updatePerson(index: number, patch: Partial<typeof personnel[0]>) {
    const next = personnel.map((p, i) => i === index ? { ...p, ...patch } : p)
    updateProject({ personnel: next })
  }

  function addPerson() {
    updateProject({
      personnel: [...personnel, { role: 'New role', annualSalaryUsd: 30000, pctTime: 20, trainingCostUsd: 1000 }],
    })
  }

  function removePerson(index: number) {
    updateProject({ personnel: personnel.filter((_, i) => i !== index) })
  }

  const salaryTotal = personnel.reduce((sum, p) => sum + p.annualSalaryUsd * p.pctTime / 100, 0)
  const trainingTotal = personnel.reduce((sum, p) => sum + (p.trainingCostUsd ?? 0), 0)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 5: Personnel</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        Enter annual salary, % time on genomic surveillance, and annual training costs per role.
      </p>

      <div className="flex flex-col gap-3">
        {personnel.map((person, idx) => {
          const annualCost = person.annualSalaryUsd * person.pctTime / 100
          const training = person.trainingCostUsd ?? 0
          return (
            <div key={idx} className="card p-4">
              <div className="flex flex-wrap gap-4 items-start">
                {/* Role name */}
                <div className="flex-1 min-w-36">
                  <label className={labelClass}>Role</label>
                  <input
                    type="text"
                    value={person.role}
                    onChange={e => updatePerson(idx, { role: e.target.value })}
                    className={inputClass}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Salary */}
                <div style={{ width: 140 }}>
                  <label className={labelClass}>Annual salary (USD)</label>
                  <input
                    type="number"
                    value={person.annualSalaryUsd}
                    min={0}
                    onChange={e => updatePerson(idx, { annualSalaryUsd: parseInt(e.target.value) || 0 })}
                    className={inputClass}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* % time slider */}
                <div className="flex-1 min-w-48">
                  <label className={labelClass}>% time on sequencing — {person.pctTime}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={person.pctTime}
                    onChange={e => updatePerson(idx, { pctTime: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
                  />
                </div>

                {/* Feature 1: Training cost per year */}
                <div style={{ width: 130 }}>
                  <label className={labelClass}>Training cost (USD/yr)</label>
                  <input
                    type="number"
                    value={training}
                    min={0}
                    onChange={e => updatePerson(idx, { trainingCostUsd: parseInt(e.target.value) || 0 })}
                    className={inputClass}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Annual attributed */}
                <div style={{ minWidth: 100, textAlign: 'right' }}>
                  <label className={labelClass}>Annual cost</label>
                  <div className="text-sm font-semibold pt-2" style={{ color: 'var(--gx-accent)' }}>
                    ${fmt(annualCost)}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
                    + ${fmt(training)} training
                  </div>
                </div>

                {/* Remove */}
                <button
                  onClick={() => removePerson(idx)}
                  className="text-xs px-2 py-0.5 rounded mt-5"
                  style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={addPerson}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          + Add role
        </button>
        <div className="text-sm font-semibold flex gap-4">
          <span>
            Salaries: <span style={{ color: 'var(--gx-accent)' }}>${fmt(salaryTotal)}</span>
          </span>
          <span>
            Training: <span style={{ color: 'var(--gx-accent)' }}>${fmt(trainingTotal)}</span>
          </span>
          <span>
            Total: <span style={{ color: 'var(--gx-accent)' }}>${fmt(salaryTotal + trainingTotal)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
