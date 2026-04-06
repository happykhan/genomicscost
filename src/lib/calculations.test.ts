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
    const project = { ...createDefaultProject(), samplesPerYear: 0 }
    const costs = calculateCosts(project)
    expect(costs.total).toBe(0)
    expect(costs.costPerSample).toBe(0)
  })

  it('sequencing reagent cost: runs × kit price', () => {
    // 200 samples, 31 effective samples/run → ceil(200/31) = 7 runs
    // kit price $526.15 → $3,683.05
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 200,
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
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    const runsNeeded = Math.ceil(200 / 31) // 7
    expect(costs.sequencingReagents).toBeCloseTo(runsNeeded * 526.15, 2)
  })

  it('library prep cost: samples × cost per sample', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
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
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
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
      samplesPerYear: 200,
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
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
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
      samplesPerYear: 200,
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
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.sequencingReagents).toBe(Math.ceil(200 / 12) * 100) // 1700, not 2000
  })

  it('disabled sequencer contributes zero cost', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 200,
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
      }],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.sequencingReagents).toBe(0)
  })

  it('equipment depreciation uses per-item lifespan', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
      sequencers: [],
      consumables: [],
      equipment: [
        { name: 'iSeq 100', category: 'sequencing_platform', status: 'buy' as const, quantity: 1, unitCostUsd: 19_900, lifespanYears: 10 },
        { name: 'Thermal cycler', category: 'lab_equipment', status: 'buy' as const, quantity: 1, unitCostUsd: 5_000, lifespanYears: 5 },
        { name: 'Already owned', category: 'lab_equipment', status: 'have' as const, quantity: 1, unitCostUsd: 999, lifespanYears: 5 },
      ],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    // 19900/10 + 5000/5 = 1990 + 1000 = 2990; 'have' items not depreciated
    expect(costs.equipment).toBeCloseTo(2990, 2)
    // Establishment = 19900 + 5000 = 24900
    expect(costs.establishmentCost).toBe(24_900)
  })

  it('facility cost: monthly × 12 × pctSequencing', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [
        { label: 'Rent', monthlyCostUsd: 1000, pctSequencing: 30 },
        { label: 'Utilities', monthlyCostUsd: 500, pctSequencing: 50 },
      ],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    // 1000*12*0.30 + 500*12*0.50 = 3600 + 3000 = 6600
    expect(costs.facility).toBe(6600)
  })

  it('QMS cost: costUsd × quantity × pctSequencing', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
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

  it('cloud bioinformatics: costPerSample × samplesPerYear', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 200,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'cloud' as const, cloudPlatform: 'BaseSpace', costPerSampleUsd: 3, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.bioinformatics).toBe(600)
  })

  it('hybrid bioinformatics: cloud cost + server cost', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 200,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'hybrid' as const, cloudPlatform: 'BaseSpace', costPerSampleUsd: 3, annualServerCostUsd: 6_000 },
      qms: [],
    }
    const costs = calculateCosts(project)
    // cloud: 200 × $3 = $600; server: $6,000; total bio = $6,600
    expect(costs.bioinformatics).toBe(6_600)
  })

  it('inhouse bioinformatics: annualServerCostUsd', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 200,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'inhouse' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 12_000 },
      qms: [],
    }
    const costs = calculateCosts(project)
    expect(costs.bioinformatics).toBe(12_000)
  })

  it('training costs: sum of trainingCostUsd per personnel role', () => {
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
      sequencers: [],
      consumables: [],
      equipment: [],
      personnel: [
        { role: 'Lab tech', annualSalaryUsd: 30_000, pctTime: 50, trainingCostUsd: 1_500 },
        { role: 'Bioinformatician', annualSalaryUsd: 50_000, pctTime: 30, trainingCostUsd: 2_000 },
      ],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
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
    if (project.samplesPerYear > 0) {
      expect(costs.costPerSample).toBeCloseTo(costs.total / project.samplesPerYear, 10)
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
    }
    const project = {
      ...createDefaultProject(),
      samplesPerYear: 100,
      sequencers: [
        { ...seq, label: 'Sequencer 1' },
        { ...seq, label: 'Sequencer 2' },
      ],
      consumables: [],
      equipment: [],
      personnel: [],
      facility: [],
      transport: [],
      bioinformatics: { type: 'none' as const, cloudPlatform: '', costPerSampleUsd: 0, annualServerCostUsd: 0 },
      qms: [],
    }
    const costs = calculateCosts(project)
    // Each: ceil(100/50) = 2 runs × $1000 = $2000; total = $4000
    expect(costs.sequencingReagents).toBe(4_000)
  })
})
