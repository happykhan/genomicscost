import { useProject } from '../../store/ProjectContext'
import { useTranslation } from '../../i18n'
import catalogue from '../../data/catalogue.json'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

export default function Step1() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()

  const filteredPathogens = catalogue.pathogens.filter(p => {
    if (!project.pathogenType) return true
    return p.type.toLowerCase() === (project.pathogenType === 'viral' ? 'virus' : 'bacteria')
  })

  function handlePathogenChange(name: string) {
    if (name === '__capture_all__') {
      updateProject({ pathogenName: 'Multiple pathogens (capture-all)', genomeSizeMb: 0 })
      return
    }
    const found = catalogue.pathogens.find(p => p.name === name)
    updateProject({
      pathogenName: name,
      genomeSizeMb: found?.genome_size_mb ?? project.genomeSizeMb,
    })
  }

  function handlePathogenTypeChange(type: 'viral' | 'bacterial') {
    updateProject({ pathogenType: type, pathogenName: '', genomeSizeMb: 0 })
  }

  const isCaptureAll = project.pathogenName === 'Multiple pathogens (capture-all)'

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
          <div>
            <label className={labelClass}>{t('field_samples_per_year')}</label>
            <input
              type="number"
              className={inputClass}
              value={project.samplesPerYear}
              min={1}
              onChange={e => updateProject({ samplesPerYear: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('field_pathogen_type')}</label>
          <div className="flex gap-3">
            {(['viral', 'bacterial'] as const).map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="pathogenType"
                  value={type}
                  checked={project.pathogenType === type}
                  onChange={() => handlePathogenTypeChange(type)}
                  style={{ accentColor: 'var(--gx-accent)' }}
                />
                <span style={{ color: 'var(--gx-text)' }}>
                  {type === 'viral' ? t('opt_viral') : t('opt_bacterial')}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('field_pathogen_name')}</label>
          <select
            className={inputClass}
            value={isCaptureAll ? '__capture_all__' : project.pathogenName}
            onChange={e => handlePathogenChange(e.target.value)}
          >
            <option value="">Select a pathogen…</option>
            <option value="__capture_all__">Multiple pathogens (capture-all)</option>
            {filteredPathogens.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Feature 7: hide genome size / coverage for capture-all; show min reads instead */}
        {!isCaptureAll && (
          <div>
            <label className={labelClass}>{t('field_genome_size')} — auto-filled from pathogen</label>
            <input
              type="number"
              className={inputClass}
              value={project.genomeSizeMb}
              step={0.001}
              min={0}
              onChange={e => updateProject({ genomeSizeMb: parseFloat(e.target.value) || 0 })}
              style={{ color: 'var(--gx-text-muted)' }}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
              {t('note_genome_size_edit')}
            </div>
          </div>
        )}

        {isCaptureAll && (
          <div className="p-3 rounded text-sm" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)', color: 'var(--gx-text-muted)' }}>
            {t('note_capture_all_mode')}
          </div>
        )}

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
