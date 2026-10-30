import { test, expect } from '@playwright/test'
import XLSX from 'xlsx'
import { readFile } from 'node:fs/promises'

// Exercise the actual import and downloadable checkpoint, not a synthetic share URL.
test('WHO workbook import survives save, reload and JSON export', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file][accept=".xlsx"]').setInputFiles('reference/fixtures/GCTv2_DEMO_COMPLETED.xlsx')
  await expect(page).toHaveURL('/wizard/1')
  await expect(page.getByRole('note')).toContainText('annual workbook quantities')
  await expect(page.getByRole('button', { name: /Save/i, exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Save/i, exact: true }).click()
  await page.reload()
  await page.goto('/')
  await page.getByRole('button', { name: /Open/i, exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download project/i }).click()
  const download = await pending
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(data.pathogens.map((p: { samplesPerYear: number }) => p.samplesPerYear)).toEqual([500, 300])
  expect(data.sequencers[0].reagentKitPrice).toBe(1194)
  expect(data.sequencers[0].libPrepCostPerSample).toBeCloseTo(4153 / 96, 8)
  expect(data.facilityPctSequencing).toBe(20)
  expect(data.equipment[0].name).toBe('Illumina MiSeq')
  await page.getByRole('button', { name: /^8 / }).click()
  await expect(page).toHaveURL('/wizard/8')
  await expect(page.getByRole('status')).toContainText('Draft estimate')
  await expect(page.getByTestId('csv-btn')).toBeVisible()
  const csvPending = page.waitForEvent('download')
  await page.getByTestId('csv-btn').click()
  const csv = await csvPending
  expect(await readFile((await csv.path())!, 'utf8')).toContain('Salmonella')
  const excelPending = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export Excel/i }).click()
  const excel = await excelPending
  const workbook = XLSX.read(await readFile((await excel.path())!))
  const equipmentRows = XLSX.utils.sheet_to_json(workbook.Sheets.Equipment, { header: 1 }) as unknown[][]
  const miseq = equipmentRows.find(row => row[0] === 'Illumina MiSeq')!
  expect(miseq[8]).toBe(12375)
  expect(miseq[9]).toBe(14850)
  expect(miseq[10]).toBe(27225)
  await page.evaluate(() => { window.print = () => { document.body.dataset.printCalled = 'yes' } })
  await page.getByTestId('print-btn').click()
  await expect(page.locator('body')).toHaveAttribute('data-print-called', 'yes')
})

test('direct result navigation keeps step numbers and flags unpriced inputs', async ({ page }) => {
  await page.goto('/wizard/8')
  await expect(page.getByRole('button', { name: /^1 / })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Draft estimate')
})
