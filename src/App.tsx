import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ProjectProvider, shareProjectLoaded } from './store/ProjectContext'
import { LANGUAGES } from './i18n/config'
import './i18n/config'
import { NavBar } from '@genomicx/ui'
import Home from './pages/Home'
import About from './pages/About'
import Catalogue from './pages/Catalogue'
import WizardShell from './components/WizardShell'
import Step1 from './pages/wizard/Step1'
import Step2 from './pages/wizard/Step2'
import Step3 from './pages/wizard/Step3'
import Step4 from './pages/wizard/Step4'
import Step5 from './pages/wizard/Step5'
import Step6 from './pages/wizard/Step6'
import Step7 from './pages/wizard/Step7'
import Step8 from './pages/wizard/Step8'

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
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7.5"/>
          <ellipse cx="10" cy="10" rx="3" ry="7.5"/>
          <line x1="2.5" y1="10" x2="17.5" y2="10"/>
          <path d="M3.5 6.5 Q10 4.5 16.5 6.5"/>
          <path d="M3.5 13.5 Q10 15.5 16.5 13.5"/>
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

declare const __APP_VERSION__: string

function LangFooter() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return (
    <div className="no-print" style={{
      borderTop: '1px solid var(--gx-border)',
      padding: '12px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--gx-text-muted)' }}>
        GCT v{__APP_VERSION__}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
    { n: 8, label: t('step8_label') },
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

function NavLinks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const linkStyle = (path: string): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 8px',
    color: location.pathname === path ? 'var(--gx-accent)' : 'var(--gx-text-muted)',
    fontSize: '0.82rem',
    fontWeight: location.pathname === path ? 600 : 400,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => navigate('/catalogue')} style={linkStyle('/catalogue')}>{t('nav_catalogue')}</button>
      <button onClick={() => navigate('/about')} style={linkStyle('/about')}>{t('nav_about')}</button>
      <GlobePicker />
    </div>
  )
}

function MobileNavLinks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={() => navigate('/catalogue')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0', color: 'var(--gx-text)', fontSize: '0.85rem' }}
      >
        {t('nav_catalogue')}
      </button>
      <button
        onClick={() => navigate('/about')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0', color: 'var(--gx-text)', fontSize: '0.85rem' }}
      >
        {t('nav_about')}
      </button>
      <MobileLangPicker />
    </div>
  )
}

function AppInner() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    if (shareProjectLoaded) {
      navigate('/wizard/8', { replace: true })
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
        actions={<NavLinks />}
        mobileActions={<MobileNavLinks />}
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
          <Route path="/wizard/8" element={<WizardShell step={8}><Step8 /></WizardShell>} />
          <Route path="/catalogue" element={<Catalogue />} />
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
