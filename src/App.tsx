import { Routes, Route, Navigate } from 'react-router-dom'
import { ProjectProvider } from './store/ProjectContext'
import { NavBar } from '@genomicx/ui'
import Home from './pages/Home'
import About from './pages/About'
import WizardShell from './components/WizardShell'
import Step1 from './pages/wizard/Step1'
import Step2 from './pages/wizard/Step2'
import Step3 from './pages/wizard/Step3'
import Step4 from './pages/wizard/Step4'
import Step5 from './pages/wizard/Step5'
import Step6 from './pages/wizard/Step6'
import Step7 from './pages/wizard/Step7'

const AppIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28">
    <rect width="32" height="32" rx="7" fill="#0f172a"/>
    <rect x="5"  y="22" width="5" height="6"  rx="1.5" fill="#2dd4bf" opacity="0.45"/>
    <rect x="13" y="16" width="5" height="12" rx="1.5" fill="#2dd4bf" opacity="0.70"/>
    <rect x="21" y="9"  width="6" height="19" rx="1.5" fill="#2dd4bf"/>
    <circle cx="7.5"   cy="20"   r="3"   fill="#2dd4bf" opacity="0.45"/>
    <circle cx="15.5"  cy="13.5" r="3"   fill="#2dd4bf" opacity="0.70"/>
    <circle cx="24"    cy="6.5"  r="3.5" fill="#2dd4bf"/>
    <line x1="10.5" y1="19.2" x2="12.5" y2="14.5" stroke="#2dd4bf" stroke-width="1.2" opacity="0.4" strokeLinecap="round"/>
    <line x1="18.5" y1="12.5" x2="20.5" y2="8"    stroke="#2dd4bf" stroke-width="1.2" opacity="0.55" strokeLinecap="round"/>
  </svg>
)

export default function App() {
  return (
    <ProjectProvider>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--gx-bg)', color: 'var(--gx-text)' }}>
        <NavBar
          appName="Genomics Costing Tool"
          appSubtitle="Genomic surveillance lab cost estimator"
          icon={<AppIcon />}
          githubUrl="https://github.com/happykhan/genomicscost"
          actions={<a href="/about" style={{ color: 'var(--gx-text-muted)', fontSize: '0.85rem' }}>About</a>}
        />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/wizard/1" element={<WizardShell step={1}><Step1 /></WizardShell>} />
            <Route path="/wizard/2" element={<WizardShell step={2}><Step2 /></WizardShell>} />
            <Route path="/wizard/3" element={<WizardShell step={3}><Step3 /></WizardShell>} />
            <Route path="/wizard/4" element={<WizardShell step={4}><Step4 /></WizardShell>} />
            <Route path="/wizard/5" element={<WizardShell step={5}><Step5 /></WizardShell>} />
            <Route path="/wizard/6" element={<WizardShell step={6}><Step6 /></WizardShell>} />
            <Route path="/wizard/7" element={<WizardShell step={7}><Step7 /></WizardShell>} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ProjectProvider>
  )
}
