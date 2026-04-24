import type { Project, SequencerConfig, PathogenEntry, BioCloudItem, BioInhouseItem, ConsumableWorkflowStep } from '../types'
import { getEffectiveCatalogue } from './catalogue'
import type { BundledReagent } from './catalogue'

/** Valid workflow steps for consumable items. */
const VALID_WORKFLOW_STEPS: ConsumableWorkflowStep[] = [
  'sample_receipt', 'nucleic_acid_extraction', 'pcr_testing', 'ngs_library_preparation', 'sequencing',
]

/** Build a workflows record from a catalogue item's workflows array or single workflow string. */
function buildWorkflows(
  catalogueWorkflows?: string[],
  catalogueWorkflow?: string | null,
): Partial<Record<ConsumableWorkflowStep, boolean>> | undefined {
  if (Array.isArray(catalogueWorkflows) && catalogueWorkflows.length > 0) {
    const result: Partial<Record<ConsumableWorkflowStep, boolean>> = {}
    for (const w of catalogueWorkflows) {
      if (VALID_WORKFLOW_STEPS.includes(w as ConsumableWorkflowStep)) {
        result[w as ConsumableWorkflowStep] = true
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
  if (catalogueWorkflow && VALID_WORKFLOW_STEPS.includes(catalogueWorkflow as ConsumableWorkflowStep)) {
    return { [catalogueWorkflow as ConsumableWorkflowStep]: true }
  }
  return undefined
}

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

// ── Consumable filtering by pathogen type and sequencer platform ────────────

/** Keywords that flag a reagent as viral-specific. */
const VIRAL_KEYWORDS = ['viral transport', 'vtm', 'rna extraction', 'rt-pcr', 'rt-qpcr', 'rnase away']

/** Keywords that flag a reagent as ONT-platform-specific. */
const ONT_KEYWORDS = ['ont flow cell', 'ont wash']

/** Keywords that flag a reagent as Illumina-platform-specific. */
const ILLUMINA_KEYWORDS: string[] = []  // none in current catalogue; reserved for future

function isViralReagent(r: BundledReagent): boolean {
  const lower = r.name.toLowerCase()
  return VIRAL_KEYWORDS.some(kw => lower.includes(kw))
}

function isOntReagent(r: BundledReagent): boolean {
  const lower = r.name.toLowerCase()
  return ONT_KEYWORDS.some(kw => lower.includes(kw))
}

function isIlluminaReagent(r: BundledReagent): boolean {
  const lower = r.name.toLowerCase()
  return ILLUMINA_KEYWORDS.some(kw => lower.includes(kw))
}

export type ConsumableItem = {
  name: string
  unitCostUsd: number
  quantityPerSample: number
  enabled: boolean
  workflows?: Partial<Record<ConsumableWorkflowStep, boolean>>
}

function reagentToConsumable(r: BundledReagent): ConsumableItem {
  const packSize = r.pack_size ?? 1
  const qtyPerSample = packSize > 1
    ? parseFloat(((r.quantity_per_sample ?? 1) / packSize).toFixed(4))
    : (r.quantity_per_sample ?? 1)
  return {
    name: r.name,
    unitCostUsd: 5,   // placeholder — user must enter local price per pack
    quantityPerSample: qtyPerSample,
    enabled: true,
    workflows: buildWorkflows(r.workflows, r.workflow),
  }
}

/**
 * Build the default consumable list, filtered by pathogen types and sequencer
 * platforms. This is the single source of truth for what the auto-populated
 * consumable list should contain.
 *
 * Rules:
 * - Only include reagents with quantity_per_sample > 0
 * - Exclude viral-specific reagents when all pathogens are bacterial
 * - Exclude ONT-specific reagents unless an ONT sequencer is enabled
 * - Exclude Illumina-specific reagents unless an Illumina sequencer is enabled
 */
export function buildFilteredConsumables(
  pathogens: PathogenEntry[],
  sequencers: SequencerConfig[],
): ConsumableItem[] {
  const catalogue = getEffectiveCatalogue()

  const allBacterial = pathogens.length > 0 &&
    pathogens.every(p => p.pathogenType === 'bacterial')
  const hasViral = pathogens.some(p => p.pathogenType === 'viral')

  const enabledPlatformIds = new Set(
    sequencers.filter(s => s.enabled).map(s => s.platformId)
  )
  const hasOnt = enabledPlatformIds.has('ont')
  const hasIllumina = enabledPlatformIds.has('illumina')

  return catalogue.reagents
    .filter(r => r.quantity_per_sample != null && r.quantity_per_sample > 0)
    .filter(r => {
      // Exclude viral-specific reagents when no viral pathogens
      if (allBacterial && !hasViral && isViralReagent(r)) return false
      // Exclude ONT-specific reagents unless an ONT platform is enabled
      if (isOntReagent(r) && !hasOnt) return false
      // Exclude Illumina-specific reagents unless an Illumina platform is enabled
      if (isIlluminaReagent(r) && !hasIllumina) return false
      return true
    })
    .map(reagentToConsumable)
}

/**
 * Check whether the current consumable list is still at its auto-populated
 * defaults (i.e. the user hasn't manually customised it). We compare the
 * set of item names and their default placeholder costs.
 *
 * Returns true if consumables appear to be the untouched default set for
 * ANY combination of pathogen/sequencer filters, meaning we can safely
 * re-populate them.
 */
export function isConsumablesAtDefaults(
  consumables: ConsumableItem[],
): boolean {
  // If the user has changed any price from the $5 placeholder, they've customised
  if (consumables.some(c => c.unitCostUsd !== 5)) return false

  // Check whether every item name comes from the catalogue reagent list
  const catalogue = getEffectiveCatalogue()
  const catalogueNames = new Set(catalogue.reagents.map(r => r.name))
  if (consumables.some(c => !catalogueNames.has(c.name))) return false

  return true
}

export function createDefaultProject(): Project {
  const catalogue = getEffectiveCatalogue()

  // Default pathogens for a new project
  const defaultPathogens: PathogenEntry[] = [
    {
      pathogenName: 'SARS-CoV-2',
      pathogenType: 'viral',
      genomeSizeMb: 0.03,
      samplesPerYear: 200,
    }
  ]
  const defaultSequencers = [createDefaultSequencer('Sequencer 1')]

  // Auto-populate consumables filtered by the default pathogen/sequencer combination
  const defaultConsumables = buildFilteredConsumables(defaultPathogens, defaultSequencers)

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

  // WHO GCT: 12 standard facility line items — all $0 by default, user enters local costs
  const defaultFacility = [
    { label: 'Rent', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Building maintenance', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Gas and heating', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Water', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Electricity', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Internet', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Telephone', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Waste management', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Generator maintenance', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Ventilation system maintenance', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'Generator fuel', monthlyCostUsd: 0, pctSequencing: 50 },
    { label: 'LIMS', monthlyCostUsd: 0, pctSequencing: 50 },
  ]

  return {
    id: randomId(),
    name: '',
    country: '',
    year: 2025,
    pathogens: defaultPathogens,
    sequencers: defaultSequencers,
    consumables: defaultConsumables,
    equipment: defaultEquipment,
    personnel: defaultPersonnel,
    facility: defaultFacility,
    transport: [
      { label: 'Regional to national reference laboratory', shipmentMethod: 'Courier', annualCostUsd: 0, pctSequencing: 100 },
      { label: 'Insurance (if applicable)', shipmentMethod: '', annualCostUsd: 0, pctSequencing: 100 },
      { label: 'Exportation fees (if applicable)', shipmentMethod: '', annualCostUsd: 0, pctSequencing: 100 },
      { label: 'Customs clearance fees', shipmentMethod: '', annualCostUsd: 0, pctSequencing: 100 },
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
