import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ProjectProvider, shareProjectLoaded } from './store/ProjectContext'
import { LANGUAGES } from './i18n/config'
import './i18n/config'
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

function GlobePicker() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Language"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          color: 'var(--gx-text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.8rem',
        }}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.33 6h2.01A13.27 13.27 0 006 10c0 1.4.18 2.74.5 4H4.33A7.96 7.96 0 012 10c0-1.44.38-2.8 1.05-4H4.33zm1.5 0h8.34c.37 1.26.58 2.6.58 4s-.21 2.74-.58 4H5.83A12.14 12.14 0 015.25 10c0-1.4.2-2.74.58-4zm9.84 0h.02C16.62 7.2 17 8.56 17 10s-.38 2.8-1.05 4h-1.62c.32-1.26.5-2.6.5-4s-.18-2.74-.5-4h-.67zM10 2.08c.9 0 2.1 1.46 2.84 3.92H7.16C7.9 3.54 9.1 2.08 10 2.08zm0 15.84c-.9 0-2.1-1.46-2.84-3.92h5.68C12.1 16.46 10.9 17.92 10 17.92z" clipRule="evenodd"/>
        </svg>
        {lang.toUpperCase()}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          background: 'var(--gx-bg)',
          border: '1px solid var(--gx-border)',
          borderRadius: 'var(--gx-radius)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: 130,
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <button
              key={code}
              onClick={() => { i18n.changeLanguage(code); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 14px',
                background: code === lang ? 'var(--gx-bg-alt)' : 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
                color: code === lang ? 'var(--gx-accent)' : 'var(--gx-text)',
                fontWeight: code === lang ? 600 : 400,
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LangFooter() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="no-print" style={{
      borderTop: '1px solid var(--gx-border)',
      padding: '12px 24px',
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      flexWrap: 'wrap',
    }}>
      {Object.entries(LANGUAGES).map(([code, name]) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.78rem',
            color: code === lang ? 'var(--gx-accent)' : 'var(--gx-text-muted)',
            fontWeight: code === lang ? 600 : 400,
            padding: '2px 6px',
          }}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function WizardTabBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const match = location.pathname.match(/^\/wizard\/(\d+)$/)
  if (!match) return null
  const currentStep = parseInt(match[1])

  const STEPS = [
    { n: 1, label: t('step1_label') },
    { n: 2, label: t('step2_label') },
    { n: 3, label: t('step3_label') },
    { n: 4, label: t('step4_label') },
    { n: 5, label: t('step5_label') },
    { n: 6, label: t('step6_label') },
    { n: 7, label: t('step7_label') },
  ]

  return (
    <div className="no-print" style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg)', overflowX: 'auto' }}>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 0', minWidth: 'max-content' }}>
        {STEPS.flatMap((s, i) => {
          const isActive = s.n === currentStep
          const isDone = s.n < currentStep
          const items = []
          if (i > 0) {
            items.push(
              <div
                key={`line-${s.n}`}
                style={{
                  width: 32,
                  height: 2,
                  marginTop: 13,
                  flexShrink: 0,
                  background: isDone || isActive ? 'var(--gx-accent)' : 'var(--gx-border)',
                  transition: 'background 0.2s',
                }}
              />
            )
          }
          items.push(
            <button
              key={s.n}
              onClick={() => navigate(`/wizard/${s.n}`)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: isActive || isDone ? 'var(--gx-accent)' : 'var(--gx-bg-alt)',
                border: `2px solid ${isActive || isDone ? 'var(--gx-accent)' : 'var(--gx-border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isActive || isDone ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                fontSize: '0.72rem', fontWeight: 700,
                transition: 'background 0.2s, border-color 0.2s',
              }}>
                {isDone ? '✓' : s.n}
              </div>
              <span style={{
                fontSize: '0.68rem',
                color: isActive ? 'var(--gx-accent)' : isDone ? 'var(--gx-text)' : 'var(--gx-text-muted)',
                fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap',
                maxWidth: 72,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {s.label}
              </span>
            </button>
          )
          return items
        })}
      </div>
      </div>
    </div>
  )
}

function LangRedirect({ lang }: { lang: string }) {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  useEffect(() => {
    i18n.changeLanguage(lang).then(() => navigate('/', { replace: true }))
  }, [lang, i18n, navigate])
  return null
}

function MobileLangPicker() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
      {Object.entries(LANGUAGES).map(([code, name]) => (
        <button
          key={code}
          onClick={() => i18n.changeLanguage(code)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.82rem',
            color: code === lang ? 'var(--gx-accent)' : 'var(--gx-text-muted)',
            fontWeight: code === lang ? 600 : 400,
            padding: '2px 6px',
          }}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

function AppInner() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    if (shareProjectLoaded) {
      navigate('/wizard/7', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--gx-bg)', color: 'var(--gx-text)' }}>
      <NavBar
        appName="Genomics Costing Tool"
        appSubtitle={t('app_subtitle')}
        icon={<AppIcon />}
        githubUrl="https://github.com/happykhan/genomicscost"
        actions={<GlobePicker />}
        mobileActions={<MobileLangPicker />}
      />
      <WizardTabBar />
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
          {Object.keys(LANGUAGES).map(code => (
            <Route key={code} path={`/${code}`} element={<LangRedirect lang={code} />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <LangFooter />
    </div>
  )
}

export default function App() {
  return (
    <ProjectProvider>
      <AppInner />
    </ProjectProvider>
  )
}
