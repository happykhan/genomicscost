/**
 * WHO GCT Acceptance Tests
 *
 * These tests verify that our web app calculations match the WHO Genomics
 * Costing Tool second edition Excel workbook (B09722-eng).
 *
 * Reference: WHO GCT User Manual 2nd ed. 2026
 * Excel: B09722-eng (1).xlsx — the canonical reference tool.
 *
 * KNOWN GAPS (features in the Excel that our tool does not yet implement):
 *   GAP-1: Equipment maintenance cost (Excel: 15%/yr of unit cost; we: $0)
 *   GAP-2: Equipment age field (Excel adjusts depreciation for existing equipment; we: always depreciate from new)
 *   GAP-3: Equipment "% use for sequencing" per item (we apply 100% always)
 *   GAP-4: Transport "% use for sequencing" per item (our TransportItem has no pctSequencing)
 *
 * Tests marked with // GAP-n are expected to diverge once the gap is fixed.
 */

import { describe, it, expect } from 'vitest'
import { calculateSamplesPerRun, calculateCosts } from './calculations'
import { createDefaultProject } from './defaults'
import type { Project } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return { ...createDefaultProject(), ...overrides }
}

// ── Section 1: Run sizing (Annex 4) ──────────────────────────────────────────
// Excel formula (Annex4_Coverage Sample Calc):
//   reads_from_coverage  = genome_mb × 1e6 × coverage / read_length_bp
//   reads_per_sample     = max(reads_from_coverage, min_reads_for_pathogen_type)
//   reads_with_buffer    = reads_per_sample × (1 + buffer / 100)
//   max_samples_per_run  = floor(max_reads_flowcell / reads_with_buffer)
//   effective_samples    = max(1, max_samples - controls_per_run)

describe('WHO GCT — Annex 4: Run sizing', () => {
  // Annex4 reference values (Illumina iSeq 100, 300bp, 4M reads):
  //   SARS-CoV-2, 0.03 Mb, 100× coverage, 20% buffer
  //   reads_from_coverage = 0.03e6 × 100 / 300 = 10,000
  //   min_reads (viral ≤0.03 Mb) = 100,000
  //   reads_per_sample = max(10,000, 100,000) = 100,000
  //   reads_with_buffer = 100,000 × 1.2 = 120,000  ← matches Excel "120,000" in Annex4
  //   max_samples = floor(4,000,000 / 120,000) = 33

  it('SARS-CoV-2 on iSeq100 (0.03 Mb, 100×, 20% buffer, 0 controls) → 33 samples/run', () => {
    const result = calculateSamplesPerRun(
      0.03, 100, 300, 4_000_000, 20, Infinity, 'viral', false, 100_000, 0,
    )
    expect(result).toBe(33)
  })

  it('SARS-CoV-2 on iSeq100 with 2 controls → 31 effective samples/run', () => {
    const result = calculateSamplesPerRun(
      0.03, 100, 300, 4_000_000, 20, Infinity, 'viral', false, 100_000, 2,
    )
    expect(result).toBe(31)
  })

  // Monkeypox (0.2 Mb viral), min reads = 150,000 (viral >0.03 Mb)
  it('Monkeypox on iSeq100 (0.2 Mb viral, 100×, 20% buffer, 0 controls) → 22 samples/run', () => {
    // reads_from_coverage = 0.2e6 × 100 / 300 = 66,667
    // min_reads (viral >0.03 Mb) = 150,000
    // reads_per_sample = 150,000
    // reads_with_buffer = 150,000 × 1.2 = 180,000
    // max_samples = floor(4,000,000 / 180,000) = 22
    const result = calculateSamplesPerRun(
      0.2, 100, 300, 4_000_000, 20, Infinity, 'viral', false, 100_000, 0,
    )
    expect(result).toBe(22)
  })

  // M. tuberculosis WGS (4.4 Mb bacterial, ≤5 Mb), min reads = 750,000
  it('M. tuberculosis on MiniSeq HO (4.4 Mb, 50×, 30% buffer, 0 controls) → 12 samples/run', () => {
    // MiniSeq High Output: 25M reads, 150bp (2×75)
    // reads_from_coverage = 4.4e6 × 50 / 150 = 1,466,667
    // min_reads (bacterial ≤5 Mb) = 750,000
    // reads_per_sample = 1,466,667
    // reads_with_buffer = 1,466,667 × 1.3 = 1,906,667
    // max_samples = floor(25,000,000 / 1,906,667) = 13
    const result = calculateSamplesPerRun(
      4.4, 50, 150, 25_000_000, 30, Infinity, 'bacterial', false, 100_000, 0,
    )
    expect(result).toBe(13)
  })

  // Barcoding limit applies
  it('barcoding limit (24) caps samples regardless of flowcell capacity', () => {
    // Without barcoding limit: 33 samples (SARS-CoV-2 case above)
    const result = calculateSamplesPerRun(
      0.03, 100, 300, 4_000_000, 20, 24, 'viral', false, 100_000, 0,
    )
    expect(result).toBe(24)
  })
})

