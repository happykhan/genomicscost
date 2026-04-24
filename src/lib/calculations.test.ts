import { describe, it, expect } from 'vitest'
import { calculateSamplesPerRun, calculateCosts, defaultBufferPct } from './calculations'
import { createDefaultProject } from './defaults'

// ── calculateSamplesPerRun ────────────────────────────────────────────────────
// Reference: WHO GCT User Manual 2nd ed. 2026, Annex 2

describe('calculateSamplesPerRun', () => {
  // iSeq 100 kit: 4,000,000 max reads, 300bp read length
  const ISEQ_READS = 4_000_000
  const ISEQ_READ_LEN = 300

  it('SARS-CoV-2 on iSeq 100 — viral, 0.03 Mb, 100× coverage', () => {
    // readsFromCoverage = 0.03e6 * 100 / 300 = 10,000
    // minReads = 100,000 (viral ≤0.03 Mb)
    // readsPerSample = max(10000, 100000) = 100,000
    // readsWithBuffer = 100,000 * 1.20 = 120,000
    // gross = floor(4,000,000 / 120,000) = 33
    // effective = 33 - 2 controls = 31
    const result = calculateSamplesPerRun(0.03, 100, ISEQ_READ_LEN, ISEQ_READS, 20, Infinity, 'viral', false, 100_000, 2)
    expect(result).toBe(31)
  })

  it('SARS-CoV-2 on iSeq 100 — no controls', () => {
    // same as above but 0 controls
    // effective = 33
    const result = calculateSamplesPerRun(0.03, 100, ISEQ_READ_LEN, ISEQ_READS, 20, Infinity, 'viral', false, 100_000, 0)
    expect(result).toBe(33)
  })

  it('viral pathogen >0.03 Mb (e.g. monkeypox 0.2 Mb) on iSeq 100', () => {
    // readsFromCoverage = 0.2e6 * 100 / 300 = 66,667
    // minReads = 150,000 (viral >0.03 Mb)
    // readsPerSample = max(66667, 150000) = 150,000
    // readsWithBuffer (20%) = 180,000
    // gross = floor(4,000,000 / 180,000) = 22
    // effective = 22 - 2 = 20
    const result = calculateSamplesPerRun(0.2, 100, ISEQ_READ_LEN, ISEQ_READS, 20, Infinity, 'viral', false, 100_000, 2)
    expect(result).toBe(20)
  })

  it('bacterial pathogen (≤5 Mb, e.g. 4.5 Mb) on MiniSeq high-output', () => {
    // MiniSeq HO: 25,000,000 max reads, 150bp
    // readsFromCoverage = 4.5e6 * 50 / 150 = 1,500,000
    // minReads = 750,000 (bacterial ≤5 Mb)
    // readsPerSample = max(1,500,000, 750,000) = 1,500,000
    // readsWithBuffer (30%) = 1,950,000
    // gross = floor(25,000,000 / 1,950,000) = 12
    // effective = 12 - 2 = 10
    const result = calculateSamplesPerRun(4.5, 50, 150, 25_000_000, 30, Infinity, 'bacterial', false, 100_000, 2)
    expect(result).toBe(10)
  })

  it('bacterial pathogen (>5 Mb, e.g. 6 Mb M. tuberculosis) on MiniSeq', () => {
    // readsFromCoverage = 6e6 * 50 / 150 = 2,000,000
    // minReads = 1,250,000 (bacterial >5 Mb)
    // readsPerSample = max(2,000,000, 1,250,000) = 2,000,000
    // readsWithBuffer (30%) = 2,600,000
    // gross = floor(25,000,000 / 2,600,000) = 9
    // effective = 9 - 0 controls = 9
    const result = calculateSamplesPerRun(6, 50, 150, 25_000_000, 30, Infinity, 'bacterial', false, 100_000, 0)
    expect(result).toBe(9)
  })

  it('barcoding limit constrains samples per run', () => {
    // Without barcoding limit: 33 samples (see SARS-CoV-2 test, no controls)
    // With limit of 24: should be capped at 24
    const result = calculateSamplesPerRun(0.03, 100, ISEQ_READ_LEN, ISEQ_READS, 20, 24, 'viral', false, 100_000, 0)
    expect(result).toBe(24)
  })

  it('capture-all mode uses minReadsPerSample directly', () => {
    // minReadsPerSample = 500,000
    // readsWithBuffer (20%) = 600,000
    // gross = floor(4,000,000 / 600,000) = 6
    // effective = 6 - 0 = 6
    const result = calculateSamplesPerRun(0, 0, 0, ISEQ_READS, 20, Infinity, 'viral', true, 500_000, 0)
    expect(result).toBe(6)
  })

  it('returns 1 when kitMaxReads is 0', () => {
    const result = calculateSamplesPerRun(0.03, 100, 300, 0, 20, Infinity, 'viral', false, 100_000, 0)
    expect(result).toBe(1)
  })

  it('never returns less than 1', () => {
    // 1,000 controls would otherwise go negative
    const result = calculateSamplesPerRun(0.03, 100, 300, ISEQ_READS, 20, Infinity, 'viral', false, 100_000, 1000)
    expect(result).toBe(1)
  })
})

