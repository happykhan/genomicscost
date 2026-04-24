import { useEffect, useState } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from 'react-i18next'
import { createDefaultSequencer } from '../../lib/defaults'
import { calculateSamplesPerRunMulti } from '../../lib/calculations'
import { getEffectiveCatalogue } from '../../lib/catalogue'
import type { SequencerConfig, PathogenEntry } from '../../types'
import Tooltip from '../../components/Tooltip'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

const PLATFORM_IDS = ['illumina', 'ont', 'thermofisher', 'mgi'] as const
type PlatformId = typeof PLATFORM_IDS[number]

// Maps kit name substrings → catalogue equipment name
const KIT_TO_INSTRUMENT: Array<{ match: string; instrument: string }> = [
  { match: 'iSeq 100',              instrument: 'Illumina iSeq 100' },
  { match: 'MiniSeq',               instrument: 'Illumina MiniSeq' },
  { match: 'MiSeq',                 instrument: 'Illumina MiSeq' },
  { match: 'NextSeq 2000 P3',       instrument: 'Illumina NextSeq 2000' },
  { match: 'NextSeq 2000 P4',       instrument: 'Illumina NextSeq 2000' },
  { match: 'NextSeq 1000/2000 P1',  instrument: 'Illumina NextSeq 1000' },
  { match: 'NextSeq 1000/2000 P2',  instrument: 'Illumina NextSeq 1000' },
  { match: 'NovaSeq',               instrument: 'Illumina NovaSeq 6000' },
  { match: 'Flongle',               instrument: 'ONT Flongle (Starter Pack)' },
  { match: 'MinION or GridION',     instrument: 'ONT MinION Mk1B' },
  { match: 'PromethION Flow Cell Packs (R10.4.1; 4', instrument: 'ONT PromethION 2 Solo (Starter Pack)' },
  { match: 'PromethION Flow Cell Packs',             instrument: 'ONT PromethION 24 (Project Pack XL)' },
]

function getInstrumentForKit(kitName: string): string | null {
  const entry = KIT_TO_INSTRUMENT.find(e => kitName.includes(e.match))
  return entry?.instrument ?? null
}

interface SequencerPanelProps {
  index: number
  sequencer: SequencerConfig
  pathogens: PathogenEntry[]
  canRemove: boolean
}

