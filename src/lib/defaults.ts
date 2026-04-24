import type { Project, SequencerConfig, BioCloudItem, BioInhouseItem } from '../types'
import { getEffectiveCatalogue } from './catalogue'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createDefaultSequencer(label: string): SequencerConfig {
  const catalogue = getEffectiveCatalogue()
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
    assignments: [],
  }
}

export function createDefaultCloudItems(): BioCloudItem[] {
  const catalogue = getEffectiveCatalogue()
  return catalogue.bioinformatics_cloud.cloud_platforms.map(p => ({
    name: p.name,
    description: p.description ?? '',
    pricePerUnit: 0,
    quantity: 1,
    totalSamplesAllPathogens: 0,
    samplesThisScenario: 0,
    enabled: false,
    notes: '',
  }))
}

export function createDefaultInhouseItems(): BioInhouseItem[] {
  // Standard in-house components from the WHO demo workbook
  return [
    { name: 'Low/mid processing workstation', description: 'Desktop workstation for bioinformatics', pricePerUnit: 7028, quantity: 1, pctUse: 100, lifespanYears: 5, ageYears: 0, enabled: false },
    { name: 'NAS (64TB)', description: 'Network-attached storage', pricePerUnit: 3380, quantity: 1, pctUse: 100, lifespanYears: 2, ageYears: 0, enabled: false },
    { name: 'Monitor', description: 'Display monitor', pricePerUnit: 150, quantity: 1, pctUse: 100, lifespanYears: 2, ageYears: 0, enabled: false },
    { name: 'External HDD (1TB)', description: 'External hard drive for backup', pricePerUnit: 52, quantity: 1, pctUse: 100, lifespanYears: 2, ageYears: 0, enabled: false },
  ]
}

export function createDefaultProject(): Project {
  const catalogue = getEffectiveCatalogue()
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
      // WHO GCT: defaults for new fields
      ageYears: 0,
      pctSequencing: 100,
    }))

  const defaultPersonnel = catalogue.personnel_roles.map((r, i) => ({
    role: r.role,
    annualSalaryUsd: 30000,
    pctTime: [20, 30, 50, 50, 60][i] ?? 20,
  }))

  const defaultQMS = catalogue.qms_activities.map(q => ({
    activity: q.activity,
    costUsd: q.default_cost_usd ?? 1000,
    quantity: q.default_quantity ?? 1,
    pctSequencing: 85,  // WHO default: 85% attributed to sequencing
    enabled: true,
  }))

  // WHO GCT: 12 standard facility line items
  const defaultFacility = [
    { label: 'Rent', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Building maintenance', monthlyCostUsd: 200, pctSequencing: 50 },
    { label: 'Gas and heating', monthlyCostUsd: 200, pctSequencing: 50 },
    { label: 'Water', monthlyCostUsd: 100, pctSequencing: 50 },
    { label: 'Electricity', monthlyCostUsd: 500, pctSequencing: 50 },
    { label: 'Internet', monthlyCostUsd: 200, pctSequencing: 50 },
    { label: 'Telephone', monthlyCostUsd: 100, pctSequencing: 50 },
    { label: 'Waste management', monthlyCostUsd: 1000, pctSequencing: 50 },
    { label: 'Generator maintenance', monthlyCostUsd: 100, pctSequencing: 50 },
    { label: 'Ventilation system maintenance', monthlyCostUsd: 300, pctSequencing: 50 },
    { label: 'Generator fuel', monthlyCostUsd: 50, pctSequencing: 50 },
    { label: 'LIMS', monthlyCostUsd: 100, pctSequencing: 50 },
  ]

  return {
    id: randomId(),
    name: '',
    country: '',
    year: 2025,
    pathogens: [
      {
        pathogenName: 'SARS-CoV-2',
        pathogenType: 'viral',
        genomeSizeMb: 0.03,
        samplesPerYear: 200,
      }
    ],
    sequencers: [createDefaultSequencer('Sequencer 1')],
    consumables: defaultConsumables,
    equipment: defaultEquipment,
    personnel: defaultPersonnel,
    facility: defaultFacility,
    transport: [
      { label: 'Sample transport', annualCostUsd: 2000, pctSequencing: 100 },
      { label: 'Courier/shipping', annualCostUsd: 1000, pctSequencing: 100 },
    ],
    bioinformatics: {
      type: 'cloud',
      cloudItems: createDefaultCloudItems(),
      inhouseItems: createDefaultInhouseItems(),
    },
    qms: defaultQMS,
    exchangeRate: 1,
    currency: 'USD',
    trainingGroupCostUsd: 5000,
    adminCostPct: 0,
  }
}
