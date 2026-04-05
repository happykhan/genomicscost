import { useEffect } from 'react'
import { useProject } from '../../store/ProjectContext'
import { useTranslation } from '../../i18n'
import { createDefaultSequencer } from '../../lib/defaults'
import { calculateSamplesPerRun } from '../../lib/calculations'
import catalogue from '../../data/catalogue.json'
import type { SequencerConfig } from '../../types'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

const PLATFORM_IDS = ['illumina', 'ont', 'thermofisher', 'mgi'] as const
type PlatformId = typeof PLATFORM_IDS[number]

interface SequencerPanelProps {
  index: number
  sequencer: SequencerConfig
  genomeSizeMb: number
  pathogenName: string
  pathogenType: string
  canRemove: boolean
}

function SequencerPanel({ index, sequencer, genomeSizeMb, pathogenName, pathogenType, canRemove }: SequencerPanelProps) {
  const { project, updateSequencer, updateProject } = useProject()
  const { t } = useTranslation()

  const isCaptureAll = sequencer.captureAll || pathogenName === 'Multiple pathogens (capture-all)'

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

  // Auto-calc samplesPerRun using Annex 2 reads-based formula
  useEffect(() => {
    if (!selectedKit) return
    const calculated = calculateSamplesPerRun(
      genomeSizeMb,
      sequencer.coverageX,
      selectedKit.read_length_bp ?? 0,
      selectedKit.max_reads_per_flowcell ?? 0,
      sequencer.bufferPct,
      barcodingLimit,
      pathogenType,
      isCaptureAll,
      sequencer.minReadsPerSample ?? 100_000,
      sequencer.controlsPerRun ?? 0,
      selectedKit.max_output_mb ?? 0,
    )
    updateSequencer(index, { samplesPerRun: calculated })
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    sequencer.reagentKitName, genomeSizeMb, sequencer.coverageX, sequencer.bufferPct,
    sequencer.controlsPerRun, isCaptureAll, sequencer.minReadsPerSample,
    sequencer.libPrepKitName, pathogenType,
  ])

  const PLATFORM_PREFIX: Record<string, string> = {
    illumina: 'Illumina',
    ont: 'ONT',
    thermofisher: 'ThermoFisher',
    mgi: 'MGI',
  }

  function handlePlatformChange(newPlatformId: PlatformId) {
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
      const catItem = catalogue.equipment.find(e =>
        e.category === 'sequencing_platform' && e.name.startsWith(prefix)
      )
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
    const kit = kits.find(k => k.name === kitName)
    updateSequencer(index, {
      reagentKitName: kitName,
      reagentKitPrice: kit?.unit_price_usd ?? 0,
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
                : <span>Max output: {selectedKit.max_output_mb.toLocaleString()} Mb</span>
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
            <label className={labelClass}>{t('field_min_reads')}</label>
            <input
              type="number"
              className={inputClass}
              value={sequencer.minReadsPerSample ?? 100_000}
              min={1000}
              step={10000}
              onChange={e => updateSequencer(index, { minReadsPerSample: parseInt(e.target.value) || 100_000 })}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
              Used instead of genome size × coverage for multi-pathogen capture panels.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('field_coverage')}</label>
              <input
                type="number"
                className={inputClass}
                value={sequencer.coverageX}
                min={1}
                onChange={e => updateSequencer(index, { coverageX: parseInt(e.target.value) || 1 })}
              />
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
            <label className={labelClass}>{t('field_buffer_pct')} — {sequencer.bufferPct}%</label>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={sequencer.bufferPct}
              onChange={e => updateSequencer(index, { bufferPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
          </div>

          {/* Retest % slider */}
          <div>
            <label className={labelClass}>{t('field_retest_pct')} — {sequencer.retestPct}%</label>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={sequencer.retestPct}
              onChange={e => updateSequencer(index, { retestPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
          </div>

          {/* Feature 3: controls per run */}
          <div>
            <label className={labelClass}>{t('field_controls_per_run')}</label>
            <input
              type="number"
              className={inputClass}
              value={sequencer.controlsPerRun ?? 2}
              min={0}
              max={96}
              onChange={e => updateSequencer(index, { controlsPerRun: parseInt(e.target.value) || 0 })}
            />
            <div className="text-xs mt-1" style={{ color: 'var(--gx-text-muted)' }}>
              Subtracted from samples per run
            </div>
          </div>
        </div>

        {/* Library prep kit */}
        <div>
          <label className={labelClass}>{t('field_lib_prep_kit')}</label>
          <select
            className={inputClass}
            value={sequencer.libPrepKitName}
            onChange={e => updateSequencer(index, { libPrepKitName: e.target.value })}
          >
            <option value="">None / custom</option>
            {libPrepKits.map(k => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
        </div>

        {/* Library prep cost per sample */}
        <div>
          <label className={labelClass}>{t('field_lib_prep_cost')}</label>
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
          </label>
        </div>
      </div>
    </div>
  )
}

export default function Step2() {
  const { project, updateProject } = useProject()
  const { t } = useTranslation()
  const { sequencers } = project

  function addSecondSequencer() {
    const newSeq = createDefaultSequencer('Sequencer 2')
    updateProject({ sequencers: [...sequencers, newSeq] })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>{t('step2_title')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        {t('step2_desc')}
      </p>

      {sequencers.map((seq, idx) => (
        <SequencerPanel
          key={idx}
          index={idx}
          sequencer={seq}
          genomeSizeMb={project.genomeSizeMb}
          pathogenName={project.pathogenName}
          pathogenType={project.pathogenType}
          canRemove={sequencers.length > 1}
        />
      ))}

      {/* Feature 6: add second sequencer */}
      {sequencers.length < 2 && (
        <button
          onClick={addSecondSequencer}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: 'var(--gx-bg-alt)', color: 'var(--gx-text)', border: '1px solid var(--gx-border)', cursor: 'pointer' }}
        >
          {t('btn_add_sequencer')}
        </button>
      )}
    </div>
  )
}
