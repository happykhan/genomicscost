import type { Project, SequencerConfig } from '../types'
import catalogue from '../data/catalogue.json'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createDefaultSequencer(label: string): SequencerConfig {
  const illuminaPlatform = catalogue.platforms.find(p => p.id === 'illumina')!
  const firstKit = illuminaPlatform.reagent_kits[0]
  return {
    platformId: 'illumina',
    reagentKitName: firstKit.name,
    reagentKitPrice: firstKit.unit_price_usd ?? 0,
    samplesPerRun: 96,
    coverageX: 10,
    bufferPct: 10,
    retestPct: 5,
    libPrepKitName: '',
    libPrepCostPerSample: 25,
    enrichment: false,
    controlsPerRun: 2,
    enabled: true,
    label,
    captureAll: false,
    minReadsPerSample: 100_000,
  }
}

export function createDefaultProject(): Project {
  // First 8 consumable-like reagents from catalogue that have quantity_per_sample > 0
  // quantityPerSample is units-per-sample; if pack_size > 1, normalise to packs-per-sample
  const defaultConsumables = catalogue.reagents
    .filter(r => r.quantity_per_sample != null && r.quantity_per_sample > 0)
    .slice(0, 8)
    .map(r => {
      const packSize = r.pack_size ?? 1
      const qtyPerSample = packSize > 1
        ? parseFloat(((r.quantity_per_sample ?? 1) / packSize).toFixed(4))
        : (r.quantity_per_sample ?? 1)
      return {
        name: r.name,
        unitCostUsd: 5,   // placeholder — user must enter local price per pack
        quantityPerSample: qtyPerSample,
        enabled: true,
        workflow: r.workflow ?? undefined,
      }
    })

  // 5 key equipment items
  const equipmentCatalogue = catalogue.equipment
  const iseq = equipmentCatalogue.find(e => e.name === 'Illumina iSeq 100')
  const pcr = equipmentCatalogue.find(e => e.name === 'Thermal cycler (conventional)')
  const centrifuge = equipmentCatalogue.find(e => e.name === 'Centrifuge (plate)')
  const microcentrifuge = equipmentCatalogue.find(e => e.name === 'Microcentrifuge (can hold  24 tubes of 1.5/2.0 mL)')
  const freezer = equipmentCatalogue.find(e => e.name === '(-)20  freezer')

  const defaultEquipment = [iseq, pcr, centrifuge, microcentrifuge, freezer]
    .filter((e): e is NonNullable<typeof e> => e != null)
    .map(e => ({
      name: e.name,
      category: e.category,
      status: 'have' as const,
      quantity: 1,
      unitCostUsd: e.unit_cost_usd ?? 0,
      // Feature 2: sequencers get 10-year lifespan, everything else 5
      lifespanYears: e.category === 'sequencing_platform' ? 10 : 5,
    }))

  const defaultPersonnel = catalogue.personnel_roles.map((r, i) => ({
    role: r.role,
    annualSalaryUsd: 30000,
    pctTime: [20, 30, 50, 50, 60][i] ?? 20,
    trainingCostUsd: 1000,
  }))

  const defaultQMS = catalogue.qms_activities.map(q => ({
    activity: q.activity,
    costUsd: q.default_cost_usd ?? 1000,
    quantity: q.default_quantity ?? 1,
    pctSequencing: 85,  // WHO default: 85% attributed to sequencing
    enabled: true,
  }))

  return {
    id: randomId(),
    name: '',
    country: '',
    year: 2025,
    pathogenType: 'viral',
    pathogenName: 'severe acute respiratory syndrome coronavirus 2 (SARS-CoV-2)',
    genomeSizeMb: 0.03,
    samplesPerYear: 200,
    sequencers: [createDefaultSequencer('Sequencer 1')],
    consumables: defaultConsumables,
    equipment: defaultEquipment,
    personnel: defaultPersonnel,
    facility: [
      { label: 'Rent/lease', monthlyCostUsd: 500, pctSequencing: 30 },
      { label: 'Utilities', monthlyCostUsd: 200, pctSequencing: 50 },
      { label: 'Maintenance', monthlyCostUsd: 100, pctSequencing: 100 },
    ],
    transport: [
      { label: 'Sample transport', annualCostUsd: 2000 },
      { label: 'Courier/shipping', annualCostUsd: 1000 },
    ],
    bioinformatics: {
      type: 'cloud',
      cloudPlatform: 'BaseSpace',
      costPerSampleUsd: 2,
      annualServerCostUsd: 0,
    },
    qms: defaultQMS,
    exchangeRate: 1,
    currency: 'USD',
  }
}
