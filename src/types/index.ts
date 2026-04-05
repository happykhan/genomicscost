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

export interface CatalogueReagent {
  name: string
  category: string
  pack_size: number | null
  quantity_per_sample: number
  workflow: string
  unit_price_usd?: number | null
}

export interface CatalogueEquipment {
  name: string
  category: string
  workflow_step: string
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
}

export type EquipmentStatus = 'buy' | 'have' | 'skip'

export interface EquipmentItem {
  name: string
  category: string
  status: EquipmentStatus
  quantity: number
  unitCostUsd: number
}

export interface PersonnelItem {
  role: string
  annualSalaryUsd: number
  pctTime: number  // 0-100
}

export interface FacilityItem {
  label: string
  monthlyCostUsd: number
  pctSequencing: number  // 0-100
}

export interface BioinformaticsConfig {
  type: 'cloud' | 'inhouse' | 'hybrid' | 'none'
  cloudPlatform: string
  costPerSampleUsd: number
  annualServerCostUsd: number
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
  annualCostUsd: number
}

export interface Project {
  id: string
  name: string
  country: string
  year: number
  pathogenType: 'viral' | 'bacterial' | ''
  pathogenName: string
  genomeSizeMb: number
  samplesPerYear: number
  sequencer: SequencerConfig
  consumables: Array<{ name: string; unitCostUsd: number; quantityPerSample: number; enabled: boolean }>
  equipment: EquipmentItem[]
  personnel: PersonnelItem[]
  facility: FacilityItem[]
  transport: TransportItem[]
  bioinformatics: BioinformaticsConfig
  qms: QMSItem[]
  exchangeRate: number
  currency: string
}

export interface CostBreakdown {
  sequencingReagents: number
  libraryPrep: number
  consumables: number
  equipment: number       // annualised
  establishmentCost: number  // one-off
  personnel: number
  facility: number
  transport: number
  bioinformatics: number
  qms: number
  total: number
  costPerSample: number
}