// ── WHO demo workbook: "Other" custom kit on ONT GridION ─────────────────────
// The workbook specifies a custom ONT kit with user-supplied specs:
//   read_length = 10,000 bp, max_output = 180 GB, barcoding = 384
// The WHO workbook derives kitMaxReads = max_output_bytes / read_length_bp
//   = 180,000,000,000 / 10,000 = 18,000,000 reads
// Our calculateSamplesPerRun uses the reads-based path when kitMaxReads > 0 && readLengthBp > 0.

describe('calculateSamplesPerRun — ONT custom kit (WHO demo workbook Seq 2)', () => {
  // E. coli: 5 Mb bacterial, 50× coverage, 30% buffer, 2 controls
  // Custom kit: 18M reads derived from 180GB/10kbp, barcoding limit 384
  const CUSTOM_KIT_READS = 18_000_000
  const CUSTOM_READ_LEN = 10_000

  it('max samples per flowcell = 16 (matches workbook row C24)', () => {
    // readsFromCoverage = 5e6 × 50 / 10,000 = 25,000
    // minReads(bacterial, 5.0) = 750,000  (5 <= 5)
    // readsPerSample = max(25,000, 750,000) = 750,000
    // readsWithBuffer = 750,000 × 1.30 = 975,000
    // grossSamples = floor(18,000,000 / 975,000) = 18
    // effectiveSamples = 18 − 2 = 16
    // min(16, 384) = 16
    const result = calculateSamplesPerRun(
      5.0, 50, CUSTOM_READ_LEN, CUSTOM_KIT_READS, 30, 384,
      'bacterial', false, 100_000, 2,
    )
    expect(result).toBe(16)
  })

  it('maxOutputMb fallback gives a different (higher) result — demonstrates why kitMaxReads is needed', () => {
    // Using only maxOutputMb = 180,000: Mb-based path
    //   mbPerSample = 5 × 50 × 1.30 = 325
    //   grossSamples = floor(180,000 / 325) = 553
    //   effective = 553 − 2 = 551, capped at 384
    const result = calculateSamplesPerRun(
      5.0, 50, 0, 0, 30, 384,
      'bacterial', false, 100_000, 2, 180_000,
    )
    expect(result).toBe(384)
  })

  it('Salmonella on MiSeq v2 300-cycle gives 12 max samples per FC (workbook row C24)', () => {
    // 4.8 Mb bacterial, 50×, 30% buffer, 2 controls
    // MiSeq v2 300-cycle: 15M reads, 300 bp
    // readsFromCoverage = 4.8e6 × 50 / 300 = 800,000
    // minReads(bacterial, 4.8) = 750,000
    // readsPerSample = max(800,000, 750,000) = 800,000
    // readsWithBuffer = 800,000 × 1.30 = 1,040,000
    // grossSamples = floor(15,000,000 / 1,040,000) = 14
    // effectiveSamples = 14 − 2 = 12
    const result = calculateSamplesPerRun(
      4.8, 50, 300, 15_000_000, 30, 384,
      'bacterial', false, 100_000, 2,
    )
    expect(result).toBe(12)
  })
})

