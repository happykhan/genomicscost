import type { Project, CostBreakdown, SequencerConfig } from '../types'

// ── Workflow step constants ───────────────────────────────────────────────────

export const WORKFLOW_STEPS = [
  'sample_receipt',
  'nucleic_acid_extraction',
  'pcr_testing',
  'library_prep',
  'sequencing',
  'bioinformatics',
] as const

export const WORKFLOW_STEP_LABELS: Record<string, string> = {
  sample_receipt: 'Sample receipt',
  nucleic_acid_extraction: 'Nucleic acid extraction',
  pcr_testing: 'PCR testing',
  library_prep: 'NGS library preparation',
  sequencing: 'Sequencing',
  bioinformatics: 'Bioinformatics',
}

// Map catalogue workflow tags → our 6 steps
const CATALOGUE_WORKFLOW_MAP: Record<string, string> = {
  sample_receipt: 'sample_receipt',
  nucleic_acid_extraction: 'nucleic_acid_extraction',
  pcr_testing: 'pcr_testing',
  library_prep: 'library_prep',
  sequencing: 'sequencing',
  // catalogue uses 'Sequencing' (capitalised) for equipment
  Sequencing: 'sequencing',
  bioinformatics: 'bioinformatics',
  general_lab: 'sample_receipt', // assign general lab reagents to sample receipt
}

// ── Annex 2: Minimum reads per sample by pathogen type and genome size ────────

