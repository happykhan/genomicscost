import { useEffect } from 'react'
import { useProject } from '../../store/ProjectContext'
import catalogue from '../../data/catalogue.json'

const inputClass = 'border border-[var(--gx-border)] rounded-[var(--gx-radius)] bg-[var(--gx-bg)] text-[var(--gx-text)] p-2 text-sm focus:outline-none focus:border-[var(--gx-accent)] w-full'
const labelClass = 'text-xs text-[var(--gx-text-muted)] uppercase tracking-wider mb-1 block'

const PLATFORM_IDS = ['illumina', 'ont', 'thermofisher', 'mgi'] as const
type PlatformId = typeof PLATFORM_IDS[number]

function calcSamplesPerRun(maxOutputMb: number, genomeSizeMb: number, coverageX: number, bufferPct: number): number {
  if (!maxOutputMb || !genomeSizeMb || !coverageX) return 1
  // genomeSizeMb × coverageX = total Mb needed per sample; apply buffer for off-target reads
  const mbPerSample = genomeSizeMb * coverageX * (1 + bufferPct / 100)
  return Math.max(1, Math.floor(maxOutputMb / mbPerSample))
}

export default function Step2() {
  const { project, updateSequencer } = useProject()
  const { sequencer } = project

  const currentPlatform = catalogue.platforms.find(p => p.id === sequencer.platformId)
  const kits = currentPlatform?.reagent_kits ?? []
  const selectedKit = kits.find(k => k.name === sequencer.reagentKitName) ?? kits[0]

  // Library prep kits for this platform
  const libPrepKits = catalogue.library_prep_kits.filter(k => {
    const name = (currentPlatform?.name ?? '').toLowerCase()
    return k.compatible_platforms.some(cp => cp.toLowerCase().includes(name)) ||
      (sequencer.platformId === 'ont' && k.name.toLowerCase().includes('ont')) ||
      (sequencer.platformId === 'illumina' && (k.name.toLowerCase().includes('illumina') || k.name.toLowerCase().includes('neb') || k.name.toLowerCase().includes('nextera'))) ||
      (sequencer.platformId === 'thermofisher' && k.name.toLowerCase().includes('thermofisher')) ||
      (sequencer.platformId === 'mgi' && k.name.toLowerCase().includes('mgi'))
  })

  // Auto-calc samplesPerRun when kit, genome size, coverage or buffer changes
  useEffect(() => {
    if (!selectedKit) return
    const calculated = calcSamplesPerRun(
      selectedKit.max_output_mb,
      project.genomeSizeMb,
      sequencer.coverageX,
      sequencer.bufferPct
    )
    updateSequencer({ samplesPerRun: calculated })
  }, [sequencer.reagentKitName, project.genomeSizeMb, sequencer.coverageX, sequencer.bufferPct]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePlatformChange(platformId: PlatformId) {
    const platform = catalogue.platforms.find(p => p.id === platformId)
    const firstKit = platform?.reagent_kits[0]
    updateSequencer({
      platformId,
      reagentKitName: firstKit?.name ?? '',
      reagentKitPrice: firstKit?.unit_price_usd ?? 0,
    })
  }

  function handleKitChange(kitName: string) {
    const kit = kits.find(k => k.name === kitName)
    updateSequencer({
      reagentKitName: kitName,
      reagentKitPrice: kit?.unit_price_usd ?? 0,
    })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--gx-text)' }}>Step 2: Sequencing Platform</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--gx-text-muted)' }}>
        Choose your sequencer, reagent kit and library preparation approach.
      </p>

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
          <label className={labelClass}>Reagent kit</label>
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
              <span>Max output: {selectedKit.max_output_mb.toLocaleString()} Mb</span>
              {selectedKit.unit_price_usd && <span>List price: ${selectedKit.unit_price_usd.toLocaleString()}</span>}
            </div>
          )}
        </div>

        {/* Kit price override */}
        <div>
          <label className={labelClass}>Reagent kit price (USD) — override if needed</label>
          <input
            type="number"
            className={inputClass}
            value={sequencer.reagentKitPrice}
            min={0}
            onChange={e => updateSequencer({ reagentKitPrice: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Coverage */}
          <div>
            <label className={labelClass}>Coverage (×)</label>
            <input
              type="number"
              className={inputClass}
              value={sequencer.coverageX}
              min={1}
              onChange={e => updateSequencer({ coverageX: parseInt(e.target.value) || 1 })}
            />
          </div>

          {/* Samples per run (calculated) */}
          <div>
            <label className={labelClass}>Samples per run (calculated)</label>
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
                based on genome size × coverage
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Buffer % slider */}
          <div>
            <label className={labelClass}>Buffer % — {sequencer.bufferPct}%</label>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={sequencer.bufferPct}
              onChange={e => updateSequencer({ bufferPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
          </div>

          {/* Retest % slider */}
          <div>
            <label className={labelClass}>Retest % — {sequencer.retestPct}%</label>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={sequencer.retestPct}
              onChange={e => updateSequencer({ retestPct: parseInt(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--gx-accent)' }}
            />
          </div>
        </div>

        {/* Library prep kit */}
        <div>
          <label className={labelClass}>Library prep kit</label>
          <select
            className={inputClass}
            value={sequencer.libPrepKitName}
            onChange={e => updateSequencer({ libPrepKitName: e.target.value })}
          >
            <option value="">None / custom</option>
            {libPrepKits.map(k => (
              <option key={k.name} value={k.name}>{k.name}</option>
            ))}
          </select>
        </div>

        {/* Library prep cost per sample */}
        <div>
          <label className={labelClass}>Library prep cost per sample (USD)</label>
          <input
            type="number"
            className={inputClass}
            value={sequencer.libPrepCostPerSample}
            min={0}
            step={0.5}
            onChange={e => updateSequencer({ libPrepCostPerSample: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Enrichment toggle */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={sequencer.enrichment}
              onChange={e => updateSequencer({ enrichment: e.target.checked })}
              style={{ accentColor: 'var(--gx-accent)', width: 16, height: 16 }}
            />
            <span style={{ color: 'var(--gx-text)' }}>Enrichment step included</span>
          </label>
        </div>
      </div>
    </div>
  )
}
