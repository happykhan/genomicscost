import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import Tooltip from '../../components/Tooltip'
import { fmt } from '../../lib/format'
import type { BioCloudItem, BioInhouseItem } from '../../types'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

export default function Step6() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const { facility, transport, bioinformatics, qms } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

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
    updateProject({ transport: transport.map((t, i) => i === idx ? { ...t, ...patch } : t) })
  }
  function addTransportRow() {
    updateProject({ transport: [...transport, { label: 'New transport cost', annualCostUsd: 0, pctSequencing: 100 }] })
  }
  function removeTransportRow(idx: number) {
    updateProject({ transport: transport.filter((_, i) => i !== idx) })
  }

  // ── Bioinformatics ────────────────────────────────────────────────────────────
  function updateCloudItem(idx: number, patch: Partial<BioCloudItem>) {
    const next = bioinformatics.cloudItems.map((c, i) => i === idx ? { ...c, ...patch } : c)
    updateProject({ bioinformatics: { ...bioinformatics, cloudItems: next } })
  }
  function addCloudItem() {
    const newItem: BioCloudItem = {
      name: '', description: '', pricePerUnit: 0, quantity: 1,
      totalSamplesAllPathogens: samplesPerYear, samplesThisScenario: samplesPerYear,
      enabled: true, notes: '',
    }
    updateProject({ bioinformatics: { ...bioinformatics, cloudItems: [...bioinformatics.cloudItems, newItem] } })
  }
  function removeCloudItem(idx: number) {
    updateProject({ bioinformatics: { ...bioinformatics, cloudItems: bioinformatics.cloudItems.filter((_, i) => i !== idx) } })
  }

  function updateInhouseItem(idx: number, patch: Partial<BioInhouseItem>) {
    const next = bioinformatics.inhouseItems.map((c, i) => i === idx ? { ...c, ...patch } : c)
    updateProject({ bioinformatics: { ...bioinformatics, inhouseItems: next } })
  }
  function addInhouseItem() {
    const newItem: BioInhouseItem = {
      name: '', description: '', pricePerUnit: 0, quantity: 1,
      pctUse: 100, lifespanYears: 5, ageYears: 0, enabled: true,
    }
    updateProject({ bioinformatics: { ...bioinformatics, inhouseItems: [...bioinformatics.inhouseItems, newItem] } })
  }
  function removeInhouseItem(idx: number) {
    updateProject({ bioinformatics: { ...bioinformatics, inhouseItems: bioinformatics.inhouseItems.filter((_, i) => i !== idx) } })
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
  const facilityTotal = facility.reduce((s, f) => s + f.monthlyCostUsd * 12 * f.pctSequencing / 100, 0)
  const facilityPerSample = samplesPerYear > 0 ? facilityTotal / samplesPerYear : 0

  const transportTotal = transport.reduce((s, t) => s + t.annualCostUsd * (t.pctSequencing ?? 100) / 100, 0)
  const facilityTransportTotal = facilityTotal + transportTotal
  const facilityTransportPerSample = samplesPerYear > 0 ? facilityTransportTotal / samplesPerYear : 0

  const qmsTotal = qms.filter(q => q.enabled).reduce((s, q) => s + q.costUsd * q.quantity, 0)

  // Cloud bioinformatics annual cost
  const cloudTotal = (bioinformatics.type === 'cloud' || bioinformatics.type === 'hybrid')
    ? bioinformatics.cloudItems
        .filter(item => item.enabled)
        .reduce((sum, item) => {
          const totalSamplesAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
          return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * (item.samplesThisScenario ?? samplesPerYear) / totalSamplesAll
        }, 0)
    : 0

  // In-house bioinformatics annual cost
  const inhouseTotal = (bioinformatics.type === 'inhouse' || bioinformatics.type === 'hybrid')
    ? bioinformatics.inhouseItems
        .filter(item => item.enabled)
        .reduce((sum, item) => {
          const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
          return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * ((item.pctUse ?? 100) / 100) / remainingLife
        }, 0)
    : 0

  const bioTotal = cloudTotal + inhouseTotal

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step6_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step6_desc')}
      </p>

      {/* ── Facility ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_facility')}</h3>
        <div className="card mb-2" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 420 }}>
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_label')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{t('col_monthly_cost')}<Tooltip content={t('tooltip_facility_monthly')} /></span></th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{t('col_pct_sequencing')}<Tooltip content={t('tooltip_facility_pct')} /></span></th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual_attr')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {facility.map((f, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2">
                    <input type="text" value={f.label} onChange={e => updateFacilityRow(idx, { label: e.target.value })} className={inputClass} style={{ width: '100%' }} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={f.monthlyCostUsd} min={0} onChange={e => updateFacilityRow(idx, { monthlyCostUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 100, textAlign: 'right' }} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={f.pctSequencing} min={0} max={100} onChange={e => updateFacilityRow(idx, { pctSequencing: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 70, textAlign: 'right' }} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                    {fmt(f.monthlyCostUsd * 12 * f.pctSequencing / 100)}
                  </td>
                  <td className="px-3 py-2">
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

        {/* Facility summary output */}
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
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_annual_sequencing')}</div>
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
                const perSample = samplesPerYear > 0 ? attributed / samplesPerYear : 0
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
                    <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                      ${fmt(perSample)}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeTransportRow(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
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
        <div className="flex justify-start items-center mb-4">
          <button onClick={addTransportRow} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
        </div>

        {/* Combined facility + transport calculated costs */}
        <div className="p-4 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--gx-text-muted)' }}>Calculated costs — Facility and transport</div>
          <div className="grid grid-cols-2 gap-4">
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

      {/* ── Bioinformatics ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_bioinformatics')}</h3>
        <div className="card p-4 flex flex-col gap-4">
          {/* Type segmented control */}
          <div>
            <label className={labelClass}>{t('label_approach')}<Tooltip content={t('tooltip_bioinformatics')} /></label>
            <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--gx-border)', width: 'fit-content' }}>
              {(['cloud', 'inhouse', 'hybrid', 'none'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => updateProject({ bioinformatics: { ...bioinformatics, type } })}
                  className="px-4 py-1.5 text-xs font-medium"
                  style={{
                    background: bioinformatics.type === type ? 'var(--gx-accent)' : 'var(--gx-bg-alt)',
                    color: bioinformatics.type === type ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {type === 'cloud' ? t('opt_cloud') : type === 'inhouse' ? t('opt_inhouse') : type === 'hybrid' ? t('opt_hybrid') : t('opt_none')}
                </button>
              ))}
            </div>
          </div>

          {/* Cloud items table */}
          {(bioinformatics.type === 'cloud' || bioinformatics.type === 'hybrid') && (
            <div>
              <label className={labelClass}>{t('label_cloud_items')}</label>
              <div className="card mb-2" style={{ overflowX: 'auto' }}>
                <table className="w-full text-sm" style={{ minWidth: 500 }}>
                  <thead>
                    <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_item')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_per_unit')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_samples_scenario')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_samples_total')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                      <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bioinformatics.cloudItems.map((item, idx) => {
                      const totalSamplesAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
                      const annualCost = item.enabled
                        ? (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * (item.samplesThisScenario ?? samplesPerYear) / totalSamplesAll
                        : 0
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: item.enabled ? 1 : 0.4 }}>
                          <td className="px-3 py-2">
                            <input type="text" value={item.name} onChange={e => updateCloudItem(idx, { name: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 120 }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.pricePerUnit} min={0} step={0.01} onChange={e => updateCloudItem(idx, { pricePerUnit: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 90, textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.quantity} min={0} onChange={e => updateCloudItem(idx, { quantity: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.samplesThisScenario} min={0} onChange={e => updateCloudItem(idx, { samplesThisScenario: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 80, textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.totalSamplesAllPathogens} min={0} onChange={e => updateCloudItem(idx, { totalSamplesAllPathogens: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 80, textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                            ${fmt(annualCost)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={item.enabled} onChange={e => updateCloudItem(idx, { enabled: e.target.checked })} style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }} />
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeCloudItem(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={addCloudItem} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
                <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_cloud_total')}: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(cloudTotal)}</strong></div>
              </div>
            </div>
          )}

          {/* In-house items table */}
          {(bioinformatics.type === 'inhouse' || bioinformatics.type === 'hybrid') && (
            <div>
              <label className={labelClass}>{t('label_inhouse_items')}</label>
              <div className="card mb-2" style={{ overflowX: 'auto' }}>
                <table className="w-full text-sm" style={{ minWidth: 550 }}>
                  <thead>
                    <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                      <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_item')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_each')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pct_use')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_life_yr')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_age_yr')}</th>
                      <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                      <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bioinformatics.inhouseItems.map((item, idx) => {
                      const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
                      const annualCost = item.enabled
                        ? (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * ((item.pctUse ?? 100) / 100) / remainingLife
                        : 0
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: item.enabled ? 1 : 0.4 }}>
                          <td className="px-3 py-2">
                            <input type="text" value={item.name} onChange={e => updateInhouseItem(idx, { name: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 120 }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.pricePerUnit} min={0} step={0.01} onChange={e => updateInhouseItem(idx, { pricePerUnit: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 90, textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.quantity} min={0} onChange={e => updateInhouseItem(idx, { quantity: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.pctUse} min={0} max={100} onChange={e => updateInhouseItem(idx, { pctUse: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 60, textAlign: 'right' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.lifespanYears} min={1} max={30} onChange={e => updateInhouseItem(idx, { lifespanYears: parseInt(e.target.value) || 1 })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.ageYears} min={0} max={Math.max(0, (item.lifespanYears ?? 1) - 1)} onChange={e => updateInhouseItem(idx, { ageYears: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
                          </td>
                          <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                            ${fmt(annualCost)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox" checked={item.enabled} onChange={e => updateInhouseItem(idx, { enabled: e.target.checked })} style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }} />
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeInhouseItem(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={addInhouseItem} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
                <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_inhouse_total')}: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(inhouseTotal)}</strong></div>
              </div>
            </div>
          )}

          {/* Bioinformatics total */}
          {bioinformatics.type !== 'none' && (
            <div className="p-3 rounded" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_bio_total')}</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>
                ${fmt(bioTotal)}
                {samplesPerYear > 0 && (
                  <span className="font-normal text-xs ml-2" style={{ color: 'var(--gx-text-muted)' }}>
                    (${fmt(bioTotal / samplesPerYear)}/{t('label_per_sample_unit')})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── QMS ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>{t('field_qms')} {t('label_optional')}</h3>
        <div className="card mb-2" style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 360 }}>
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_activity')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_cost')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_quantity')}</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_annual')}</th>
                <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_on')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {qms.map((q, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: q.enabled ? 1 : 0.4 }}>
                  <td className="px-3 py-2">
                    <input type="text" value={q.activity} onChange={e => updateQMS(idx, { activity: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 180 }} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={q.costUsd} min={0} onChange={e => updateQMS(idx, { costUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 90, textAlign: 'right' }} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={q.quantity} min={0} onChange={e => updateQMS(idx, { quantity: parseInt(e.target.value) || 0 })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--gx-text)' }}>
                    {q.enabled ? fmt(q.costUsd * q.quantity) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={q.enabled} onChange={e => updateQMS(idx, { enabled: e.target.checked })} style={{ accentColor: 'var(--gx-accent)', width: 15, height: 15 }} />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeQMS(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={addQMS} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>{t('btn_add')}</button>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total')} QMS: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(qmsTotal)}</strong></div>
        </div>
      </section>
    </div>
  )
}
