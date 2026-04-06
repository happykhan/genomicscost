import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { WORKFLOW_STEPS, WORKFLOW_STEP_LABELS } from '../../lib/calculations'

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtCurrency(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export default function Step7() {
  const { project, costs, saveProject } = useProject()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { exchangeRate, currency, samplesPerYear } = project
  const showLocalCurrency = exchangeRate !== 1 || currency !== 'USD'

  const rows = [
    { label: t('label_sequencing_reagents'), value: costs.sequencingReagents },
    { label: t('label_library_prep'), value: costs.libraryPrep },
    { label: t('label_consumables'), value: costs.consumables },
    { label: t('label_equipment'), value: costs.equipment },
    { label: t('label_personnel'), value: costs.personnel },
    { label: t('label_training'), value: costs.training },
    { label: t('label_facility'), value: costs.facility },
    { label: t('label_transport'), value: costs.transport },
    { label: t('label_bioinformatics'), value: costs.bioinformatics },
    { label: t('label_qms'), value: costs.qms },
  ].filter(r => r.value > 0)

  const maxValue = Math.max(...rows.map(r => r.value), 1)

  // Workflow breakdown rows — use translated labels where available
  const workflowRows = WORKFLOW_STEPS.map(step => ({
    step,
    label: WORKFLOW_STEP_LABELS[step],
    value: costs.workflowBreakdown[step] ?? 0,
  }))
  const workflowTotal = workflowRows.reduce((s, r) => s + r.value, 0)

  function handleSave() {
    saveProject()
    toast.success(t('toast_project_saved'))
  }

  function handlePrint() {
    window.print()
  }

  function handleExportCSV() {
    const sep = ','
    const lines: string[] = [
      `${t('col_category')}${sep}${t('col_annual_usd')}${sep}${t('col_pct_of_total')}`,
      ...rows.map(r => `${r.label}${sep}${r.value}${sep}${pct(r.value, costs.total)}`),
      `${t('label_annual_total')}${sep}${costs.total}${sep}100`,
      '',
      `${t('label_cost_per_sample')}${sep}${costs.costPerSample}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name || 'genomics-cost'}-results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleShare() {
    try {
      // unescape(encodeURIComponent()) converts UTF-8 to Latin-1 bytes safe for btoa
      // ~3× shorter than btoa(encodeURIComponent()) which double-encodes ASCII chars
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(project))))
      const url = `${window.location.origin}/#share=${encoded}`
      navigator.clipboard.writeText(url)
      toast.success(t('toast_link_copied'))
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className="gx-print-region">
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step7_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {project.name || t('label_unnamed_project')} · {project.country || t('label_no_country')} · {project.year}
      </p>

      {/* Main cost per sample card */}
      <div
        className="rounded-xl p-8 text-center mb-8 gx-cost-hero"
        style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ opacity: 0.85 }}>
          {t('label_cost_per_sample')}
        </div>
        <div className="text-6xl font-bold mb-1">
          ${fmt(costs.costPerSample)}
        </div>
        {showLocalCurrency && (
          <div className="text-2xl font-semibold mt-1" style={{ opacity: 0.85 }}>
            {fmtCurrency(costs.costPerSample * exchangeRate)} {currency}
          </div>
        )}
        <div className="text-sm mt-1" style={{ opacity: 0.75 }}>
          {samplesPerYear} {t('label_samples_per_yr')} · {project.pathogenName || t('label_no_pathogen')}
        </div>
      </div>

      {/* Breakdown chart — hidden in print (tables below have the same data) */}
      <div className="card p-5 mb-6 no-print">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--gx-text)' }}>{t('label_cost_breakdown')}</h3>
        <div className="flex flex-col gap-2">
          {rows.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-36 text-xs text-right flex-shrink-0" style={{ color: 'var(--gx-text-muted)' }}>
                {row.label}
              </div>
              <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ background: 'var(--gx-bg-alt)' }}>
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${(row.value / maxValue) * 100}%`,
                    background: 'var(--gx-accent)',
                    opacity: 0.85,
                  }}
                />
              </div>
              <div className="w-20 text-xs text-right flex-shrink-0 font-medium" style={{ color: 'var(--gx-text)' }}>
                ${fmt(row.value)}
              </div>
              <div className="w-10 text-xs text-right flex-shrink-0" style={{ color: 'var(--gx-text-muted)' }}>
                {pct(row.value, costs.total)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary table — Feature 4: local currency column */}
      <div className="card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_category')}</th>
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual_usd')}</th>
              {showLocalCurrency && (
                <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual_currency', { currency })}</th>
              )}
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pct_of_total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{row.label}</td>
                <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
                {showLocalCurrency && (
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>
                    {fmtCurrency(row.value * exchangeRate)}
                  </td>
                )}
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>{pct(row.value, costs.total)}%</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--gx-border)', fontWeight: 700 }}>
              <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{t('label_annual_total')}</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>${fmt(costs.total)}</td>
              {showLocalCurrency && (
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(costs.total * exchangeRate)} {currency}
                </td>
              )}
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Feature 5: Workflow step breakdown */}
      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>{t('label_workflow_breakdown')}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_workflow_step')}</th>
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual_usd')}</th>
              {showLocalCurrency && (
                <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual_currency', { currency })}</th>
              )}
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_cost_per_sample_usd')}</th>
              {showLocalCurrency && (
                <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_cost_per_sample_currency', { currency })}</th>
              )}
              <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {workflowRows.map(row => {
              const perSample = samplesPerYear > 0 ? row.value / samplesPerYear : 0
              return (
                <tr key={row.step} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{row.label}</td>
                  <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
                  {showLocalCurrency && (
                    <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>
                      {fmtCurrency(row.value * exchangeRate)}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text)' }}>
                    ${fmtCurrency(perSample, 2)}
                  </td>
                  {showLocalCurrency && (
                    <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>
                      {fmtCurrency(perSample * exchangeRate, 2)}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>
                    {pct(row.value, workflowTotal)}%
                  </td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--gx-border)', fontWeight: 700 }}>
              <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{t('label_total')}</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>${fmt(workflowTotal)}</td>
              {showLocalCurrency && (
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(workflowTotal * exchangeRate)}
                </td>
              )}
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>
                ${fmtCurrency(samplesPerYear > 0 ? workflowTotal / samplesPerYear : 0, 2)}
              </td>
              {showLocalCurrency && (
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(samplesPerYear > 0 ? workflowTotal * exchangeRate / samplesPerYear : 0, 2)}
                </td>
              )}
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Establishment cost */}
      {costs.establishmentCost > 0 && (
        <div className="card p-4 mb-6 flex justify-between items-center flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>{t('label_establishment_cost')}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
              {t('label_establishment_cost_desc')}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold" style={{ color: 'var(--gx-text)' }}>
              ${fmt(costs.establishmentCost)}
            </div>
            {showLocalCurrency && (
              <div className="text-sm" style={{ color: 'var(--gx-text-muted)' }}>
                {fmtCurrency(costs.establishmentCost * exchangeRate)} {currency}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mt-4">
        <button
          onClick={handleSave}
          className="px-5 py-2 rounded text-sm font-semibold"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('btn_save')}
        </button>
        <button
          onClick={handlePrint}
          data-testid="print-btn"
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_print')}
        </button>
        <button
          onClick={handleExportCSV}
          data-testid="csv-btn"
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_export_csv')}
        </button>
        <button
          onClick={handleShare}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_share')}
        </button>
        <button
          onClick={() => navigate('/wizard/1')}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_edit')}
        </button>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_home')}
        </button>
      </div>
    </div>
  )
}