// ── Section 2: Sequencing reagent cost ───────────────────────────────────────
// Excel formula:
//   runs_needed = ceil(samples_per_year × (1 + retest_pct/100) / effective_samples_per_run)
//   sequencing_reagents = runs_needed × reagent_kit_price

describe('WHO GCT — Sequencing reagent cost', () => {
  it('100 samples/yr, 33 samples/run, $1,000/kit, 0% retest → 4 runs → $4,000', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina', label: 'Sequencer 1',
        reagentKitName: 'iSeq 100 i1 Reagent v2 (300-cycle)',
        reagentKitPrice: 1_000,
        samplesPerRun: 33,
        coverageX: 100, bufferPct: 20, retestPct: 0,
        libPrepKitName: '', libPrepCostPerSample: 0,
        enrichment: false, controlsPerRun: 0, enabled: true,
        captureAll: false, minReadsPerSample: 100_000,
      }],
    })
    const costs = calculateCosts(project)
    // ceil(100 / 33) = 4 runs × $1,000 = $4,000
    expect(costs.sequencingReagents).toBe(4_000)
  })

  it('10% retest inflates sample count: ceil(110 / 33) = 4 runs → $4,000', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina', label: 'Sequencer 1',
        reagentKitName: 'iSeq 100 i1 Reagent v2 (300-cycle)',
        reagentKitPrice: 1_000,
        samplesPerRun: 33,
        coverageX: 100, bufferPct: 20, retestPct: 10,
        libPrepKitName: '', libPrepCostPerSample: 0,
        enrichment: false, controlsPerRun: 0, enabled: true,
        captureAll: false, minReadsPerSample: 100_000,
      }],
    })
    const costs = calculateCosts(project)
    // 100 × 1.10 = 110; ceil(110 / 33) = 4 runs × $1,000 = $4,000
    expect(costs.sequencingReagents).toBe(4_000)
  })

})

// ── Section 3: Library prep cost ─────────────────────────────────────────────
// Excel formula: samples_including_retests × lib_prep_cost_per_sample

describe('WHO GCT — Library prep cost', () => {
  it('100 samples, $50/sample lib prep, 0% retest → $5,000', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina', label: 'Sequencer 1',
        reagentKitName: '', reagentKitPrice: 0,
        samplesPerRun: 33, coverageX: 100, bufferPct: 20, retestPct: 0,
        libPrepKitName: 'NEBNext Ultra II', libPrepCostPerSample: 50,
        enrichment: false, controlsPerRun: 0, enabled: true,
        captureAll: false, minReadsPerSample: 100_000,
      }],
    })
    const costs = calculateCosts(project)
    expect(costs.libraryPrep).toBe(5_000)
  })

  it('100 samples, $50/sample, 10% retest → 110 × $50 = $5,500', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina', label: 'Sequencer 1',
        reagentKitName: '', reagentKitPrice: 0,
        samplesPerRun: 33, coverageX: 100, bufferPct: 20, retestPct: 10,
        libPrepKitName: 'NEBNext Ultra II', libPrepCostPerSample: 50,
        enrichment: false, controlsPerRun: 0, enabled: true,
        captureAll: false, minReadsPerSample: 100_000,
      }],
    })
    const costs = calculateCosts(project)
    expect(costs.libraryPrep).toBeCloseTo(5_500, 2)
  })
})

