import { useProject } from '../../store/ProjectContext'
import catalogue from '../../data/catalogue.json'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

export default function Step1() {
  const { project, updateProject } = useProject()

  const filteredPathogens = catalogue.pathogens.filter(p => {
    if (!project.pathogenType) return true
    return p.type.toLowerCase() === (project.pathogenType === 'viral' ? 'virus' : 'bacteria')
  })

  function handlePathogenChange(name: string) {
    const found = catalogue.pathogens.find(p => p.name === name)
    updateProject({
      pathogenName: name,
      genomeSizeMb: found?.genome_size_mb ?? project.genomeSizeMb,
    })
  }

  function handlePathogenTypeChange(type: 'viral' | 'bacterial') {
    updateProject({ pathogenType: type, pathogenName: '', genomeSizeMb: 0 })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 1: Setup</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        Tell us about your lab and the pathogen you're sequencing.
      </p>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Lab / project name</label>
            <input
              type="text"
              className={inputClass}
              value={project.name}
              placeholder="e.g. National Reference Lab"
              onChange={e => updateProject({ name: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Country</label>
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
            <label className={labelClass}>Year</label>
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
            <label className={labelClass}>Samples per year</label>
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
          <label className={labelClass}>Pathogen type</label>
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
                <span style={{ color: 'var(--gx-text)', textTransform: 'capitalize' }}>{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Pathogen</label>
          <select
            className={inputClass}
            value={project.pathogenName}
            onChange={e => handlePathogenChange(e.target.value)}
          >
            <option value="">Select a pathogen…</option>
            {filteredPathogens.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Genome size (Mb) — auto-filled from pathogen</label>
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
            You can edit this if your pathogen has a non-standard genome size.
          </div>
        </div>
      </div>
    </div>
  )
}
