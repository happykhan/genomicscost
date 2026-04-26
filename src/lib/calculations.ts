import type { Project, CostBreakdown, PathogenCostBreakdown, SequencerConfig, PathogenEntry, ConsumableWorkflowStep } from '../types'
import { getEffectiveCatalogue } from './catalogue'

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

/**
 * For a mixed-pathogen run, calculate effective samples per run using a
 * weighted-average reads-per-sample across all pathogens (weighted by annual count).
 * This is more accurate than using the largest genome alone.
 */
export function calculateSamplesPerRunMulti(
  pathogens: PathogenEntry[],
  coverageX: number,
  readLengthBp: number,
  kitMaxReads: number,
  bufferPct: number,
  barcodingLimit: number,
  captureAll = false,
  minReadsCaptureAll = 100_000,
  controlsPerRun = 0,
  maxOutputMb = 0,
): number {
  if (pathogens.length === 0) return 1
  if (pathogens.length === 1) {
    return calculateSamplesPerRun(
      pathogens[0].genomeSizeMb, coverageX, readLengthBp, kitMaxReads,
      bufferPct, barcodingLimit, pathogens[0].pathogenType,
      captureAll, minReadsCaptureAll, controlsPerRun, maxOutputMb,
    )
  }

  const totalSamples = pathogens.reduce((s, p) => s + p.samplesPerYear, 0)
  if (totalSamples === 0) return 1
  const buffer = 1 + bufferPct / 100

  let grossSamples: number

  if (captureAll) {
    const readsPerSample = Math.max(1, minReadsCaptureAll)
    if (kitMaxReads > 0) {
      grossSamples = Math.floor(kitMaxReads / (readsPerSample * buffer))
    } else if (maxOutputMb > 0 && readLengthBp > 0) {
      const mbPerSample = (readsPerSample * readLengthBp * buffer) / 1e6
      grossSamples = Math.floor(maxOutputMb / mbPerSample)
    } else {
      return 1
    }
  } else if (kitMaxReads > 0 && readLengthBp > 0) {
    // Weighted average reads per sample across all pathogens
    const weightedReadsPerSample = pathogens.reduce((sum, p) => {
      const proportion = p.samplesPerYear / totalSamples
      const outputPerSampleBp = p.genomeSizeMb * 1e6 * coverageX
      const readsFromCoverage = outputPerSampleBp / readLengthBp
      const minReads = minReadsForPathogen(p.pathogenType, p.genomeSizeMb)
      return sum + proportion * Math.max(readsFromCoverage, minReads)
    }, 0)
    if (weightedReadsPerSample === 0) return 1
    grossSamples = Math.floor(kitMaxReads / (weightedReadsPerSample * buffer))
  } else if (maxOutputMb > 0) {
    const weightedMbPerSample = pathogens.reduce((sum, p) => {
      const proportion = p.samplesPerYear / totalSamples
      return sum + proportion * p.genomeSizeMb * coverageX
    }, 0)
    if (weightedMbPerSample === 0) return 1
    grossSamples = Math.floor(maxOutputMb / (weightedMbPerSample * buffer))
  } else {
    return 1
  }

  const effectiveSamples = Math.max(1, grossSamples - Math.max(0, controlsPerRun))
  return Math.max(1, Math.min(effectiveSamples, barcodingLimit || Infinity))
}

// ── Per-sequencer cost calculator ─────────────────────────────────────────────

function calcSequencerCosts(
  seq: SequencerConfig,
  assignedSamples: number,
): { sequencingReagents: number; libraryPrep: number } {
  if (!seq.enabled || assignedSamples <= 0) return { sequencingReagents: 0, libraryPrep: 0 }

  const catalogue = getEffectiveCatalogue()
  const samplesIncludingRetests = assignedSamples * (1 + (seq.retestPct ?? 0) / 100)
  // Use avgSamplesPerRun if set (WHO GCT row 26), otherwise fall back to max capacity
  const maxSamplesPerRun = Math.max(1, seq.samplesPerRun ?? 1)
  const effectiveSamplesPerRun = Math.max(1, seq.avgSamplesPerRun ?? maxSamplesPerRun)
  const runsNeeded = Math.ceil(samplesIncludingRetests / effectiveSamplesPerRun)

  // Library prep cost: kits × kit_price (controls also need prepping — matches Excel)
  const selectedLibKit = catalogue.library_prep_kits.find(k => k.name === seq.libPrepKitName)
  const libPackSize = seq.libPrepKitName === 'Other library preparation kit'
    ? (seq.customLibPrepBarcodesPerPack ?? 0)
    : (selectedLibKit?.pack_size ?? 0)
  const kitPrice = libPackSize > 0 ? (seq.libPrepCostPerSample ?? 0) * libPackSize : 0
  const libKitsNeeded = libPackSize > 0
    ? Math.ceil((samplesIncludingRetests + runsNeeded * (seq.controlsPerRun ?? 0)) / libPackSize)
    : 0
  const libraryPrep = libPackSize > 0 && kitPrice > 0
    ? libKitsNeeded * kitPrice
    : samplesIncludingRetests * (seq.libPrepCostPerSample ?? 0)

  return {
    sequencingReagents: runsNeeded * (seq.reagentKitPrice ?? 0),
    libraryPrep,
  }
}

