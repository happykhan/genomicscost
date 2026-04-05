import type { Project, CostBreakdown } from '../types'

// ── Annex 2: Minimum reads per sample by pathogen type and genome size ────────

function minReadsPerSample(pathogenType: string, genomeSizeMb: number): number {
  if (pathogenType === 'bacterial') {
    return genomeSizeMb <= 5 ? 750_000 : 1_250_000
  }
  // viral (default)
  return genomeSizeMb <= 0.03 ? 100_000 : 150_000
}

// Default buffer by pathogen type (Annex 2: 20% viral, 30% bacterial)
export function defaultBufferPct(pathogenType: string): number {
  return pathogenType === 'bacterial' ? 30 : 20
}

/**
 * Calculate the recommended max samples per sequencing run.
 * Based on Annex 2 of the WHO GCT user manual (2nd ed., 2026).
 *
 * @param genomeSizeMb   Genome size in megabases
 * @param coverageX      Required coverage (e.g. 100)
 * @param readLengthBp   Read length from the sequencing kit (bp)
 * @param kitMaxReads    Max reads per flow cell for the selected kit
 * @param bufferPct      Buffer for off-target reads (%)
 * @param barcodingLimit Max barcodes for the library prep kit (or Infinity)
 * @param pathogenType   'viral' | 'bacterial'
 */
export function calculateSamplesPerRun(
  genomeSizeMb: number,
  coverageX: number,
  readLengthBp: number,
  kitMaxReads: number,
  bufferPct: number,
  barcodingLimit: number,
  pathogenType: string,
): number {
  if (!genomeSizeMb || !coverageX || !readLengthBp || !kitMaxReads) return 1

  // Step 1: reads needed for coverage
  const outputPerSampleBp = genomeSizeMb * 1e6 * coverageX
  const readsFromCoverage = outputPerSampleBp / readLengthBp

  // Step 2: compare with minimum reads, take the larger
  const minReads = minReadsPerSample(pathogenType, genomeSizeMb)
  const readsPerSample = Math.max(readsFromCoverage, minReads)

  // Step 3: apply buffer
  const readsWithBuffer = readsPerSample * (1 + bufferPct / 100)

  // Step 4: samples per flow cell
  const samplesFromReads = Math.floor(kitMaxReads / readsWithBuffer)

  // Step 5: constrain by barcoding limit
  return Math.max(1, Math.min(samplesFromReads, barcodingLimit || Infinity))
}

// ── Main cost calculator ──────────────────────────────────────────────────────

export function calculateCosts(project: Project): CostBreakdown {
  const { samplesPerYear, sequencer, consumables, equipment, personnel, facility, transport, bioinformatics, qms } = project

  if (!samplesPerYear || samplesPerYear <= 0) {
    return {
      sequencingReagents: 0, libraryPrep: 0, consumables: 0,
      equipment: 0, establishmentCost: 0, personnel: 0,
      facility: 0, transport: 0, bioinformatics: 0, qms: 0,
      total: 0, costPerSample: 0,
    }
  }

  // Runs needed (including retest % — samples that need to be repeated)
  const samplesIncludingRetests = samplesPerYear * (1 + (sequencer.retestPct ?? 0) / 100)
  const samplesPerRun = Math.max(sequencer.samplesPerRun, 1)
  const runsNeeded = Math.ceil(samplesIncludingRetests / samplesPerRun)

  const sequencingReagents = runsNeeded * (sequencer.reagentKitPrice ?? 0)
  const libraryPrep = samplesIncludingRetests * (sequencer.libPrepCostPerSample ?? 0)

  const annualConsumables = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => {
      const qty = Math.ceil(samplesPerYear * (c.quantityPerSample ?? 0))
      return sum + qty * (c.unitCostUsd ?? 0)
    }, 0)

  // Equipment: amortised over 5 years (operational cost)
  const annualEquipment = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1) / 5, 0)

  // Establishment cost: full purchase price of equipment to buy
  const establishmentCost = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1), 0)

  const annualPersonnel = personnel.reduce((sum, p) => {
    return sum + (p.annualSalaryUsd ?? 0) * (p.pctTime ?? 0) / 100
  }, 0)

  const annualFacility = facility.reduce((sum, f) => {
    return sum + (f.monthlyCostUsd ?? 0) * 12 * (f.pctSequencing ?? 0) / 100
  }, 0)

  const annualTransport = transport.reduce((sum, t) => sum + (t.annualCostUsd ?? 0), 0)

  let annualBioinformatics = 0
  if (bioinformatics.type === 'cloud') {
    annualBioinformatics = samplesPerYear * (bioinformatics.costPerSampleUsd ?? 0)
  } else if (bioinformatics.type === 'inhouse' || bioinformatics.type === 'hybrid') {
    annualBioinformatics = bioinformatics.annualServerCostUsd ?? 0
  }

  // QMS: cost × quantity × pctSequencing (% attributed to this sequencing programme)
  const annualQMS = qms
    .filter(q => q.enabled)
    .reduce((sum, q) => sum + (q.costUsd ?? 0) * (q.quantity ?? 1) * (q.pctSequencing ?? 100) / 100, 0)

  const total =
    sequencingReagents + libraryPrep + annualConsumables + annualEquipment +
    annualPersonnel + annualFacility + annualTransport + annualBioinformatics + annualQMS

  const costPerSample = samplesPerYear > 0 ? total / samplesPerYear : 0

  return {
    sequencingReagents,
    libraryPrep,
    consumables: annualConsumables,
    equipment: annualEquipment,
    establishmentCost,
    personnel: annualPersonnel,
    facility: annualFacility,
    transport: annualTransport,
    bioinformatics: annualBioinformatics,
    qms: annualQMS,
    total,
    costPerSample,
  }
}
