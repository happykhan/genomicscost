import { useState } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import Tooltip from '../../components/Tooltip'
import { fmt } from '../../lib/format'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

export default function Step7() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const { facility, transport, qms } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)
  const facilityPct = (project.facilityPctSequencing ?? 100) / 100
  const [qmsOpen, setQmsOpen] = useState(true)

  // ── Facility ─────────────────────────────────────────────────────────────────
  function updateFacilityRow(idx: number, patch: Partial<typeof facility[0]>) {
    updateProject({ facility: facility.map((f, i) => i === idx ? { ...f, ...patch } : f) })
  }
  function addFacilityRow() {
    updateProject({ facility: [...facility, { label: 'New cost', monthlyCostUsd: 0, pctSequencing: 50 }] })
  }
  function removeFacilityRow(idx: number) {
    updateProject({ facility: facility.filter((_, i) => i !== idx) })
  }

  // ── Transport ─────────────────────────────────────────────────────────────────
  function updateTransportRow(idx: number, patch: Partial<typeof transport[0]>) {
    updateProject({ transport: transport.map((tr, i) => i === idx ? { ...tr, ...patch } : tr) })
  }
  function addTransportRow() {
    updateProject({ transport: [...transport, { label: 'New transport cost', annualCostUsd: 0, pctSequencing: 100 }] })
  }
  function removeTransportRow(idx: number) {
    updateProject({ transport: transport.filter((_, i) => i !== idx) })
  }

  // ── QMS ──────────────────────────────────────────────────────────────────────
  function updateQMS(idx: number, patch: Partial<typeof qms[0]>) {
    updateProject({ qms: qms.map((q, i) => i === idx ? { ...q, ...patch } : q) })
  }
  function addQMS() {
    updateProject({ qms: [...qms, { activity: 'New QMS activity', costUsd: 0, quantity: 1, pctSequencing: 100, enabled: true }] })
  }
  function removeQMS(idx: number) {
    updateProject({ qms: qms.filter((_, i) => i !== idx) })
  }

  // ── Computed totals ──────────────────────────────────────────────────────────
  const facilityMonthlyTotal = facility.reduce((s, f) => s + f.monthlyCostUsd, 0)
  const facilityAnnualAll = facilityMonthlyTotal * 12
  const facilityTotal = facilityAnnualAll * facilityPct
  const facilityPerSample = samplesPerYear > 0 ? facilityTotal / samplesPerYear : 0

  const transportTotal = transport.reduce((s, tr) => s + tr.annualCostUsd * (tr.pctSequencing ?? 100) / 100, 0)
  const facilityTransportTotal = facilityTotal + transportTotal
  const facilityTransportPerSample = samplesPerYear > 0 ? facilityTransportTotal / samplesPerYear : 0

  const qmsTotal = qms.filter(q => q.enabled).reduce((s, q) => s + q.costUsd * q.quantity * (q.pctSequencing ?? 100) / 100, 0)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step7_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>{t('step7_desc')}</p>

      {/* ── Facility ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_facility')}</h3>

        {/* Global sequencing % control */}
        <div className="flex items-center gap-3 mb-3 p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
          <label className="text-xs font-medium" style={{ color: 'var(--gx-text)', whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              % of facility used for sequencing
              <Tooltip content="Percentage of the facility costs attributed to the sequencing programme. Applied to all facility line items." />
            </span>
          </label>
          <input
            type="number"
            value={project.facilityPctSequencing ?? 100}
            min={0}
            max={100}
            onChange={e => updateProject({ facilityPctSequencing: parseInt(e.target.value) || 0 })}
            className={inputClass}
            style={{ width: 70, textAlign: 'right' }}
          />
          <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>%</span>
        </div>

        <div className="card mb-2" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 480, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 'auto' }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_label')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                    {t('col_monthly_cost')}<Tooltip content={t('tooltip_facility_monthly')} />
                  </span>
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual (attributed)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {facility.map((f, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2">
                    <input type="text" value={f.label} onChange={e => updateFacilityRow(idx, { label: e.target.value })} className={inputClass} style={{ width: '100%' }} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" value={f.monthlyCostUsd} min={0} onChange={e => updateFacilityRow(idx, { monthlyCostUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: '100%', textAlign: 'right' }} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                    ${fmt(f.monthlyCostUsd * 12 * facilityPct)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => removeFacilityRow(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mb-3">
          <button onClick={addFacilityRow} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
        </div>

        {/* Facility summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_monthly')}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(facilityMonthlyTotal)}</div>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_annual_all')}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(facilityAnnualAll)}</div>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_annual_sequencing')} ({project.facilityPctSequencing ?? 100}%)</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(facilityTotal)}</div>
          </div>
          <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_per_sample')}</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(facilityPerSample)}</div>
          </div>
        </div>
      </section>

      {/* ── Transport ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_transport')}</h3>
        <div className="card mb-2" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Transportation service</th>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Shipment method</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual cost (USD)</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>% for sequencing</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Cost/sample</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {transport.map((tr, idx) => {
                const attributed = tr.annualCostUsd * (tr.pctSequencing ?? 100) / 100
                const costPerSample = samplesPerYear > 0 ? attributed / samplesPerYear : 0
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                    <td className="px-3 py-2">
                      <input type="text" value={tr.label} onChange={e => updateTransportRow(idx, { label: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 160 }} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={tr.shipmentMethod ?? ''} placeholder="e.g. Courier" onChange={e => updateTransportRow(idx, { shipmentMethod: e.target.value })} className={inputClass} style={{ width: 110 }} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={tr.annualCostUsd} min={0} onChange={e => updateTransportRow(idx, { annualCostUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 110, textAlign: 'right' }} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={tr.pctSequencing ?? 100} min={0} max={100} onChange={e => updateTransportRow(idx, { pctSequencing: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 70, textAlign: 'right' }} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                      ${fmt(costPerSample)}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeTransportRow(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ borderTop: '2px solid var(--gx-border)' }}>
              <tr>
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>Total annual transport-related cost</td>
                <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--gx-text)' }}>${fmt(transportTotal)}</td>
                <td />
                <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--gx-text)' }}>
                  ${fmt(samplesPerYear > 0 ? transportTotal / samplesPerYear : 0)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex justify-between items-center mb-3">
          <button onClick={addTransportRow} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
        </div>

        {/* Combined facility + transport output */}
        <div className="p-4 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--gx-text-muted)' }}>Calculated costs — Facility and transport</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Total annual facility and transportation cost</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(facilityTransportTotal)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Facility and transportation cost per sample</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(facilityTransportPerSample)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QMS ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>
            {t('field_qms')} <span className="font-normal text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_optional')}</span>
          </h3>
          <div className="flex items-center gap-4">
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>
              {t('label_total')} QMS: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(qmsTotal)}</strong>
              &nbsp;&nbsp;/sample: <strong style={{ color: 'var(--gx-accent)' }}>{samplesPerYear > 0 ? `$${fmt(qmsTotal / samplesPerYear)}` : '—'}</strong>
            </div>
            <button
              onClick={() => setQmsOpen(o => !o)}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
            >
              {qmsOpen ? '▲ Hide' : '▼ Show'}
            </button>
          </div>
        </div>
        {qmsOpen && (
          <>
            <div className="card mb-2" style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ minWidth: 520, tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 44 }} />
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_activity')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_cost')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_quantity')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                    <th className="text-center px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {qms.map((q, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: q.enabled ? 1 : 0.4 }}>
                      <td className="px-3 py-2">
                        <input type="text" value={q.activity} onChange={e => updateQMS(idx, { activity: e.target.value })} className={inputClass} style={{ width: '100%' }} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={q.costUsd} min={0} onChange={e => updateQMS(idx, { costUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: '100%', textAlign: 'right' }} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={q.quantity} min={0} onChange={e => updateQMS(idx, { quantity: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: '100%', textAlign: 'center' }} />
                      </td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                        {q.enabled ? fmt(q.costUsd * q.quantity * (q.pctSequencing ?? 100) / 100) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={q.enabled} onChange={e => updateQMS(idx, { enabled: e.target.checked })} style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeQMS(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addQMS} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
          </>
        )}
      </section>

    </div>
  )
}
