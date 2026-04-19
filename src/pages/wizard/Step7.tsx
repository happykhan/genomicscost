import { useState } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { WORKFLOW_STEPS, WORKFLOW_STEP_LABELS } from '../../lib/calculations'
import LZString from 'lz-string'
import PriceEditor from '../../components/PriceEditor'
import { fmt, fmtCurrency } from '../../lib/format'
import { downloadCSV } from '../../lib/download'
import DonutChart from '../../components/DonutChart'
import ThroughputCurve from '../../components/ThroughputCurve'
import BreakevenChart from '../../components/BreakevenChart'
import SequencerCompare from '../../components/SequencerCompare'

const CAT_COLORS = ['#0d9488', '#4f8ef7', '#f97316', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b']
const WF_COLORS  = ['#0d9488', '#3b82f6', '#f97316', '#8b5cf6', '#22c55e', '#ec4899']

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export default function Step7() {
  const { project, costs, saveProject } = useProject()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPriceEditor, setShowPriceEditor] = useState(false)
  const [showAnnualised, setShowAnnualised] = useState(false)
  const { exchangeRate, currency } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)
  const showLocalCurrency = exchangeRate !== 1 || currency !== 'USD'

  // Full annualised view adds equipment depreciation back into the total
  const displayTotal = showAnnualised ? costs.total + costs.equipment : costs.total
  const displayCostPerSample = samplesPerYear > 0 ? displayTotal / samplesPerYear : 0

  const rows = [
    { label: t('label_sequencing_reagents'), value: costs.sequencingReagents },
    { label: t('label_library_prep'), value: costs.libraryPrep },
    { label: t('label_consumables'), value: costs.consumables },
    ...(showAnnualised && costs.equipment > 0
      ? [{ label: `${t('label_equipment')} (annualised)`, value: costs.equipment }]
      : []),
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
      ...rows.map(r => `${r.label}${sep}${r.value}${sep}${pct(r.value, displayTotal)}`),
      `${t('label_annual_total')}${sep}${displayTotal}${sep}100`,
      '',
      `${t('label_cost_per_sample')}${sep}${displayCostPerSample}`,
    ]
    downloadCSV(lines.join('\n'), `${project.name || 'genomics-cost'}-results.csv`)
  }

  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
      [t('label_report_title')],
      [project.name || t('label_unnamed_project'), project.country || '', project.year],
      [],
      [t('col_category'), t('col_annual_usd'), t('col_pct_of_total')],
      ...rows.map(r => [r.label, r.value, pct(r.value, displayTotal)]),
      [],
      [t('label_annual_total'), displayTotal, 100],
      [t('label_cost_per_sample'), displayCostPerSample],
      [t('label_establishment_cost'), costs.establishmentCost],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')

    // Workflow sheet
    const wfData = [
      [t('col_workflow_step'), t('col_annual_usd'), t('col_cost_per_sample_usd'), '%'],
      ...workflowRows.map(r => {
        const perSample = samplesPerYear > 0 ? r.value / samplesPerYear : 0
        return [r.label, r.value, perSample, pct(r.value, workflowTotal)]
      }),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wfData), 'Workflow')

    // Equipment sheet
    const eqData = [
      [t('col_item'), 'Status', t('col_qty'), t('col_price_each'), t('col_life_yr'), t('col_annual')],
      ...project.equipment.map(e => [
        e.name, e.status, e.quantity, e.unitCostUsd, e.lifespanYears,
        e.status === 'buy' ? (e.unitCostUsd * e.quantity) / e.lifespanYears : 0,
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eqData), 'Equipment')

    // Personnel sheet
    const persData = [
      [t('col_role'), t('col_salary'), t('col_pct_time'), t('col_training'), t('col_annual_cost')],
      ...project.personnel.map(p => [
        p.role, p.annualSalaryUsd, p.pctTime, p.trainingCostUsd,
        (p.annualSalaryUsd * p.pctTime / 100) + p.trainingCostUsd,
      ]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(persData), 'Personnel')

    XLSX.writeFile(wb, `${project.name || 'genomics-cost'}-results.xlsx`)
  }

  function handleShare() {
    try {
      const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(project))
      const url = `${window.location.origin}/#share=${encoded}`
      navigator.clipboard.writeText(url)
      toast.success(t('toast_link_copied'))
    } catch {
      toast.error(t('error_copy_link'))
    }
  }

  return (
    <div className="gx-print-region">
      {/* Screen header */}
      <div className="no-print">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--gx-text)' }}>{t('step7_title')}</h2>
          {/* Cost view toggle */}
          <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <button
              onClick={() => setShowAnnualised(false)}
              className="px-3 py-1 rounded text-xs font-medium transition-all"
              style={{
                background: !showAnnualised ? 'var(--gx-accent)' : 'transparent',
                color: !showAnnualised ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              Running cost
            </button>
            <button
              onClick={() => setShowAnnualised(true)}
              className="px-3 py-1 rounded text-xs font-medium transition-all"
              style={{
                background: showAnnualised ? 'var(--gx-accent)' : 'transparent',
                color: showAnnualised ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              Full annualised
            </button>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
          {project.name || t('label_unnamed_project')} · {project.country || t('label_no_country')} · {project.year}
          {showAnnualised && <span className="ml-2" style={{ color: 'var(--gx-accent)' }}>· includes equipment depreciation</span>}
        </p>
      </div>

      {/* Print-only report header */}
      <div className="gx-only-print" style={{ marginBottom: 24 }}>
        <div style={{
          background: '#0d9488',
          color: '#ffffff',
          padding: '14px 20px',
          borderRadius: '6px 6px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.02em' }}>{t('app_name')}</span>
          <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{t('label_print_generated')}</span>
        </div>
        <div style={{
          border: '1px solid #0d9488',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          padding: '16px 20px 14px',
          background: '#f8fafc',
        }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            {t('label_report_title')}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 10 }}>
            {t('label_report_subtitle')}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.78rem' }}>
            {project.name && (
              <span><strong style={{ color: '#0f172a' }}>Project:</strong> <span style={{ color: '#475569' }}>{project.name}</span></span>
            )}
            {project.country && (
              <span><strong style={{ color: '#0f172a' }}>Country:</strong> <span style={{ color: '#475569' }}>{project.country}</span></span>
            )}
            <span><strong style={{ color: '#0f172a' }}>Year:</strong> <span style={{ color: '#475569' }}>{project.year}</span></span>
            {project.pathogens.length > 0 && (
              <span><strong style={{ color: '#0f172a' }}>Pathogen:</strong> <span style={{ color: '#475569' }}>{project.pathogens.map(p => p.pathogenName).join(', ') || t('label_no_pathogen')}</span></span>
            )}
            <span><strong style={{ color: '#0f172a' }}>Samples/yr:</strong> <span style={{ color: '#475569' }}>{samplesPerYear.toLocaleString()}</span></span>
          </div>
        </div>
      </div>

      {/* Main cost per sample card */}
      <div
        className="rounded-xl p-8 text-center mb-8 gx-cost-hero"
        style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)' }}
      >
        <div className="text-sm font-medium mb-2" style={{ opacity: 0.85 }}>
          {t('label_cost_per_sample')}
        </div>
        <div className="text-6xl font-bold mb-1 gx-cost-number">
          ${fmt(displayCostPerSample)}
        </div>
        {showLocalCurrency && (
          <div className="text-2xl font-semibold mt-1" style={{ opacity: 0.85 }}>
            {fmtCurrency(displayCostPerSample * exchangeRate)} {currency}
          </div>
        )}
        <div className="text-sm mt-1" style={{ opacity: 0.75 }}>
          {samplesPerYear} {t('label_samples_per_yr')} · {project.pathogens.map(p => p.pathogenName).join(', ') || t('label_no_pathogen')}
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
                {pct(row.value, displayTotal)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary table — Feature 4: local currency column */}
      <div className="card mb-6" style={{ overflowX: 'auto' }}>
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
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>{pct(row.value, displayTotal)}%</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--gx-border)', fontWeight: 700 }}>
              <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>{t('label_annual_total')}</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>${fmt(displayTotal)}</td>
              {showLocalCurrency && (
                <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(displayTotal * exchangeRate)} {currency}
                </td>
              )}
              <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Feature 5: Workflow step breakdown */}
      <div className="card mb-6" style={{ overflowX: 'auto' }}>
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

      {/* Charts — 4 donut charts matching WHO Excel Results tab */}
      {displayTotal > 0 && (() => {
        const catData = [
          { label: t('label_sequencing_reagents'), value: costs.sequencingReagents, color: CAT_COLORS[0] },
          { label: t('label_library_prep'),         value: costs.libraryPrep,         color: CAT_COLORS[1] },
          { label: t('label_consumables'),           value: costs.consumables,          color: CAT_COLORS[2] },
          { label: t('label_personnel'),             value: costs.personnel,            color: CAT_COLORS[3] },
          { label: t('label_training'),              value: costs.training,             color: CAT_COLORS[4] },
          { label: t('label_facility'),              value: costs.facility,             color: CAT_COLORS[5] },
          { label: t('label_transport'),             value: costs.transport,            color: CAT_COLORS[6] },
          { label: t('label_bioinformatics'),        value: costs.bioinformatics,       color: CAT_COLORS[7] },
          { label: t('label_qms'),                   value: costs.qms,                  color: CAT_COLORS[8] },
        ]
        const perSampleCatData = catData.map(d => ({
          ...d,
          value: samplesPerYear > 0 ? d.value / samplesPerYear : 0,
        }))
        const wfData = workflowRows.map((row, i) => ({
          label: row.label,
          value: row.value,
          color: WF_COLORS[i % WF_COLORS.length],
        }))
        const perSampleWfData = wfData.map(d => ({
          ...d,
          value: samplesPerYear > 0 ? d.value / samplesPerYear : 0,
        }))
        const fmtUsd2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 gx-print-page-break gx-print-charts-grid">
            <DonutChart
              title={t('chart_cost_per_sample_by_category')}
              data={perSampleCatData}
              centerText={`$${fmtCurrency(displayCostPerSample, 2)}`}
              formatValue={fmtUsd2}
            />
            <DonutChart
              title={t('chart_total_annual_by_category')}
              data={catData}
              centerText={`$${fmt(displayTotal)}`}
            />
            <DonutChart
              title={t('chart_cost_per_sample_by_workflow')}
              data={perSampleWfData}
              centerText={`$${fmtCurrency(samplesPerYear > 0 ? workflowTotal / samplesPerYear : 0, 2)}`}
              formatValue={fmtUsd2}
            />
            <DonutChart
              title={t('chart_total_annual_by_workflow')}
              data={wfData}
              centerText={`$${fmt(workflowTotal)}`}
            />
          </div>
        )
      })()}

      {/* Additional charts: throughput curve, breakeven, sequencer comparison */}
      {displayTotal > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 gx-print-charts-grid">
          <ThroughputCurve project={project} costPerSample={displayCostPerSample} />
          <BreakevenChart
            establishmentCost={costs.establishmentCost}
            annualRunningCost={displayTotal}
          />
          {project.sequencers.filter(s => s.enabled).length >= 2 && (
            <div className="sm:col-span-2">
              <SequencerCompare project={project} />
            </div>
          )}
        </div>
      )}

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

      {/* Print-only shopping list */}
      <div className="gx-only-print gx-print-page-break" style={{ marginTop: 0 }}>

        {/* Sequencing platform summary */}
        {project.sequencers.filter(s => s.enabled).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_sequencing_platform_summary')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('label_platform')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('field_reagent_kit')}</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('field_lib_prep_kit')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('field_samples_per_run')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('label_runs_per_yr')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('field_coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {project.sequencers.filter(s => s.enabled).map((s, i) => {
                  const runsNeeded = s.samplesPerRun > 0 && samplesPerYear > 0
                    ? Math.ceil(samplesPerYear / s.samplesPerRun) : '—'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '4px 8px', color: '#0f172a', fontWeight: 600 }}>{s.platformId}</td>
                      <td style={{ padding: '4px 8px', color: '#0f172a' }}>{s.reagentKitName || '—'}</td>
                      <td style={{ padding: '4px 8px', color: '#0f172a' }}>{s.libPrepKitName || '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{s.samplesPerRun}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{runsNeeded}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>
                        {s.captureAll ? t('label_capture_all_mode_short') : `${s.coverageX}×`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Key assumptions */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
              {t('label_key_assumptions')}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <tbody>
                {project.sequencers.filter(s => s.enabled).map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>
                      {project.sequencers.filter(s => s.enabled).length > 1 ? `${t('label_sequencer_n', { n: i + 1 })} ` : ''}{t('field_buffer_pct')}
                    </td>
                    <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>{s.bufferPct}%</td>
                  </tr>
                ))}
                {project.sequencers.filter(s => s.enabled).map((s, i) => (
                  <tr key={`retest-${i}`}>
                    <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>
                      {project.sequencers.filter(s => s.enabled).length > 1 ? `${t('label_sequencer_n', { n: i + 1 })} ` : ''}{t('field_retest_pct')}
                    </td>
                    <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>{s.retestPct}%</td>
                  </tr>
                ))}
                {project.sequencers.filter(s => s.enabled).map((s, i) => (
                  <tr key={`controls-${i}`}>
                    <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>
                      {project.sequencers.filter(s => s.enabled).length > 1 ? `${t('label_sequencer_n', { n: i + 1 })} ` : ''}{t('field_controls_per_run')}
                    </td>
                    <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>{s.controlsPerRun}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>{t('field_exchange_rate')}</td>
                  <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>
                    1 USD = {project.exchangeRate} {project.currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Personnel roster */}
        {project.personnel.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_personnel_roster')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_role')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_salary')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_pct_time')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('label_salary_attributed')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_training')}</th>
                </tr>
              </thead>
              <tbody>
                {project.personnel.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px 8px', color: '#0f172a' }}>{p.role}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmt(p.annualSalaryUsd)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{p.pctTime}%</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                      ${fmt(p.annualSalaryUsd * p.pctTime / 100)}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>
                      {p.trainingCostUsd > 0 ? `$${fmt(p.trainingCostUsd)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Equipment to purchase */}
        {project.equipment.filter(e => e.status === 'buy').length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_equipment_to_buy')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_item')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_qty')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_price_each')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_total_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {project.equipment.filter(e => e.status === 'buy').map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px 8px', color: '#0f172a' }}>{e.name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{e.quantity}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmt(e.unitCostUsd)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>${fmt(e.unitCostUsd * e.quantity)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '4px 8px', color: '#0f172a' }}>{t('label_establishment_cost')}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0d9488' }}>${fmt(costs.establishmentCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Annual consumables */}
        {project.consumables.filter(c => c.enabled).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_consumables_to_stock')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_item')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_qty_sample')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_unit_cost')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_annual')}</th>
                </tr>
              </thead>
              <tbody>
                {project.consumables.filter(c => c.enabled).map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px 8px', color: '#0f172a' }}>{c.name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{c.quantityPerSample}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmtCurrency(c.unitCostUsd, 2)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                      ${fmt(c.unitCostUsd * c.quantityPerSample * samplesPerYear)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{ marginTop: 12, marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>{t('label_disclaimer_note')}</div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', lineHeight: 1.5 }}>{t('label_disclaimer_text')}</div>
        </div>

        {/* Print footer */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: '0.7rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('label_print_generated')}</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      </div>

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
          onClick={handleExportExcel}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_export_excel')}
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
          onClick={() => setShowPriceEditor(true)}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_edit_prices')}
        </button>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_home')}
        </button>
      </div>

      {showPriceEditor && <PriceEditor onClose={() => setShowPriceEditor(false)} />}
    </div>
  )
}
