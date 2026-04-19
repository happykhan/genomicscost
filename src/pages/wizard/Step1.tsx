import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import catalogue from '../../data/catalogue.json'
import Tooltip from '../../components/Tooltip'
import type { PathogenEntry } from '../../types'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

const DEFAULT_PATHOGEN_ENTRY: PathogenEntry = {
  pathogenName: 'SARS-CoV-2',
  pathogenType: 'viral',
  genomeSizeMb: 0.03,
  samplesPerYear: 100,
}

export default function Step1() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()

  const pathogens = project.pathogens ?? []
  const totalSamplesPerYear = pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

  function updatePathogenEntry(index: number, patch: Partial<PathogenEntry>) {
    const next = pathogens.map((p, i) => i === index ? { ...p, ...patch } : p)
    updateProject({ pathogens: next })
  }

  function handlePathogenSelect(index: number, name: string) {
    const found = catalogue.pathogens.find(p => p.name === name)
    if (found) {
      updatePathogenEntry(index, {
        pathogenName: found.name,
        genomeSizeMb: found.genome_size_mb ?? 0,
        pathogenType: found.type.toLowerCase() === 'bacteria' ? 'bacterial' : 'viral',
      })
    } else {
      updatePathogenEntry(index, { pathogenName: name })
    }
  }

  function addPathogen() {
    updateProject({ pathogens: [...pathogens, { ...DEFAULT_PATHOGEN_ENTRY }] })
  }

  function removePathogen(index: number) {
    updateProject({ pathogens: pathogens.filter((_, i) => i !== index) })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step1_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step1_desc')}
      </p>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('field_project_name')}</label>
            <input
              type="text"
              className={inputClass}
              value={project.name}
              placeholder="e.g. National Reference Lab"
              onChange={e => updateProject({ name: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>{t('field_country')}</label>
            <input
              type="text"
              className={inputClass}
              value={project.country}
              placeholder="e.g. Uganda"
              onChange={e => updateProject({ country: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t('field_year')}</label>
            <input
              type="number"
              className={inputClass}
              value={project.year}
              min={2020}
              max={2035}
              onChange={e => updateProject({ year: parseInt(e.target.value) || 2025 })}
            />
          </div>
        </div>

        {/* Multi-pathogen list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass} style={{ marginBottom: 0 }}>
              {t('field_pathogen_name')}<Tooltip content={t('tooltip_pathogen_name')} />
            </label>
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                    {t('field_pathogen_name')}
                  </th>
                  <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                    {t('field_pathogen_type')}
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                    {t('field_genome_size')}
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                    {t('field_samples_per_year')}<Tooltip content={t('tooltip_samples_per_year')} />
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pathogens.map((entry, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                    <td className="px-3 py-2" style={{ minWidth: 220 }}>
                      <select
                        className={inputClass}
                        value={entry.pathogenName}
                        onChange={e => handlePathogenSelect(index, e.target.value)}
                      >
                        <option value="">{t('opt_select_pathogen')}</option>
                        {catalogue.pathogens.map(p => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                        {/* Show current value if it's not in catalogue */}
                        {entry.pathogenName && !catalogue.pathogens.find(p => p.name === entry.pathogenName) && (
                          <option value={entry.pathogenName}>{entry.pathogenName}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 110 }}>
                      <select
                        className={inputClass}
                        value={entry.pathogenType}
                        onChange={e => updatePathogenEntry(index, { pathogenType: e.target.value as 'bacterial' | 'viral' })}
                      >
                        <option value="viral">{t('opt_viral')}</option>
                        <option value="bacterial">{t('opt_bacterial')}</option>
                      </select>
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 110 }}>
                      <input
                        type="number"
                        className={inputClass}
                        value={entry.genomeSizeMb}
                        step={0.001}
                        min={0}
                        onChange={e => updatePathogenEntry(index, { genomeSizeMb: parseFloat(e.target.value) || 0 })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ minWidth: 110 }}>
                      <input
                        type="number"
                        className={inputClass}
                        value={entry.samplesPerYear}
                        min={1}
                        onChange={e => updatePathogenEntry(index, { samplesPerYear: parseInt(e.target.value) || 1 })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {pathogens.length > 1 && (
                        <button
                          onClick={() => removePathogen(index)}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                        >
                          {t('btn_remove')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr style={{ borderTop: '2px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
                  <td className="px-3 py-2 text-xs font-semibold" colSpan={3} style={{ color: 'var(--gx-text-muted)' }}>
                    {t('label_annual_total')}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-sm" style={{ color: 'var(--gx-text)' }}>
                    {totalSamplesPerYear.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <button
            onClick={addPathogen}
            className="mt-3 px-4 py-2 rounded text-sm font-medium"
            style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
          >
            + {t('btn_add')} pathogen
          </button>
        </div>

        {/* Feature 4: local currency */}
        <div className="pt-2" style={{ borderTop: '1px solid var(--gx-border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_local_currency')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('field_currency_code')}</label>
              <input
                type="text"
                className={inputClass}
                value={project.currency}
                placeholder="USD"
                maxLength={8}
                onChange={e => updateProject({ currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className={labelClass}>{t('field_exchange_rate')}</label>
              <input
                type="number"
                className={inputClass}
                value={project.exchangeRate}
                min={0}
                step={0.01}
                onChange={e => updateProject({ exchangeRate: parseFloat(e.target.value) || 1 })}
              />
              <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
                {t('note_usd_default')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