// ── Section 4: Consumables ───────────────────────────────────────────────────
// Excel formula: ceil(samples_per_year × qty_per_sample) × unit_cost

describe('WHO GCT — Consumables', () => {
  it('0.5 units/sample × $20/unit × 100 samples = $1,000', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      consumables: [{ name: 'DNA extraction kit', unitCostUsd: 20, quantityPerSample: 0.5, enabled: true }],
    })
    const costs = calculateCosts(project)
    // ceil(100 × 0.5) = 50 units × $20 = $1,000
    expect(costs.consumables).toBe(1_000)
  })

  it('disabled consumable contributes $0', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      consumables: [{ name: 'Extraction kit', unitCostUsd: 50, quantityPerSample: 1, enabled: false }],
    })
    const costs = calculateCosts(project)
    expect(costs.consumables).toBe(0)
  })
})

// ── Section 5: Equipment ─────────────────────────────────────────────────────
// Excel formula (annual operational cost):
//   depreciation = (unit_cost × qty) / lifespan_years   [assumes age=0, i.e. new equipment]
//   maintenance  = (unit_cost × qty) × 0.15             [GAP-1: we don't implement this]
//   annual_cost  = (depreciation + maintenance) × pct_sequencing / 100  [GAP-3]
//
// Our formula: (unit_cost × qty) / lifespan_years  [no maintenance, no age, no % scaling]
// Establishment cost = unit_cost × qty (purchase price; same in Excel)

describe('WHO GCT — Equipment', () => {
  it('establishment cost = unit_cost × quantity for items to buy', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      equipment: [
        { name: 'iSeq 100', status: 'buy', unitCostUsd: 19_900, quantity: 1, lifespanYears: 8 },
        { name: '-80 Freezer', status: 'buy', unitCostUsd: 13_719, quantity: 1, lifespanYears: 10 },
        { name: 'Thermal cycler', status: 'existing', unitCostUsd: 9_000, quantity: 1, lifespanYears: 10 },
      ],
    })
    const costs = calculateCosts(project)
    // Only 'buy' items count for establishment: 19,900 + 13,719 = 33,619
    expect(costs.establishmentCost).toBe(19_900 + 13_719)
  })

  it('annual depreciation = unit_cost / lifespan (no maintenance, no age adjustment)', () => {
    // NOTE: Excel also adds 15% maintenance/yr (GAP-1) — our tool underestimates annual equipment cost
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      equipment: [
        { name: 'iSeq 100', status: 'buy', unitCostUsd: 19_900, quantity: 1, lifespanYears: 8 },
      ],
    })
    const costs = calculateCosts(project)
    // Our tool: 19,900 / 8 = 2,487.50
    expect(costs.equipment).toBeCloseTo(19_900 / 8, 2)
    // Excel would add 15% maintenance: 19,900 × 0.15 = 2,985/yr on top → GAP-1
  })

  it('existing equipment does not add to establishment cost', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      equipment: [
        { name: 'Thermal cycler', status: 'existing', unitCostUsd: 9_000, quantity: 1, lifespanYears: 10 },
      ],
    })
    const costs = calculateCosts(project)
    expect(costs.establishmentCost).toBe(0)
    expect(costs.equipment).toBe(0)
  })
})

// ── Section 6: Personnel ─────────────────────────────────────────────────────
// Excel formula: salary × pct_time / 100
// Training is combined with personnel in Excel Results; our tool separates them.

describe('WHO GCT — Personnel', () => {
  it('annual personnel cost = salary × pct_time / 100', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      personnel: [
        { role: 'Lab manager', annualSalaryUsd: 50_000, pctTime: 50, trainingCostUsd: 0 },
        { role: 'Bioinformatician', annualSalaryUsd: 60_000, pctTime: 25, trainingCostUsd: 0 },
      ],
    })
    const costs = calculateCosts(project)
    // (50,000 × 50%) + (60,000 × 25%) = 25,000 + 15,000 = 40,000
    expect(costs.personnel).toBe(40_000)
  })

  it('training cost is summed across all personnel', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      personnel: [
        { role: 'Lab manager', annualSalaryUsd: 50_000, pctTime: 50, trainingCostUsd: 500 },
        { role: 'Technician', annualSalaryUsd: 30_000, pctTime: 100, trainingCostUsd: 300 },
      ],
    })
    const costs = calculateCosts(project)
    expect(costs.training).toBe(800)
  })
})

