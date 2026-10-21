import { expect, test } from '@playwright/test'
import { areaTotal, captureTask, loadSample, radar, radarNodes, sideButton, startEmpty, taskButton, toast } from './helpers'

test.describe('new area', () => {
  test('the sidebar button creates an area that shows up everywhere', async ({ page }) => {
    await startEmpty(page)
    await sideButton(page, 'New area').click()
    const dialog = page.getByRole('dialog', { name: 'New area' })
    await dialog.getByLabel('Name').fill('Research')
    await dialog.getByRole('button', { name: 'Create area' }).click()
    await expect(dialog).toBeHidden()
    await expect(sideButton(page, /^Research/)).toBeVisible()

    // The new area is immediately usable from capture.
    await captureTask(page, 'Read two papers #research')
    await sideButton(page, /^Research/).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible()
    await expect(taskButton(page, 'Read two papers')).toBeVisible()
  })

  test('duplicate names are refused', async ({ page }) => {
    await startEmpty(page)
    await sideButton(page, 'New area').click()
    const dialog = page.getByRole('dialog', { name: 'New area' })
    await dialog.getByLabel('Name').fill('classes')
    await expect(dialog.getByText('You already have an area with that name.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create area' })).toBeDisabled()
  })
})

test.describe('map view', () => {
  test('shows areas and tasks as a tree and adds a task in place', async ({ page }) => {
    await loadSample(page)
    const before = await areaTotal(page)
    await page.goto('/#tasks/map')
    const map = page.getByRole('list', { name: 'Map of areas and tasks' })
    await expect(map.getByRole('button', { name: /^Classes/ })).toBeVisible()
    await expect(map.getByRole('button', { name: 'Study for the biology midterm' })).toBeVisible()

    await map.getByRole('button', { name: 'Add to Life' }).click()
    const input = map.getByLabel('New task in Life')
    await input.fill('Book dentist appointment')
    await input.press('Enter')
    await expect(map.getByRole('button', { name: 'Book dentist appointment' })).toBeVisible()
    await expect.poll(() => areaTotal(page)).toBe(before + 1)
  })

  test('collapsing an area hides its tasks', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Map' }).click()
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
    await page.goto('/#tasks/map')
    await expect(page.locator('.map--outline')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await context.close()
  })
})

test.describe('radar view', () => {
  test('fills the stage and shows one dot per open task', async ({ page }) => {
    await loadSample(page)
    const total = await areaTotal(page)
    await page.goto('/#tasks/radar')
    await expect(radar(page)).toBeVisible()
    await expect(radarNodes(page)).toHaveCount(total)
    const box = await radar(page).boundingBox()
    expect(box?.height ?? 0).toBeGreaterThan(400)
  })
})

test.describe('repeating tasks', () => {
  test('finishing a weekly task schedules the next one', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Lab report #classes fri')
    await sideButton(page, 'All tasks').click()
    await taskButton(page, 'Lab report').click()
    const detail = page.getByRole('complementary', { name: 'Task details' })
    await detail.getByText('More options').click()
    await detail.getByLabel('Repeats').selectOption('weekly')
    await detail.getByRole('button', { name: 'Mark done' }).click()
    await expect(toast(page)).toContainText('Next one is due')
    await expect(taskButton(page, 'Lab report')).toHaveCount(1)
  })
})

test.describe('do after', () => {
  test('a task can wait for another, and the list says so', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Publish the site #projects')
    await captureTask(page, 'Add the site to my resume #career')
    await sideButton(page, 'All tasks').click()
    await taskButton(page, 'Add the site to my resume').click()
    const detail = page.getByRole('complementary', { name: 'Task details' })
    await detail.getByLabel('Do this after another task').selectOption({ label: 'Publish the site' })
    await detail.getByRole('button', { name: 'Close details' }).click()
    await expect(taskButton(page, 'Add the site to my resume')).toContainText('After “Publish the site”')
  })
})
