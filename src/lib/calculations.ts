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
 * For kits with max_reads_per_flowcell + read_length_bp (e.g. Illumina, MGI):
 *   uses reads-based formula with pathogen-specific minimums.
 * For kits with only max_output_mb (e.g. ONT long-read):
 *   falls back to Mb-based formula (output / genome × coverage).
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
  maxOutputMb = 0,
): number {
  const buffer = 1 + bufferPct / 100

  let grossSamples: number

  if (captureAll) {
    const readsPerSample = Math.max(1, minReadsCaptureAll)
    const readsWithBuffer = readsPerSample * buffer
    if (kitMaxReads > 0) {
      grossSamples = Math.floor(kitMaxReads / readsWithBuffer)
    } else if (maxOutputMb > 0 && readLengthBp > 0) {
      const mbPerSample = (readsPerSample * readLengthBp * buffer) / 1e6
      grossSamples = Math.floor(maxOutputMb / mbPerSample)
    } else {
      return 1
    }
  } else if (kitMaxReads > 0 && readLengthBp > 0) {
    // Reads-based path (Annex 2, primary method)
    if (!genomeSizeMb || !coverageX) return 1
    const outputPerSampleBp = genomeSizeMb * 1e6 * coverageX
    const readsFromCoverage = outputPerSampleBp / readLengthBp
    const minReads = minReadsForPathogen(pathogenType, genomeSizeMb)
    const readsPerSample = Math.max(readsFromCoverage, minReads)
    grossSamples = Math.floor(kitMaxReads / (readsPerSample * buffer))
  } else if (maxOutputMb > 0) {
    // Mb-based fallback for kits without discrete read counts (e.g. ONT)
    if (!genomeSizeMb || !coverageX) return 1
    const mbPerSample = genomeSizeMb * coverageX * buffer
    grossSamples = Math.floor(maxOutputMb / mbPerSample)
  } else {
    return 1
  }

  const effectiveSamples = Math.max(1, grossSamples - Math.max(0, controlsPerRun))
  return Math.max(1, Math.min(effectiveSamples, barcodingLimit || Infinity))
}

// ── Per-sequencer cost calculator ─────────────────────────────────────────────

function calcSequencerCosts(
  seq: SequencerConfig,
  samplesPerYear: number,
): { sequencingReagents: number; libraryPrep: number } {
  if (!seq.enabled) return { sequencingReagents: 0, libraryPrep: 0 }

  const samplesIncludingRetests = samplesPerYear * (1 + (seq.retestPct ?? 0) / 100)
  // samplesPerRun is already the effective count after controls (set by calculateSamplesPerRun)
  const effectiveSamplesPerRun = Math.max(1, seq.samplesPerRun ?? 1)
  const runsNeeded = Math.ceil(samplesIncludingRetests / effectiveSamplesPerRun)

  return {
    sequencingReagents: runsNeeded * (seq.reagentKitPrice ?? 0),
    libraryPrep: samplesIncludingRetests * (seq.libPrepCostPerSample ?? 0),
  }
}

// ── Main cost calculator ──────────────────────────────────────────────────────

export function calculateCosts(project: Project): CostBreakdown {
  const { pathogens, sequencers, consumables, equipment, personnel, facility, transport, bioinformatics, qms } = project

  const samplesPerYear = (pathogens ?? []).reduce((sum, p) => sum + p.samplesPerYear, 0)

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
  } else if (bioinformatics.type === 'inhouse') {
    annualBioinformatics = bioinformatics.annualServerCostUsd ?? 0
  } else if (bioinformatics.type === 'hybrid') {
    annualBioinformatics = samplesPerYear * (bioinformatics.costPerSampleUsd ?? 0) + (bioinformatics.annualServerCostUsd ?? 0)
  }

  // QMS: cost × quantity × pctSequencing (% attributed to this sequencing programme)
  const annualQMS = qms
    .filter(q => q.enabled)
    .reduce((sum, q) => sum + (q.costUsd ?? 0) * (q.quantity ?? 1) * (q.pctSequencing ?? 100) / 100, 0)

  // Equipment is capital expenditure (one-off), shown separately as establishmentCost.
  // Depreciation (annualEquipment) is excluded from running cost total.
  const total =
    seqCosts.sequencingReagents + seqCosts.libraryPrep + annualConsumables +
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

  // Equipment is capital expenditure — excluded from workflow running cost breakdown.

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
