import { promises as fs } from 'node:fs'
import { expect, test } from '@playwright/test'
import { areaTotal, captureInput, expectPersisted, loadSample, openApp, sideButton, welcome } from './helpers'

test.describe('export round-trip', () => {
  test('Back up (JSON) downloads a file that imports to the same task count', async ({ page, browser }) => {
    await loadSample(page)
    await expect.poll(() => areaTotal(page)).toBeGreaterThan(0)
    const total = await areaTotal(page)

    await sideButton(page, 'Settings').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Back up (JSON)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^cairn-backup-.*\.json$/)
    const json = await fs.readFile(await download.path(), 'utf8')
    expect(() => JSON.parse(json)).not.toThrow()

    const context = await browser.newContext()
    try {
      const fresh = await context.newPage()
      await openApp(fresh)
      await welcome(fresh).getByRole('button', { name: 'Import my list' }).click()
      const dialog = fresh.locator('dialog[open]')
      await dialog.getByLabel('Paste tasks').fill(json)
      await dialog.getByRole('button', { name: 'Preview import' }).click()
      await expect(dialog.getByText(new RegExp(`Found ${total} tasks in JSON`))).toBeVisible()
      await dialog.getByRole('button', { name: `Add ${total} tasks` }).click()
      await expect(dialog).toHaveCount(0)
      await expect.poll(() => areaTotal(fresh)).toBe(total)
    } finally {
      await context.close()
    }
  })
})

test.describe('phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('bottom nav shows, sidebar is hidden, no horizontal scroll anywhere', async ({ page }) => {
    await openApp(page)
    const scrollWidth = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth)
    const tabs = page.getByRole('navigation', { name: 'Views' })
    await expect(tabs).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()

    await welcome(page).getByRole('button', { name: 'Try with sample tasks' }).click()
    await expect(welcome(page)).toBeHidden()
    expect(await scrollWidth()).toBeLessThanOrEqual(375)

    for (const view of ['Tasks', 'Focus', 'Today']) {
      await tabs.getByRole('button', { name: view }).click()
      expect(await scrollWidth(), `${view} view`).toBeLessThanOrEqual(375)
    }
    await tabs.getByRole('button', { name: 'Tasks' }).click()
    for (const mode of ['Map', 'Radar']) {
      await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: mode }).click()
      expect(await scrollWidth(), `${mode} mode`).toBeLessThanOrEqual(375)
    }
  })

  test('More opens areas, and an area opens its page', async ({ page }) => {
    await loadSample(page)
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await sheet.getByRole('button', { name: /^Career/ }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Career' })).toBeVisible()
  })

  test('the center + opens New task', async ({ page }) => {
    await loadSample(page)
    await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: 'New task' }).click()
    await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible()
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
    await expect(captureInput(page)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible()
    await context.setOffline(false)
  })
})
