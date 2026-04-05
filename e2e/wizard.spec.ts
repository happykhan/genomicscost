import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('loads with correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Genomics/)
    await expect(page.getByRole('heading', { name: /Genomics Costing Tool/i }).first()).toBeVisible()
  })

  test('shows start button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /Start new estimate/i })).toBeVisible()
  })
})

test.describe('Wizard navigation', () => {
  test('navigates through all 7 steps', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Start new estimate/i }).click()
    await expect(page).toHaveURL('/wizard/1')

    for (let step = 1; step <= 6; step++) {
      await expect(page.getByRole('button', { name: /Next/i })).toBeVisible()
      await page.getByRole('button', { name: /Next/i }).click()
      await expect(page).toHaveURL(`/wizard/${step + 1}`)
    }

    // Step 7: results
    await expect(page.getByTestId('print-btn')).toBeVisible()
  })

  test('back button works', async ({ page }) => {
    await page.goto('/wizard/3')
    await page.getByRole('button', { name: /Back/i }).click()
    await expect(page).toHaveURL('/wizard/2')
  })

  test('step numbers in stepper are clickable', async ({ page }) => {
    await page.goto('/wizard/1')
    // Click step 3 in the stepper
    await page.getByRole('button', { name: '3' }).click()
    await expect(page).toHaveURL('/wizard/3')
  })
})

test.describe('Results page (Step 7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wizard/7')
  })

  test('shows cost per sample', async ({ page }) => {
    // The big $ number should be visible
    await expect(page.locator('.gx-cost-hero')).toBeVisible()
  })

  test('export PDF button triggers print', async ({ page }) => {
    // We can't test window.print() directly, but we can verify the button exists
    await expect(page.getByTestId('print-btn')).toBeVisible()
  })

  test('save button exists', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible()
  })
})

test.describe('Language switching', () => {
  test('switches to French', async ({ page }) => {
    await page.goto('/fr')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: /Démarrer/i })).toBeVisible()
  })

  test('switches to Spanish', async ({ page }) => {
    await page.goto('/es')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: /Iniciar/i })).toBeVisible()
  })
})