// ── Section 7: Facility ───────────────────────────────────────────────────────
// Excel formula: sum_of_monthly_costs × 12 × pct_for_sequencing / 100

describe('WHO GCT — Facility', () => {
  it('annual facility = monthly × 12 × pct_sequencing / 100', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      facility: [
        { label: 'Rent + utilities', monthlyCostUsd: 2_000, pctSequencing: 30 },
      ],
    })
    const costs = calculateCosts(project)
    // 2,000 × 12 × 30% = 7,200
    expect(costs.facility).toBe(7_200)
  })

  it('multiple facility items sum correctly', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      facility: [
        { label: 'Rent', monthlyCostUsd: 1_000, pctSequencing: 50 },
        { label: 'Electricity', monthlyCostUsd: 200, pctSequencing: 100 },
      ],
    })
    const costs = calculateCosts(project)
    // (1,000 × 12 × 50%) + (200 × 12 × 100%) = 6,000 + 2,400 = 8,400
    expect(costs.facility).toBe(8_400)
  })
})

// ── Section 8: Transport ─────────────────────────────────────────────────────
// Excel formula: annual_cost × pct_for_sequencing / 100 per item
// GAP-4: our TransportItem has no pctSequencing — we use 100% always

describe('WHO GCT — Transport', () => {
  it('annual transport = sum of annual costs (100% attributed — GAP-4: no pct_sequencing field)', () => {
    // NOTE: Excel allows per-item % attribution to sequencing; our tool applies 100%
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      transport: [
        { label: 'Regional courier', annualCostUsd: 3_600 },
        { label: 'Insurance', annualCostUsd: 400 },
      ],
    })
    const costs = calculateCosts(project)
    expect(costs.transport).toBe(4_000)
  })
})

// ── Section 9: Bioinformatics ─────────────────────────────────────────────────
// Excel formulas match our implementation:
//   cloud:   samples × cost_per_sample
//   inhouse: annual_server_cost  (depreciation of servers)
//   hybrid:  samples × cost_per_sample + annual_server_cost

describe('WHO GCT — Bioinformatics', () => {
  it('cloud: samples × cost_per_sample', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 200 }],
      bioinformatics: { type: 'cloud', costPerSampleUsd: 5, annualServerCostUsd: 0 },
    })
    const costs = calculateCosts(project)
    expect(costs.bioinformatics).toBe(1_000)
  })

  it('inhouse: annual server cost', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 200 }],
      bioinformatics: { type: 'inhouse', costPerSampleUsd: 0, annualServerCostUsd: 12_000 },
    })
    const costs = calculateCosts(project)
    expect(costs.bioinformatics).toBe(12_000)
  })

  it('hybrid: samples × cost_per_sample + annual server', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 200 }],
      bioinformatics: { type: 'hybrid', costPerSampleUsd: 2, annualServerCostUsd: 5_000 },
    })
    const costs = calculateCosts(project)
    // 200 × $2 + $5,000 = $5,400
    expect(costs.bioinformatics).toBe(5_400)
  })
})

// ── Section 10: Quality management ───────────────────────────────────────────
// Excel formula: cost × quantity × pct_sequencing / 100

describe('WHO GCT — QMS', () => {
  it('QMS cost = cost × quantity × pct_sequencing / 100', () => {
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      qms: [
        { activity: 'ISO 15189 accreditation', costUsd: 4_000, quantity: 1, pctSequencing: 50, enabled: true },
        { activity: 'EQA – NGS', costUsd: 2_300, quantity: 1, pctSequencing: 100, enabled: true },
        { activity: 'EQA – PCR', costUsd: 900, quantity: 1, pctSequencing: 100, enabled: false },
      ],
    })
    const costs = calculateCosts(project)
    // (4,000 × 1 × 50%) + (2,300 × 1 × 100%) + disabled = 2,000 + 2,300 = 4,300
    expect(costs.qms).toBe(4_300)
  })
})

// ── Section 11: End-to-end scenario ──────────────────────────────────────────
// A concrete scenario with all components, verifiable against manual Excel entry.
// Inputs chosen to produce round numbers for easy cross-checking.

