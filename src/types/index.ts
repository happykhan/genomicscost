export interface Pathogen {
  name: string
  type: string
  genome_type: string
  genome_size_mb: number
  required_coverage_x: number
}

export interface ReagentKit {
  name: string
  unit_price_usd: number | null
  read_length_bp: number | null
  max_reads_per_flowcell: number
  max_output_mb: number
}

export interface Platform {
  id: string
  name: string
  reagent_kits: ReagentKit[]
}

export interface LibraryPrepKit {
  name: string
  platform: string[]
  pathogens: string[]
  pack_size: number | null
  barcoding_limit: number | null
  price_usd: number | null
  enrichment: boolean
  catalog_ref: string | null
}

export type ConsumableWorkflowStep =
  | 'sample_receipt'
  | 'nucleic_acid_extraction'
  | 'pcr_testing'
  | 'ngs_library_preparation'
  | 'sequencing'

export interface CatalogueReagent {
  name: string
  category: string
  pack_size: number | null
  quantity_per_sample: number
  workflow: string
  workflows?: string[]
  unit_price_usd?: number | null
}

export interface CatalogueEquipment {
  name: string
  category: string
  workflow_step: string
  workflow_steps?: string[]
  unit_cost_usd: number | null
  recommended_quantity: number | null
}

export interface PersonnelRole {
  role: string
}

export interface QMSActivity {
  activity: string
  default_cost_usd: number | null
  default_quantity: number
}

export interface CloudPlatform {
  name: string
  cost_per_sample?: number | null
  monthly_cost?: number | null
}

// ── Project state ─────────────────────────────────────────────────────────────

export interface PathogenEntry {
  pathogenName: string
  pathogenType: 'bacterial' | 'viral'
  genomeSizeMb: number
  samplesPerYear: number
}

export interface SequencerAssignment {
  pathogenIndex: number   // index into project.pathogens
  samples: number         // annual sample count sent to this sequencer for this pathogen
}

export interface SequencerConfig {
  platformId: string        // 'illumina' | 'ont' | 'thermofisher' | 'mgi'
  reagentKitName: string
  reagentKitPrice: number   // user can override
  samplesPerRun: number     // calculated from genome, coverage, kit output
  coverageX: number
  bufferPct: number
  retestPct: number
  libPrepKitName: string
  libPrepCostPerSample: number
  enrichment: boolean
  // Feature 3: controls per run
  controlsPerRun: number
  // Feature 6: dual sequencer
  enabled: boolean
  label: string
  // Feature 7: capture-all mode
  captureAll: boolean
  minReadsPerSample: number
  // Feature 8: pathogen→sequencer assignment matrix
  assignments: SequencerAssignment[]
}

export type EquipmentStatus = 'buy' | 'have' | 'skip'

export interface EquipmentItem {
  name: string
  category: string
  status: EquipmentStatus
  quantity: number
  unitCostUsd: number
  // Feature 2: per-item lifespan
  lifespanYears: number
  // WHO GCT: age adjustment for depreciation (0 = new)
  ageYears?: number
  // WHO GCT: % of use attributed to sequencing (0–100; default 100)
  pctSequencing?: number
}

export interface PersonnelItem {
  role: string
  annualSalaryUsd: number
  pctTime: number  // 0-100
  // Legacy field — kept for migration from old saved projects only.
  // New projects use Project.trainingGroupCostUsd instead.
  trainingCostUsd?: number
}

export interface FacilityItem {
  label: string
  monthlyCostUsd: number
  pctSequencing: number  // 0-100
}

export interface BioCloudItem {
  name: string
  description: string
  pricePerUnit: number
  quantity: number
  totalSamplesAllPathogens: number  // total samples across all pathogens
  samplesThisScenario: number       // samples for the costed pathogens
  enabled: boolean
  notes?: string
}

export interface BioInhouseItem {
  name: string
  description: string
  pricePerUnit: number
  quantity: number
  pctUse: number          // % of use for sequencing (0-100)
  lifespanYears: number
  ageYears: number
  enabled: boolean
}

export interface BioinformaticsConfig {
  type: 'cloud' | 'inhouse' | 'hybrid' | 'none'
  // Legacy fields — kept for migration from old saved projects
  cloudPlatform?: string
  costPerSampleUsd?: number
  annualServerCostUsd?: number
  // New structured items
  cloudItems: BioCloudItem[]
  inhouseItems: BioInhouseItem[]
}

export interface QMSItem {
  activity: string
  costUsd: number
  quantity: number
  pctSequencing: number  // 0-100, % of cost attributed to sequencing
  enabled: boolean
}

export interface TransportItem {
  label: string
  shipmentMethod?: string   // e.g. 'Courier', 'Air freight'
  annualCostUsd: number
  // WHO GCT: % of cost attributed to sequencing (0–100; default 100)
  pctSequencing?: number
}

export interface Project {
  id: string
  name: string
  country: string
  year: number
  pathogens: PathogenEntry[]
  // Feature 6: dual sequencer (replaces singular sequencer)
  sequencers: SequencerConfig[]
  consumables: Array<{
    name: string
    unitCostUsd: number
    quantityPerSample: number
    enabled: boolean
    workflows?: Partial<Record<ConsumableWorkflowStep, boolean>>
  }>
  equipment: EquipmentItem[]
  personnel: PersonnelItem[]
  facility: FacilityItem[]
  transport: TransportItem[]
  bioinformatics: BioinformaticsConfig
  qms: QMSItem[]
  exchangeRate: number
  currency: string
  // WHO GCT: group-level training cost (not per-person)
  trainingGroupCostUsd: number
  // WHO GCT: admin overhead % applied to personnel + training subtotal
  adminCostPct: number
  // WHO GCT: single global % of facility attributed to sequencing (0–100)
  facilityPctSequencing: number
}

export interface CostBreakdown {
  sequencingReagents: number
  libraryPrep: number
  consumables: number
  equipment: number       // annualised (depreciation + maintenance)
  incidentals: number     // 7% of reagent/consumable costs
  establishmentCost: number  // one-off
  personnel: number
  facility: number
  transport: number
  bioinformatics: number
  qms: number
  training: number
  adminCost: number       // admin overhead % applied to personnel + training
  total: number
  costPerSample: number
  // Feature 5: workflow breakdown
  workflowBreakdown: Record<string, number>
  // Per-sequencer reagent costs (for Step 7 category table)
  perSequencerReagents: Array<{ label: string; reagents: number; libraryPrep: number }>
  // Potential purchases to reach recommended equipment quantities
  potentialPurchases: number
}
