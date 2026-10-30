import { expect, it } from 'vitest'
import XLSX from 'xlsx'
import { parseGctWorkbook } from './importGct'

it('imports the actual completed WHO workbook rather than a displaced mock schema', () => {
  const wb = XLSX.readFile('reference/fixtures/GCTv2_DEMO_COMPLETED.xlsx')
  const p = parseGctWorkbook(wb)
  expect(p.name).toBe(wb.Sheets['Data entry'].C8?.v ?? 'Imported WHO GCT project')
  expect(p.country).toBe(wb.Sheets['Data entry'].C9?.v ?? '')
  expect(p.year).toBe(wb.Sheets['Data entry'].C10?.v ?? 2025)
  expect(p.pathogens![0]).toMatchObject({ pathogenName: 'Salmonella spp.', samplesPerYear: 500 })
  expect(p.sequencers![0]).toMatchObject({ reagentKitPrice: 1194, avgSamplesPerRun: 10, retestPct: 5, bufferPct: 30, controlsPerRun: 2 })
  expect(p.sequencers![1]).toMatchObject({ platformId: 'ont', customKitReadLengthBp: 10000, customKitMaxOutputMb: 180000 })
  expect(p.equipment![0]).toMatchObject({ name: 'Illumina MiSeq', quantity: 1, unitCostUsd: 99000, lifespanYears: 8, ageYears: 5 })
  expect(p.personnel).toHaveLength(6)
  expect(p.personnel![0]).toMatchObject({ role: 'Clinical microbiologist', annualSalaryUsd: 15000, pctTime: 10 })
  expect(p.adminCostPct).toBe(10)
  expect(p.trainingGroupCostUsd).toBe(5000)
  expect(p.facility!.reduce((s, f) => s + f.monthlyCostUsd, 0)).toBe(2850)
  expect(p.facilityPctSequencing).toBe(20)
  expect(p.transport![0]).toMatchObject({ annualCostUsd: 1000, pctSequencing: 15 })
  expect(p.bioinformatics!.cloudItems[0]).toMatchObject({ pricePerUnit: 500, samplesThisScenario: 500 })
  expect(p.bioinformatics!.inhouseItems.find(i => i.name === 'Low/mid processing workstation')!.pricePerUnit).toBe(7028)
  expect(p.qms!.reduce((s, q) => s + q.costUsd * q.quantity * q.pctSequencing! / 100, 0)).toBe(190)
  expect(p.fixedConsumables!.find(c => c.name === 'Cold packs (24-pck)')).toMatchObject({ quantityPerYear: 2, unitCostUsd: 179.664, workflows: { sample_receipt: true } })
  expect(p.fixedConsumables!.some(c => c.name.includes('Calculated costs'))).toBe(false)
})

it('matches actual workbook equipment and bioinformatics straight-line annual costs', async () => {
  const { calculateCosts } = await import('../lib/calculations')
  const { createDefaultProject } = await import('../lib/defaults')
  const wb = XLSX.readFile('reference/fixtures/GCTv2_DEMO_COMPLETED.xlsx')
  const project = { ...createDefaultProject(), ...parseGctWorkbook(wb) }
  const costs = calculateCosts(project)
  expect(costs.equipment).toBeCloseTo(wb.Sheets['Results - USD'].D13.v, 6)
  expect(costs.bioinformaticsInhouse).toBeCloseTo(3183.6, 6)
  expect(costs.bioinformaticsCloud).toBeCloseTo(156.25, 6)
  expect(costs.facility + costs.transport).toBeCloseTo(6990, 6)
  expect(costs.qms).toBeCloseTo(190, 6)
  expect(Object.values(costs.workflowBreakdown).reduce((s, v) => s + v, 0)).toBeCloseTo(costs.total, 6)
  expect(costs.perPathogenBreakdown.reduce((s, v) => s + v.total, 0)).toBeCloseTo(costs.total, 6)
})

it('preserves explicit zero percentages and rejects unrelated spreadsheets', () => {
  const wb = XLSX.readFile('reference/fixtures/GCTv2_DEMO_COMPLETED.xlsx')
  for (const [sheet, cell] of [['Data entry', 'C20'], ['Data entry', 'C23'], ['Equipment', 'P7'], ['Facility and transport', 'H25'], ['Bioinformatics', 'E43'], ['Quality management', 'E8']]) wb.Sheets[sheet][cell] = { t: 'n', v: 0 }
  const p = parseGctWorkbook(wb)
  expect(p.sequencers![0]).toMatchObject({ bufferPct: 0, retestPct: 0 })
  expect(p.equipment!.find(e => e.name === 'PCR workstation')!.pctSequencing).toBe(0)
  expect(p.transport![0].pctSequencing).toBe(0)
  expect(p.bioinformatics!.inhouseItems.find(i => i.name === 'Low/mid processing workstation')!.pctUse).toBe(0)
  expect(p.qms!.find(q => q.activity === 'Annual BSC certification')!.pctSequencing).toBe(0)
  expect(() => parseGctWorkbook(XLSX.utils.book_new())).toThrow('WHO GCT')
})

it('retains a populated exchange rate while marking the unspecified currency code for review', () => {
  const wb = XLSX.readFile('reference/fixtures/GCTv2_DEMO_COMPLETED.xlsx')
  wb.Sheets['Reagents and consumables'].O2 = { t: 'n', v: 143.5 }
  const p = parseGctWorkbook(wb)
  expect(p.exchangeRate).toBe(143.5)
  expect(p.currency).toBe('LOCAL')
})
