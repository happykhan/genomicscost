import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import Tooltip from '../../components/Tooltip'
import { fmt } from '../../lib/format'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

export default function Step5() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const { personnel } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

  function updatePerson(index: number, patch: Partial<typeof personnel[0]>) {
    const next = personnel.map((p, i) => i === index ? { ...p, ...patch } : p)
    updateProject({ personnel: next })
  }

  function addPerson() {
    updateProject({
      personnel: [...personnel, { role: 'New role', annualSalaryUsd: 30000, pctTime: 20 }],
    })
  }

  function removePerson(index: number) {
    updateProject({ personnel: personnel.filter((_, i) => i !== index) })
  }

  const salaryTotal = personnel.reduce((sum, p) => sum + p.annualSalaryUsd * p.pctTime / 100, 0)
  const trainingTotal = project.trainingGroupCostUsd ?? 0
  const adminPct = project.adminCostPct ?? 0
  const adminCost = (salaryTotal + trainingTotal) * adminPct / 100
  const totalPersonnelTraining = salaryTotal + trainingTotal + adminCost
  const trainingPerSample = samplesPerYear > 0 ? trainingTotal / samplesPerYear : 0
  const totalPerSample = samplesPerYear > 0 ? totalPersonnelTraining / samplesPerYear : 0
  const adminPerSample = samplesPerYear > 0 ? adminCost / samplesPerYear : 0

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step5_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step5_desc')}
      </p>

      <div className="flex flex-col gap-3">
        {personnel.map((person, idx) => {
          const annualCost = person.annualSalaryUsd * person.pctTime / 100
          return (
            <div key={idx} className="card p-4">
              <div className="flex flex-wrap gap-4 items-start">
                {/* Role name */}
                <div className="flex-1 min-w-36">
                  <label className={labelClass}>{t('col_role')}</label>
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
                  <label className={labelClass}>{t('col_salary')}<Tooltip content={t('tooltip_annual_salary')} /></label>
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
                  <label className={labelClass}>{t('col_pct_time')} — {person.pctTime}%<Tooltip content={t('tooltip_pct_time')} /></label>
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

                {/* Annual attributed */}
                <div style={{ minWidth: 100, textAlign: 'right' }}>
                  <label className={labelClass}>{t('col_annual_cost')}</label>
                  <div className="text-sm font-semibold pt-2" style={{ color: 'var(--gx-accent)' }}>
                    ${fmt(annualCost)}
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
          {t('btn_add')}
        </button>
        <div className="text-sm font-semibold">
          <span>
            {t('label_salaries')}: <span style={{ color: 'var(--gx-accent)' }}>${fmt(salaryTotal)}</span>
          </span>
        </div>
      </div>

      {/* Group-level training and admin cost */}
      <div className="card p-4 mt-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>Training and admin overhead</h3>
        <div className="flex flex-wrap gap-6 items-end">
          <div style={{ width: 200 }}>
            <label className={labelClass}>Annual training cost (USD)<Tooltip content="Total annual training budget for the entire sequencing team. Covers wet-lab and bioinformatics training." /></label>
            <input
              type="number"
              value={project.trainingGroupCostUsd ?? 5000}
              min={0}
              onChange={e => updateProject({ trainingGroupCostUsd: parseInt(e.target.value) || 0 })}
              className={inputClass}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ width: 180 }}>
            <label className={labelClass}>Additional admin cost %<Tooltip content="Administrative overhead percentage applied to the combined personnel and training cost. E.g. 10% adds 10% of (salaries + training) as an admin line item." /></label>
            <input
              type="number"
              value={project.adminCostPct ?? 0}
              min={0}
              max={50}
              step={1}
              onChange={e => updateProject({ adminCostPct: Math.min(50, parseInt(e.target.value) || 0) })}
              className={inputClass}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Summary outputs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Annual training cost</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(trainingTotal)}</div>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>
              ${fmt(trainingPerSample)}/sample
            </div>
          </div>
          {adminPct > 0 && (
            <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Admin cost ({adminPct}%)</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(adminCost)}</div>
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                ${fmt(adminPerSample)}/sample
              </div>
            </div>
          )}
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Total personnel + training{adminPct > 0 ? ' + admin' : ''}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(totalPersonnelTraining)}</div>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>
              ${fmt(totalPerSample)}/sample
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
