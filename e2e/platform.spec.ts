import { promises as fs } from 'node:fs'
import { expect, test } from '@playwright/test'
import { WELCOME_TITLE, expectPersisted, loadSample, openApp, radarNodes, railTotal, railButton } from './helpers'

test.describe('export round-trip', () => {
  test('Back up (JSON) downloads a file that imports to the same task count', async ({ page, browser }) => {
    await loadSample(page)
    await expect.poll(() => railTotal(page)).toBeGreaterThan(0)
    const total = await railTotal(page)

    await railButton(page, 'Settings').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Back up (JSON)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^nearer-backup-.*\.json$/)
    const json = await fs.readFile(await download.path(), 'utf8')
    expect(() => JSON.parse(json)).not.toThrow()

    const context = await browser.newContext()
    try {
      const fresh = await context.newPage()
      await openApp(fresh)
      await expect(fresh.getByRole('heading', { name: WELCOME_TITLE })).toBeVisible()
      await fresh.getByRole('button', { name: 'Import my list' }).click()
      const dialog = fresh.locator('dialog[open]')
      await dialog.getByLabel('Paste tasks').fill(json)
      await dialog.getByRole('button', { name: 'Preview import' }).click()
      await expect(dialog.getByText(new RegExp(`Found ${total} tasks in JSON`))).toBeVisible()
      await dialog.getByRole('button', { name: `Add ${total} tasks` }).click()
      await expect(dialog).toHaveCount(0)
      await expect.poll(() => railTotal(fresh)).toBe(total)
      await expect(radarNodes(fresh)).toHaveCount(total)
    } finally {
      await context.close()
    }
  })
})

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('bottom nav shows, rail is hidden, no horizontal scroll', async ({ page }) => {
    await openApp(page)
    const scrollWidth = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth)
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    expect(await scrollWidth()).toBeLessThanOrEqual(375)

    await page.getByRole('button', { name: 'Try it with sample tasks' }).click()
    await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeHidden()
    await expect(radarNodes(page).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    expect(await scrollWidth()).toBeLessThanOrEqual(375)

    for (const view of ['Map', 'List', 'Focus', 'Reset']) {
      await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: view }).click()
      expect(await scrollWidth(), `${view} view`).toBeLessThanOrEqual(375)
    }
  })
})

test.describe('offline', () => {
  test('app still renders after reload while offline', async ({ page, context }) => {
    await loadSample(page)
    await expectPersisted(page, 'Finish problem set 4')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    // Make sure the worker controls the page before going offline.
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByLabel('New task')).toBeVisible()
    await expect(radarNodes(page).first()).toBeVisible()
    await context.setOffline(false)
  })
})
