import { useState, useRef } from 'react'
import { useProject } from '../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { downloadCSV } from '../lib/download'

type Tab = 'equipment' | 'consumables' | 'personnel'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] px-2 py-1 text-sm focus:outline-none focus:border-[var(--gx-accent)]'

interface PriceEditorProps {
  onClose: () => void
}

export default function PriceEditor({ onClose }: PriceEditorProps) {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('equipment')
  const fileRef = useRef<HTMLInputElement>(null)

  // Local editable copies
  const [equipment, setEquipment] = useState(project.equipment.map(e => ({ ...e })))
  const [consumables, setConsumables] = useState(project.consumables.map(c => ({ ...c })))
  const [personnel, setPersonnel] = useState(project.personnel.map(p => ({ ...p })))

  function handleSave() {
    updateProject({ equipment, consumables, personnel })
    toast.success(t('toast_prices_saved'))
    onClose()
  }

  // ── CSV export ────────────────────────────────────────────────────────────────
  function handleDownloadCSV() {
    const rows: string[] = ['type,name,value,field']
    equipment.forEach(e => rows.push(`equipment,${csvEsc(e.name)},${e.unitCostUsd},unitCostUsd`))
    consumables.forEach(c => rows.push(`consumable,${csvEsc(c.name)},${c.unitCostUsd},unitCostUsd`))
    personnel.forEach(p => rows.push(`personnel,${csvEsc(p.role)},${p.annualSalaryUsd},annualSalaryUsd`))
    downloadCSV(rows.join('\n'), `${project.name || 'genomics-cost'}-prices.csv`)
  }

  function csvEsc(s: string) {
    return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s
  }

  // ── CSV import ────────────────────────────────────────────────────────────────
  function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = (ev.target?.result as string).split('\n').slice(1) // skip header
        let updated = 0
        const newEquipment = equipment.map(eq => ({ ...eq }))
        const newConsumables = consumables.map(c => ({ ...c }))
        const newPersonnel = personnel.map(p => ({ ...p }))

        for (const line of lines) {
          if (!line.trim()) continue
          const [type, name, value] = parseCSVLine(line)
          const num = parseFloat(value)
          if (isNaN(num) || num < 0) continue

          if (type === 'equipment') {
            const idx = newEquipment.findIndex(eq => eq.name === name)
            if (idx >= 0) { newEquipment[idx].unitCostUsd = num; updated++ }
          } else if (type === 'consumable') {
            const idx = newConsumables.findIndex(c => c.name === name)
            if (idx >= 0) { newConsumables[idx].unitCostUsd = num; updated++ }
          } else if (type === 'personnel') {
            const idx = newPersonnel.findIndex(p => p.role === name)
            if (idx >= 0) { newPersonnel[idx].annualSalaryUsd = num; updated++ }
          }
        }

        setEquipment(newEquipment)
        setConsumables(newConsumables)
        setPersonnel(newPersonnel)
        toast.success(t('toast_prices_imported', { count: updated }))
      } catch {
        toast.error(t('error_parse_csv'))
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsText(file)
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { result.push(cur); cur = '' }
      else { cur += ch }
    }
    result.push(cur)
    return result
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'equipment', label: t('step4_label'), count: equipment.length },
    { id: 'consumables', label: t('step3_label'), count: consumables.length },
    { id: 'personnel', label: t('step5_label'), count: personnel.length },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--gx-bg)',
        border: '1px solid var(--gx-border)',
        borderRadius: 10,
        width: '100%',
        maxWidth: 680,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gx-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gx-text)' }}>{t('label_price_editor_title')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gx-text-muted)', marginTop: 2 }}>{t('label_price_editor_desc')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gx-text-muted)', fontSize: '1.2rem', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* CSV actions */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--gx-border)', display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--gx-bg-alt)' }}>
          <button
            onClick={handleDownloadCSV}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: 'var(--gx-bg)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
          >
            {t('btn_download_price_template')}
          </button>
          <label
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: 'var(--gx-bg)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer', display: 'inline-block' }}
          >
            {t('btn_import_prices')}
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
          </label>
          <span style={{ fontSize: '0.7rem', color: 'var(--gx-text-muted)', alignSelf: 'center' }}>{t('note_price_csv_tip')}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gx-border)' }}>
          {tabs.map(tItem => (
            <button
              key={tItem.id}
              onClick={() => setTab(tItem.id)}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: tab === tItem.id ? '2px solid var(--gx-accent)' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: tab === tItem.id ? 600 : 400,
                color: tab === tItem.id ? 'var(--gx-accent)' : 'var(--gx-text-muted)',
              }}
            >
              {tItem.label} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({tItem.count})</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
          {tab === 'equipment' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--gx-bg-alt)', position: 'sticky', top: 0 }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500 }}>{t('col_item')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500, width: 140 }}>{t('col_price_each')}</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((eq, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                    <td style={{ padding: '6px 16px', color: 'var(--gx-text)' }}>{eq.name}</td>
                    <td style={{ padding: '6px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={eq.unitCostUsd}
                        min={0}
                        onChange={e => setEquipment(prev => prev.map((x, j) => j === i ? { ...x, unitCostUsd: parseFloat(e.target.value) || 0 } : x))}
                        className={inputClass}
                        style={{ width: 110, textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'consumables' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--gx-bg-alt)', position: 'sticky', top: 0 }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500 }}>{t('col_item')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500, width: 140 }}>{t('col_unit_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {consumables.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gx-border)', opacity: c.enabled ? 1 : 0.45 }}>
                    <td style={{ padding: '6px 16px', color: 'var(--gx-text)' }}>{c.name}</td>
                    <td style={{ padding: '6px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={c.unitCostUsd}
                        min={0}
                        step={0.01}
                        onChange={e => setConsumables(prev => prev.map((x, j) => j === i ? { ...x, unitCostUsd: parseFloat(e.target.value) || 0 } : x))}
                        className={inputClass}
                        style={{ width: 110, textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'personnel' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--gx-bg-alt)', position: 'sticky', top: 0 }}>
                  <th style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500 }}>{t('col_role')}</th>
                  <th style={{ textAlign: 'right', padding: '8px 16px', color: 'var(--gx-text-muted)', fontWeight: 500, width: 160 }}>{t('col_salary')}</th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                    <td style={{ padding: '6px 16px', color: 'var(--gx-text)' }}>{p.role}</td>
                    <td style={{ padding: '6px 16px', textAlign: 'right' }}>
                      <input
                        type="number"
                        value={p.annualSalaryUsd}
                        min={0}
                        onChange={e => setPersonnel(prev => prev.map((x, j) => j === i ? { ...x, annualSalaryUsd: parseFloat(e.target.value) || 0 } : x))}
                        className={inputClass}
                        style={{ width: 120, textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--gx-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 6, background: 'none', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {t('btn_cancel')}
          </button>
          <button
            onClick={handleSave}
            style={{ padding: '7px 20px', borderRadius: 6, background: 'var(--gx-accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
          >
            {t('btn_save')}
          </button>
        </div>
      </div>
    </div>
  )
}
