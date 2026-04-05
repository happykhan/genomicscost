import { useProject } from '../../store/ProjectContext'
import catalogue from '../../data/catalogue.json'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

const CLOUD_PLATFORMS = catalogue.bioinformatics_cloud.cloud_platforms.map(p => p.name)

export default function Step6() {
  const { project, updateProject } = useProject()
  const { facility, transport, bioinformatics, qms } = project

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
    updateProject({ transport: [...transport, { label: 'New transport cost', annualCostUsd: 0 }] })
  }
  function removeTransportRow(idx: number) {
    updateProject({ transport: transport.filter((_, i) => i !== idx) })
  }

  // ── QMS ──────────────────────────────────────────────────────────────────────
  function updateQMS(idx: number, patch: Partial<typeof qms[0]>) {
    updateProject({ qms: qms.map((q, i) => i === idx ? { ...q, ...patch } : q) })
  }

  const facilityTotal = facility.reduce((s, f) => s + f.monthlyCostUsd * 12 * f.pctSequencing / 100, 0)
  const transportTotal = transport.reduce((s, t) => s + t.annualCostUsd, 0)
  const qmsTotal = qms.filter(q => q.enabled).reduce((s, q) => s + q.costUsd * q.quantity, 0)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 6: Facility, Transport & Bioinformatics</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        Overhead costs, sample transport and your bioinformatics approach.
      </p>

      {/* ── Facility ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>Facility costs</h3>
        <div className="card overflow-hidden mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Label</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Monthly cost ($)</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>% sequencing</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual attr. ($)</th>
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
        <div className="flex justify-between items-center">
          <button onClick={addFacilityRow} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>+ Add row</button>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Total: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(facilityTotal)}</strong></div>
        </div>
      </section>

      {/* ── Transport ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>Transport</h3>
        <div className="card overflow-hidden mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Label</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual cost ($)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {transport.map((t, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2">
                    <input type="text" value={t.label} onChange={e => updateTransportRow(idx, { label: e.target.value })} className={inputClass} style={{ width: '100%' }} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={t.annualCostUsd} min={0} onChange={e => updateTransportRow(idx, { annualCostUsd: parseFloat(e.target.value) || 0 })} className={inputClass} style={{ width: 120, textAlign: 'right' }} />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeTransportRow(idx)} className="text-xs px-2 py-0.5 rounded" style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={addTransportRow} className="px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>+ Add row</button>
          <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>Total: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(transportTotal)}</strong></div>
        </div>
      </section>

      {/* ── Bioinformatics ── */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>Bioinformatics</h3>
        <div className="card p-4 flex flex-col gap-4">
          {/* Type radio */}
          <div>
            <label className={labelClass}>Approach</label>
            <div className="flex gap-4">
              {(['cloud', 'inhouse', 'none'] as const).map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="bioType"
                    value={type}
                    checked={bioinformatics.type === type}
                    onChange={() => updateProject({ bioinformatics: { ...bioinformatics, type } })}
                    style={{ accentColor: 'var(--gx-accent)' }}
                  />
                  <span style={{ color: 'var(--gx-text)', textTransform: 'capitalize' }}>{type === 'inhouse' ? 'In-house' : type === 'none' ? 'None / included' : 'Cloud'}</span>
                </label>
              ))}
            </div>
          </div>

          {bioinformatics.type === 'cloud' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Platform</label>
                <select
                  className={inputClass}
                  value={bioinformatics.cloudPlatform}
                  onChange={e => updateProject({ bioinformatics: { ...bioinformatics, cloudPlatform: e.target.value } })}
                  style={{ width: '100%' }}
                >
                  {CLOUD_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Cost per sample (USD)</label>
                <input
                  type="number"
                  value={bioinformatics.costPerSampleUsd}
                  min={0}
                  step={0.1}
                  onChange={e => updateProject({ bioinformatics: { ...bioinformatics, costPerSampleUsd: parseFloat(e.target.value) || 0 } })}
                  className={inputClass}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}

          {bioinformatics.type === 'inhouse' && (
            <div>
              <label className={labelClass}>Annual server / infrastructure cost (USD)</label>
              <input
                type="number"
                value={bioinformatics.annualServerCostUsd}
                min={0}
                onChange={e => updateProject({ bioinformatics: { ...bioinformatics, annualServerCostUsd: parseFloat(e.target.value) || 0 } })}
                className={inputClass}
                style={{ width: 200 }}
              />
            </div>
          )}
        </div>
      </section>

      {/* ── QMS ── */}
      <section>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>Quality management (optional)</h3>
        <div className="card overflow-hidden mb-2">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
                <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Activity</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Cost ($)</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Qty</th>
                <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>Annual ($)</th>
                <th className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>On</th>
              </tr>
            </thead>
            <tbody>
              {qms.map((q, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--gx-border)', opacity: q.enabled ? 1 : 0.4 }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>{q.activity}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-right" style={{ color: 'var(--gx-text-muted)' }}>
          Total QMS: <strong style={{ color: 'var(--gx-accent)' }}>${fmt(qmsTotal)}</strong>
        </div>
      </section>
    </div>
  )
}
