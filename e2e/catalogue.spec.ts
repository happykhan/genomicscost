import { test, expect } from '@playwright/test'

test.describe('Catalogue editor', () => {
  test.beforeEach(async ({ page }) => {
    // Clear catalogue overrides before each test
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('gct.catalogue.overrides'))
  })

  test('navigates to /catalogue and shows tabs', async ({ page }) => {
    await page.goto('/catalogue')
    await expect(page.getByText('Catalogue Editor')).toBeVisible()
    await expect(page.getByRole('button', { name: /Reagent kits/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Equipment/i })).toBeVisible()
  })

  test('edits an equipment price and sees it reflected in Step 4', async ({ page }) => {
    // 1. Go to catalogue, switch to Equipment tab
    await page.goto('/catalogue')
    await page.getByRole('button', { name: /Equipment/i }).click()

    // 2. Find iSeq 100 row and edit its price
    const row = page.locator('tr', { hasText: 'Illumina iSeq 100' }).first()
    await expect(row).toBeVisible()

    // The unit cost input in the row
    const costInput = row.locator('input[type="number"]').first()
    await costInput.fill('99999')

    // Verify the override badge appears
    await expect(row.locator('span[title="User override"]')).toBeVisible()

    // 3. Navigate to Step 4 (Equipment) and check the price
    await page.goto('/wizard/4')

    // The iSeq 100 should show the new price in its cost input
    const equipRow = page.locator('div', { hasText: 'Illumina iSeq 100' }).first()
    await expect(equipRow).toBeVisible()
  })

  test('adds a custom reagent and sees it in catalogue', async ({ page }) => {
    await page.goto('/catalogue')

    // Switch to Reagents tab
    await page.getByRole('button', { name: /^Reagents/i }).click()

    // Click Add row
    await page.getByRole('button', { name: /Add row/i }).click()

    // Fill in the name
    const modal = page.locator('[class*="card"]').filter({ hasText: 'Add custom item' })
    await expect(modal).toBeVisible()
    await modal.locator('input[type="text"]').first().fill('Custom Test Reagent')

    // Click Add
    await modal.getByRole('button', { name: /^Add$/i }).click()

    // Verify the new row appears
    await expect(page.locator('tr', { hasText: 'Custom Test Reagent' })).toBeVisible()
  })

  test('deletes a reagent kit and restores it', async ({ page }) => {
    await page.goto('/catalogue')

    // On Reagent kits tab (default), count initial rows
    const initialRowCount = await page.locator('tbody tr').count()

    // Delete the first kit
    const firstRow = page.locator('tbody tr').first()
    await firstRow.getByRole('button', { name: /Delete/i }).click()

    // The deleted row should now show a Restore button (last rows in the table are deleted items)
    const restoreBtn = page.getByRole('button', { name: /Restore/i }).first()
    await expect(restoreBtn).toBeVisible()

    // Restore it
    await restoreBtn.click()

    // Row count should be back to the original (no deleted rows visible)
    await expect(page.locator('tbody tr')).toHaveCount(initialRowCount)
    // The first row should have a Delete button again
    await expect(page.locator('tbody tr').first().getByRole('button', { name: /Delete/i })).toBeVisible()
  })
})
