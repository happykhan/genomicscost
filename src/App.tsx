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

export default function App() {
  return (
    <ProjectProvider>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--gx-bg)', color: 'var(--gx-text)' }}>
        <NavBar
          appName="Genomics Costing Tool"
          appSubtitle="Genomic surveillance lab cost estimator"
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