function SequencerPanel({ index, sequencer, pathogens, canRemove }: SequencerPanelProps) {
  const { project, updateSequencer, updateProject } = useProject()
  const { t } = useTranslation()
  const catalogue = getEffectiveCatalogue()
  const [kitSearch, setKitSearch] = useState('')

  const isCaptureAll = sequencer.captureAll || pathogens.some(p => p.pathogenName === 'Multiple pathogens (capture-all)')

  const currentPlatform = catalogue.platforms.find(p => p.id === sequencer.platformId)
  const kits = currentPlatform?.reagent_kits ?? []
  const selectedKit = kits.find(k => k.name === sequencer.reagentKitName) ?? kits[0]

  const libPrepKits = catalogue.library_prep_kits.filter(k => {
    const name = (currentPlatform?.name ?? '').toLowerCase()
    return k.compatible_platforms.some(cp => cp.toLowerCase().includes(name)) ||
      (sequencer.platformId === 'ont' && k.name.toLowerCase().includes('ont')) ||
      (sequencer.platformId === 'illumina' && (k.name.toLowerCase().includes('illumina') || k.name.toLowerCase().includes('neb') || k.name.toLowerCase().includes('nextera'))) ||
      (sequencer.platformId === 'thermofisher' && k.name.toLowerCase().includes('thermofisher')) ||
      (sequencer.platformId === 'mgi' && k.name.toLowerCase().includes('mgi'))
  })

  // Barcoding limit from selected lib prep kit
  const selectedLibPrepKit = catalogue.library_prep_kits.find(k => k.name === sequencer.libPrepKitName)
  const barcodingLimit = selectedLibPrepKit?.barcoding_limit ?? Infinity

  // Auto-calc samplesPerRun using weighted multi-pathogen formula (Annex 2)
  // Build assigned pathogen subset for run sizing
  const assignedPathogens: PathogenEntry[] = (() => {
    if (!Array.isArray(sequencer.assignments) || sequencer.assignments.length === 0) return pathogens
    return sequencer.assignments
      .filter(a => a.pathogenIndex >= 0 && a.pathogenIndex < pathogens.length && a.samples > 0)
      .map(a => ({ ...pathogens[a.pathogenIndex], samplesPerYear: a.samples }))
  })()

  useEffect(() => {
    if (!selectedKit) return
    const calculated = calculateSamplesPerRunMulti(
      assignedPathogens.length > 0 ? assignedPathogens : pathogens,
      sequencer.coverageX,
      selectedKit.read_length_bp ?? 0,
      selectedKit.max_reads_per_flowcell ?? 0,
      sequencer.bufferPct,
      barcodingLimit,
      isCaptureAll,
      sequencer.minReadsPerSample ?? 100_000,
      sequencer.controlsPerRun ?? 0,
      selectedKit.max_output_mb ?? 0,
    )
    updateSequencer(index, { samplesPerRun: calculated })
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    sequencer.reagentKitName, pathogens, sequencer.coverageX, sequencer.bufferPct,
    sequencer.controlsPerRun, isCaptureAll, sequencer.minReadsPerSample,
    sequencer.libPrepKitName, sequencer.assignments,
  ])

  const PLATFORM_PREFIX: Record<string, string> = {
    illumina: 'Illumina',
    ont: 'ONT',
    thermofisher: 'ThermoFisher',
    mgi: 'MGI',
  }

  function handlePlatformChange(newPlatformId: PlatformId, kitName?: string) {
    const platform = catalogue.platforms.find(p => p.id === newPlatformId)
    const firstKit = platform?.reagent_kits[0]
    updateSequencer(index, {
      platformId: newPlatformId,
      reagentKitName: firstKit?.name ?? '',
      reagentKitPrice: firstKit?.unit_price_usd ?? 0,
    })

    // Sync sequencing_platform equipment to match active platforms after this change
    const updatedSequencers = project.sequencers.map((s, i) =>
      i === index ? { ...s, platformId: newPlatformId } : s
    )
    const activePlatformIds = [...new Set(updatedSequencers.filter(s => s.enabled).map(s => s.platformId))]

    const nonSeqEquipment = project.equipment.filter(e => e.category !== 'sequencing_platform')

    const seqEquipment = activePlatformIds.flatMap(pid => {
      const prefix = PLATFORM_PREFIX[pid] ?? pid
      const existing = project.equipment.filter(e =>
        e.category === 'sequencing_platform' && e.name.startsWith(prefix)
      )
      if (existing.length > 0) return existing

      // Use kit-specific instrument name if available, otherwise fall back to first for this platform
      const instrumentName = (pid === newPlatformId && kitName) ? getInstrumentForKit(kitName) : null
      const catItem = instrumentName
        ? catalogue.equipment.find(e => e.category === 'sequencing_platform' && e.name === instrumentName)
        : catalogue.equipment.find(e => e.category === 'sequencing_platform' && e.name.startsWith(prefix))

      if (!catItem) return []
      return [{
        name: catItem.name,
        category: 'sequencing_platform',
        status: 'buy' as const,
        quantity: 1,
        unitCostUsd: catItem.unit_cost_usd ?? 0,
        lifespanYears: 10,
      }]
    })

    updateProject({ equipment: [...seqEquipment, ...nonSeqEquipment] })
  }

  function handleKitChange(kitName: string) {
    // Look up which platform this kit belongs to across all platforms
    let kitPlatformId: PlatformId | undefined
    let kitPrice = 0
    for (const platform of catalogue.platforms) {
      const found = platform.reagent_kits.find(k => k.name === kitName)
      if (found) {
        kitPlatformId = platform.id as PlatformId
        kitPrice = found.unit_price_usd ?? 0
        break
      }
    }
    if (kitPlatformId && kitPlatformId !== sequencer.platformId) {
      // Platform switching — handlePlatformChange will also update equipment
      handlePlatformChange(kitPlatformId, kitName)
    } else {
      // Same platform — update equipment to match the specific instrument for this kit
      const instrumentName = getInstrumentForKit(kitName)
      if (instrumentName) {
        const prefix = PLATFORM_PREFIX[sequencer.platformId] ?? sequencer.platformId
        const catItem = catalogue.equipment.find(e =>
          e.category === 'sequencing_platform' && e.name === instrumentName
        )
        if (catItem) {
          const nonSeqEquipment = project.equipment.filter(e => e.category !== 'sequencing_platform')
          const otherSeqEquipment = project.equipment.filter(e =>
            e.category === 'sequencing_platform' && !e.name.startsWith(prefix)
          )
          updateProject({
            equipment: [
              ...otherSeqEquipment,
              { name: catItem.name, category: 'sequencing_platform', status: 'buy' as const, quantity: 1, unitCostUsd: catItem.unit_cost_usd ?? 0, lifespanYears: 10 },
              ...nonSeqEquipment,
            ]
          })
        }
      }
    }
    updateSequencer(index, {
      reagentKitName: kitName,
      reagentKitPrice: kitPrice || (kits.find(k => k.name === kitName)?.unit_price_usd ?? 0),
    })
  }

  function handleRemove() {
    updateProject({ sequencers: project.sequencers.filter((_, i) => i !== index) })
  }

  return (
    <div className="card p-5 mb-6" style={{ borderLeft: '3px solid var(--gx-accent)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--gx-text)' }}>{sequencer.label}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={sequencer.enabled}
              onChange={e => updateSequencer(index, { enabled: e.target.checked })}
              style={{ accentColor: 'var(--gx-accent)', width: 14, height: 14 }}
            />
            <span style={{ color: 'var(--gx-text-muted)' }}>{t('label_enabled')}</span>
          </label>
          {canRemove && (
            <button
              onClick={handleRemove}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: 'var(--gx-text-muted)', background: 'none', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
            >
              {t('btn_remove')}
            </button>
          )}
        </div>
      </div>

      {/* Search all kits */}
      <div className="mb-4" style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={t('placeholder_search_kits')}
          value={kitSearch}
          onChange={e => setKitSearch(e.target.value)}
          className={inputClass}
          style={{ maxWidth: 400 }}
        />
        {kitSearch.trim().length > 0 && (() => {
          const query = kitSearch.trim().toLowerCase()
          const results = catalogue.platforms.flatMap(p =>
            p.reagent_kits
              .filter(k => k.name.toLowerCase().includes(query))
              .map(k => ({ kitName: k.name, platformId: p.id as PlatformId, platformName: p.name }))
          ).slice(0, 8)
          return results.length > 0 ? (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: 'var(--gx-bg)',
              border: '1px solid var(--gx-border)',
              borderRadius: 'var(--gx-radius)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 400,
              maxWidth: 600,
              maxHeight: 260,
              overflowY: 'auto',
            }}>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setKitSearch('')
                    handleKitChange(r.kitName)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 12px',
                    background: 'none',
                    border: 'none',
                    borderBottom: i < results.length - 1 ? '1px solid var(--gx-border)' : 'none',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    color: 'var(--gx-text)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--gx-bg-alt)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontWeight: 500 }}>{r.kitName}</span>
                  <span style={{ color: 'var(--gx-text-muted)', marginLeft: 8, fontSize: '0.75rem' }}>{r.platformName}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 50,
              background: 'var(--gx-bg)',
              border: '1px solid var(--gx-border)',
              borderRadius: 'var(--gx-radius)',
              padding: '8px 12px',
              fontSize: '0.82rem',
              color: 'var(--gx-text-muted)',
            }}>
              {t('label_no_results')}
            </div>
          )
        })()}
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'var(--gx-bg-alt)' }}>
        {PLATFORM_IDS.map(pid => {
          const p = catalogue.platforms.find(pl => pl.id === pid)
          return (
            <button
              key={pid}
              onClick={() => handlePlatformChange(pid)}
              className="px-4 py-1.5 rounded text-sm font-medium transition-all"
              style={{
                background: sequencer.platformId === pid ? 'var(--gx-accent)' : 'transparent',
                color: sequencer.platformId === pid ? 'var(--gx-bg)' : 'var(--gx-text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {p?.name ?? pid}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-5">
        {/* Reagent kit */}
        <div>
          <label className={labelClass}>{t('field_reagent_kit')}</label>
          <select
            className={inputClass}
            value={sequencer.reagentKitName}
            onChange={e => handleKitChange(e.target.value)}
          >
            {kits.map(k => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
          {selectedKit && (
            <div className="text-xs mt-1 flex gap-4" style={{ color: 'var(--gx-text-muted)' }}>
              {selectedKit.max_reads_per_flowcell
                ? <span>{t('label_max_reads')}: {selectedKit.max_reads_per_flowcell.toLocaleString()}</span>
                : <span>{t('label_max_output')}: {selectedKit.max_output_mb.toLocaleString()} Mb</span>
              }
              {selectedKit.read_length_bp && <span>{t('label_read_length')}: {selectedKit.read_length_bp} bp</span>}
              {selectedKit.unit_price_usd && <span>{t('label_list_price')}: ${selectedKit.unit_price_usd.toLocaleString()}</span>}
            </div>
          )}
        </div>

        {/* Kit price override */}
        <div>
          <label className={labelClass}>{t('field_kit_price')}</label>
          <input
            type="number"
            className={inputClass}
            value={sequencer.reagentKitPrice}
            min={0}
            onChange={e => updateSequencer(index, { reagentKitPrice: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Feature 7: capture-all mode — show min reads instead of coverage */}
        {isCaptureAll ? (
          <div>
            <label className={labelClass}>{t('field_min_reads')}<Tooltip content={t('tooltip_min_reads')} /></label>
            <input
              type="number"
              className={inputClass}
              value={sequencer.minReadsPerSample ?? 100_000}
              min={1000}
              step={10000}
              onChange={e => updateSequencer(index, { minReadsPerSample: parseInt(e.target.value) || 100_000 })}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
              {t('note_min_reads_usage')}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('field_coverage')}<Tooltip content={t('tooltip_coverage')} /></label>
              <input
                type="number"
                className={inputClass}
                value={sequencer.coverageX}
                min={1}
                onChange={e => updateSequencer(index, { coverageX: parseInt(e.target.value) || 1 })}
              />
              <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>{t('note_coverage_help')}</div>
            </div>
            <div>
              <label className={labelClass}>{t('field_samples_per_run')}</label>
              <div
                className="p-2 text-sm rounded"
                style={{
                  border: '1px solid var(--gx-border)',
                  background: 'var(--gx-bg-alt)',
                  color: 'var(--gx-text)',
                }}
              >
                {sequencer.samplesPerRun}
                <span className="text-xs ml-2" style={{ color: 'var(--gx-text-muted)' }}>
                  {t('label_effective')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* If capture-all, still show samples per run readout */}
        {isCaptureAll && (
          <div>
            <label className={labelClass}>{t('field_samples_per_run')}</label>
            <div
              className="p-2 text-sm rounded"
              style={{
                border: '1px solid var(--gx-border)',
                background: 'var(--gx-bg-alt)',
                color: 'var(--gx-text)',
              }}
            >
              {sequencer.samplesPerRun}
              <span className="text-xs ml-2" style={{ color: 'var(--gx-text-muted)' }}>
                {t('label_effective')}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Buffer % slider */}
          <div>
            <label className={labelClass}>{t('field_buffer_pct')} — {sequencer.bufferPct}%<Tooltip content={t('tooltip_buffer_pct')} /></label>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={sequencer.bufferPct}
              onChange={e => updateSequencer(index, { bufferPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>{t('note_buffer_pct_help')}</div>
          </div>

          {/* Retest % slider */}
          <div>
            <label className={labelClass}>{t('field_retest_pct')} — {sequencer.retestPct}%<Tooltip content={t('tooltip_retest_pct')} /></label>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={sequencer.retestPct}
              onChange={e => updateSequencer(index, { retestPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>{t('note_retest_pct_help')}</div>
          </div>

          {/* Feature 3: controls per run */}
          <div>
            <label className={labelClass}>{t('field_controls_per_run')}<Tooltip content={t('tooltip_controls_per_run')} /></label>
            <input
              type="number"
              className={inputClass}
              value={sequencer.controlsPerRun ?? 2}
              min={0}
              max={96}
              onChange={e => updateSequencer(index, { controlsPerRun: parseInt(e.target.value) || 0 })}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
              {t('note_controls_subtracted')}
            </div>
          </div>
        </div>

        {/* Library prep kit */}
        <div>
          <label className={labelClass}>{t('field_lib_prep_kit')}<Tooltip content={t('tooltip_lib_prep_kit')} /></label>
          <select
            className={inputClass}
            value={sequencer.libPrepKitName}
            onChange={e => {
              const kit = catalogue.library_prep_kits.find(k => k.name === e.target.value)
              const updates: Partial<typeof sequencer> = { libPrepKitName: e.target.value }
              if (kit?.unit_price_usd && kit?.pack_size) {
                updates.libPrepCostPerSample = parseFloat((kit.unit_price_usd / kit.pack_size).toFixed(2))
              }
              updateSequencer(index, updates)
            }}
          >
            <option value="">Custom / other kit</option>
            {libPrepKits.map(k => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
          {selectedLibPrepKit && (
            <div className="text-xs mt-1 flex gap-4" style={{ color: 'var(--gx-text-muted)' }}>
              {selectedLibPrepKit.pack_size && <span>Pack size: {selectedLibPrepKit.pack_size} reactions</span>}
              {selectedLibPrepKit.barcoding_limit && <span>Barcoding limit: {selectedLibPrepKit.barcoding_limit}</span>}
            </div>
          )}
        </div>

        {/* Library prep cost per sample — always shown so user can set local price */}
        <div>
          <label className={labelClass}>
            {t('field_lib_prep_cost')}
            {selectedLibPrepKit?.unit_price_usd && selectedLibPrepKit?.pack_size && (
              <span className="ml-2 normal-case font-normal" style={{ color: 'var(--gx-text-muted)' }}>
                — catalogue ${selectedLibPrepKit.unit_price_usd} ÷ {selectedLibPrepKit.pack_size} rxn. Override with local price.
              </span>
            )}
          </label>
          <input
            type="number"
            className={inputClass}
            value={sequencer.libPrepCostPerSample}
            min={0}
            step={0.5}
            onChange={e => updateSequencer(index, { libPrepCostPerSample: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Enrichment toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={sequencer.enrichment}
              onChange={e => updateSequencer(index, { enrichment: e.target.checked })}
              style={{ accentColor: 'var(--gx-accent)', width: 16, height: 16 }}
            />
            <span style={{ color: 'var(--gx-text)' }}>{t('field_enrichment')}</span>
            <Tooltip content={t('tooltip_enrichment')} />
          </label>
        </div>
      </div>
    </div>
  )
}

// ── Assignment matrix helpers ────────────────────────────────────────────────

function getAssignedSamples(
  sequencers: SequencerConfig[],
  seqIdx: number,
  pathogenIdx: number,
): number {
  const seq = sequencers[seqIdx]
  if (!seq || !Array.isArray(seq.assignments)) return 0
  const a = seq.assignments.find(x => x.pathogenIndex === pathogenIdx)
  return a?.samples ?? 0
}

function setAssignedSamples(
  sequencers: SequencerConfig[],
  seqIdx: number,
  pathogenIdx: number,
  samples: number,
): SequencerConfig[] {
  return sequencers.map((seq, si) => {
    if (si !== seqIdx) return seq
    const existing = (seq.assignments ?? []).filter(a => a.pathogenIndex !== pathogenIdx)
    if (samples > 0) {
      existing.push({ pathogenIndex: pathogenIdx, samples })
    }
    return { ...seq, assignments: existing }
  })
}

interface AssignmentMatrixProps {
  pathogens: PathogenEntry[]
  sequencers: SequencerConfig[]
  onUpdate: (sequencers: SequencerConfig[]) => void
}

function AssignmentMatrix({ pathogens, sequencers, onUpdate }: AssignmentMatrixProps) {
  const { t } = useTranslation()
  const enabledSeqs = sequencers
    .map((s, i) => ({ seq: s, idx: i }))
    .filter(x => x.seq.enabled)

  if (pathogens.length === 0 || enabledSeqs.length === 0) return null

  function handleCellChange(seqIdx: number, pathogenIdx: number, value: string) {
    const num = Math.max(0, parseInt(value) || 0)
    onUpdate(setAssignedSamples(sequencers, seqIdx, pathogenIdx, num))
  }

  function distributeEvenly() {
    let updated = sequencers.map(s => ({ ...s, assignments: [] as SequencerConfig['assignments'] }))
    pathogens.forEach((p, pi) => {
      const base = Math.floor(p.samplesPerYear / enabledSeqs.length)
      const remainder = p.samplesPerYear - base * enabledSeqs.length
      enabledSeqs.forEach(({ idx }, i) => {
        const samples = base + (i < remainder ? 1 : 0)
        updated = setAssignedSamples(updated, idx, pi, samples)
      })
    })
    onUpdate(updated)
  }

  function allToFirst() {
    let updated = sequencers.map(s => ({ ...s, assignments: [] as SequencerConfig['assignments'] }))
    if (enabledSeqs.length === 0) return
    const firstIdx = enabledSeqs[0].idx
    pathogens.forEach((p, pi) => {
      updated = setAssignedSamples(updated, firstIdx, pi, p.samplesPerYear)
    })
    onUpdate(updated)
  }

  function clearAll() {
    onUpdate(sequencers.map(s => ({ ...s, assignments: [] })))
  }

  // Column sums
  const colSums = enabledSeqs.map(({ idx }) =>
    pathogens.reduce((sum, _, pi) => sum + getAssignedSamples(sequencers, idx, pi), 0)
  )
  const totalDefined = pathogens.reduce((s, p) => s + p.samplesPerYear, 0)
  const totalAssigned = colSums.reduce((s, v) => s + v, 0)
  const grandDelta = totalAssigned - totalDefined

  return (
    <div className="card p-5 mb-6" style={{ borderLeft: '3px solid var(--gx-accent)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--gx-text)' }}>
        {t('matrix_title')}
      </h3>

      {/* Helper buttons */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={distributeEvenly}
          className="text-xs px-3 py-1 rounded"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('matrix_distribute')}
        </button>
        <button
          onClick={allToFirst}
          className="text-xs px-3 py-1 rounded"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('matrix_all_to_first')}
        </button>
        <button
          onClick={clearAll}
          className="text-xs px-3 py-1 rounded"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('matrix_clear')}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
              <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                {t('field_pathogen_name')}
              </th>
              {enabledSeqs.map(({ seq }) => (
                <th key={seq.label} className="text-center px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)', minWidth: 90 }}>
                  {seq.label.length > 16 ? seq.label.slice(0, 14) + '...' : seq.label}
                </th>
              ))}
              <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                {t('matrix_defined')}
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                {t('matrix_assigned')}
              </th>
              <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--gx-text-muted)' }}>
                <Tooltip content={t('matrix_delta_tooltip')} />
                {' '}{t('matrix_delta')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pathogens.map((p, pi) => {
              const rowAssigned = enabledSeqs.reduce(
                (sum, { idx }) => sum + getAssignedSamples(sequencers, idx, pi), 0
              )
              const delta = rowAssigned - p.samplesPerYear
              const deltaColor = delta === 0
                ? 'var(--gx-text-muted)'
                : delta < 0
                  ? '#d97706'  // amber
                  : '#3b82f6'  // blue

              return (
                <tr key={pi} style={{ borderBottom: '1px solid var(--gx-border)' }}>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--gx-text)' }}>
                    <span style={{ marginRight: 4, fontSize: '0.7rem', opacity: 0.6 }}>
                      {p.pathogenType === 'bacterial' ? '🦠' : '🧬'}
                    </span>
                    {p.pathogenName}
                    {delta < 0 && (
                      <span className="ml-2 text-xs" style={{ color: '#d97706' }} title={t('matrix_not_assigned_hint')}>
                        ⚠
                      </span>
                    )}
                  </td>
                  {enabledSeqs.map(({ idx }) => (
                    <td key={idx} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={getAssignedSamples(sequencers, idx, pi)}
                        onChange={e => handleCellChange(idx, pi, e.target.value)}
                        className={inputClass}
                        style={{ width: 80, textAlign: 'center', margin: '0 auto' }}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text-muted)' }}>
                    {p.samplesPerYear.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--gx-text)' }}>
                    {rowAssigned.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: deltaColor }}>
                    {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {/* Column totals */}
            <tr style={{ borderTop: '2px solid var(--gx-border)', background: 'var(--gx-bg-alt)' }}>
              <td className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
                {t('label_total')}
              </td>
              {enabledSeqs.map(({ idx }, i) => (
                <td key={idx} className="px-3 py-2 text-center text-xs font-semibold" style={{ color: 'var(--gx-text)' }}>
                  {colSums[i].toLocaleString()}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--gx-text-muted)' }}>
                {totalDefined.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--gx-text)' }}>
                {totalAssigned.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right text-xs font-semibold" style={{
                color: grandDelta === 0 ? 'var(--gx-text-muted)' : grandDelta < 0 ? '#d97706' : '#3b82f6'
              }}>
                {grandDelta > 0 ? '+' : ''}{grandDelta.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary line */}
      <div className="mt-3 text-xs" style={{ color: 'var(--gx-text-muted)' }}>
        {t('matrix_summary', {
          defined: totalDefined.toLocaleString(),
          assigned: totalAssigned.toLocaleString(),
          delta: (grandDelta >= 0 ? '+' : '') + grandDelta.toLocaleString(),
        })}
      </div>
    </div>
  )
}

export default function Step2() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const { sequencers } = project

  function addSequencer() {
    const label = `Sequencer ${sequencers.length + 1}`
    const newSeq = createDefaultSequencer(label)
    updateProject({ sequencers: [...sequencers, newSeq] })
  }

  function handleAssignmentUpdate(updatedSequencers: SequencerConfig[]) {
    updateProject({ sequencers: updatedSequencers })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step2_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step2_desc')}
      </p>

      {/* Assignment matrix — shown when there are pathogens and sequencers */}
      {project.pathogens.length > 0 && sequencers.length > 0 && (
        <AssignmentMatrix
          pathogens={project.pathogens}
          sequencers={sequencers}
          onUpdate={handleAssignmentUpdate}
        />
      )}

      {sequencers.map((seq, idx) => (
        <SequencerPanel
          key={idx}
          index={idx}
          sequencer={seq}
          pathogens={project.pathogens}
          canRemove={sequencers.length > 1}
        />
      ))}

      {/* Unlimited sequencers */}
      <button
        onClick={addSequencer}
        className="px-4 py-2 rounded text-sm font-medium"
        style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
      >
        {t('btn_add_sequencer')}
      </button>
    </div>
  )
}
