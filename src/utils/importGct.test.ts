import { describe, it, expect } from 'vitest'
import { parseGctWorkbook } from './importGct'
import type XLSX from 'xlsx'

// ── Mock workbook builder ────────────────────────────────────────────────────

type CellValue = string | number | undefined
interface MockSheet {
  [addr: string]: { v: CellValue; t: string } | undefined
}

function mockSheet(cells: Record<string, CellValue>): MockSheet {
  const ws: MockSheet = {}
  for (const [addr, value] of Object.entries(cells)) {
    if (value !== undefined) {
      ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' }
    }
  }
  return ws
}

function mockWorkbook(sheets: Record<string, Record<string, CellValue>>): XLSX.WorkBook {
  const Sheets: Record<string, MockSheet> = {}
  for (const [name, cells] of Object.entries(sheets)) {
    Sheets[name] = mockSheet(cells)
  }
  return {
    SheetNames: Object.keys(sheets),
    Sheets,
  } as unknown as XLSX.WorkBook
}

// ── Data entry parsing ───────────────────────────────────────────────────────

describe('parseGctWorkbook — Data entry', () => {
  it('parses lab name, country and year', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C8: 'National Reference Lab',
        C9: 'Kenya',
        C10: 2026,
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.name).toBe('National Reference Lab')
    expect(result.country).toBe('Kenya')
    expect(result.year).toBe(2026)
  })

  it('parses pathogen and sequencer from Sequencer 1 columns', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Salmonella spp.',
        C15: 4.8,
        C16: 500,
        C17: 'Illumina MiSeq',
        C18: 'MiSeq Reagent Kit v2 (300 cycle)',
        C19: 50,
        C20: 0.3,   // 30% as decimal
        C21: 'Illumina DNA Prep, (M) Tagmentation (96 Samples, IPB)',
        C22: 'No',
        C23: 0.05,   // 5% as decimal
        C27: 2,
        C26: 10,
      },
    })
    const result = parseGctWorkbook(wb)

    expect(result.pathogens).toHaveLength(1)
    expect(result.pathogens![0].pathogenName).toBe('Salmonella spp.')
    expect(result.pathogens![0].pathogenType).toBe('bacterial')
    expect(result.pathogens![0].genomeSizeMb).toBe(4.8)
    expect(result.pathogens![0].samplesPerYear).toBe(500)

    expect(result.sequencers).toHaveLength(1)
    expect(result.sequencers![0].platformId).toBe('illumina')
    expect(result.sequencers![0].reagentKitName).toBe('MiSeq Reagent Kit v2 (300 cycle)')
    expect(result.sequencers![0].coverageX).toBe(50)
    expect(result.sequencers![0].bufferPct).toBe(30)
    expect(result.sequencers![0].retestPct).toBe(5)
    expect(result.sequencers![0].enrichment).toBe(false)
    expect(result.sequencers![0].controlsPerRun).toBe(2)
    expect(result.sequencers![0].avgSamplesPerRun).toBe(10)
  })

  it('parses two sequencers and two pathogens', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Salmonella spp.',
        C15: 4.8,
        C16: 500,
        C17: 'Illumina MiSeq',
        C18: 'MiSeq Reagent Kit v2 (300 cycle)',
        C19: 50,
        C20: 0.3,
        C21: 'Illumina DNA Prep',
        C22: 'No',
        C23: 0.05,
        C27: 2,
        F13: 'Bacterial',
        F14: 'Escherichia coli',
        F15: 5.0,
        F16: 300,
        F17: 'ONT GridION',
        F18: 'Other sequencing kit',
        F19: 50,
        F20: 0.3,
        F21: 'Other library preparation kit',
        F22: 'No',
        F23: 0.02,
        F27: 2,
        F36: 384,
        F37: 96,
        F38: 180000000000,
        F39: 10000,
        F40: 1,
      },
    })
    const result = parseGctWorkbook(wb)

    expect(result.pathogens).toHaveLength(2)
    expect(result.pathogens![1].pathogenName).toBe('Escherichia coli')

    expect(result.sequencers).toHaveLength(2)
    expect(result.sequencers![0].platformId).toBe('illumina')
    expect(result.sequencers![1].platformId).toBe('ont')
    expect(result.sequencers![1].customLibPrepMaxBarcodes).toBe(384)
    expect(result.sequencers![1].customLibPrepBarcodesPerPack).toBe(96)
    expect(result.sequencers![1].customKitMaxOutputMb).toBe(180000)
    expect(result.sequencers![1].customKitReadLengthBp).toBe(10000)
  })
})