describe('WHO GCT — end-to-end scenario', () => {
  it('matches manually-computed WHO GCT running cost total', () => {
    /**
     * Scenario: SARS-CoV-2 surveillance lab, 100 samples/year
     *
     * Inputs (no retest, no controls, barcoding unlimited):
     *   Sequencer: iSeq100, 100× coverage, 4M reads, 300bp, 20% buffer
     *     → samplesPerRun = 33, runs = ceil(100/33) = 4
     *     → sequencing reagents = 4 × $1,000 = $4,000
     *     → lib prep = 100 × $50 = $5,000
     *   Consumables: extraction kit 0.5 units/sample @ $20 → ceil(50) × $20 = $1,000
     *   Equipment: iSeq100 $19,900, 8yr lifespan (to buy)
     *     → establishment = $19,900
     *     → depreciation = $19,900/8 = $2,487.50 [excluded from running cost by default]
     *     → GAP-1: Excel also adds 15% maintenance = $2,985/yr
     *   Personnel: lab manager 50% @ $50,000 → $25,000
     *   Training: $500
     *   Facility: $1,000/mo × 12 × 10% = $1,200
     *   Transport: $500/yr (100% attributed — GAP-4)
     *   Bioinformatics: cloud $5/sample → $500
     *   QMS: EQA-NGS $2,300 × 1 × 100% = $2,300
     *
     * Running cost total (no equipment depreciation):
     *   $4,000 + $5,000 + $1,000 + $25,000 + $500 + $1,200 + $500 + $500 + $2,300 = $40,000
     * Cost per sample: $40,000 / 100 = $400.00
     * Establishment cost: $19,900
     */
    const project = makeProject({
      pathogens: [{ pathogenName: 'SARS-CoV-2', pathogenType: 'viral', genomeSizeMb: 0.03, samplesPerYear: 100 }],
      sequencers: [{
        platformId: 'illumina', label: 'Sequencer 1',
        reagentKitName: 'iSeq 100 i1 Reagent v2 (300-cycle)',
        reagentKitPrice: 1_000,
        samplesPerRun: 33,
        coverageX: 100, bufferPct: 20, retestPct: 0,
        libPrepKitName: 'NEBNext Ultra II', libPrepCostPerSample: 50,
        enrichment: false, controlsPerRun: 0, enabled: true,
        captureAll: false, minReadsPerSample: 100_000,
      }],
      consumables: [
        { name: 'DNA extraction kit', unitCostUsd: 20, quantityPerSample: 0.5, enabled: true },
      ],
      equipment: [
        { name: 'Illumina iSeq 100', status: 'buy', unitCostUsd: 19_900, quantity: 1, lifespanYears: 8 },
      ],
      personnel: [
        { role: 'Lab manager', annualSalaryUsd: 50_000, pctTime: 50, trainingCostUsd: 500 },
      ],
      facility: [
        { label: 'Rent + utilities', monthlyCostUsd: 1_000, pctSequencing: 10 },
      ],
      transport: [
        { label: 'Sample courier', annualCostUsd: 500 },
      ],
      bioinformatics: { type: 'cloud', costPerSampleUsd: 5, annualServerCostUsd: 0 },
      qms: [
        { activity: 'EQA – NGS', costUsd: 2_300, quantity: 1, pctSequencing: 100, enabled: true },
      ],
    })

    const costs = calculateCosts(project)

    // Component checks
    expect(costs.sequencingReagents).toBe(4_000)
    expect(costs.libraryPrep).toBe(5_000)
    expect(costs.consumables).toBe(1_000)
    expect(costs.personnel).toBe(25_000)
    expect(costs.training).toBe(500)
    expect(costs.facility).toBe(1_200)
    expect(costs.transport).toBe(500)
    expect(costs.bioinformatics).toBe(500)
    expect(costs.qms).toBe(2_300)

    // Running cost total (equipment depreciation excluded — it's capital expenditure)
    expect(costs.total).toBe(40_000)
    expect(costs.costPerSample).toBe(400)

    // Establishment cost (capital one-off)
    expect(costs.establishmentCost).toBe(19_900)

    // Depreciation is tracked but NOT in running total
    expect(costs.equipment).toBeCloseTo(19_900 / 8, 2)
  })
})
