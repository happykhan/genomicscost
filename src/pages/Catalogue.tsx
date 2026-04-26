import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useProject } from '../store/ProjectContext'
import toast from 'react-hot-toast'
import {
  getEffectiveCatalogue,
  getOverrideStatus,
  setOverride,
  resetRow,
  resetAll,
  exportOverrides,
  importOverrides,
  exportEffective,
  loadOverrides,
  getBundledCatalogue,
} from '../lib/catalogue'
import type {
  BundledEquipmentItem,
  BundledReagent,
  BundledLibPrepKit,
  BundledPathogen,
  BundledCloudPlatform,
  BundledReagentKit,
} from '../lib/catalogue'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-1.5 text-xs focus:outline-none focus:border-[var(--gx-accent)]'

const WF_STEPS = ['sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing'] as const
const WF_ABBREV: Record<string, string> = {
  sample_receipt: 'SR', nucleic_acid_extraction: 'NA', pcr_testing: 'PCR',
  ngs_library_preparation: 'Lib', sequencing: 'Seq',
}
// Workflow full names — use i18n keys; resolved at render time
const WF_FULL_KEYS: Record<string, string> = {
  sample_receipt: 'wf_sample_receipt', nucleic_acid_extraction: 'wf_nucleic_acid_extraction',
  pcr_testing: 'wf_pcr_testing', ngs_library_preparation: 'ws_library_prep', sequencing: 'ws_sequencing',
}

// ── Shared helper components ─────────────────────────────────────────────────

function OverrideBadge({ status }: { status: 'none' | 'edited' | 'custom' | 'deleted' }) {
  const { t } = useTranslation()
  if (status === 'none') return null
  const labels: Record<string, string> = {
    edited: t('catalogue_badge_override'),
    custom: t('catalogue_badge_custom'),
    deleted: t('catalogue_badge_deleted'),
  }
  const colors: Record<string, string> = {
    edited: 'var(--gx-accent)',
    custom: '#8b5cf6',
    deleted: '#ef4444',
  }
  return (
    <span
      title={labels[status]}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colors[status],
        marginLeft: 6,
        flexShrink: 0,
      }}
    />
  )
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTranslation()
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? t('catalogue_search_placeholder')}
      className={inputClass}
      style={{ width: 280, marginBottom: 12 }}
    />
  )
}

// ── Editable cell ────────────────────────────────────────────────────────────

function EditableCell({
  value,
  type,
  onChange,
  readOnly,
  style,
}: {
  value: string | number | null
  type: 'text' | 'number'
  onChange: (v: string | number | null) => void
  readOnly?: boolean
  style?: React.CSSProperties
}) {
  if (readOnly) {
    return <span style={{ fontSize: '0.78rem', color: 'var(--gx-text-muted)', ...style }}>{value ?? ''}</span>
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => {
        if (type === 'number') {
          const n = parseFloat(e.target.value)
          onChange(isNaN(n) ? null : n)
        } else {
          onChange(e.target.value)
        }
      }}
      className={inputClass}
      style={{ width: type === 'number' ? 90 : 160, textAlign: type === 'number' ? 'right' : 'left', ...style }}
    />
  )
}

// ── Row actions ──────────────────────────────────────────────────────────────