function minReadsForPathogen(pathogenType: string, genomeSizeMb: number): number {
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
 * @param captureAll     If true, use minReadsPerSample directly
 * @param minReadsCaptureAll  Minimum reads per sample for capture-all mode
 * @param controlsPerRun  Number of control lanes to subtract from samples per run
 */
export function calculateSamplesPerRun(
  genomeSizeMb: number,
  coverageX: number,
  readLengthBp: number,
  kitMaxReads: number,
  bufferPct: number,
  barcodingLimit: number,
  pathogenType: string,
  captureAll = false,
  minReadsCaptureAll = 100_000,
  controlsPerRun = 0,
): number {
  if (!kitMaxReads) return 1

  let readsPerSample: number

  if (captureAll) {
    // Feature 7: capture-all mode — use fixed min reads directly
    readsPerSample = Math.max(1, minReadsCaptureAll)
  } else {
    if (!genomeSizeMb || !coverageX || !readLengthBp) return 1

    // Step 1: reads needed for coverage
    const outputPerSampleBp = genomeSizeMb * 1e6 * coverageX
    const readsFromCoverage = outputPerSampleBp / readLengthBp

    // Step 2: compare with minimum reads, take the larger
    const minReads = minReadsForPathogen(pathogenType, genomeSizeMb)
    readsPerSample = Math.max(readsFromCoverage, minReads)
  }

  // Step 3: apply buffer
  const readsWithBuffer = readsPerSample * (1 + bufferPct / 100)

  // Step 4: samples per flow cell (gross, before subtracting controls)
  const grossSamples = Math.floor(kitMaxReads / readsWithBuffer)

  // Step 5: subtract controls
  const effectiveSamples = Math.max(1, grossSamples - Math.max(0, controlsPerRun))

  // Step 6: constrain by barcoding limit
  return Math.max(1, Math.min(effectiveSamples, barcodingLimit || Infinity))
}

// ── Per-sequencer cost calculator ─────────────────────────────────────────────

function calcSequencerCosts(
  seq: SequencerConfig,
  samplesPerYear: number,
): { sequencingReagents: number; libraryPrep: number } {
  if (!seq.enabled) return { sequencingReagents: 0, libraryPrep: 0 }

  const samplesIncludingRetests = samplesPerYear * (1 + (seq.retestPct ?? 0) / 100)
  // Feature 3: effective samples per run subtracts controls
  const effectiveSamplesPerRun = Math.max(1, (seq.samplesPerRun ?? 1) - Math.max(0, seq.controlsPerRun ?? 0))
  const runsNeeded = Math.ceil(samplesIncludingRetests / effectiveSamplesPerRun)

  return {
    sequencingReagents: runsNeeded * (seq.reagentKitPrice ?? 0),
    libraryPrep: samplesIncludingRetests * (seq.libPrepCostPerSample ?? 0),
  }
}

// ── Main cost calculator ──────────────────────────────────────────────────────

export function calculateCosts(project: Project): CostBreakdown {
  const { samplesPerYear, sequencers, consumables, equipment, personnel, facility, transport, bioinformatics, qms } = project

  const zero: CostBreakdown = {
    sequencingReagents: 0, libraryPrep: 0, consumables: 0,
    equipment: 0, establishmentCost: 0, personnel: 0,
    facility: 0, transport: 0, bioinformatics: 0, qms: 0, training: 0,
    total: 0, costPerSample: 0,
    workflowBreakdown: Object.fromEntries(WORKFLOW_STEPS.map(s => [s, 0])),
  }

  if (!samplesPerYear || samplesPerYear <= 0) return zero

  // Sum costs across all enabled sequencers
  const seqCosts = (sequencers ?? []).reduce(
    (acc, seq) => {
      const c = calcSequencerCosts(seq, samplesPerYear)
      return {
        sequencingReagents: acc.sequencingReagents + c.sequencingReagents,
        libraryPrep: acc.libraryPrep + c.libraryPrep,
      }
    },
    { sequencingReagents: 0, libraryPrep: 0 },
  )

  const annualConsumables = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => {
      const qty = Math.ceil(samplesPerYear * (c.quantityPerSample ?? 0))
      return sum + qty * (c.unitCostUsd ?? 0)
    }, 0)

  // Feature 2: per-item lifespan for depreciation
  const annualEquipment = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => {
      const lifespan = Math.max(1, e.lifespanYears ?? 5)
      return sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1) / lifespan
    }, 0)

  // Establishment cost: full purchase price of equipment to buy
  const establishmentCost = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1), 0)

  const annualPersonnel = personnel.reduce((sum, p) => {
    return sum + (p.annualSalaryUsd ?? 0) * (p.pctTime ?? 0) / 100
  }, 0)

  // Feature 1: training costs
  const annualTraining = personnel.reduce((sum, p) => sum + (p.trainingCostUsd ?? 0), 0)

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
    seqCosts.sequencingReagents + seqCosts.libraryPrep + annualConsumables + annualEquipment +
    annualPersonnel + annualFacility + annualTransport + annualBioinformatics + annualQMS + annualTraining

  const costPerSample = samplesPerYear > 0 ? total / samplesPerYear : 0

  // ── Feature 5: Workflow step breakdown ──────────────────────────────────────
  // Personnel, Facility, Transport, QMS, Training are shared evenly across 6 steps
  const sharedCost = annualPersonnel + annualFacility + annualTransport + annualQMS + annualTraining
  const perStep = sharedCost / WORKFLOW_STEPS.length

  const workflowBreakdown: Record<string, number> = Object.fromEntries(WORKFLOW_STEPS.map(s => [s, perStep]))

  // Consumables: assigned by their workflow tag
  consumables.filter(c => c.enabled).forEach(c => {
    const qty = Math.ceil(samplesPerYear * (c.quantityPerSample ?? 0))
    const cost = qty * (c.unitCostUsd ?? 0)
    const tag = (c as { workflow?: string }).workflow ?? 'sample_receipt'
    const step = CATALOGUE_WORKFLOW_MAP[tag] ?? 'sample_receipt'
    if (step in workflowBreakdown) {
      workflowBreakdown[step] += cost
    } else {
      workflowBreakdown['sample_receipt'] += cost
    }
  })

  // Equipment: assigned by workflow_step from catalogue (only 'Sequencing' currently)
  equipment.filter(e => e.status === 'buy').forEach(e => {
    const lifespan = Math.max(1, e.lifespanYears ?? 5)
    const annualCost = (e.unitCostUsd ?? 0) * (e.quantity ?? 1) / lifespan
    // Equipment items store category; workflow step not on EquipmentItem directly
    // Assign sequencing_platform category to sequencing step, rest to sample_receipt
    const step = e.category === 'sequencing_platform' ? 'sequencing' : 'sample_receipt'
    workflowBreakdown[step] = (workflowBreakdown[step] ?? 0) + annualCost
  })

  // Sequencing reagents → sequencing step; library prep → library_prep step
  workflowBreakdown['sequencing'] = (workflowBreakdown['sequencing'] ?? 0) + seqCosts.sequencingReagents
  workflowBreakdown['library_prep'] = (workflowBreakdown['library_prep'] ?? 0) + seqCosts.libraryPrep

  // Bioinformatics → bioinformatics step only
  workflowBreakdown['bioinformatics'] = (workflowBreakdown['bioinformatics'] ?? 0) + annualBioinformatics

  return {
    sequencingReagents: seqCosts.sequencingReagents,
    libraryPrep: seqCosts.libraryPrep,
    consumables: annualConsumables,
    equipment: annualEquipment,
    establishmentCost,
    personnel: annualPersonnel,
    facility: annualFacility,
    transport: annualTransport,
    bioinformatics: annualBioinformatics,
    qms: annualQMS,
    training: annualTraining,
    total,
    costPerSample,
    workflowBreakdown,
  }
}