// ── Main cost calculator ──────────────────────────────────────────────────────

export function calculateCosts(project: Project): CostBreakdown {
  const { pathogens, sequencers, consumables, equipment, personnel, facility, transport, bioinformatics, qms } = project

  const samplesPerYear = (pathogens ?? []).reduce((sum, p) => sum + p.samplesPerYear, 0)

  const zero: CostBreakdown = {
    sequencingReagents: 0, libraryPrep: 0, consumables: 0,
    equipment: 0, incidentals: 0, establishmentCost: 0, personnel: 0,
    facility: 0, transport: 0, bioinformatics: 0, qms: 0, training: 0,
    adminCost: 0,
    total: 0, costPerSample: 0,
    workflowBreakdown: Object.fromEntries(WORKFLOW_STEPS.map(s => [s, 0])),
    perSequencerReagents: [],
    potentialPurchases: 0,
    perPathogenBreakdown: [],
  }

  if (!samplesPerYear || samplesPerYear <= 0) return zero

  // Compute total assigned samples across all sequencers
  const hasAnyAssignments = (sequencers ?? []).some(
    s => Array.isArray(s.assignments) && s.assignments.length > 0,
  )

  // Sum costs across all enabled sequencers using assignment-based sample counts
  // Also collect per-sequencer breakdown for Step 7
  const perSequencerReagents: CostBreakdown['perSequencerReagents'] = []
  const seqCosts = (sequencers ?? []).reduce(
    (acc, seq) => {
      let assignedSamples: number
      if (hasAnyAssignments && Array.isArray(seq.assignments) && seq.assignments.length > 0) {
        assignedSamples = seq.assignments.reduce((sum, a) => sum + (a.samples ?? 0), 0)
      } else if (!hasAnyAssignments) {
        // Back-compat: no assignments anywhere — use global samplesPerYear (old behaviour)
        assignedSamples = samplesPerYear
      } else {
        // This sequencer has no assignments but others do — it gets 0
        assignedSamples = 0
      }
      const c = calcSequencerCosts(seq, assignedSamples)
      if (seq.enabled) {
        perSequencerReagents.push({
          label: seq.label || 'Sequencer',
          reagents: c.sequencingReagents,
          libraryPrep: c.libraryPrep,
        })
      }
      return {
        sequencingReagents: acc.sequencingReagents + c.sequencingReagents,
        libraryPrep: acc.libraryPrep + c.libraryPrep,
      }
    },
    { sequencingReagents: 0, libraryPrep: 0 },
  )

  // Compute total assigned samples for per-sample scaling (consumables, bioinformatics)
  const totalAssignedRuns = hasAnyAssignments
    ? (sequencers ?? []).reduce((sum, seq) => {
        if (!seq.enabled || !Array.isArray(seq.assignments)) return sum
        return sum + seq.assignments.reduce((s, a) => s + (a.samples ?? 0), 0)
      }, 0)
    : 0
  // Use assigned total if available, otherwise fall back to defined samplesPerYear
  const effectiveSamplesForScaling = (totalAssignedRuns > 0) ? totalAssignedRuns : samplesPerYear

  const annualConsumables = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => {
      const qty = Math.ceil(effectiveSamplesForScaling * (c.quantityPerSample ?? 0))
      return sum + qty * (c.unitCostUsd ?? 0)
    }, 0)

  const fixedConsumablesTotal = (project.fixedConsumables ?? [])
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + (c.quantityPerYear ?? 0) * (c.unitCostUsd ?? 0), 0)

  // WHO GCT: depreciation (age-adjusted) + 15% maintenance, both scaled by pctSequencing
  // Only 'buy' items contribute — 'have' are sunk costs excluded from programme budget
  const annualEquipment = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => {
      const lifespan = Math.max(1, e.lifespanYears ?? 5)
      const age = Math.max(0, Math.min(e.ageYears ?? 0, lifespan - 1))
      const remainingLife = Math.max(1, lifespan - age)
      const totalCost = (e.unitCostUsd ?? 0) * (e.quantity ?? 1)
      const pct = (e.pctSequencing ?? 100) / 100
      const depreciation = (totalCost / remainingLife) * pct
      const maintenance = totalCost * 0.15 * pct
      return sum + depreciation + maintenance
    }, 0)

  // Establishment cost: full purchase price of equipment to buy
  const establishmentCost = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1), 0)

  // Potential purchases to reach recommended quantities
  const catalogue = getEffectiveCatalogue()
  const potentialPurchases = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => {
      const catItem = catalogue.equipment.find(c => c.name === e.name)
      const recommended = catItem?.recommended_quantity ?? 0
      if (recommended > 0 && (e.quantity ?? 1) < recommended) {
        return sum + (recommended - (e.quantity ?? 1)) * (e.unitCostUsd ?? 0)
      }
      return sum
    }, 0)

  const annualPersonnel = personnel.reduce((sum, p) => {
    return sum + (p.annualSalaryUsd ?? 0) * (p.pctTime ?? 0) / 100
  }, 0)

  // WHO GCT: group-level training cost
  const annualTraining = project.trainingGroupCostUsd ?? 0

  // WHO GCT: admin overhead % applied to personnel + training subtotal
  const adminCost = (annualPersonnel + annualTraining) * (project.adminCostPct ?? 0) / 100

  const facilityPct = (project.facilityPctSequencing ?? 100) / 100
  const annualFacility = facility.reduce((sum, f) => {
    return sum + (f.monthlyCostUsd ?? 0) * 12 * facilityPct
  }, 0)

  const annualTransport = transport.reduce((sum, t) => {
    return sum + (t.annualCostUsd ?? 0) * ((t.pctSequencing ?? 100) / 100)
  }, 0)

  // Bioinformatics: use new cloudItems/inhouseItems structure
  let annualBioinformatics = 0
  if (bioinformatics.type === 'cloud' || bioinformatics.type === 'hybrid') {
    if (Array.isArray(bioinformatics.cloudItems)) {
      annualBioinformatics += bioinformatics.cloudItems
        .filter(item => item.enabled)
        .reduce((sum, item) => {
          const totalSamplesAll = Math.max(1, item.totalSamplesAllPathogens || effectiveSamplesForScaling)
          return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * (item.samplesThisScenario ?? effectiveSamplesForScaling) / totalSamplesAll
        }, 0)
    } else if (bioinformatics.costPerSampleUsd) {
      // Legacy fallback
      annualBioinformatics += effectiveSamplesForScaling * (bioinformatics.costPerSampleUsd ?? 0)
    }
  }
  if (bioinformatics.type === 'inhouse' || bioinformatics.type === 'hybrid') {
    if (Array.isArray(bioinformatics.inhouseItems)) {
      annualBioinformatics += bioinformatics.inhouseItems
        .filter(item => item.enabled)
        .reduce((sum, item) => {
          const remainingLife = Math.max(1, (item.lifespanYears ?? 1) - (item.ageYears ?? 0))
          return sum + (item.pricePerUnit ?? 0) * (item.quantity ?? 1) * ((item.pctUse ?? 100) / 100) / remainingLife
        }, 0)
    } else if (bioinformatics.annualServerCostUsd) {
      // Legacy fallback
      annualBioinformatics += bioinformatics.annualServerCostUsd ?? 0
    }
  }

  // QMS: cost × quantity × pctSequencing (% attributed to this sequencing programme)
  const annualQMS = qms
    .filter(q => q.enabled)
    .reduce((sum, q) => sum + (q.costUsd ?? 0) * (q.quantity ?? 1) * (q.pctSequencing ?? 100) / 100, 0)

  const totalConsumables = annualConsumables + fixedConsumablesTotal

  // WHO GCT: 7% incidentals on all reagent/consumable costs
  const incidentals = (seqCosts.sequencingReagents + seqCosts.libraryPrep + totalConsumables) * 0.07

  // WHO GCT: equipment operational cost (depreciation + maintenance) is always included
  const total =
    seqCosts.sequencingReagents + seqCosts.libraryPrep + totalConsumables +
    annualEquipment + incidentals +
    annualPersonnel + annualFacility + annualTransport + annualBioinformatics + annualQMS + annualTraining + adminCost

  const costPerSample = effectiveSamplesForScaling > 0 ? total / effectiveSamplesForScaling : 0

  // ── Feature 5: Workflow step breakdown ──────────────────────────────────────
  // Personnel, Facility, Transport, QMS, Training, Admin, Equipment, Incidentals are shared evenly across 6 steps
  const sharedCost = annualPersonnel + annualFacility + annualTransport + annualQMS + annualTraining + adminCost + annualEquipment + incidentals
  const perStep = sharedCost / WORKFLOW_STEPS.length

  const workflowBreakdown: Record<string, number> = Object.fromEntries(WORKFLOW_STEPS.map(s => [s, perStep]))

  // Consumables: split each item's cost across its checked workflow steps equally
  // Map consumable workflow steps to the 6-step workflow breakdown keys
  const CONSUMABLE_WF_TO_STEP: Record<ConsumableWorkflowStep, string> = {
    sample_receipt: 'sample_receipt',
    nucleic_acid_extraction: 'nucleic_acid_extraction',
    pcr_testing: 'pcr_testing',
    ngs_library_preparation: 'library_prep',
    sequencing: 'sequencing',
  }

  consumables.filter(c => c.enabled).forEach(c => {
    const qty = Math.ceil(effectiveSamplesForScaling * (c.quantityPerSample ?? 0))
    const cost = qty * (c.unitCostUsd ?? 0)

    // Collect the checked workflow steps for this consumable
    const checkedSteps: string[] = []
    if (c.workflows && typeof c.workflows === 'object') {
      for (const [wfKey, checked] of Object.entries(c.workflows)) {
        if (checked) {
          const mappedStep = CONSUMABLE_WF_TO_STEP[wfKey as ConsumableWorkflowStep]
          if (mappedStep && mappedStep in workflowBreakdown) {
            checkedSteps.push(mappedStep)
          }
        }
      }
    }

    if (checkedSteps.length > 0) {
      // Split cost equally across checked workflow steps
      const perStep = cost / checkedSteps.length
      for (const step of checkedSteps) {
        workflowBreakdown[step] += perStep
      }
    } else {
      // Fallback: no workflow steps checked — add to shared pool
      // Distribute evenly across all workflow steps
      const fallbackPerStep = cost / WORKFLOW_STEPS.length
      for (const step of WORKFLOW_STEPS) {
        workflowBreakdown[step] += fallbackPerStep
      }
    }
  })

  // Equipment operational cost and incidentals are distributed evenly across workflow steps (already in sharedCost).

  // Sequencing reagents → sequencing step; library prep → library_prep step
  workflowBreakdown['sequencing'] = (workflowBreakdown['sequencing'] ?? 0) + seqCosts.sequencingReagents
  workflowBreakdown['library_prep'] = (workflowBreakdown['library_prep'] ?? 0) + seqCosts.libraryPrep

  // Bioinformatics → bioinformatics step only
  workflowBreakdown['bioinformatics'] = (workflowBreakdown['bioinformatics'] ?? 0) + annualBioinformatics

  // ── Per-pathogen cost breakdown ─────────────────────────────────────────────
  // Fixed/shared costs are split proportionally by sample volume.
  const fixedTotal = annualEquipment + annualPersonnel + annualFacility + annualTransport +
    annualBioinformatics + annualQMS + annualTraining + adminCost

  const perPathogenBreakdown: PathogenCostBreakdown[] = pathogens.map((pathogen, idx) => {
    const proportion = effectiveSamplesForScaling > 0
      ? pathogen.samplesPerYear / effectiveSamplesForScaling
      : 1 / pathogens.length

    // Sequencing reagents + library prep from explicit assignments
    let pathReagents = 0
    let pathLibPrep = 0
    if (hasAnyAssignments) {
      for (const seq of sequencers ?? []) {
        if (!seq.enabled || !Array.isArray(seq.assignments)) continue
        const asgn = seq.assignments.find(a => a.pathogenIndex === idx)
        if (asgn && asgn.samples > 0) {
          const c = calcSequencerCosts(seq, asgn.samples)
          pathReagents += c.sequencingReagents
          pathLibPrep += c.libraryPrep
        }
      }
    } else {
      // No assignments: all costs proportional
      pathReagents = seqCosts.sequencingReagents * proportion
      pathLibPrep = seqCosts.libraryPrep * proportion
    }

    const pathConsumables = annualConsumables * proportion
    const pathIncidentals = (pathReagents + pathLibPrep + pathConsumables) * 0.07
    const pathShared = fixedTotal * proportion
    const pathTotal = pathReagents + pathLibPrep + pathConsumables + pathIncidentals + pathShared

    return {
      pathogenName: pathogen.pathogenName,
      pathogenType: pathogen.pathogenType,
      samples: pathogen.samplesPerYear,
      sequencingReagents: pathReagents,
      libraryPrep: pathLibPrep,
      consumables: pathConsumables,
      incidentals: pathIncidentals,
      sharedCosts: pathShared,
      total: pathTotal,
      costPerSample: pathogen.samplesPerYear > 0 ? pathTotal / pathogen.samplesPerYear : 0,
    }
  })

  return {
    sequencingReagents: seqCosts.sequencingReagents,
    libraryPrep: seqCosts.libraryPrep,
    consumables: totalConsumables,
    equipment: annualEquipment,
    incidentals,
    establishmentCost,
    personnel: annualPersonnel,
    facility: annualFacility,
    transport: annualTransport,
    bioinformatics: annualBioinformatics,
    qms: annualQMS,
    training: annualTraining,
    adminCost,
    total,
    costPerSample,
    workflowBreakdown,
    perSequencerReagents,
    potentialPurchases,
    perPathogenBreakdown,
  }
}