// ── defaultBufferPct ──────────────────────────────────────────────────────────

describe('defaultBufferPct', () => {
  it('returns 20 for viral', () => {
    expect(defaultBufferPct('viral')).toBe(20)
  })
  it('returns 30 for bacterial', () => {
    expect(defaultBufferPct('bacterial')).toBe(30)
  })
})

// ── calculateCosts ────────────────────────────────────────────────────────────

describe('calculateCosts', () => {
  it('returns zero costs when samplesPerYear is 0', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 0 }],
    }
    const costs = calculateCosts(project)
    expect(costs.total).toBe(0)
    expect(costs.costPerSample).toBe(0)
  })

  it('sequencing reagent cost: runs × kit price', () => {
    // 200 samples, 31 effective samples/run → ceil(200/31) = 7 runs
    // kit price $526.15 → $3,683.05
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'iSeq 100 i1 Reagent v2 (300-cycle)',
        reagentKitPrice: 526.15,
        samplesPerRun: 31,      // pre-calculated
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: '',
        libPrepCostPerSample: 0,
        enrichment: false,
        controlsPerRun: 0,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    const runsNeeded = Math.ceil(200 / 31) // 7
    expect(costs.sequencingReagents).toBeCloseTo(runsNeeded * 526.15, 2)
  })

  it('library prep cost: samples × cost per sample', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 0,
        samplesPerRun: 50,
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: 'COVIDSeq',
        libPrepCostPerSample: 15,
        enrichment: false,
        controlsPerRun: 0,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.libraryPrep).toBe(100 * 15)
  })

  it('retest % increases runs needed', () => {
    // 200 samples + 10% retest = 220 effective samples
    // 31 per run → ceil(220/31) = 8 runs
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 1000,
        samplesPerRun: 31,
        coverageX: 100,
        bufferPct: 20,
        retestPct: 10,
        libPrepKitName: '',
        libPrepCostPerSample: 0,
        enrichment: false,
        controlsPerRun: 0,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // 200 * 1.10 = 220; ceil(220/31) = 8; 8 * 1000 = 8000
    expect(costs.sequencingReagents).toBe(8 * 1000)
  })

  it('samplesPerRun is used directly — controls not subtracted again', () => {
    // samplesPerRun is already post-controls (set by calculateSamplesPerRun)
    // If calcSequencerCosts subtracted controls a second time it would use 29 not 31,
    // giving ceil(200/29)=7 runs instead of ceil(200/31)=7 — catches only at the boundary.
    // Use a value where double-subtraction clearly changes run count:
    // samplesPerRun=12 (already minus 2 controls from gross 14), 200 samples
    // correct: ceil(200/12)=17 runs × $100 = $1700
    // wrong (double subtract): ceil(200/10)=20 runs × $100 = $2000
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 100,
        samplesPerRun: 12,   // already post-controls
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: '',
        libPrepCostPerSample: 0,
        enrichment: false,
        controlsPerRun: 2,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.sequencingReagents).toBe(Math.ceil(200 / 12) * 100) // 1700, not 2000
  })

  it('disabled sequencer contributes zero cost', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 5000,
        samplesPerRun: 31,
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: '',
        libPrepCostPerSample: 0,
        enrichment: false,
        controlsPerRun: 0,
        enabled: false,       // disabled
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.sequencingReagents).toBe(0)
  })

  it('equipment uses WHO formula: depreciation (age-adjusted) + 15% maintenance × pctSequencing', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [],
      consumables: [],
      equipment: [
        // iSeq: $19,900, lifespan 10yr, age 0 → remaining 10yr, pct 100%
        //   depreciation = 19900/10 = 1990; maintenance = 19900*0.15 = 2985; total = 4975
        { name: 'iSeq 100', category: 'sequencing_platform', status: 'buy' as const, quantity: 1, unitCostUsd: 19_900, lifespanYears: 10, ageYears: 0, pctSequencing: 100 },
        // Thermal cycler: $5,000, lifespan 5yr, age 2yr → remaining 3yr, pct 100%
        //   depreciation = 5000/3 ≈ 1666.67; maintenance = 5000*0.15 = 750; total ≈ 2416.67
        { name: 'Thermal cycler', category: 'lab_equipment', status: 'buy' as const, quantity: 1, unitCostUsd: 5_000, lifespanYears: 5, ageYears: 2, pctSequencing: 100 },
        // Already owned — no cost
        { name: 'Already owned', category: 'lab_equipment', status: 'have' as const, quantity: 1, unitCostUsd: 999, lifespanYears: 5, ageYears: 0, pctSequencing: 100 },
      ],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      qms: [],
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
    }
    const costs = calculateCosts(project)
    // iSeq: 19900/10 + 19900*0.15 = 1990 + 2985 = 4975
    // Thermal cycler (age=2, remaining=3): 5000/3 + 5000*0.15 ≈ 1666.67 + 750 = 2416.67
    // 'have' items: 0
    expect(costs.equipment).toBeCloseTo(4975 + 5000 / 3 + 750, 1)
    // Equipment IS now included in total (WHO methodology)
    expect(costs.total).toBeCloseTo(costs.equipment + costs.incidentals, 5)
    // Establishment = 19900 + 5000 = 24900
    expect(costs.establishmentCost).toBe(24_900)
  })

  it('facility cost: monthly × 12 × pctSequencing', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [
        { label: 'Rent', monthlyCostUsd: 1000, pctSequencing: 30 },
        { label: 'Utilities', monthlyCostUsd: 500, pctSequencing: 50 },
      ],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // 1000*12*0.30 + 500*12*0.50 = 3600 + 3000 = 6600
    expect(costs.facility).toBe(6600)
  })

  it('QMS cost: costUsd × quantity × pctSequencing', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [
        { activity: 'ISO 15189 accreditation', costUsd: 10_000, quantity: 1, pctSequencing: 85, enabled: true },
        { activity: 'External QA', costUsd: 2_000, quantity: 2, pctSequencing: 100, enabled: true },
        { activity: 'Disabled', costUsd: 9_999, quantity: 1, pctSequencing: 100, enabled: false },
      ],
    }
    const costs = calculateCosts(project)
    // 10000*1*0.85 + 2000*2*1.0 = 8500 + 4000 = 12500
    expect(costs.qms).toBe(12_500)
  })

  it('cloud bioinformatics: pricePerUnit × qty × samplesThisScenario / totalSamples', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: {
        type: 'cloud' as const,
        cloudItems: [
          // Annual licence of $600, used for all 200 samples
          { name: 'BaseSpace', description: '', pricePerUnit: 600, quantity: 1, totalSamplesAllPathogens: 200, samplesThisScenario: 200, enabled: true },
        ],
        inhouseItems: [],
      },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // 600 * 1 * 200/200 = $600
    expect(costs.bioinformatics).toBe(600)
  })

  it('hybrid bioinformatics: cloud cost + inhouse depreciation', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: {
        type: 'hybrid' as const,
        cloudItems: [
          // Annual licence of $600
          { name: 'BaseSpace', description: '', pricePerUnit: 600, quantity: 1, totalSamplesAllPathogens: 200, samplesThisScenario: 200, enabled: true },
        ],
        inhouseItems: [
          { name: 'Workstation', description: '', pricePerUnit: 6_000, quantity: 1, pctUse: 100, lifespanYears: 1, ageYears: 0, enabled: true },
        ],
      },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // cloud: 600 * 1 * 200/200 = $600; inhouse: $6,000/1yr = $6,000; total bio = $6,600
    expect(costs.bioinformatics).toBe(6_600)
  })

  it('inhouse bioinformatics: depreciation of inhouse items', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: {
        type: 'inhouse' as const,
        cloudItems: [],
        inhouseItems: [
          { name: 'Server', description: '', pricePerUnit: 12_000, quantity: 1, pctUse: 100, lifespanYears: 1, ageYears: 0, enabled: true },
        ],
      },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.bioinformatics).toBe(12_000)
  })

  it('training costs: group-level trainingGroupCostUsd on project', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [
        { role: 'Lab tech', annualSalaryUsd: 30_000, pctTime: 50 },
        { role: 'Bioinformatician', annualSalaryUsd: 50_000, pctTime: 30 },
      ],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 3_500,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.training).toBe(3_500)
    // Personnel: 30000*0.5 + 50000*0.3 = 15000 + 15000 = 30000
    expect(costs.personnel).toBe(30_000)
  })

  it('costPerSample = total / samplesPerYear', () => {
    const project = createDefaultProject()
    const costs = calculateCosts(project)
    const totalSamples = project.pathogens.reduce((sum, p) => sum + p.samplesPerYear, 0)
    if (totalSamples > 0) {
      expect(costs.costPerSample).toBeCloseTo(costs.total / totalSamples, 10)
    }
  })

  it('workflow breakdown sums approximately to total', () => {
    const project = createDefaultProject()
    const costs = calculateCosts(project)
    const wfTotal = Object.values(costs.workflowBreakdown).reduce((a, b) => a + b, 0)
    // Bioinformatics is excluded from the shared split so it can differ slightly
    // but overall should be within rounding of total
    expect(Math.abs(wfTotal - costs.total)).toBeLessThan(1)
  })

  it('dual sequencer: both enabled sequencers contribute costs', () => {
    const seq = {
      platformId: 'illumina',
      reagentKitName: 'test',
      reagentKitPrice: 1000,
      samplesPerRun: 50,
      coverageX: 100,
      bufferPct: 20,
      retestPct: 0,
      libPrepKitName: '',
      libPrepCostPerSample: 0,
      enrichment: false,
      controlsPerRun: 0,
      enabled: true,
      captureAll: false,
      minReadsPerSample: 100_000,
      assignments: [],
    }
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [
        { ...seq, label: 'Sequencer 1' },
        { ...seq, label: 'Sequencer 2' },
      ],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // Each: ceil(100/50) = 2 runs × $1000 = $2000; total = $4000
    expect(costs.sequencingReagents).toBe(4_000)
  })

  it('assignment matrix: single sequencer, one pathogen — same cost as before migration', () => {
    // With explicit assignments matching old behaviour, cost should be identical
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 200 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 526.15,
        samplesPerRun: 31,
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: '',
        libPrepCostPerSample: 10,
        enrichment: false,
        controlsPerRun: 0,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [{ pathogenIndex: 0, samples: 200 }],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    const runsNeeded = Math.ceil(200 / 31) // 7
    expect(costs.sequencingReagents).toBeCloseTo(runsNeeded * 526.15, 2)
    expect(costs.libraryPrep).toBe(200 * 10)
  })

  it('assignment matrix: two sequencers splitting 50/50 — total reagent cost equals single-sequencer baseline', () => {
    // 500 samples split 250/250 across two identical sequencers
    // Each: ceil(250/50)=5 runs × $1000 = $5000; total = $10000
    // Single-sequencer baseline: ceil(500/50)=10 runs × $1000 = $10000
    const seq = {
      platformId: 'illumina',
      reagentKitName: 'test',
      reagentKitPrice: 1000,
      samplesPerRun: 50,
      coverageX: 100,
      bufferPct: 20,
      retestPct: 0,
      libPrepKitName: '',
      libPrepCostPerSample: 0,
      enrichment: false,
      controlsPerRun: 0,
      enabled: true,
      captureAll: false,
      minReadsPerSample: 100_000,
      assignments: [],
    }
    const splitProject = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 500 }],
      sequencers: [
        { ...seq, label: 'Sequencer 1', assignments: [{ pathogenIndex: 0, samples: 250 }] },
        { ...seq, label: 'Sequencer 2', assignments: [{ pathogenIndex: 0, samples: 250 }] },
      ],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const singleProject = {
      ...splitProject,
      sequencers: [
        { ...seq, label: 'Sequencer 1', assignments: [{ pathogenIndex: 0, samples: 500 }] },
      ],
    }
    const splitCosts = calculateCosts(splitProject)
    const singleCosts = calculateCosts(singleProject)

    // Reagent costs should be equal (within rounding for integer division)
    expect(Math.abs(splitCosts.sequencingReagents - singleCosts.sequencingReagents)).toBeLessThanOrEqual(1000)
    // In this case they should be exactly equal since 250 and 500 both divide evenly into runs of 50
    expect(splitCosts.sequencingReagents).toBe(singleCosts.sequencingReagents)
  })

  it('assignment matrix: re-sequencing on two platforms (delta = +N) — reagent/lib-prep scale up', () => {
    // 100 samples sequenced on BOTH platforms = 200 total assigned
    // Equipment, personnel, etc. stay the same (shared infrastructure)
    const seq = {
      platformId: 'illumina',
      reagentKitName: 'test',
      reagentKitPrice: 1000,
      samplesPerRun: 50,
      coverageX: 100,
      bufferPct: 20,
      retestPct: 0,
      libPrepKitName: '',
      libPrepCostPerSample: 20,
      enrichment: false,
      controlsPerRun: 0,
      enabled: true,
      captureAll: false,
      minReadsPerSample: 100_000,
      assignments: [],
    }
    const singleProject = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [
        { ...seq, label: 'Sequencer 1', assignments: [{ pathogenIndex: 0, samples: 100 }] },
      ],
      consumables: [],
      equipment: [{ name: 'iSeq', category: 'sequencing_platform', status: 'buy' as const, unitCostUsd: 19_900, quantity: 1, lifespanYears: 10 }],
      personnel: [{ role: 'Tech', annualSalaryUsd: 30_000, pctTime: 50 }],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const dualProject = {
      ...singleProject,
      sequencers: [
        { ...seq, label: 'Sequencer 1', assignments: [{ pathogenIndex: 0, samples: 100 }] },
        { ...seq, label: 'Sequencer 2', assignments: [{ pathogenIndex: 0, samples: 100 }] },
      ],
    }
    const singleCosts = calculateCosts(singleProject)
    const dualCosts = calculateCosts(dualProject)

    // Reagent costs should double (2 platforms × same runs)
    expect(dualCosts.sequencingReagents).toBe(singleCosts.sequencingReagents * 2)
    // Library prep should double
    expect(dualCosts.libraryPrep).toBe(singleCosts.libraryPrep * 2)
    // Equipment stays the same (shared)
    expect(dualCosts.equipment).toBe(singleCosts.equipment)
    // Personnel stays the same (shared)
    expect(dualCosts.personnel).toBe(singleCosts.personnel)
  })

  it('assignment matrix: no assignments falls back to samplesPerYear (back-compat)', () => {
    // Sequencers without assignments field at all — should use global total
    const project = {
      ...createDefaultProject(),
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina',
        reagentKitName: 'test',
        reagentKitPrice: 1000,
        samplesPerRun: 50,
        coverageX: 100,
        bufferPct: 20,
        retestPct: 0,
        libPrepKitName: '',
        libPrepCostPerSample: 0,
        enrichment: false,
        controlsPerRun: 0,
        enabled: true,
        label: 'Sequencer 1',
        captureAll: false,
        minReadsPerSample: 100_000,
        assignments: [],
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudItems: [], inhouseItems: [] },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // ceil(100/50)=2 runs × $1000 = $2000 (same as old behaviour)
    expect(costs.sequencingReagents).toBe(2_000)
  })

  it('multi-pathogen: total samplesPerYear is sum across pathogens', () => {
    const project = {
      ...createDefaultProject(),
      pathogens: [
        { pathogenName: 'SARS-CoV-2', pathogenType: 'viral' as const, genomeSizeMb: 0.03, samplesPerYear: 100 },
        { pathogenName: 'M. tuberculosis', pathogenType: 'bacterial' as const, genomeSizeMb: 4.4, samplesPerYear: 50 },
      ],
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: {
        type: 'cloud' as const,
        cloudItems: [
          // Annual licence cost $450 covering all 150 samples
          { name: 'BaseSpace', description: '', pricePerUnit: 450, quantity: 1, totalSamplesAllPathogens: 150, samplesThisScenario: 150, enabled: true },
        ],
        inhouseItems: [],
      },
      trainingGroupCostUsd: 0,
      adminCostPct: 0,
      qms: [],
    }
    const costs = calculateCosts(project)
    // total samples = 150; cloud bio = 450 * 1 * 150/150 = $450
    expect(costs.bioinformatics).toBe(450)
    expect(costs.costPerSample).toBeCloseTo(450 / 150, 10)
  })
})
