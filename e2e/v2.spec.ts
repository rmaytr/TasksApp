import { expect, test } from '@playwright/test'
import { captureTask, loadSample, railTotal, startEmpty } from './helpers'

test.describe('new area', () => {
  test('the radar button creates an area that shows up everywhere', async ({ page }) => {
    await startEmpty(page)
    await page.getByRole('button', { name: 'New area' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New area' })
    await dialog.getByLabel('Name').fill('Research')
    await dialog.getByRole('button', { name: 'Create area' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /Research/ })).toBeVisible()

    // The new area is immediately usable from capture.
    await captureTask(page, 'Read two papers #research')
    await page.keyboard.press('Escape')
    await page.keyboard.press('3')
    await expect(page.getByRole('heading', { name: /Research/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Read two papers' })).toBeVisible()
  })

  test('duplicate names are refused', async ({ page }) => {
    await startEmpty(page)
    await page.getByRole('button', { name: 'New area' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'New area' })
    await dialog.getByLabel('Name').fill('classes')
    await expect(dialog.getByText('You already have an area with that name.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create area' })).toBeDisabled()
  })
})

test.describe('map view', () => {
  test('shows areas and tasks as a tree and adds a task in place', async ({ page }) => {
    await loadSample(page)
    const before = await railTotal(page)
    await page.keyboard.press('2')
    const map = page.getByRole('list', { name: 'Map of areas and tasks' })
    await expect(map.getByRole('button', { name: /^Classes/ })).toBeVisible()
    await expect(map.getByRole('button', { name: 'Study for the biology midterm' })).toBeVisible()

    await map.getByRole('button', { name: 'Add to Life' }).click()
    const input = map.getByLabel('New task in Life')
    await input.fill('Book dentist appointment')
    await input.press('Enter')
    await expect(map.getByRole('button', { name: 'Book dentist appointment' })).toBeVisible()
    await expect.poll(() => railTotal(page)).toBe(before + 1)
  })

  test('collapsing an area hides its tasks', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    const map = page.getByRole('list', { name: 'Map of areas and tasks' })
    const area = map.getByRole('button', { name: /^Classes/ })
    await expect(area).toHaveAttribute('aria-expanded', 'true')
    await area.click()
    await expect(area).toHaveAttribute('aria-expanded', 'false')
    await expect(map.getByRole('button', { name: 'Study for the biology midterm' })).toBeHidden()
  })

  test('phones get the outline layout', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await loadSample(page)
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'Map' }).click()
    await expect(page.locator('.map--outline')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await context.close()
  })
})

test.describe('repeating tasks', () => {
  test('finishing a weekly task schedules the next one', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Lab report #classes fri')
    await page.keyboard.press('Escape')
    await page.keyboard.press('3')
    await page.getByRole('button', { name: 'Lab report' }).click()
    const detail = page.getByRole('complementary', { name: 'Task details' })
    await detail.getByLabel('Repeats').selectOption('weekly')
    await detail.getByRole('button', { name: 'Mark done' }).click()
    await expect(page.locator('.toast')).toContainText('Next one is due')
    await expect(page.getByRole('button', { name: 'Lab report' })).toHaveCount(1)
  })
})
