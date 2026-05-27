/**
 * Import a WHO Genomics Costing Tool Excel workbook (.xlsx) into the app's
 * Project data model. Reads positional cell addresses from each sheet and
 * maps them to the equivalent fields in our Project type.
 *
 * The Excel file has no named ranges — everything is positional. Variable-
 * length sections are scanned until the name cell is empty.
 */
import type XLSX from 'xlsx'
import type {
  Project,
  SequencerConfig,
  PathogenEntry,
  EquipmentItem,
  PersonnelItem,
  FacilityItem,
  TransportItem,
  BioCloudItem,
  BioInhouseItem,
  QMSItem,
  FixedConsumableItem,
  ConsumableWorkflowStep,
  BioinformaticsConfig,
} from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read a cell value, returning undefined if the cell is missing or empty. */
function cell(ws: XLSX.WorkSheet, addr: string): unknown {
  const c = ws[addr]
  if (!c) return undefined
  const v = c.v
  if (v === '' || v === undefined || v === null) return undefined
  return v
}

/** Read a cell as a string, or return the fallback. */
function str(ws: XLSX.WorkSheet, addr: string, fallback = ''): string {
  const v = cell(ws, addr)
  if (v === undefined) return fallback
  return String(v)
}

/** Read a cell as a number, or return the fallback. */
function num(ws: XLSX.WorkSheet, addr: string, fallback = 0): number {
  const v = cell(ws, addr)
  if (v === undefined) return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

/**
 * Convert a decimal percentage (0.2) to an integer percentage (20).
 * If the value is already > 1, assume it is already in integer form.
 */
function pctToInt(v: number): number {
  if (v > 1) return Math.round(v)
  return Math.round(v * 100)
}

/** Map "Yes"/"No"/blank to boolean. */
function yesNo(ws: XLSX.WorkSheet, addr: string): boolean {
  const v = str(ws, addr).toLowerCase()
  return v === 'yes' || v === 'y'
}

/** Build a workflows record from Yes/No flags in columns B-F. */
function readWorkflowFlags(ws: XLSX.WorkSheet, row: number): Partial<Record<ConsumableWorkflowStep, boolean>> | undefined {
  const steps: ConsumableWorkflowStep[] = [
    'sample_receipt',
    'nucleic_acid_extraction',
    'pcr_testing',
    'ngs_library_preparation',
    'sequencing',
  ]
  // Columns B(1), C(2), D(3), E(4), F(5) → 0-indexed in encode_cell
  const result: Partial<Record<ConsumableWorkflowStep, boolean>> = {}
  let anySet = false
  for (let i = 0; i < steps.length; i++) {
    const col = i + 1 // B=1, C=2, D=3, E=4, F=5
    const addr = encodeCell(row, col)
    const v = str(ws, addr).toLowerCase()
    if (v === 'yes' || v === 'y') {
      result[steps[i]] = true
      anySet = true
    }
  }
  return anySet ? result : undefined
}

/** Encode a 0-indexed row and col into a cell address like "A1". */
function encodeCell(row: number, col: number): string {
  let colStr = ''
  let c = col
  while (c >= 0) {
    colStr = String.fromCharCode(65 + (c % 26)) + colStr
    c = Math.floor(c / 26) - 1
  }
  return colStr + (row + 1)
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Platform ID mapping ──────────────────────────────────────────────────────

/** Map the Excel platform name to the app's platformId. */
function mapPlatformId(platformName: string): string {
  const lower = platformName.toLowerCase()
  if (lower.includes('illumina') || lower.includes('miseq') || lower.includes('nextseq') || lower.includes('iseq') || lower.includes('novaseq') || lower.includes('miniseq')) return 'illumina'
  if (lower.includes('ont') || lower.includes('minion') || lower.includes('gridion') || lower.includes('promethion') || lower.includes('nanopore')) return 'ont'
  if (lower.includes('thermofisher') || lower.includes('ion') || lower.includes('genexus')) return 'thermofisher'
  if (lower.includes('mgi') || lower.includes('dnbseq')) return 'mgi'
  return 'illumina' // sensible default
}

/** Map the Excel equipment status to the app's EquipmentStatus. */
function mapEquipmentStatus(value: string): 'buy' | 'have' | 'skip' {
  const lower = value.trim().toLowerCase()
  if (lower === 'buy') return 'buy'
  if (lower === 'have') return 'have'
  return 'skip'
}

/** Map the bioinformatics type string from the Excel to the app's type. */
function mapBioType(value: string): 'cloud' | 'inhouse' | 'hybrid' | 'none' {
  const lower = value.toLowerCase()
  if (lower.includes('hybrid')) return 'hybrid'
  if (lower.includes('cloud')) return 'cloud'
  if (lower.includes('in-house') || lower.includes('inhouse')) return 'inhouse'
  return 'none'
}

// ── Sheet parsers ────────────────────────────────────────────────────────────

function parseDataEntry(wb: XLSX.WorkBook): {
  name: string
  country: string
  year: number
  pathogens: PathogenEntry[]
  sequencers: Partial<SequencerConfig>[]
  bioinformaticsType: 'cloud' | 'inhouse' | 'hybrid' | 'none'
} {
  const ws = wb.Sheets['Data entry']
  if (!ws) {
    return {
      name: '',
      country: '',
      year: 2025,
      pathogens: [],
      sequencers: [],
      bioinformaticsType: 'hybrid',
    }
  }

  const name = str(ws, 'C8')
  const country = str(ws, 'C9')
  const year = num(ws, 'C10', 2025)

  // Sequencer 1: columns B/C/D (row offsets from the Excel)
  // Sequencer 2: columns E/F/G
  const pathogens: PathogenEntry[] = []
  const sequencers: Partial<SequencerConfig>[] = []

  // Parse each sequencer column pair
  for (const seq of [
    { colType: 'C', colVal: 'C', colExtra: 'D', colSpec: 'C', label: 'Sequencer 1', idx: 0 },
    { colType: 'F', colVal: 'F', colExtra: 'G', colSpec: 'F', label: 'Sequencer 2', idx: 1 },
  ]) {
    const pathogenType = str(ws, seq.colType + '13').toLowerCase()
    const pathogenName = str(ws, seq.colType + '14')

    // Skip this sequencer column if no pathogen is set
    if (!pathogenName && !pathogenType) continue

    const genomeSizeMb = num(ws, seq.colType + '15')
    const samplesPerYear = num(ws, seq.colType + '16')

    if (pathogenName || samplesPerYear > 0) {
      pathogens.push({
        pathogenName: pathogenName || 'Unknown',
        pathogenType: pathogenType.includes('viral') ? 'viral' : 'bacterial',
        genomeSizeMb: genomeSizeMb || 5,
        samplesPerYear: samplesPerYear || 100,
      })
    }

    const platformName = str(ws, seq.colType + '17')
    const reagentKitName = str(ws, seq.colType + '18')
    const coverageX = num(ws, seq.colType + '19')
    const bufferRaw = num(ws, seq.colType + '20')
    const bufferPct = pctToInt(bufferRaw)
    const libPrepKitName = str(ws, seq.colType + '21')
    const enrichment = yesNo(ws, seq.colType + '22')
    const retestRaw = num(ws, seq.colType + '23')
    const retestPct = pctToInt(retestRaw)
    const controlsPerRun = num(ws, seq.colType + '27', 2)
    const avgSamplesPerRun = num(ws, seq.colType + '26')

    // Custom kit specs (rows 36-41, only for the appropriate column)
    const specCol = seq.colSpec
    const customMaxBarcodes = num(ws, specCol + '36')
    const customBarcodesPerPack = num(ws, specCol + '37')
    const customMaxOutputBytes = num(ws, specCol + '38')
    const customReadLengthBp = num(ws, specCol + '39')
    const customKitPacksPerRun = num(ws, specCol + '40')

    const seqConfig: Partial<SequencerConfig> = {
      platformId: mapPlatformId(platformName),
      reagentKitName: reagentKitName || 'Other sequencing kit',
      reagentKitPrice: 0, // not stored in Data entry sheet; resolved by catalogue
      coverageX: coverageX || 50,
      bufferPct: bufferPct || 20,
      retestPct: retestPct || 5,
      libPrepKitName: libPrepKitName || 'Other library preparation kit',
      libPrepCostPerSample: 0,
      enrichment,
      controlsPerRun,
      enabled: true,
      label: seq.label,
      captureAll: false,
      minReadsPerSample: 100_000,
      samplesPerRun: 0,
      assignments: [],
    }

    // Attach avgSamplesPerRun if specified
    if (avgSamplesPerRun > 0) {
      seqConfig.avgSamplesPerRun = avgSamplesPerRun
    }

    // Attach custom kit specs if the kit is "Other"
    if (reagentKitName.toLowerCase().includes('other')) {
      if (customMaxOutputBytes > 0) {
        seqConfig.customKitMaxOutputMb = customMaxOutputBytes / 1_000_000
      }
      if (customReadLengthBp > 0) seqConfig.customKitReadLengthBp = customReadLengthBp
      if (customKitPacksPerRun > 0) seqConfig.customKitPacksPerRun = customKitPacksPerRun
    }
    if (libPrepKitName.toLowerCase().includes('other')) {
      if (customMaxBarcodes > 0) seqConfig.customLibPrepMaxBarcodes = customMaxBarcodes
      if (customBarcodesPerPack > 0) seqConfig.customLibPrepBarcodesPerPack = customBarcodesPerPack
    }

    sequencers.push(seqConfig)
  }

  // Bioinformatics type from C32
  const bioTypeStr = str(ws, 'C32')
  const bioinformaticsType = mapBioType(bioTypeStr)

  return { name, country, year, pathogens, sequencers, bioinformaticsType }
}

function parseReagentsAndConsumables(wb: XLSX.WorkBook): FixedConsumableItem[] {
  const ws = wb.Sheets['Reagents and consumables']
  if (!ws) return []

  // The sheet has two blocks:
  // Block 1: rows 5-26 (0-indexed: 4-25) — sequencer-specific reagents (auto-calculated, skip)
  // Block 2: rows 29 onwards (0-indexed: 28+) — fixed annual consumables
  // Header row is 27 (0-indexed), data starts at row 29 (0-indexed: 28)
  const items: FixedConsumableItem[] = []

  for (let r = 28; r <= 120; r++) {
    const itemName = str(ws, encodeCell(r, 7)) // col H (index 7) = name
    if (!itemName) continue // sentinel: stop at empty name

    const quantity = num(ws, encodeCell(r, 8)) // col I = quantity
    const unitCost = num(ws, encodeCell(r, 9)) // col J = unit price

    const workflows = readWorkflowFlags(ws, r)

    items.push({
      name: itemName,
      unitCostUsd: unitCost,
      quantityPerYear: quantity,
      enabled: true,
      workflows,
    })
  }

  return items
}

function parseEquipment(wb: XLSX.WorkBook): EquipmentItem[] {
  const ws = wb.Sheets['Equipment']
  if (!ws) return []

  // Data rows start at row 5 (0-indexed: 4). Scan until col G (name) is empty.
  // Col A (0) = status (Buy/Have/blank)
  // Col G (6) = name
  // Col I (8) = quantity
  // Col J (9) = unit cost
  // Col L (11) = lifespan (years)
  // Col M (12) = age (years)
  // Col P (15) = % sequencing
  const items: EquipmentItem[] = []

  for (let r = 4; r <= 100; r++) {
    const itemName = str(ws, encodeCell(r, 6)) // col G
    if (!itemName) continue // skip rows with no name (but keep scanning)

    const statusStr = str(ws, encodeCell(r, 0)) // col A
    const status = mapEquipmentStatus(statusStr)

    // If no status flag and no quantity, it's likely a skippable row
    const quantity = num(ws, encodeCell(r, 8)) // col I
    const unitCost = num(ws, encodeCell(r, 9)) // col J
    const lifespanYears = num(ws, encodeCell(r, 11), 10) // col L
    const ageYears = num(ws, encodeCell(r, 12)) // col M
    const pctSequencingRaw = num(ws, encodeCell(r, 15), 1) // col P — stored as decimal in some cells
    const pctSequencing = pctSequencingRaw <= 1 && pctSequencingRaw > 0 ? pctToInt(pctSequencingRaw) : pctSequencingRaw

    // Determine category from workflow flags or default to lab_equipment
    let category = 'lab_equipment'
    const seqFlag = str(ws, encodeCell(r, 5)).toLowerCase() // col F = sequencing
    if (seqFlag === 'yes' || seqFlag === 'y') {
      // Check if it looks like a sequencing platform by name
      const lowerName = itemName.toLowerCase()
      if (lowerName.includes('miseq') || lowerName.includes('nextseq') || lowerName.includes('iseq') ||
          lowerName.includes('novaseq') || lowerName.includes('minion') || lowerName.includes('gridion') ||
          lowerName.includes('promethion') || lowerName.includes('genexus') || lowerName.includes('sequencer') ||
          lowerName.includes('dnbseq')) {
        category = 'sequencing_platform'
      }
    }

    items.push({
      name: itemName,
      category,
      status: status === 'skip' && quantity > 0 ? 'have' : status,
      quantity: quantity || (status === 'buy' ? 1 : 0),
      unitCostUsd: unitCost,
      lifespanYears: lifespanYears || 10,
      ageYears,
      pctSequencing: pctSequencing || 100,
    })
  }

  return items
}

function parsePersonnel(wb: XLSX.WorkBook): {
  personnel: PersonnelItem[]
  trainingGroupCostUsd: number
  adminCostPct: number
} {
  const ws = wb.Sheets['Personnel and training']
  if (!ws) return { personnel: [], trainingGroupCostUsd: 5000, adminCostPct: 0 }

  // Roles in rows 5-39 (0-indexed: 4-38), col B=role, C=salary, D=% time
  const personnel: PersonnelItem[] = []
  for (let r = 4; r <= 38; r++) {
    const role = str(ws, encodeCell(r, 1)) // col B
    if (!role) continue

    const salary = num(ws, encodeCell(r, 2)) // col C
    const pctTimeRaw = num(ws, encodeCell(r, 3)) // col D — stored as decimal (0.1 = 10%)
    const pctTime = pctToInt(pctTimeRaw)

    personnel.push({
      role,
      annualSalaryUsd: salary,
      pctTime,
    })
  }

  // Admin cost % at B41 (0-indexed row 40)
  const adminRaw = num(ws, 'B41')
  const adminCostPct = pctToInt(adminRaw)

  // Training cost at E41 (0-indexed row 40)
  const trainingGroupCostUsd = num(ws, 'E41', 5000)

  return { personnel, trainingGroupCostUsd, adminCostPct }
}

function parseFacilityAndTransport(wb: XLSX.WorkBook): {
  facility: FacilityItem[]
  facilityPctSequencing: number
  transport: TransportItem[]
} {
  const ws = wb.Sheets['Facility and transport']
  if (!ws) return { facility: [], facilityPctSequencing: 100, transport: [] }

  // Facility: rows 7-18 (0-indexed: 6-17), col B=label, C=monthly cost
  const facility: FacilityItem[] = []
  for (let r = 6; r <= 20; r++) {
    const label = str(ws, encodeCell(r, 1)) // col B
    if (!label) continue
    const monthlyCost = num(ws, encodeCell(r, 2)) // col C
    facility.push({
      label,
      monthlyCostUsd: monthlyCost,
      pctSequencing: 100, // individual items don't have pct in Excel; the global pct is at E8
    })
  }

  // Global % sequencing at E8 (0-indexed row 7, col 4 = E) — stored as decimal
  const facPctRaw = num(ws, 'G8', 1) // actually stored in G8 in the demo
  const facilityPctSequencing = pctToInt(facPctRaw)

  // Transport: rows 25-44 (0-indexed: 24-43), col E=label, F=method, G=annual cost, H=% sequencing
  const transport: TransportItem[] = []
  for (let r = 24; r <= 43; r++) {
    const label = str(ws, encodeCell(r, 4)) // col E
    if (!label) continue
    const shipmentMethod = str(ws, encodeCell(r, 5)) // col F
    const annualCost = num(ws, encodeCell(r, 6)) // col G
    const pctSeqRaw = num(ws, encodeCell(r, 7)) // col H — stored as decimal
    const pctSequencing = pctToInt(pctSeqRaw)

    transport.push({
      label,
      shipmentMethod: shipmentMethod || undefined,
      annualCostUsd: annualCost,
      pctSequencing: pctSequencing || 100,
    })
  }

  return { facility, facilityPctSequencing, transport }
}

function parseBioinformatics(
  wb: XLSX.WorkBook,
  bioType: 'cloud' | 'inhouse' | 'hybrid' | 'none',
): BioinformaticsConfig {
  const ws = wb.Sheets['Bioinformatics']
  if (!ws) {
    return { type: bioType, cloudItems: [], inhouseItems: [] }
  }

  // Cloud items: rows 7-21 (0-indexed: 6-20)
  // A=name, B=description, C=price/unit, D=quantity, E=total samples, F=costed samples
  const cloudItems: BioCloudItem[] = []
  for (let r = 6; r <= 21; r++) {
    const name = str(ws, encodeCell(r, 0)) // col A
    if (!name) continue
    const description = str(ws, encodeCell(r, 1)) // col B
    const pricePerUnit = num(ws, encodeCell(r, 2)) // col C
    const quantity = num(ws, encodeCell(r, 3)) // col D
    const totalSamples = num(ws, encodeCell(r, 4)) // col E
    const samplesThisScenario = num(ws, encodeCell(r, 5)) // col F

    cloudItems.push({
      name,
      description,
      pricePerUnit,
      quantity,
      totalSamplesAllPathogens: totalSamples,
      samplesThisScenario,
      enabled: pricePerUnit > 0 || quantity > 0,
    })
  }

  // In-house items: rows 28-60 (0-indexed: 27-59)
  // A=name, B=description, C=price, D=quantity, E=% use, G=lifespan, H=age
  // Note: the Excel groups sub-components under a top-level item. We only
  // import rows that have a value in col A (the top-level component name).
  const inhouseItems: BioInhouseItem[] = []
  for (let r = 27; r <= 66; r++) {
    const name = str(ws, encodeCell(r, 0)) // col A
    if (!name) continue
    const description = str(ws, encodeCell(r, 1)) // col B
    const pricePerUnit = num(ws, encodeCell(r, 2)) // col C
    const quantity = num(ws, encodeCell(r, 3)) // col D
    const pctUseRaw = num(ws, encodeCell(r, 4), 1) // col E — decimal or integer
    const pctUse = pctUseRaw <= 1 && pctUseRaw > 0 ? pctToInt(pctUseRaw) : (pctUseRaw > 1 ? Math.round(pctUseRaw) : 100)
    const lifespanYears = num(ws, encodeCell(r, 6), 5) // col G
    const ageYears = num(ws, encodeCell(r, 7)) // col H

    inhouseItems.push({
      name: name.trim(),
      description,
      pricePerUnit,
      quantity,
      pctUse,
      lifespanYears: lifespanYears || 5,
      ageYears,
      enabled: pricePerUnit > 0 || quantity > 0,
    })
  }

  return {
    type: bioType,
    cloudItems,
    inhouseItems,
  }
}

function parseQualityManagement(wb: XLSX.WorkBook): QMSItem[] {
  const ws = wb.Sheets['Quality management']
  if (!ws) return []

  // Rows 5-20 (0-indexed: 4-19): B=activity, C=cost, D=quantity, E=% sequencing
  const items: QMSItem[] = []
  for (let r = 4; r <= 21; r++) {
    const activity = str(ws, encodeCell(r, 1)) // col B
    if (!activity) continue
    const costUsd = num(ws, encodeCell(r, 2)) // col C
    const quantity = num(ws, encodeCell(r, 3)) // col D
    const pctSeqRaw = num(ws, encodeCell(r, 4)) // col E — stored as decimal
    const pctSequencing = pctSeqRaw > 0 ? pctToInt(pctSeqRaw) : 85 // default 85%

    items.push({
      activity,
      costUsd,
      quantity,
      pctSequencing,
      enabled: costUsd > 0 || quantity > 0,
    })
  }

  return items
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Parse a WHO GCT Excel workbook into a partial Project object.
 * The result is passed through migrateProject in ProjectContext so missing
 * fields are backfilled with defaults.
 */
export function parseGctWorkbook(wb: XLSX.WorkBook): Partial<Project> {
  const dataEntry = parseDataEntry(wb)
  const fixedConsumables = parseReagentsAndConsumables(wb)
  const equipment = parseEquipment(wb)
  const { personnel, trainingGroupCostUsd, adminCostPct } = parsePersonnel(wb)
  const { facility, facilityPctSequencing, transport } = parseFacilityAndTransport(wb)
  const bioinformatics = parseBioinformatics(wb, dataEntry.bioinformaticsType)
  const qms = parseQualityManagement(wb)

  // Build full sequencer configs from the partial ones
  const sequencers: SequencerConfig[] = dataEntry.sequencers.map((partial, i) => ({
    platformId: partial.platformId || 'illumina',
    reagentKitName: partial.reagentKitName || 'Other sequencing kit',
    reagentKitPrice: partial.reagentKitPrice || 0,
    samplesPerRun: partial.samplesPerRun || 0,
    coverageX: partial.coverageX || 50,
    bufferPct: partial.bufferPct || 20,
    retestPct: partial.retestPct || 5,
    libPrepKitName: partial.libPrepKitName || 'Other library preparation kit',
    libPrepCostPerSample: partial.libPrepCostPerSample || 0,
    enrichment: partial.enrichment || false,
    controlsPerRun: partial.controlsPerRun ?? 2,
    enabled: true,
    label: partial.label || `Sequencer ${i + 1}`,
    captureAll: partial.captureAll || false,
    minReadsPerSample: partial.minReadsPerSample || 100_000,
    assignments: [],
    ...(partial.avgSamplesPerRun ? { avgSamplesPerRun: partial.avgSamplesPerRun } : {}),
    ...(partial.customKitMaxOutputMb ? { customKitMaxOutputMb: partial.customKitMaxOutputMb } : {}),
    ...(partial.customKitReadLengthBp ? { customKitReadLengthBp: partial.customKitReadLengthBp } : {}),
    ...(partial.customKitPacksPerRun ? { customKitPacksPerRun: partial.customKitPacksPerRun } : {}),
    ...(partial.customLibPrepMaxBarcodes ? { customLibPrepMaxBarcodes: partial.customLibPrepMaxBarcodes } : {}),
    ...(partial.customLibPrepBarcodesPerPack ? { customLibPrepBarcodesPerPack: partial.customLibPrepBarcodesPerPack } : {}),
  }))

  // Wire up assignments: each sequencer gets its corresponding pathogen
  for (let i = 0; i < sequencers.length && i < dataEntry.pathogens.length; i++) {
    sequencers[i].assignments = [{
      pathogenIndex: i,
      samples: dataEntry.pathogens[i].samplesPerYear,
    }]
  }

  // Count imported fields for the toast message
  let fieldCount = 0
  if (dataEntry.name) fieldCount++
  if (dataEntry.country) fieldCount++
  if (dataEntry.year !== 2025) fieldCount++
  fieldCount += dataEntry.pathogens.length
  fieldCount += sequencers.length
  fieldCount += fixedConsumables.length
  fieldCount += equipment.length
  fieldCount += personnel.length
  fieldCount += facility.length
  fieldCount += transport.length
  fieldCount += bioinformatics.cloudItems.length + bioinformatics.inhouseItems.length
  fieldCount += qms.length

  return {
    id: randomId(),
    name: dataEntry.name || 'Imported WHO GCT project',
    country: dataEntry.country,
    year: dataEntry.year,
    pathogens: dataEntry.pathogens,
    sequencers,
    consumables: [], // per-sample consumables start empty; user builds from catalogue
    fixedConsumables,
    equipment,
    personnel,
    facility,
    transport,
    bioinformatics,
    qms,
    exchangeRate: 1,
    currency: 'USD',
    trainingGroupCostUsd,
    adminCostPct,
    facilityPctSequencing,
    maintenancePct: 15,
    incidentalsPct: 7,
    _importedFieldCount: fieldCount,
  } as Partial<Project> & { _importedFieldCount: number }
}
