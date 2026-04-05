import type { Project, CostBreakdown } from '../types'

export function calculateCosts(project: Project): CostBreakdown {
  const { samplesPerYear, sequencer, consumables, equipment, personnel, facility, transport, bioinformatics, qms } = project

  if (!samplesPerYear || samplesPerYear <= 0) {
    return {
      sequencingReagents: 0,
      libraryPrep: 0,
      consumables: 0,
      equipment: 0,
      establishmentCost: 0,
      personnel: 0,
      facility: 0,
      transport: 0,
      bioinformatics: 0,
      qms: 0,
      total: 0,
      costPerSample: 0,
    }
  }

  // Runs needed
  const adjustedSamples = samplesPerYear * (1 + (sequencer.retestPct ?? 0) / 100 + (sequencer.bufferPct ?? 0) / 100)
  const samplesPerRun = Math.max(sequencer.samplesPerRun, 1)
  const runsNeeded = Math.ceil(adjustedSamples / samplesPerRun)

  const sequencingReagents = runsNeeded * (sequencer.reagentKitPrice ?? 0)
  const libraryPrep = samplesPerYear * (sequencer.libPrepCostPerSample ?? 0)

  const annualConsumables = consumables
    .filter(c => c.enabled)
    .reduce((sum, c) => {
      const qty = Math.ceil(samplesPerYear * (c.quantityPerSample ?? 0))
      return sum + qty * (c.unitCostUsd ?? 0)
    }, 0)

  const annualEquipment = equipment
    .filter(e => e.status === 'buy')
    .reduce((sum, e) => sum + (e.unitCostUsd ?? 0) * (e.quantity ?? 1) / 5, 0)

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
  } else if (bioinformatics.type === 'inhouse') {
    annualBioinformatics = bioinformatics.annualServerCostUsd ?? 0
  }

  const annualQMS = qms
    .filter(q => q.enabled)
    .reduce((sum, q) => sum + (q.costUsd ?? 0) * (q.quantity ?? 0), 0)

  const total =
    sequencingReagents +
    libraryPrep +
    annualConsumables +
    annualEquipment +
    annualPersonnel +
    annualFacility +
    annualTransport +
    annualBioinformatics +
    annualQMS

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
