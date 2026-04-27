import React, { useState } from 'react'
import type { ConsumableWorkflowStep } from '../../types'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { WORKFLOW_STEPS, WORKFLOW_STEP_LABELS } from '../../lib/calculations'
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

export default function Step8() {
  const { project, costs, saveProject, loadProjectFromData } = useProject()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showPriceEditor, setShowPriceEditor] = useState(false)
  const { exchangeRate, currency } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)
  const showLocalCurrency = exchangeRate !== 1 || currency !== 'USD'

  const rows = [
    { label: t('label_sequencing_reagents'), value: costs.sequencingReagents },
    { label: t('label_library_prep'), value: costs.libraryPrep },
    { label: t('label_consumables'), value: costs.consumables },
    { label: t('label_incidentals'), value: costs.incidentals },
    { label: t('label_equipment'), value: costs.equipment },
    { label: t('label_personnel'), value: costs.personnel },
    { label: t('label_training'), value: costs.training },
    { label: t('label_admin_overhead'), value: costs.adminCost },
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
    // Helper to escape CSV fields containing commas or quotes
    const esc = (v: string | number | undefined | null): string => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }
    const row = (...cells: (string | number | undefined | null)[]) => cells.map(esc).join(',')

    const lines: string[] = []

    // Section 1: Project info
    lines.push('--- PROJECT INFO ---')
    lines.push(row('Project', project.name || 'Unnamed'))
    lines.push(row('Country', project.country || ''))
    lines.push(row('Year', project.year))
    lines.push(row('Samples/yr', samplesPerYear))
    lines.push(row('Pathogens', project.pathogens.map(p => p.pathogenName).join('; ')))
    lines.push(row('Currency', currency))
    lines.push(row('Exchange rate (1 USD)', exchangeRate))
    lines.push('')

    // Section 2: Cost summary
    lines.push('--- COST SUMMARY ---')
    lines.push(row('Category', 'Annual USD', '% of total', 'Cost/sample USD'))
    for (const r of rows) {
      const perSample = samplesPerYear > 0 ? r.value / samplesPerYear : 0
      lines.push(row(r.label, Math.round(r.value), pct(r.value, costs.total), perSample.toFixed(2)))
    }
    lines.push(row('TOTAL', Math.round(costs.total), 100, costs.costPerSample.toFixed(2)))
    lines.push(row('Establishment cost (one-off)', Math.round(costs.establishmentCost)))
    lines.push('')

    // Section 3: Workflow breakdown
    lines.push('--- WORKFLOW BREAKDOWN ---')
    lines.push(row('Step', 'Annual USD', 'Cost/sample USD', '%'))
    for (const r of workflowRows) {
      const perSample = samplesPerYear > 0 ? r.value / samplesPerYear : 0
      lines.push(row(r.label, Math.round(r.value), perSample.toFixed(2), pct(r.value, workflowTotal)))
    }
    lines.push('')

    // Section 4: Fixed consumables (Section B)
    const enabledFixed = (project.fixedConsumables ?? []).filter(c => c.enabled && c.quantityPerYear > 0)
    if (enabledFixed.length > 0) {
      const wfKeys: ConsumableWorkflowStep[] = ['sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing']
      const wfShort = ['R', 'N', 'P', 'L', 'S']
      lines.push('--- SECTION B: FIXED ANNUAL REAGENTS & CONSUMABLES ---')
      lines.push(row('Item', 'Qty/yr', 'Unit cost USD', 'Annual cost USD', 'Workflows'))
      for (const c of enabledFixed) {
        const annual = c.quantityPerYear * c.unitCostUsd
        const wfStr = wfKeys.map((k, i) => (c.workflows?.[k] ? wfShort[i] : '')).filter(Boolean).join('/') || 'all'
        lines.push(row(c.name, c.quantityPerYear, c.unitCostUsd.toFixed(2), annual.toFixed(2), wfStr))
      }
      const fixedTotal = enabledFixed.reduce((s, c) => s + c.quantityPerYear * c.unitCostUsd, 0)
      lines.push(row('SUBTOTAL', '', '', fixedTotal.toFixed(2)))
      lines.push('')
    }

    // Section 5: Per-sample consumables (Section C)
    const enabledPerSample = project.consumables.filter(c => c.enabled)
    if (enabledPerSample.length > 0) {
      lines.push('--- SECTION C: PER-SAMPLE CONSUMABLES ---')
      lines.push(row('Item', 'Qty/sample', 'Unit cost USD', 'Annual cost USD'))
      for (const c of enabledPerSample) {
        const annual = c.unitCostUsd * c.quantityPerSample * samplesPerYear
        lines.push(row(c.name, c.quantityPerSample, c.unitCostUsd.toFixed(2), annual.toFixed(2)))
      }
      lines.push('')
    }

    // Section 6: Equipment
    if (project.equipment.length > 0) {
      lines.push('--- EQUIPMENT ---')
      lines.push(row('Item', 'Category', 'Status', 'Qty', 'Unit cost USD', 'Lifespan yr', 'Age yr', '% seq', 'Annual depreciation USD'))
      const maintenanceRate = (project.maintenancePct ?? 15) / 100
      for (const e of project.equipment) {
        const lifespan = Math.max(1, e.lifespanYears ?? 5)
        const age = Math.max(0, Math.min(e.ageYears ?? 0, lifespan - 1))
        const remainingLife = Math.max(1, lifespan - age)
        const totalCost = (e.unitCostUsd ?? 0) * (e.quantity ?? 1)
        const pctSeq = (e.pctSequencing ?? 100) / 100
        const depreciation = e.status === 'buy' ? (totalCost / remainingLife) * pctSeq : 0
        const maintenance = e.status === 'buy' ? totalCost * maintenanceRate * pctSeq : 0
        lines.push(row(e.name, e.category, e.status, e.quantity, e.unitCostUsd, lifespan, age, e.pctSequencing ?? 100, (depreciation + maintenance).toFixed(2)))
      }
      lines.push('')
    }

    // Section 7: Personnel
    if (project.personnel.length > 0) {
      lines.push('--- PERSONNEL ---')
      lines.push(row('Role', 'Annual salary USD', '% time', 'Annual attributed USD'))
      for (const p of project.personnel) {
        lines.push(row(p.role, p.annualSalaryUsd, p.pctTime, (p.annualSalaryUsd * p.pctTime / 100).toFixed(2)))
      }
      if ((project.trainingGroupCostUsd ?? 0) > 0) {
        lines.push(row('Training (group)', '', '', (project.trainingGroupCostUsd ?? 0).toFixed(2)))
      }
      if (costs.adminCost > 0) {
        lines.push(row(`Admin overhead (${project.adminCostPct}%)`, '', '', costs.adminCost.toFixed(2)))
      }
      lines.push('')
    }

    // Section 8: Bioinformatics
    if (project.bioinformatics.type !== 'none') {
      lines.push('--- BIOINFORMATICS ---')
      lines.push(row('Type', project.bioinformatics.type))
      if ((project.bioinformatics.type === 'cloud' || project.bioinformatics.type === 'hybrid') && project.bioinformatics.cloudItems?.length) {
        lines.push(row('Component', 'Price/unit USD', 'Qty', 'Samples this scenario', 'Total samples all', 'Annual cost USD'))
        for (const item of project.bioinformatics.cloudItems.filter(i => i.enabled)) {
          const totalAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
          const annual = item.pricePerUnit * item.quantity * (item.samplesThisScenario || samplesPerYear) / totalAll
          lines.push(row(item.name, item.pricePerUnit, item.quantity, item.samplesThisScenario, item.totalSamplesAllPathogens, annual.toFixed(2)))
        }
      }
      if ((project.bioinformatics.type === 'inhouse' || project.bioinformatics.type === 'hybrid') && project.bioinformatics.inhouseItems?.length) {
        lines.push(row('Component', 'Price/unit USD', 'Qty', '% use', 'Lifespan yr', 'Age yr', 'Annual depreciation USD'))
        for (const item of project.bioinformatics.inhouseItems.filter(i => i.enabled)) {
          const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
          const annual = item.pricePerUnit * item.quantity * (item.pctUse / 100) / remainingLife
          lines.push(row(item.name, item.pricePerUnit, item.quantity, item.pctUse, item.lifespanYears, item.ageYears, annual.toFixed(2)))
        }
      }
      lines.push(row('Total cloud', costs.bioinformaticsCloud.toFixed(2)))
      lines.push(row('Total in-house', costs.bioinformaticsInhouse.toFixed(2)))
      lines.push(row('Total bioinformatics', costs.bioinformatics.toFixed(2)))
      lines.push('')
    }

    // Section 9: QMS
    const enabledQms = project.qms.filter(q => q.enabled)
    if (enabledQms.length > 0) {
      lines.push('--- QMS ---')
      lines.push(row('Activity', 'Cost USD', 'Qty', '% attributed', 'Annual USD'))
      for (const q of enabledQms) {
        const annual = q.costUsd * q.quantity * (q.pctSequencing / 100)
        lines.push(row(q.activity, q.costUsd, q.quantity, q.pctSequencing, annual.toFixed(2)))
      }
      lines.push('')
    }

    // Section 10: Assumptions
    lines.push('--- ASSUMPTIONS ---')
    lines.push(row('Parameter', 'Value'))
    lines.push(row('Maintenance %', project.maintenancePct ?? 15))
    lines.push(row('Incidentals %', project.incidentalsPct ?? 7))
    lines.push(row('Exchange rate (1 USD)', exchangeRate))
    lines.push(row('Currency', currency))
    lines.push(row('Samples/yr', samplesPerYear))
    lines.push(row('Pathogens', project.pathogens.map(p => p.pathogenName).join('; ')))

    downloadCSV(lines.join('\n'), `${project.name || 'genomics-cost'}-results.csv`)
  }

  async function handleExportExcel() {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const maintenanceRate = (project.maintenancePct ?? 15) / 100

    // ── Summary sheet (enhanced) ────────────────────────────────────────────
    const summaryData: (string | number | null)[][] = [
      [t('label_report_title')],
      [project.name || t('label_unnamed_project'), project.country || '', project.year],
      [],
      [t('col_category'), t('col_annual_usd'), t('col_pct_of_total'), t('col_cost_per_sample_usd')],
    ]
    for (const r of rows) {
      const perSample = samplesPerYear > 0 ? r.value / samplesPerYear : 0
      summaryData.push([r.label, Math.round(r.value), pct(r.value, costs.total), +perSample.toFixed(2)])
      // Bioinformatics sub-rows
      if (r.label === t('label_bioinformatics') && (costs.bioinformaticsCloud > 0 || costs.bioinformaticsInhouse > 0)) {
        if (costs.bioinformaticsCloud > 0) {
          summaryData.push([`  ${t('label_cloud_operational')}`, Math.round(costs.bioinformaticsCloud), null, null])
        }
        if (costs.bioinformaticsInhouse > 0) {
          summaryData.push([`  ${t('label_inhouse_depreciation')}`, Math.round(costs.bioinformaticsInhouse), null, null])
        }
      }
    }
    summaryData.push([])
    summaryData.push([t('label_annual_total'), Math.round(costs.total), 100, +costs.costPerSample.toFixed(2)])
    summaryData.push([t('label_cost_per_sample'), +costs.costPerSample.toFixed(2)])
    summaryData.push([t('label_establishment_cost'), Math.round(costs.establishmentCost)])
    // Establishment breakdown
    const equipEstab = project.equipment
      .filter(e => e.status === 'buy')
      .reduce((s, e) => s + (e.unitCostUsd ?? 0) * (e.quantity ?? 1), 0)
    const bioEstab = costs.establishmentCost - equipEstab
    if (equipEstab > 0) summaryData.push([`  ${t('label_equip_establishment')}`, Math.round(equipEstab)])
    if (bioEstab > 0) summaryData.push([`  ${t('label_bio_establishment')}`, Math.round(bioEstab)])
    summaryData.push([])
    summaryData.push([t('label_maintenance_pct'), project.maintenancePct ?? 15])
    summaryData.push([t('label_incidentals_pct'), project.incidentalsPct ?? 7])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')

    // ── Workflow sheet ──────────────────────────────────────────────────────
    const wfData = [
      [t('col_workflow_step'), t('col_annual_usd'), t('col_cost_per_sample_usd'), '%'],
      ...workflowRows.map(r => {
        const perSample = samplesPerYear > 0 ? r.value / samplesPerYear : 0
        return [r.label, Math.round(r.value), +perSample.toFixed(2), pct(r.value, workflowTotal)]
      }),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wfData), 'Workflow')

    // ── Equipment sheet (enhanced with age, % seq, maintenance) ─────────────
    const eqData: (string | number)[][] = [
      [t('col_item'), 'Category', 'Status', t('col_qty'), t('col_price_each'), t('col_life_yr'), 'Age (yr)', '% seq', 'Annual depreciation USD', 'Annual maintenance USD', 'Total annual USD'],
    ]
    for (const e of project.equipment) {
      const lifespan = Math.max(1, e.lifespanYears ?? 5)
      const age = Math.max(0, Math.min(e.ageYears ?? 0, lifespan - 1))
      const remainingLife = Math.max(1, lifespan - age)
      const totalCost = (e.unitCostUsd ?? 0) * (e.quantity ?? 1)
      const pctSeq = (e.pctSequencing ?? 100) / 100
      const depreciation = e.status === 'buy' ? (totalCost / remainingLife) * pctSeq : 0
      const maintenance = e.status === 'buy' ? totalCost * maintenanceRate * pctSeq : 0
      eqData.push([
        e.name, e.category, e.status, e.quantity, e.unitCostUsd, lifespan, age,
        e.pctSequencing ?? 100,
        +depreciation.toFixed(2), +maintenance.toFixed(2), +(depreciation + maintenance).toFixed(2),
      ])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eqData), 'Equipment')

    // ── Personnel sheet ─────────────────────────────────────────────────────
    const persData: (string | number)[][] = [
      [t('col_role'), t('col_salary'), t('col_pct_time'), t('col_annual_cost')],
      ...project.personnel.map(p => [
        p.role, p.annualSalaryUsd, p.pctTime,
        +(p.annualSalaryUsd * p.pctTime / 100).toFixed(2),
      ] as (string | number)[]),
    ]
    persData.push([])
    persData.push([t('label_training'), project.trainingGroupCostUsd ?? 0])
    if (project.adminCostPct > 0) {
      persData.push([`${t('label_admin_overhead')} (${project.adminCostPct}%)`, +costs.adminCost.toFixed(2)])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(persData), 'Personnel')

    // ── Consumables_B sheet (fixed annual) ──────────────────────────────────
    const wfKeysB: ConsumableWorkflowStep[] = ['sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing']
    const fixedItems = (project.fixedConsumables ?? []).filter(c => c.enabled && c.quantityPerYear > 0)
    if (fixedItems.length > 0) {
      const cbData: (string | number)[][] = [
        ['Item', 'Qty/yr', 'Unit cost USD', 'Annual cost USD', 'R', 'N', 'P', 'L', 'S'],
      ]
      let fixedSubtotal = 0
      for (const c of fixedItems) {
        const annual = c.quantityPerYear * c.unitCostUsd
        fixedSubtotal += annual
        cbData.push([
          c.name, c.quantityPerYear, +c.unitCostUsd.toFixed(2), +annual.toFixed(2),
          ...wfKeysB.map(k => (c.workflows?.[k] ? 'Y' : 'N') as string | number),
        ])
      }
      cbData.push([])
      cbData.push(['SUBTOTAL', '', '', +fixedSubtotal.toFixed(2)])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cbData), 'Consumables_B')
    }

    // ── Consumables_C sheet (per-sample) ────────────────────────────────────
    const perSampleItems = project.consumables.filter(c => c.enabled)
    if (perSampleItems.length > 0) {
      const ccData: (string | number)[][] = [
        ['Item', 'Qty/sample', 'Unit cost USD', 'Annual cost USD'],
      ]
      for (const c of perSampleItems) {
        const annual = c.unitCostUsd * c.quantityPerSample * samplesPerYear
        ccData.push([c.name, c.quantityPerSample, +c.unitCostUsd.toFixed(2), +annual.toFixed(2)])
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ccData), 'Consumables_C')
    }

    // ── Bioinformatics sheet ────────────────────────────────────────────────
    if (project.bioinformatics.type !== 'none') {
      const bioData: (string | number)[][] = [
        ['Bioinformatics type', project.bioinformatics.type],
        [],
      ]
      if ((project.bioinformatics.type === 'cloud' || project.bioinformatics.type === 'hybrid') && project.bioinformatics.cloudItems?.length) {
        bioData.push(['--- CLOUD ITEMS ---'])
        bioData.push(['Component', 'Unit cost USD', 'Qty', 'Samples this scenario', 'Total samples all pathogens', 'Annual cost USD'])
        for (const item of project.bioinformatics.cloudItems.filter(i => i.enabled)) {
          const totalAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
          const annual = item.pricePerUnit * item.quantity * (item.samplesThisScenario || samplesPerYear) / totalAll
          bioData.push([item.name, item.pricePerUnit, item.quantity, item.samplesThisScenario || samplesPerYear, item.totalSamplesAllPathogens || samplesPerYear, +annual.toFixed(2)])
        }
        bioData.push([])
      }
      if ((project.bioinformatics.type === 'inhouse' || project.bioinformatics.type === 'hybrid') && project.bioinformatics.inhouseItems?.length) {
        bioData.push(['--- IN-HOUSE ITEMS ---'])
        bioData.push(['Component', 'Description', 'Unit cost USD', 'Qty', '% use', 'Lifespan yr', 'Age yr', 'Remaining life yr', 'Annual depreciation USD'])
        for (const item of project.bioinformatics.inhouseItems.filter(i => i.enabled)) {
          const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
          const annual = item.pricePerUnit * item.quantity * (item.pctUse / 100) / remainingLife
          bioData.push([item.name, item.description || '', item.pricePerUnit, item.quantity, item.pctUse, item.lifespanYears, item.ageYears, remainingLife, +annual.toFixed(2)])
        }
        bioData.push([])
      }
      bioData.push([])
      bioData.push(['Total cloud', +costs.bioinformaticsCloud.toFixed(2)])
      bioData.push(['Total in-house (depreciation)', +costs.bioinformaticsInhouse.toFixed(2)])
      bioData.push(['Total bioinformatics', +costs.bioinformatics.toFixed(2)])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bioData), 'Bioinformatics')
    }

    // ── QMS sheet ───────────────────────────────────────────────────────────
    if (project.qms.length > 0) {
      const qmsData: (string | number)[][] = [
        ['Activity', 'Cost USD', 'Quantity', '% attributed', 'Annual USD', 'Enabled'],
      ]
      for (const q of project.qms) {
        const annual = q.costUsd * q.quantity * (q.pctSequencing / 100)
        qmsData.push([q.activity, q.costUsd, q.quantity, q.pctSequencing, +annual.toFixed(2), q.enabled ? 'Y' : 'N'])
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qmsData), 'QMS')
    }

    // ── Assumptions sheet ───────────────────────────────────────────────────
    const assumpData: (string | number)[][] = [
      ['Parameter', 'Value'],
      ['Maintenance %', project.maintenancePct ?? 15],
      ['Incidentals %', project.incidentalsPct ?? 7],
      ['Exchange rate (1 USD)', exchangeRate],
      ['Currency', currency],
      ['Samples/yr', samplesPerYear],
      ['Pathogens', project.pathogens.length],
    ]
    for (const p of project.pathogens) {
      assumpData.push([`  ${p.pathogenName}`, p.samplesPerYear])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assumpData), 'Assumptions')

    XLSX.writeFile(wb, `${project.name || 'genomics-cost'}-results.xlsx`)
  }


  function handleDownloadProject() {
    const filename = `${(project.name || 'genomics-cost').replace(/\s+/g, '-')}-project.json`
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoadProject(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        // Apply same migration logic as the context uses for loaded projects
        loadProjectFromData(raw)
        toast.success(t('toast_project_loaded', { name: raw.name || 'project' }))
        navigate('/wizard/1')
      } catch {
        toast.error(t('toast_project_load_error'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="gx-print-region">
      {/* Screen header */}
      <div className="no-print">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--gx-text)' }}>{t('step8_title')}</h2>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
          {project.name || t('label_unnamed_project')} · {project.country || t('label_no_country')} · {project.year}
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
              <span><strong style={{ color: '#0f172a' }}>{t('field_project_name')}:</strong> <span style={{ color: '#475569' }}>{project.name}</span></span>
            )}
            {project.country && (
              <span><strong style={{ color: '#0f172a' }}>{t('field_country')}:</strong> <span style={{ color: '#475569' }}>{project.country}</span></span>
            )}
            <span><strong style={{ color: '#0f172a' }}>{t('field_year')}:</strong> <span style={{ color: '#475569' }}>{project.year}</span></span>
            {project.pathogens.length > 0 && (
              <span><strong style={{ color: '#0f172a' }}>{t('field_pathogen_name')}:</strong> <span style={{ color: '#475569' }}>{project.pathogens.map(p => p.pathogenName).join(', ') || t('label_no_pathogen')}</span></span>
            )}
            <span><strong style={{ color: '#0f172a' }}>{t('label_samples_per_yr')}:</strong> <span style={{ color: '#475569' }}>{samplesPerYear.toLocaleString()}</span></span>
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
          ${fmt(costs.costPerSample)}
        </div>
        {showLocalCurrency && (
          <div className="text-2xl font-semibold mt-1" style={{ opacity: 0.85 }}>
            {fmtCurrency(costs.costPerSample * exchangeRate)} {currency}
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
                {pct(row.value, costs.total)}%
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
            {rows.map(row => {
              const isBio = row.label === t('label_bioinformatics')
              const showBioSub = isBio && costs.bioinformaticsCloud > 0 && costs.bioinformaticsInhouse > 0
              return (
                <React.Fragment key={row.label}>
                  <tr style={{ borderBottom: showBioSub ? 'none' : '1px solid var(--gx-border)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--gx-text)' }}>
                      {row.label}
                      {row.label === t('label_equipment') && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)', fontWeight: 400 }}>
                          {t('label_equip_depreciation_note')}
                        </div>
                      )}
                      {isBio && !showBioSub && costs.bioinformaticsCloud > 0 && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)', fontWeight: 400 }}>{t('label_cloud_operational')}</div>
                      )}
                      {isBio && !showBioSub && costs.bioinformaticsInhouse > 0 && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)', fontWeight: 400 }}>{t('label_inhouse_depreciation')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
                    {showLocalCurrency && (
                      <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>
                        {fmtCurrency(row.value * exchangeRate)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right" style={{ color: 'var(--gx-text-muted)' }}>{pct(row.value, costs.total)}%</td>
                  </tr>
                  {showBioSub && (
                    <>
                      <tr style={{ borderBottom: 'none' }}>
                        <td className="px-4 py-1 pl-8 text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_cloud_operational')}</td>
                        <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>${fmt(costs.bioinformaticsCloud)}</td>
                        {showLocalCurrency && (
                          <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                            {fmtCurrency(costs.bioinformaticsCloud * exchangeRate)}
                          </td>
                        )}
                        <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}></td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--gx-border)' }}>
                        <td className="px-4 py-1 pl-8 text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_inhouse_depreciation')}</td>
                        <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>${fmt(costs.bioinformaticsInhouse)}</td>
                        {showLocalCurrency && (
                          <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                            {fmtCurrency(costs.bioinformaticsInhouse * exchangeRate)}
                          </td>
                        )}
                        <td className="px-4 py-1 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}></td>
                      </tr>
                    </>
                  )}
                </React.Fragment>
              )
            })}
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
      <div className="card mb-6" style={{ overflowX: 'auto' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>{t('label_workflow_breakdown')}</h3>
        </div>
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 320 }}>
          <colgroup>
            <col />
            <col style={{ width: 90 }} />
            {showLocalCurrency && <col style={{ width: 90 }} />}
            <col style={{ width: 80 }} />
            {showLocalCurrency && <col style={{ width: 80 }} />}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_workflow_step')}</th>
              <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
              {showLocalCurrency && (
                <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{currency}</th>
              )}
              <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_per_sample')}</th>
              {showLocalCurrency && (
                <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{currency}/sample</th>
              )}
              <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {workflowRows.map(row => {
              const perSample = samplesPerYear > 0 ? row.value / samplesPerYear : 0
              return (
                <tr key={row.step} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--gx-text)' }}>{row.label}</td>
                  <td className="px-2 py-2 text-right text-xs font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(row.value)}</td>
                  {showLocalCurrency && (
                    <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                      {fmtCurrency(row.value * exchangeRate)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-text)' }}>
                    ${fmtCurrency(perSample, 2)}
                  </td>
                  {showLocalCurrency && (
                    <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                      {fmtCurrency(perSample * exchangeRate, 2)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                    {pct(row.value, workflowTotal)}%
                  </td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--gx-border)', fontWeight: 700 }}>
              <td className="px-3 py-2 text-xs" style={{ color: 'var(--gx-text)' }}>{t('label_total')}</td>
              <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-accent)' }}>${fmt(workflowTotal)}</td>
              {showLocalCurrency && (
                <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(workflowTotal * exchangeRate)}
                </td>
              )}
              <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-accent)' }}>
                ${fmtCurrency(samplesPerYear > 0 ? workflowTotal / samplesPerYear : 0, 2)}
              </td>
              {showLocalCurrency && (
                <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-accent)' }}>
                  {fmtCurrency(samplesPerYear > 0 ? workflowTotal * exchangeRate / samplesPerYear : 0, 2)}
                </td>
              )}
              <td className="px-2 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Charts — 4 donut charts matching WHO Excel Results tab */}
      {costs.total > 0 && (() => {
        const catData = [
          { label: t('label_sequencing_reagents'), value: costs.sequencingReagents, color: CAT_COLORS[0] },
          { label: t('label_library_prep'),         value: costs.libraryPrep,         color: CAT_COLORS[1] },
          { label: t('label_consumables'),           value: costs.consumables,          color: CAT_COLORS[2] },
          { label: t('label_incidentals'),           value: costs.incidentals,          color: CAT_COLORS[9] },
          { label: t('label_equipment'),             value: costs.equipment,            color: CAT_COLORS[3] },
          { label: t('label_personnel'),             value: costs.personnel,            color: CAT_COLORS[4] },
          { label: t('label_training'),              value: costs.training,             color: CAT_COLORS[5] },
          { label: t('label_admin_overhead'),        value: costs.adminCost,            color: '#94a3b8' },
          { label: t('label_facility'),              value: costs.facility,             color: CAT_COLORS[6] },
          { label: t('label_transport'),             value: costs.transport,            color: CAT_COLORS[7] },
          { label: t('label_bioinformatics'),        value: costs.bioinformatics,       color: CAT_COLORS[8] },
          { label: t('label_qms'),                   value: costs.qms,                  color: CAT_COLORS[9] },
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
              centerText={`$${fmtCurrency(costs.costPerSample, 2)}`}
              formatValue={fmtUsd2}
            />
            <DonutChart
              title={t('chart_total_annual_by_category')}
              data={catData}
              centerText={`$${fmt(costs.total)}`}
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
      {costs.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 gx-print-charts-grid">
          <ThroughputCurve project={project} costPerSample={costs.costPerSample} />
          <BreakevenChart
            establishmentCost={costs.establishmentCost}
            annualRunningCost={costs.total}
          />
          {project.sequencers.filter(s => s.enabled).length >= 2 && (
            <div className="sm:col-span-2">
              <SequencerCompare project={project} />
            </div>
          )}
        </div>
      )}

      {/* Per-pathogen cost breakdown */}
      {costs.perPathogenBreakdown.length > 0 && (
        <div className="card mb-6" style={{ overflowX: 'auto' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>{t('label_cost_per_pathogen')}</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--gx-text-muted)' }}>
              {t('label_cost_per_pathogen_desc')}
            </p>
          </div>
          <table className="w-full" style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('field_pathogen_name')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('label_samples_per_yr')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_seq_reagents')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_lib_prep')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('label_consumables')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_overheads')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_annual')}</th>
                <th className="text-right px-2 py-2 font-medium" style={{ color: 'var(--gx-text)' }}>{t('label_cost_per_sample')}</th>
              </tr>
            </thead>
            <tbody>
              {costs.perPathogenBreakdown.map(pb => (
                <tr key={pb.pathogenName} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-2 py-1.5">
                    <div className="font-medium" style={{ color: 'var(--gx-text)' }}>{pb.pathogenName}</div>
                    <div style={{ color: 'var(--gx-text-muted)', textTransform: 'capitalize' }}>{pb.pathogenType}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ color: 'var(--gx-text-muted)' }}>{pb.samples.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: 'var(--gx-text)' }}>${fmt(pb.sequencingReagents)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: 'var(--gx-text)' }}>${fmt(pb.libraryPrep)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: 'var(--gx-text)' }}>${fmt(pb.consumables)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: 'var(--gx-text-muted)' }}>${fmt(pb.sharedCosts + pb.incidentals)}</td>
                  <td className="px-2 py-1.5 text-right font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(pb.total)}</td>
                  <td className="px-2 py-1.5 text-right font-bold" style={{ color: 'var(--gx-accent)' }}>${fmtCurrency(pb.costPerSample, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Key assumptions card — on screen */}
      <div className="card p-4 mb-6 no-print">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('label_key_assumptions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
          <div>
            <span style={{ color: 'var(--gx-text-muted)' }}>{t('label_maintenance_pct')}</span>
            <div className="font-medium" style={{ color: 'var(--gx-text)' }}>{project.maintenancePct ?? 15}%</div>
          </div>
          <div>
            <span style={{ color: 'var(--gx-text-muted)' }}>{t('label_incidentals_pct')}</span>
            <div className="font-medium" style={{ color: 'var(--gx-text)' }}>{project.incidentalsPct ?? 7}%</div>
          </div>
          <div>
            <span style={{ color: 'var(--gx-text-muted)' }}>{t('label_exchange_rate')}</span>
            <div className="font-medium" style={{ color: 'var(--gx-text)' }}>1 USD = {exchangeRate} {currency}</div>
          </div>
          <div>
            <span style={{ color: 'var(--gx-text-muted)' }}>{t('label_samples_per_yr')}</span>
            <div className="font-medium" style={{ color: 'var(--gx-text)' }}>{samplesPerYear.toLocaleString()}</div>
          </div>
        </div>
      </div>

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
                <tr>
                  <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>{t('label_maintenance_pct')}</td>
                  <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>{project.maintenancePct ?? 15}%</td>
                </tr>
                <tr>
                  <td style={{ padding: '2px 8px 2px 0', color: '#475569' }}>{t('label_incidentals_pct')}</td>
                  <td style={{ padding: '2px 0', color: '#0f172a', fontWeight: 500 }}>{project.incidentalsPct ?? 7}%</td>
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
                  </tr>
                ))}
                {/* Group-level training */}
                <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td colSpan={3} style={{ padding: '4px 8px', color: '#475569' }}>{t('label_training')}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                    ${fmt(project.trainingGroupCostUsd ?? 0)}
                  </td>
                </tr>
                {/* Admin overhead if set */}
                {(project.adminCostPct ?? 0) > 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '4px 8px', color: '#475569' }}>{t('label_admin_overhead')} ({project.adminCostPct}%)</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                      ${fmt(costs.adminCost)}
                    </td>
                  </tr>
                )}
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

        {/* Section B: Fixed annual reagents & consumables */}
        {(project.fixedConsumables ?? []).filter(c => c.enabled && c.quantityPerYear > 0).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_section_b_fixed_reagents')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_item')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_qty_yr')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_unit_cost_usd')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_annual_cost_usd')}</th>
                </tr>
              </thead>
              <tbody>
                {(project.fixedConsumables ?? []).filter(c => c.enabled && c.quantityPerYear > 0).map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px 8px', color: '#0f172a' }}>{c.name}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{c.quantityPerYear}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmtCurrency(c.unitCostUsd, 2)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                      ${fmt(c.quantityPerYear * c.unitCostUsd)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '4px 8px', color: '#0f172a' }}>{t('label_subtotal')}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0d9488' }}>
                    ${fmt((project.fixedConsumables ?? []).filter(c => c.enabled && c.quantityPerYear > 0).reduce((s, c) => s + c.quantityPerYear * c.unitCostUsd, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bioinformatics (print) */}
        {project.bioinformatics.type !== 'none' && costs.bioinformatics > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_bioinformatics')} ({project.bioinformatics.type})
            </h3>
            {(project.bioinformatics.type === 'inhouse' || project.bioinformatics.type === 'hybrid') &&
              (project.bioinformatics.inhouseItems ?? []).filter(i => i.enabled).length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: 10 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_component_inhouse')}</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_purchase_cost_usd')}</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_remaining_life_yr')}</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_depreciation_yr_usd')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(project.bioinformatics.inhouseItems ?? []).filter(i => i.enabled).map((item, i) => {
                    const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
                    const annual = item.pricePerUnit * item.quantity * (item.pctUse / 100) / remainingLife
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 8px', color: '#0f172a' }}>{item.name}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmt(item.pricePerUnit * item.quantity)}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{remainingLife}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>${fmt(annual)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {(project.bioinformatics.type === 'cloud' || project.bioinformatics.type === 'hybrid') &&
              (project.bioinformatics.cloudItems ?? []).filter(i => i.enabled).length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', marginBottom: 10 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_component_cloud')}</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_annual_cost_usd')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(project.bioinformatics.cloudItems ?? []).filter(i => i.enabled).map((item, i) => {
                    const totalAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
                    const annual = item.pricePerUnit * item.quantity * (item.samplesThisScenario || samplesPerYear) / totalAll
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px 8px', color: '#0f172a' }}>{item.name}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>${fmt(annual)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', textAlign: 'right', paddingRight: 8 }}>
              {t('label_bio_total')}: ${fmt(costs.bioinformatics)}
            </div>
          </div>
        )}

        {/* QMS activities (print) */}
        {project.qms.filter(q => q.enabled).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {t('label_qms_full')}
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_activity')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_cost')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_qty')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_pct_attr')}</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: '#475569', fontWeight: 500 }}>{t('col_annual_usd')}</th>
                </tr>
              </thead>
              <tbody>
                {project.qms.filter(q => q.enabled).map((q, i) => {
                  const annual = q.costUsd * q.quantity * (q.pctSequencing / 100)
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '4px 8px', color: '#0f172a' }}>{q.activity}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>${fmt(q.costUsd)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{q.quantity}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a' }}>{q.pctSequencing}%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>${fmt(annual)}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '4px 8px', color: '#0f172a' }}>{t('label_total_qms')}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#0d9488' }}>${fmt(costs.qms)}</td>
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
          onClick={handleDownloadProject}
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_download_project')}
        </button>
        <label
          className="px-5 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer', display: 'inline-block' }}
        >
          {t('btn_load_project')}
          <input type="file" accept=".json" onChange={handleLoadProject} style={{ display: 'none' }} />
        </label>
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
