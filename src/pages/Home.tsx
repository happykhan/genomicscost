import { useNavigate } from 'react-router-dom'
import { useProject } from '../store/ProjectContext'

const STEP_DESCRIPTIONS = [
  { n: 1, label: 'Setup', desc: 'Lab name, country, pathogen and annual sample volume' },
  { n: 2, label: 'Platform', desc: 'Sequencing platform, reagent kits and library preparation' },
  { n: 3, label: 'Consumables', desc: 'Lab consumables and reagent costs per sample' },
  { n: 4, label: 'Equipment', desc: 'Capital equipment — buy, have, or skip' },
  { n: 5, label: 'Personnel', desc: 'Staff roles, salaries and time allocated to sequencing' },
  { n: 6, label: 'Facility', desc: 'Rent, utilities, transport and bioinformatics' },
  { n: 7, label: 'Results', desc: 'Full cost breakdown and PDF export' },
]

export default function Home() {
  const navigate = useNavigate()
  const { savedProjects, loadProject, deleteProject, newProject } = useProject()

  function handleNewProject() {
    newProject()
    navigate('/wizard/1')
  }

  function handleLoadProject(id: string) {
    loadProject(id)
    navigate('/wizard/1')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--gx-text)' }}>
          Genomics Costing Tool
        </h1>
        <p className="text-lg mb-6" style={{ color: 'var(--gx-text-muted)' }}>
          Estimate the cost of running a genomic surveillance laboratory
        </p>
        <p className="text-sm mb-8 max-w-xl mx-auto" style={{ color: 'var(--gx-text-muted)' }}>
          Based on the WHO Genomics Costing Tool (second edition). Walk through 7 guided steps to
          estimate reagent, equipment, personnel and facility costs — then export a PDF summary.
        </p>
        <button
          onClick={handleNewProject}
          className="px-8 py-3 rounded-lg text-base font-semibold"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          New project
        </button>
      </div>

      {/* Step overview */}
      <div className="card p-6 mb-10">
        <h2 className="text-sm uppercase tracking-wider mb-4 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
          What you'll configure
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STEP_DESCRIPTIONS.map(s => (
            <div
              key={s.n}
              className="flex gap-3 items-start p-3 rounded-lg"
              style={{ background: 'var(--gx-bg-alt)' }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
              >
                {s.n}
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saved projects */}
      {savedProjects.length > 0 && (
        <div>
          <h2 className="text-sm uppercase tracking-wider mb-4 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            Saved projects
          </h2>
          <div className="flex flex-col gap-2">
            {savedProjects.map(p => (
              <div
                key={p.id}
                className="card p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: 'var(--gx-text)' }}>
                    {p.name || 'Unnamed project'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
                    {p.country || 'No country'} · {p.pathogenName || 'No pathogen'} · {p.samplesPerYear} samples/yr · {p.year}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleLoadProject(p.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
