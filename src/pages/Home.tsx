import { useNavigate } from 'react-router-dom'
import { useProject } from '../store/ProjectContext'
import { useTranslation } from 'react-i18next'

export default function Home() {
  const navigate = useNavigate()
  const { savedProjects, loadProject, deleteProject, newProject } = useProject()
  const { t } = useTranslation()

  const STEP_DESCRIPTIONS = [
    { n: 1, label: t('step1_label'), desc: t('step1_desc') },
    { n: 2, label: t('step2_label'), desc: t('step2_desc') },
    { n: 3, label: t('step3_label'), desc: t('step3_desc') },
    { n: 4, label: t('step4_label'), desc: t('step4_desc') },
    { n: 5, label: t('step5_label'), desc: t('step5_desc') },
    { n: 6, label: t('step6_label'), desc: t('step6_desc') },
    { n: 7, label: t('step7_label'), desc: t('step7_desc') },
  ]

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
          {t('home_title')}
        </h1>
        <p className="text-lg mb-6" style={{ color: 'var(--gx-text-muted)' }}>
          {t('home_subtitle')}
        </p>
        <p className="text-sm mb-8 max-w-xl mx-auto" style={{ color: 'var(--gx-text-muted)' }}>
          {t('home_based_on')}
        </p>
        <button
          onClick={handleNewProject}
          className="px-8 py-3 rounded-lg text-base font-semibold"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('home_start')}
        </button>
      </div>

      {/* Step overview */}
      <div className="card p-6 mb-10">
        <h2 className="text-sm uppercase tracking-wider mb-4 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
          {t('home_what_configure')}
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
                {s.desc && <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>{s.desc}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saved projects */}
      {savedProjects.length > 0 && (
        <div>
          <h2 className="text-sm uppercase tracking-wider mb-4 font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
            {t('home_load')}
          </h2>
          <div className="flex flex-col gap-2">
            {savedProjects.map(p => (
              <div
                key={p.id}
                className="card p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: 'var(--gx-text)' }}>
                    {p.name || t('label_unnamed_project')}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
                    {p.country || t('label_no_country')} · {p.pathogens.map(ph => ph.pathogenName).filter(Boolean).join(', ') || t('label_no_pathogen')} · {p.pathogens.reduce((sum, ph) => sum + ph.samplesPerYear, 0)} {t('label_samples_per_yr')} · {p.year}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleLoadProject(p.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
                  >
                    {t('btn_open')}
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium"
                    style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
                  >
                    {t('btn_remove')}
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