function RowActions({
  status,
  onReset,
  onDelete,
  onRestore,
}: {
  status: 'none' | 'edited' | 'custom' | 'deleted'
  onReset: () => void
  onDelete: () => void
  onRestore: () => void
}) {
  const { t } = useTranslation()
  if (status === 'deleted') {
    return (
      <button
        onClick={onRestore}
        className="text-xs px-2 py-0.5 rounded"
        style={{ color: 'var(--gx-accent)', background: 'none', border: '1px solid var(--gx-accent)', cursor: 'pointer' }}
      >
        {t('catalogue_btn_restore')}
      </button>
    )
  }
  return (
    <div className="flex gap-1">
      {(status === 'edited' || status === 'custom') && (
        <button
          onClick={onReset}
          title={t('catalogue_tooltip_revert')}
          className="text-xs px-2 py-0.5 rounded"
          style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('catalogue_btn_reset')}
        </button>
      )}
      <button
        onClick={onDelete}
        className="text-xs px-2 py-0.5 rounded"
        style={{ color: '#ef4444', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
      >
        {t('catalogue_btn_delete')}
      </button>
    </div>
  )
}

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'reagent_kits' | 'library_prep' | 'reagents' | 'equipment' | 'pathogens' | 'bioinformatics' | 'settings'

interface TabDef {
  id: TabId
  labelKey: string
  count: (cat: ReturnType<typeof getEffectiveCatalogue>) => number
}

const TABS: TabDef[] = [
  { id: 'reagent_kits', labelKey: 'catalogue_tab_reagent_kits', count: c => c.platforms.reduce((s, p) => s + p.reagent_kits.length, 0) },
  { id: 'library_prep', labelKey: 'catalogue_tab_library_prep', count: c => c.library_prep_kits.length },
  { id: 'reagents', labelKey: 'catalogue_tab_reagents', count: c => c.reagents.length },
  { id: 'equipment', labelKey: 'catalogue_tab_equipment', count: c => c.equipment.length },
  { id: 'pathogens', labelKey: 'catalogue_tab_pathogens', count: c => c.pathogens.length },
  { id: 'bioinformatics', labelKey: 'catalogue_tab_bioinformatics', count: c => c.bioinformatics_cloud.cloud_platforms.length },
  { id: 'settings', labelKey: 'catalogue_tab_settings', count: () => 2 },
]

// ── Add-row modal ────────────────────────────────────────────────────────────

function AddRowModal({
  tab,
  platformId,
  onClose,
  onAdd,
}: {
  tab: TabId
  platformId?: string
  onClose: () => void
  onAdd: (name: string, data: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Record<string, string | number | null>>({})

  function handleSubmit() {
    if (!name.trim()) return
    onAdd(name.trim(), { ...fields })
    onClose()
  }

  const fieldDefs = getFieldDefs(tab)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card p-6"
        style={{ maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--gx-text)' }}>
          {t('catalogue_add_title')}
          {platformId && <span className="text-xs ml-2" style={{ color: 'var(--gx-text-muted)' }}>({platformId})</span>}
        </h3>

        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className={inputClass}
            style={{ width: '100%' }}
            autoFocus
          />
        </div>

        {fieldDefs.map(f => (
          <div key={f.key} className="mb-3">
            <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t(f.labelKey)}</label>
            <input
              type={f.type}
              value={fields[f.key] ?? ''}
              onChange={e => {
                const val = f.type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value
                setFields(prev => ({ ...prev, [f.key]: val }))
              }}
              className={inputClass}
              style={{ width: '100%' }}
            />
          </div>
        ))}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded text-sm font-medium"
            style={{
              background: name.trim() ? 'var(--gx-accent)' : 'var(--gx-bg-alt)',
              color: name.trim() ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
              border: 'none',
              cursor: name.trim() ? 'pointer' : 'default',
            }}
          >
            {t('catalogue_btn_add')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm font-medium"
            style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
          >
            {t('btn_cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function getFieldDefs(tab: TabId): Array<{ key: string; labelKey: string; type: 'text' | 'number' }> {
  switch (tab) {
    case 'equipment':
      return [
        { key: 'category', labelKey: 'col_category', type: 'text' },
        { key: 'workflow_step', labelKey: 'col_workflow_step', type: 'text' },
        { key: 'unit_cost_usd', labelKey: 'col_unit_cost_usd', type: 'number' },
        { key: 'recommended_quantity', labelKey: 'col_rec_qty', type: 'number' },
      ]
    case 'reagent_kits':
      return [
        { key: 'unit_price_usd', labelKey: 'col_price_usd', type: 'number' },
        { key: 'read_length_bp', labelKey: 'col_read_length_bp', type: 'number' },
        { key: 'max_reads_per_flowcell', labelKey: 'col_max_reads', type: 'number' },
        { key: 'max_output_mb', labelKey: 'col_max_output_mb', type: 'number' },
      ]
    case 'library_prep':
      return [
        { key: 'pathogen_type', labelKey: 'field_pathogen_type', type: 'text' },
        { key: 'compatible_platforms', labelKey: 'col_platforms', type: 'text' },
        { key: 'pack_size', labelKey: 'col_pack_size', type: 'number' },
        { key: 'barcoding_limit', labelKey: 'col_barcoding_limit', type: 'number' },
        { key: 'unit_price_usd', labelKey: 'col_price_usd', type: 'number' },
      ]
    case 'reagents':
      return [
        { key: 'category', labelKey: 'col_category', type: 'text' },
        { key: 'pack_size', labelKey: 'col_pack_size', type: 'number' },
        { key: 'quantity_per_sample', labelKey: 'col_qty_sample', type: 'number' },
        { key: 'workflow', labelKey: 'col_workflow_step', type: 'text' },
      ]
    case 'pathogens':
      return [
        { key: 'type', labelKey: 'col_type', type: 'text' },
        { key: 'genome_type', labelKey: 'col_genome', type: 'text' },
        { key: 'genome_size_mb', labelKey: 'col_size_mb', type: 'number' },
        { key: 'required_coverage_x', labelKey: 'col_coverage_x', type: 'number' },
      ]
    case 'bioinformatics':
      return [
        { key: 'description', labelKey: 'col_description', type: 'text' },
        { key: 'pricing_model', labelKey: 'col_pricing_model', type: 'text' },
      ]
    case 'settings':
      return []
  }
}

// ── Tab content components ───────────────────────────────────────────────────

function EquipmentTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const filtered = catalogue.equipment.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  )

  // Include deleted items from overrides
  const deletedNames = Object.entries(overrides.equipment ?? {})
    .filter(([, v]) => v === null)
    .map(([k]) => k)

  const bundled = getBundledCatalogue()
  const deletedItems = deletedNames
    .map(name => bundled.equipment.find(e => e.name === name))
    .filter((e): e is BundledEquipmentItem => e != null)
    .filter(e => e.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | null) {
    setOverride('equipment', name, { [field]: value })
    onRefresh()
  }

  function handleDelete(name: string) {
    setOverride('equipment', name, null)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('equipment', name)
    onRefresh()
  }

  function handleRestore(name: string) {
    resetRow('equipment', name)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const newItem = {
      name,
      category: (data.category as string) ?? 'lab_equipment',
      workflow_step: (data.workflow_step as string) ?? '',
      unit_cost_usd: (data.unit_cost_usd as number) ?? null,
      catalog_ref: null,
      recommended_quantity: (data.recommended_quantity as number) ?? 1,
      comment: null,
    }
    setOverride('equipment', name, newItem)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_category')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_unit_cost_usd')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_rec_qty')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_catalogue_ref')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const status = getOverrideStatus('equipment', item.name)
              return (
                <tr key={item.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)', maxWidth: 280 }}>
                    <span className="text-xs">{item.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{item.category}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditableCell
                      value={item.unit_cost_usd}
                      type="number"
                      onChange={v => handleEdit(item.name, 'unit_cost_usd', v)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <EditableCell
                      value={item.recommended_quantity}
                      type="number"
                      onChange={v => handleEdit(item.name, 'recommended_quantity', v)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{item.catalog_ref ?? ''}</span>
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      status={status}
                      onReset={() => handleReset(item.name)}
                      onDelete={() => handleDelete(item.name)}
                      onRestore={() => handleRestore(item.name)}
                    />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(item => (
              <tr key={`deleted-${item.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                  <span className="text-xs line-through">{item.name}</span>
                  <OverrideBadge status="deleted" />
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{item.category}</span>
                </td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{item.unit_cost_usd}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{item.recommended_quantity}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2">
                  <RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleRestore(item.name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddRowModal tab="equipment" onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

function ReagentKitsTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const PLATFORM_IDS = catalogue.platforms.map(p => p.id)
  const [activePlatform, setActivePlatform] = useState(PLATFORM_IDS[0])

  const platform = catalogue.platforms.find(p => p.id === activePlatform)
  const kits = platform?.reagent_kits ?? []

  const filtered = kits.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase())
  )

  // Deleted kits
  const deletedNames = Object.entries(overrides.platforms?.[activePlatform]?.reagent_kits ?? {})
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  const bundled = getBundledCatalogue()
  const bundledPlatform = bundled.platforms.find(p => p.id === activePlatform)
  const deletedItems = deletedNames
    .map(name => bundledPlatform?.reagent_kits.find(k => k.name === name))
    .filter((k): k is BundledReagentKit => k != null)
    .filter(k => k.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | null) {
    setOverride('platforms', name, { [field]: value }, activePlatform)
    onRefresh()
  }

  function handleDelete(name: string) {
    setOverride('platforms', name, null, activePlatform)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('platforms', name, activePlatform)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const newKit = {
      name,
      unit_price_usd: (data.unit_price_usd as number) ?? null,
      read_length_bp: (data.read_length_bp as number) ?? null,
      max_reads_per_flowcell: (data.max_reads_per_flowcell as number) ?? 0,
      max_output_bytes: 0,
      max_output_mb: (data.max_output_mb as number) ?? 0,
    }
    setOverride('platforms', name, newKit, activePlatform)
    onRefresh()
  }

  return (
    <div>
      {/* Platform sub-tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ background: 'var(--gx-bg-alt)' }}>
        {catalogue.platforms.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePlatform(p.id)}
            className="px-3 py-1 rounded text-xs font-medium"
            style={{
              background: activePlatform === p.id ? 'var(--gx-accent)' : 'transparent',
              color: activePlatform === p.id ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {p.name} ({p.reagent_kits.length})
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_usd')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_max_reads')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_max_output_mb')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_read_length_bp')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(kit => {
              const status = getOverrideStatus('platforms', kit.name, activePlatform)
              return (
                <tr key={kit.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)', maxWidth: 320 }}>
                    <span className="text-xs">{kit.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.unit_price_usd} type="number" onChange={v => handleEdit(kit.name, 'unit_price_usd', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.max_reads_per_flowcell} type="number" onChange={v => handleEdit(kit.name, 'max_reads_per_flowcell', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.max_output_mb} type="number" onChange={v => handleEdit(kit.name, 'max_output_mb', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.read_length_bp} type="number" onChange={v => handleEdit(kit.name, 'read_length_bp', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <RowActions
                      status={status}
                      onReset={() => handleReset(kit.name)}
                      onDelete={() => handleDelete(kit.name)}
                      onRestore={() => handleReset(kit.name)}
                    />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(kit => (
              <tr key={`deleted-${kit.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                  <span className="text-xs line-through">{kit.name}</span>
                  <OverrideBadge status="deleted" />
                </td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.unit_price_usd}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.max_reads_per_flowcell}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.max_output_mb}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.read_length_bp}</td>
                <td className="px-3 py-2">
                  <RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleReset(kit.name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddRowModal tab="reagent_kits" platformId={activePlatform} onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

function LibPrepTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const filtered = catalogue.library_prep_kits.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase())
  )

  const deletedNames = Object.entries(overrides.library_prep_kits ?? {}).filter(([, v]) => v === null).map(([k]) => k)
  const bundled = getBundledCatalogue()
  const deletedItems = deletedNames
    .map(name => bundled.library_prep_kits.find(k => k.name === name))
    .filter((k): k is BundledLibPrepKit => k != null)
    .filter(k => k.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | null) {
    setOverride('library_prep_kits', name, { [field]: value })
    onRefresh()
  }

  function handleDelete(name: string) {
    setOverride('library_prep_kits', name, null)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('library_prep_kits', name)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const platforms = typeof data.compatible_platforms === 'string'
      ? (data.compatible_platforms as string).split(',').map(s => s.trim()).filter(Boolean)
      : []
    const newKit = {
      name,
      pathogen_type: (data.pathogen_type as string) ?? '',
      compatible_platforms: platforms,
      pack_size: (data.pack_size as number) ?? null,
      barcoding_limit: (data.barcoding_limit as number) ?? null,
      unit_price_usd: (data.unit_price_usd as number) ?? null,
      enrichment_included: 'No',
      catalog_ref: null,
    }
    setOverride('library_prep_kits', name, newKit)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_price_usd')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_barcoding_limit')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pack_size')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_platforms')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(kit => {
              const status = getOverrideStatus('library_prep_kits', kit.name)
              return (
                <tr key={kit.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)', maxWidth: 280 }}>
                    <span className="text-xs">{kit.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.unit_price_usd} type="number" onChange={v => handleEdit(kit.name, 'unit_price_usd', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.barcoding_limit} type="number" onChange={v => handleEdit(kit.name, 'barcoding_limit', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={kit.pack_size} type="number" onChange={v => handleEdit(kit.name, 'pack_size', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.compatible_platforms.join(', ')}</span>
                  </td>
                  <td className="px-3 py-2">
                    <RowActions status={status} onReset={() => handleReset(kit.name)} onDelete={() => handleDelete(kit.name)} onRestore={() => handleReset(kit.name)} />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(kit => (
              <tr key={`deleted-${kit.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2"><span className="text-xs line-through">{kit.name}</span><OverrideBadge status="deleted" /></td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.unit_price_usd}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.barcoding_limit}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{kit.pack_size}</td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2"><RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleReset(kit.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddRowModal tab="library_prep" onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

function ReagentsTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const filtered = catalogue.reagents.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  )

  const deletedNames = Object.entries(overrides.reagents ?? {}).filter(([, v]) => v === null).map(([k]) => k)
  const bundled = getBundledCatalogue()
  const deletedItems = deletedNames
    .map(name => bundled.reagents.find(r => r.name === name))
    .filter((r): r is BundledReagent => r != null)
    .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | string[] | null) {
    setOverride('reagents', name, { [field]: value })
    onRefresh()
  }

  function handleWorkflowToggle(r: BundledReagent, step: string) {
    const current: string[] = r.workflows ?? (r.workflow ? [r.workflow] : [])
    const next = current.includes(step)
      ? current.filter(s => s !== step)
      : [...current, step]
    handleEdit(r.name, 'workflows', next)
  }

  function handleDelete(name: string) {
    setOverride('reagents', name, null)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('reagents', name)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const newReagent = {
      name,
      category: (data.category as string) ?? 'consumable',
      pack_size: (data.pack_size as number) ?? null,
      catalog_ref: null,
      quantity_per_sample: (data.quantity_per_sample as number) ?? 1,
      workflow: (data.workflow as string) ?? 'sample_receipt',
    }
    setOverride('reagents', name, newReagent)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_category')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pack_size')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_qty_sample')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_workflow_steps')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const status = getOverrideStatus('reagents', r.name)
              const activeSteps = new Set(r.workflows ?? (r.workflow ? [r.workflow] : []))
              return (
                <tr key={r.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)', maxWidth: 280 }}>
                    <span className="text-xs">{r.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{r.category}</span></td>
                  <td className="px-3 py-2">
                    <EditableCell value={r.pack_size} type="number" onChange={v => handleEdit(r.name, 'pack_size', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={r.quantity_per_sample} type="number" onChange={v => handleEdit(r.name, 'quantity_per_sample', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {WF_STEPS.map(step => {
                        const active = activeSteps.has(step)
                        return (
                          <button
                            key={step}
                            onClick={() => handleWorkflowToggle(r, step)}
                            title={t(WF_FULL_KEYS[step])}
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: active ? 'var(--gx-accent)' : 'var(--gx-bg-alt)',
                              color: active ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                              border: `1px solid ${active ? 'var(--gx-accent)' : 'var(--gx-border)'}`,
                              cursor: 'pointer',
                              fontWeight: active ? 600 : 400,
                            }}
                          >
                            {WF_ABBREV[step]}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <RowActions status={status} onReset={() => handleReset(r.name)} onDelete={() => handleDelete(r.name)} onRestore={() => handleReset(r.name)} />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(r => (
              <tr key={`deleted-${r.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2"><span className="text-xs line-through">{r.name}</span><OverrideBadge status="deleted" /></td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{r.category}</span></td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{r.pack_size}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{r.quantity_per_sample}</td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{(r.workflows ?? [r.workflow]).join(', ')}</span></td>
                <td className="px-3 py-2"><RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleReset(r.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddRowModal tab="reagents" onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

function PathogensTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const filtered = catalogue.pathogens.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const deletedNames = Object.entries(overrides.pathogens ?? {}).filter(([, v]) => v === null).map(([k]) => k)
  const bundled = getBundledCatalogue()
  const deletedItems = deletedNames
    .map(name => bundled.pathogens.find(p => p.name === name))
    .filter((p): p is BundledPathogen => p != null)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | null) {
    setOverride('pathogens', name, { [field]: value })
    onRefresh()
  }

  function handleDelete(name: string) {
    setOverride('pathogens', name, null)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('pathogens', name)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const newPathogen = {
      name,
      type: (data.type as string) ?? 'Virus',
      genome_type: (data.genome_type as string) ?? 'DNA',
      genome_size_mb: (data.genome_size_mb as number) ?? 0,
      required_coverage_x: (data.required_coverage_x as number) ?? 30,
    }
    setOverride('pathogens', name, newPathogen)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_type')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_genome')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_size_mb')}</th>
              <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_coverage_x')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const status = getOverrideStatus('pathogens', p.name)
              return (
                <tr key={p.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                    <span className="text-xs">{p.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.type}</span></td>
                  <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.genome_type}</span></td>
                  <td className="px-3 py-2">
                    <EditableCell value={p.genome_size_mb} type="number" onChange={v => handleEdit(p.name, 'genome_size_mb', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={p.required_coverage_x} type="number" onChange={v => handleEdit(p.name, 'required_coverage_x', v)} />
                  </td>
                  <td className="px-3 py-2">
                    <RowActions status={status} onReset={() => handleReset(p.name)} onDelete={() => handleDelete(p.name)} onRestore={() => handleReset(p.name)} />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(p => (
              <tr key={`deleted-${p.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2"><span className="text-xs line-through">{p.name}</span><OverrideBadge status="deleted" /></td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.type}</span></td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.genome_type}</span></td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.genome_size_mb}</td>
                <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>{p.required_coverage_x}</td>
                <td className="px-3 py-2"><RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleReset(p.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <PathogenAddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

function PathogenAddModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (name: string, data: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [type, setType] = useState('Virus')
  const [genomeType, setGenomeType] = useState('DNA')
  const [genomeSizeMb, setGenomeSizeMb] = useState('')
  const [coverageX, setCoverageX] = useState('30')

  function handleSubmit() {
    if (!name.trim()) return
    onAdd(name.trim(), {
      type,
      genome_type: genomeType,
      genome_size_mb: parseFloat(genomeSizeMb) || 0,
      required_coverage_x: parseInt(coverageX) || 30,
    })
    onClose()
  }

  const selectClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div className="card p-6" style={{ maxWidth: 440, width: '90%' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--gx-text)' }}>{t('label_add_custom_pathogen')}</h3>

        <div className="mb-3">
          <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} style={{ width: '100%' }} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_type')}</label>
            <select value={type} onChange={e => setType(e.target.value)} className={selectClass}>
              <option value="Virus">Virus</option>
              <option value="Bacteria">Bacteria</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_genome')}</label>
            <select value={genomeType} onChange={e => setGenomeType(e.target.value)} className={selectClass}>
              <option value="DNA">DNA</option>
              <option value="RNA">RNA</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_size_mb')}</label>
            <input type="number" value={genomeSizeMb} min={0} step={0.001} onChange={e => setGenomeSizeMb(e.target.value)} className={inputClass} style={{ width: '100%' }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--gx-text-muted)' }}>{t('col_coverage_x')}</label>
            <input type="number" value={coverageX} min={1} step={1} onChange={e => setCoverageX(e.target.value)} className={inputClass} style={{ width: '100%' }} />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={!name.trim()} className="px-4 py-1.5 rounded text-sm font-medium"
            style={{ background: name.trim() ? 'var(--gx-accent)' : 'var(--gx-bg-alt)', color: name.trim() ? 'var(--gx-bg)' : 'var(--gx-text-muted)', border: 'none', cursor: name.trim() ? 'pointer' : 'default' }}>
            {t('btn_add_pathogen')}
          </button>
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm font-medium"
            style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}>
            {t('btn_cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function BioinformaticsTab({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()

  const filtered = catalogue.bioinformatics_cloud.cloud_platforms.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const deletedNames = Object.entries(overrides.bioinformatics_cloud ?? {}).filter(([, v]) => v === null).map(([k]) => k)
  const bundled = getBundledCatalogue()
  const deletedItems = deletedNames
    .map(name => bundled.bioinformatics_cloud.cloud_platforms.find(c => c.name === name))
    .filter((c): c is BundledCloudPlatform => c != null)
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  function handleEdit(name: string, field: string, value: string | number | null) {
    setOverride('bioinformatics_cloud', name, { [field]: value })
    onRefresh()
  }

  function handleDelete(name: string) {
    setOverride('bioinformatics_cloud', name, null)
    onRefresh()
  }

  function handleReset(name: string) {
    resetRow('bioinformatics_cloud', name)
    onRefresh()
  }

  function handleAdd(name: string, data: Record<string, unknown>) {
    const newCloud = {
      name,
      description: (data.description as string) ?? null,
      pricing_model: (data.pricing_model as string) ?? 'variable',
    }
    setOverride('bioinformatics_cloud', name, newCloud)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SearchBar value={search} onChange={setSearch} />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-accent)', color: 'var(--gx-bg)', border: 'none', cursor: 'pointer' }}
        >
          {t('catalogue_btn_add_row')}
        </button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--gx-bg-alt)', borderBottom: '1px solid var(--gx-border)' }}>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_name')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_description')}</th>
              <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--gx-text-muted)' }}>{t('col_pricing_model')}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const status = getOverrideStatus('bioinformatics_cloud', c.name)
              return (
                <tr key={c.name} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--gx-text)' }}>
                    <span className="text-xs">{c.name}</span>
                    <OverrideBadge status={status} />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell value={c.description} type="text" onChange={v => handleEdit(c.name, 'description', v)} style={{ width: 240 }} />
                  </td>
                  <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{c.pricing_model}</span></td>
                  <td className="px-3 py-2">
                    <RowActions status={status} onReset={() => handleReset(c.name)} onDelete={() => handleDelete(c.name)} onRestore={() => handleReset(c.name)} />
                  </td>
                </tr>
              )
            })}
            {deletedItems.map(c => (
              <tr key={`deleted-${c.name}`} style={{ borderBottom: '1px solid var(--gx-border)', opacity: 0.4 }}>
                <td className="px-3 py-2"><span className="text-xs line-through">{c.name}</span><OverrideBadge status="deleted" /></td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{c.description}</span></td>
                <td className="px-3 py-2"><span className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{c.pricing_model}</span></td>
                <td className="px-3 py-2"><RowActions status="deleted" onReset={() => {}} onDelete={() => {}} onRestore={() => handleReset(c.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddRowModal tab="bioinformatics" onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

// ── Other Settings tab ───────────────────────────────────────────────────────

function SettingsTab() {
  const settingsInputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)]'
  const { project, updateProject } = useProject()
  const { t } = useTranslation()

  const settings = [
    {
      label: t('label_equip_maintenance_rate'),
      description: t('label_equip_maintenance_desc'),
      field: 'maintenancePct' as const,
      value: project.maintenancePct ?? 15,
      unit: '%',
      min: 0, max: 50, step: 1,
    },
    {
      label: t('label_incidentals_rate'),
      description: t('label_incidentals_desc'),
      field: 'incidentalsPct' as const,
      value: project.incidentalsPct ?? 7,
      unit: '%',
      min: 0, max: 30, step: 0.5,
    },
  ]

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm" style={{ color: 'var(--gx-text-muted)' }}>
        {t('label_settings_desc')}
      </p>
      {settings.map(s => (
        <div key={s.field} className="card p-4 flex flex-wrap gap-4 items-start">
          <div className="flex-1 min-w-48">
            <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--gx-text)' }}>{s.label}</div>
            <div className="text-xs" style={{ color: 'var(--gx-text-muted)' }}>{s.description}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={s.value}
              min={s.min}
              max={s.max}
              step={s.step}
              onChange={e => updateProject({ [s.field]: parseFloat(e.target.value) || 0 })}
              className={settingsInputClass}
              style={{ width: 80, textAlign: 'right' }}
            />
            <span className="text-sm" style={{ color: 'var(--gx-text-muted)' }}>{s.unit}</span>
            <button
              onClick={() => updateProject({ [s.field]: s.field === 'maintenancePct' ? 15 : 7 })}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text-muted)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
            >
              {t('btn_reset_who_default')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Catalogue page ──────────────────────────────────────────────────────

export default function Catalogue() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('reagent_kits')
  const [refreshKey, setRefreshKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const catalogue = getEffectiveCatalogue()
  const overrides = loadOverrides()
  const hasOverrides = Object.keys(overrides).length > 0

  function handleExportOverrides() {
    const json = exportOverrides()
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gct-catalogue-overrides-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportEffective() {
    const json = exportEffective()
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gct-catalogue-effective-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const result = importOverrides(reader.result as string)
        const { format, stats } = result
        const total = stats.edits + stats.additions + stats.deletions

        if (format === 'effective') {
          if (total === 0) {
            toast.success(t('catalogue_toast_imported_no_diff'))
          } else {
            toast.success(t('catalogue_toast_imported_diff', { edits: stats.edits, additions: stats.additions, deletions: stats.deletions }))
          }
        } else {
          toast.success(t('catalogue_toast_imported_n', { count: total }))
        }
        refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : t('catalogue_toast_import_error')
        toast.error(message)
      }
    }
    reader.readAsText(file)
    // Reset file input so the same file can be selected again
    e.target.value = ''
  }

  function handleResetAll() {
    resetAll()
    setShowResetConfirm(false)
    toast.success(t('catalogue_toast_reset'))
    refresh()
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8" key={refreshKey}>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-xs mb-2 flex items-center gap-1"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--gx-text-muted)' }}
          >
            {t('btn_back_to_tool')}
          </button>
          <h1 className="text-xl font-bold" style={{ color: 'var(--gx-text)' }}>{t('catalogue_title')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gx-text-muted)' }}>
            {t('catalogue_desc')}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={handleExportOverrides}
          disabled={!hasOverrides}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{
            background: 'var(--gx-bg-alt)',
            color: hasOverrides ? 'var(--gx-text)' : 'var(--gx-text-muted)',
            border: '1px solid var(--gx-border)',
            cursor: hasOverrides ? 'pointer' : 'default',
            opacity: hasOverrides ? 1 : 0.5,
          }}
        >
          {t('catalogue_btn_export_overrides')}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('catalogue_btn_import_overrides')}
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
        <button
          onClick={handleExportEffective}
          className="px-3 py-1.5 rounded text-xs font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('catalogue_btn_export_effective')}
        </button>
        {hasOverrides && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-3 py-1.5 rounded text-xs font-medium"
            style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', cursor: 'pointer' }}
          >
            {t('catalogue_btn_reset_all')}
          </button>
        )}
      </div>

      {/* Reset confirm dialog */}
      {showResetConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowResetConfirm(false)}
        >
          <div className="card p-6" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--gx-text)' }}>
              {t('catalogue_reset_confirm_title')}
            </h3>
            <p className="text-xs mb-4" style={{ color: 'var(--gx-text-muted)' }}>
              {t('catalogue_reset_confirm_body')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleResetAll}
                className="px-4 py-1.5 rounded text-sm font-medium"
                style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {t('catalogue_btn_confirm_reset')}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-1.5 rounded text-sm font-medium"
                style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
              >
                {t('btn_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg overflow-x-auto" style={{ background: 'var(--gx-bg-alt)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap"
            style={{
              background: activeTab === tab.id ? 'var(--gx-accent)' : 'transparent',
              color: activeTab === tab.id ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t(tab.labelKey)} ({tab.count(catalogue)})
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'reagent_kits' && <ReagentKitsTab onRefresh={refresh} />}
      {activeTab === 'library_prep' && <LibPrepTab onRefresh={refresh} />}
      {activeTab === 'reagents' && <ReagentsTab onRefresh={refresh} />}
      {activeTab === 'equipment' && <EquipmentTab onRefresh={refresh} />}
      {activeTab === 'pathogens' && <PathogensTab onRefresh={refresh} />}
      {activeTab === 'bioinformatics' && <BioinformaticsTab onRefresh={refresh} />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  )
}