// ── Percentage decimal conversion ────────────────────────────────────────────

describe('parseGctWorkbook — percentage conversion', () => {
  it('converts buffer % from decimal (0.2 → 20)', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Viral',
        C14: 'SARS-CoV-2',
        C15: 0.03,
        C16: 200,
        C17: 'Illumina iSeq',
        C18: 'iSeq 100 Kit',
        C19: 100,
        C20: 0.2,  // should become 20
        C21: 'Some kit',
        C23: 0.05, // should become 5
        C27: 2,
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.sequencers![0].bufferPct).toBe(20)
    expect(result.sequencers![0].retestPct).toBe(5)
  })

  it('converts personnel % time from decimal (0.3 → 30)', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Personnel and training': {
        B5: 'Bioinformatician',
        C5: 12000,
        D5: 0.3,  // should become 30
        B41: 0.1,  // admin 10%
        E41: 5000,
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.personnel![0].pctTime).toBe(30)
    expect(result.adminCostPct).toBe(10)
  })

  it('converts facility % sequencing from decimal (0.2 → 20)', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Facility and transport': {
        B7: 'Rent',
        C7: 500,
        G8: 0.2,  // 20% sequencing
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.facilityPctSequencing).toBe(20)
  })
})

// ── Equipment status mapping ─────────────────────────────────────────────────

describe('parseGctWorkbook — Equipment', () => {
  it('maps "Buy" → buy, "Have" → have, blank → skip', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Equipment': {
        A5: 'Buy',
        G5: 'PCR workstation',
        I5: 2,
        J5: 3837.57,
        L5: 10,
        M5: 0,
        P5: 1,
        A6: 'Have',
        G6: 'Vortex',
        I6: 1,
        J6: 351,
        L6: 10,
        M6: 3,
        P6: 0.5,
        // Row 7: no A column → skip
        G7: 'Fluorometer, strip tube capable',
        J7: 6600,
        L7: 10,
      },
    })
    const result = parseGctWorkbook(wb)

    expect(result.equipment!.length).toBe(3)
    expect(result.equipment![0].name).toBe('PCR workstation')
    expect(result.equipment![0].status).toBe('buy')
    expect(result.equipment![0].quantity).toBe(2)
    expect(result.equipment![0].unitCostUsd).toBe(3837.57)
    expect(result.equipment![0].lifespanYears).toBe(10)

    expect(result.equipment![1].name).toBe('Vortex')
    expect(result.equipment![1].status).toBe('have')
    expect(result.equipment![1].pctSequencing).toBe(50)

    expect(result.equipment![2].name).toBe('Fluorometer, strip tube capable')
    expect(result.equipment![2].status).toBe('skip')
  })
})

// ── Variable-length row scanning ─────────────────────────────────────────────

