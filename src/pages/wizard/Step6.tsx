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
  const { bioinformatics } = project
  const samplesPerYear = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)

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

  const showCloud = bioinformatics.type === 'cloud' || bioinformatics.type === 'hybrid'
  const showInhouse = bioinformatics.type === 'inhouse' || bioinformatics.type === 'hybrid'

  // Cloud: full purchase cost (pricePerUnit × qty, before sample-proportion adjustment)
  const cloudPurchaseCost = showCloud
    ? bioinformatics.cloudItems.filter(i => i.enabled)
        .reduce((sum, item) => sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1), 0)
    : 0

  // Cloud: annual operational cost (proportioned by samples this scenario / all pathogens)
  const cloudTotal = showCloud
    ? bioinformatics.cloudItems.filter(i => i.enabled).reduce((sum, item) => {
        const totalSamplesAll = Math.max(1, item.totalSamplesAllPathogens || samplesPerYear)
        return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * (item.samplesThisScenario ?? samplesPerYear) / totalSamplesAll
      }, 0)
    : 0

  // In-house: total capital cost (pricePerUnit × qty, before depreciation)
  const inhousePurchaseCost = showInhouse
    ? bioinformatics.inhouseItems.filter(i => i.enabled)
        .reduce((sum, item) => sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1), 0)
    : 0

  // In-house: annual depreciation cost
  const inhouseTotal = showInhouse
    ? bioinformatics.inhouseItems.filter(i => i.enabled).reduce((sum, item) => {
        const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
        return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * ((item.pctUse ?? 100) / 100) / remainingLife
      }, 0)
    : 0

  const bioTotal = cloudTotal + inhouseTotal

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step6_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>{t('step6_desc')}</p>

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
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_description')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_per_unit')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_samples_scenario')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_samples_total')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_total_cost')}</th>
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
                          <input type="text" value={item.description} onChange={e => updateCloudItem(idx, { description: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 120 }} />
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
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_cloud_total')}: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(cloudTotal)}</strong> ({samplesPerYear > 0 ? `$${fmt(cloudTotal / samplesPerYear)}/sample` : '—'})</div>
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
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_component')}</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_description')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_each')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pct_use')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_lifetime_yr')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_age_yr')}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_depreciation_yr')}</th>
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
                          <input type="text" value={item.name} title={item.name} onChange={e => updateInhouseItem(idx, { name: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 120 }} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={item.description} title={item.description} onChange={e => updateInhouseItem(idx, { description: e.target.value })} className={inputClass} style={{ width: '100%', minWidth: 120 }} />
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
                          <input type="number" value={item.lifespanYears} min={1} max={30} onChange={e => updateInhouseItem(idx, { lifespanYears: (v => isNaN(v) ? 1 : v)(parseInt(e.target.value)) })} className={inputClass} style={{ width: 60, textAlign: 'center' }} />
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
              <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_inhouse_total')}: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(inhouseTotal)}</strong> ({samplesPerYear > 0 ? `$${fmt(inhouseTotal / samplesPerYear)}/sample` : '—'})</div>
            </div>
          </div>
        )}

        {/* Calculated costs summary */}
        {bioinformatics.type !== 'none' && (
          <div className="p-4 rounded flex flex-col gap-3" style={{ background: 'var(--gx-bg-alt)', border: '1px solid var(--gx-border)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--gx-text-muted)' }}>
              {t('label_calc_costs_bio')}
            </div>

            {/* Cloud block */}
            {showCloud && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('label_cloud_based')}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_purchase_cost')}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(cloudPurchaseCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_annual_cost')}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(cloudTotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_cost_per_sample')}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>
                      {samplesPerYear > 0 ? `$${fmt(cloudTotal / samplesPerYear)}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* In-house block */}
            {showInhouse && (
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--gx-text)' }}>{t('opt_inhouse')}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--gx-border)', color: 'var(--gx-text-muted)' }}>
                      <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: 4 }}>{t('col_component')}</th>
                      <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 4 }}>{t('col_purchase_cost')}</th>
                      <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 4 }}>{t('col_remaining_life')}</th>
                      <th style={{ textAlign: 'right', fontWeight: 500, paddingBottom: 4 }}>{t('col_annual_depreciation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bioinformatics.inhouseItems.filter(i => i.enabled && (i.quantity ?? 0) > 0).map((item, idx) => {
                      const purchaseCost = (item.pricePerUnit ?? 0) * (item.quantity ?? 1)
                      const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
                      const depreciation = purchaseCost * ((item.pctUse ?? 100) / 100) / remainingLife
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                          <td style={{ padding: '3px 0', color: 'var(--gx-text)' }}>{item.name || '—'}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0', color: 'var(--gx-text)' }}>${fmt(purchaseCost)}</td>
                          <td style={{ textAlign: 'right', padding: '3px 0', color: 'var(--gx-text-muted)' }}>{remainingLife} yr</td>
                          <td style={{ textAlign: 'right', padding: '3px 0', color: 'var(--gx-accent)', fontWeight: 500 }}>${fmt(depreciation)}/yr</td>
                        </tr>
                      )
                    })}
                    {bioinformatics.inhouseItems.filter(i => i.enabled && (i.quantity ?? 0) > 0).length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--gx-text-muted)', padding: '4px 0' }}>{t('label_no_active_items')}</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--gx-border)' }}>
                      <td style={{ padding: '4px 0', fontWeight: 600, color: 'var(--gx-text)', fontSize: '0.8rem' }}>Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gx-text)' }}>
                        ${fmt(inhousePurchaseCost)}
                        <div style={{ fontWeight: 400, fontStyle: 'italic', color: 'var(--gx-text-muted)', fontSize: '0.7rem' }}>{t('label_included_establishment')}</div>
                      </td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--gx-accent)' }}>
                        ${fmt(inhouseTotal)}/yr
                        {samplesPerYear > 0 && <span style={{ fontWeight: 400, color: 'var(--gx-text-muted)' }}> (${fmt(inhouseTotal / samplesPerYear)}/sample)</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Hybrid combined totals */}
            {bioinformatics.type === 'hybrid' && (
              <div style={{ borderTop: '1px solid var(--gx-border)', paddingTop: 8 }}>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('label_hybrid_desc')}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_hybrid_purchase')}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--gx-text)' }}>${fmt(cloudPurchaseCost + inhousePurchaseCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_hybrid_operational')}</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>${fmt(bioTotal)}</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{t('label_total_hybrid_per_sample')}</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--gx-accent)' }}>
                      {samplesPerYear > 0 ? `$${fmt(bioTotal / samplesPerYear)}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Single-mode total (cloud-only or inhouse-only) */}
            {bioinformatics.type !== 'hybrid' && (
              <div style={{ borderTop: '1px solid var(--gx-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>{t('label_bio_total')}</div>
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
        )}
      </div>
    </div>
  )
}