describe('parseGctWorkbook — variable-length scanning', () => {
  it('stops scanning reagents at empty name cell', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Reagents and consumables': {
        // Row 29 (0-indexed 28)
        B29: 'Yes',
        G29: 'Consumable',
        H29: 'Cold packs (24-pck)',
        I29: 2,
        J29: 180,
        // Row 30
        B30: 'No',
        C30: 'Yes',
        G30: 'Reagent',
        H30: 'RNA extraction kit (250 reactions)',
        I30: 3,
        J30: 723,
        // Row 31: empty name → sentinel
        H31: '',
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.fixedConsumables!.length).toBe(2)
    expect(result.fixedConsumables![0].name).toBe('Cold packs (24-pck)')
    expect(result.fixedConsumables![0].quantityPerYear).toBe(2)
    expect(result.fixedConsumables![0].unitCostUsd).toBe(180)
    expect(result.fixedConsumables![1].name).toBe('RNA extraction kit (250 reactions)')
  })

  it('parses workflow flags for consumables (Yes/No in B-F)', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Reagents and consumables': {
        B29: 'No',
        C29: 'Yes',
        D29: 'Yes',
        E29: 'Yes',
        F29: 'Yes',
        H29: 'Pipette filter tips 10uL',
        I29: 5,
        J29: 185,
      },
    })
    const result = parseGctWorkbook(wb)
    const item = result.fixedConsumables![0]
    expect(item.workflows).toBeDefined()
    expect(item.workflows!.sample_receipt).toBeUndefined()
    expect(item.workflows!.nucleic_acid_extraction).toBe(true)
    expect(item.workflows!.pcr_testing).toBe(true)
    expect(item.workflows!.ngs_library_preparation).toBe(true)
    expect(item.workflows!.sequencing).toBe(true)
  })

  it('scans QMS rows and stops at empty activity', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Quality management': {
        B5: 'Annual BSC certification',
        C5: 300,
        D5: 1,
        E5: 0.5,
        B6: 'Internal quality control material',
        C6: 200,
        D6: 2,
        E6: 0.1,
        // Row 7 empty → done
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.qms!.length).toBe(2)
    expect(result.qms![0].activity).toBe('Annual BSC certification')
    expect(result.qms![0].costUsd).toBe(300)
    expect(result.qms![0].quantity).toBe(1)
    expect(result.qms![0].pctSequencing).toBe(50)
    expect(result.qms![1].pctSequencing).toBe(10)
  })
})

// ── Transport parsing ────────────────────────────────────────────────────────

describe('parseGctWorkbook — Transport', () => {
  it('parses transport items with % sequencing conversion', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 100,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.2,
        C21: 'Prep',
        C27: 2,
      },
      'Facility and transport': {
        E25: 'Regional to national reference laboratory',
        F25: 'Courier',
        G25: 1000,
        H25: 0.15,  // 15%
        E26: 'Insurance (if applicable)',
        G26: 500,
        H26: 1,     // 100% (already > 1, so treated as integer)
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.transport!.length).toBe(2)
    expect(result.transport![0].label).toBe('Regional to national reference laboratory')
    expect(result.transport![0].shipmentMethod).toBe('Courier')
    expect(result.transport![0].annualCostUsd).toBe(1000)
    expect(result.transport![0].pctSequencing).toBe(15)
    expect(result.transport![1].pctSequencing).toBe(100)
  })
})

// ── Bioinformatics parsing ───────────────────────────────────────────────────

describe('parseGctWorkbook — Bioinformatics', () => {
  it('parses cloud items from rows 7-21', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 800,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.3,
        C21: 'Prep',
        C27: 2,
        C32: 'Hybrid, in-house and cloud-based',
      },
      'Bioinformatics': {
        A7: 'Illumina BaseSpace software and cloud storage',
        B7: 'Single user annual licence',
        C7: 500,
        D7: 1,
        E7: 1600,
        F7: 500,
        A8: 'Illumina BaseSpace additional cloud storage',
        B8: 'Extra storage',
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.bioinformatics!.type).toBe('hybrid')
    expect(result.bioinformatics!.cloudItems.length).toBe(2)
    expect(result.bioinformatics!.cloudItems[0].name).toBe('Illumina BaseSpace software and cloud storage')
    expect(result.bioinformatics!.cloudItems[0].pricePerUnit).toBe(500)
    expect(result.bioinformatics!.cloudItems[0].enabled).toBe(true)
    expect(result.bioinformatics!.cloudItems[1].enabled).toBe(false)
  })

  it('parses in-house items from rows 28-60', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Test',
        C16: 800,
        C17: 'Illumina',
        C18: 'Kit',
        C19: 50,
        C20: 0.3,
        C21: 'Prep',
        C27: 2,
        C32: 'In-house computing',
      },
      'Bioinformatics': {
        A28: 'High-processing server',
        B28: 'Server for bioinformatic storage',
        G28: 5,
        H28: 1,
        A43: 'Low/mid processing workstation',
        B43: 'Computer workstation',
        C43: 7028,
        D43: 1,
        E43: 1,
        G43: 5,
        H43: 2,
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.bioinformatics!.type).toBe('inhouse')
    expect(result.bioinformatics!.inhouseItems.length).toBe(2)
    expect(result.bioinformatics!.inhouseItems[0].name).toBe('High-processing server')
    expect(result.bioinformatics!.inhouseItems[0].enabled).toBe(false) // no price or quantity
    expect(result.bioinformatics!.inhouseItems[1].name).toBe('Low/mid processing workstation')
    expect(result.bioinformatics!.inhouseItems[1].pricePerUnit).toBe(7028)
    expect(result.bioinformatics!.inhouseItems[1].pctUse).toBe(100)
    expect(result.bioinformatics!.inhouseItems[1].lifespanYears).toBe(5)
    expect(result.bioinformatics!.inhouseItems[1].ageYears).toBe(2)
    expect(result.bioinformatics!.inhouseItems[1].enabled).toBe(true)
  })
})

// ── Missing sheets handled gracefully ────────────────────────────────────────

describe('parseGctWorkbook — graceful handling', () => {
  it('returns sensible defaults when sheets are missing', () => {
    const wb = mockWorkbook({
      'Data entry': {},
    })
    const result = parseGctWorkbook(wb)
    expect(result.name).toBe('Imported WHO GCT project')
    expect(result.pathogens).toEqual([])
    expect(result.sequencers).toEqual([])
    expect(result.fixedConsumables).toEqual([])
    expect(result.equipment).toEqual([])
    expect(result.personnel).toEqual([])
    expect(result.qms).toEqual([])
    // With no C32 value, bioinformatics type defaults to 'none'
    // (the migrateProject step in ProjectContext will backfill to 'hybrid' at runtime)
    expect(result.bioinformatics!.type).toBe('none')
  })

  it('returns an id for the imported project', () => {
    const wb = mockWorkbook({ 'Data entry': {} })
    const result = parseGctWorkbook(wb)
    expect(result.id).toBeDefined()
    expect(typeof result.id).toBe('string')
    expect(result.id!.length).toBeGreaterThan(0)
  })
})

// ── Sequencer assignment wiring ──────────────────────────────────────────────

describe('parseGctWorkbook — sequencer assignments', () => {
  it('wires pathogen 0 to sequencer 0, pathogen 1 to sequencer 1', () => {
    const wb = mockWorkbook({
      'Data entry': {
        C13: 'Bacterial',
        C14: 'Salmonella',
        C15: 4.8,
        C16: 500,
        C17: 'Illumina MiSeq',
        C18: 'Kit',
        C19: 50,
        C20: 0.3,
        C21: 'Prep',
        C27: 2,
        F13: 'Bacterial',
        F14: 'E. coli',
        F15: 5.0,
        F16: 300,
        F17: 'ONT GridION',
        F18: 'Other sequencing kit',
        F19: 50,
        F20: 0.3,
        F21: 'Other library preparation kit',
        F27: 2,
      },
    })
    const result = parseGctWorkbook(wb)
    expect(result.sequencers![0].assignments).toEqual([
      { pathogenIndex: 0, samples: 500 },
    ])
    expect(result.sequencers![1].assignments).toEqual([
      { pathogenIndex: 1, samples: 300 },
    ])
  })
})
