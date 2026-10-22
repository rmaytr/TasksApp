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
    await detail.getByRole('button', { name: 'Repeat' }).click()
    await detail.getByLabel('Repeats').selectOption('weekly')
    await detail.getByRole('button', { name: 'Done', exact: true }).click()
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
    await detail.getByRole('button', { name: 'After another task' }).click()
    await detail.getByLabel('Do this after another task').selectOption({ label: 'Publish the site' })
    await detail.getByRole('button', { name: 'Close details' }).click()
    await expect(taskButton(page, 'Add the site to my resume')).toContainText('after Publish the site')
  })
})

test.describe('area menu', () => {
  test('rename, recolour, reorder and delete an area from the sidebar', async ({ page }) => {
    await loadSample(page)
    const side = page.getByRole('navigation', { name: 'Main' })
    const openMenu = async (name: string) => {
      await side.getByRole('button', { name: new RegExp(`^${name}`) }).first().hover()
      await side.getByRole('button', { name: `Options for ${name}` }).click()
      return page.getByRole('menu', { name: `${name} options` })
    }

    let menu = await openMenu('Learning')
    await menu.getByRole('menuitem', { name: 'Rename' }).click()
    const input = side.getByLabel('Rename Learning')
    await input.fill('Study')
    await input.press('Enter')
    await expect(sideButton(page, /^Study/)).toBeVisible()

    menu = await openMenu('Study')
    await menu.getByRole('menuitemradio', { name: 'Rose' }).click()
    await expect(menu.getByRole('menuitemradio', { name: 'Rose' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    menu = await openMenu('Study')
    await menu.getByRole('menuitem', { name: 'Move up' }).click()
    // Reordering keeps the menu open so it can be repeated.
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    const names = await side.locator('.side__area-name').allTextContents()
    expect(names.indexOf('Study')).toBeLessThan(names.indexOf('Projects'))

    const before = await areaTotal(page)
    menu = await openMenu('Study')
    await menu.getByRole('menuitem', { name: 'Delete area…' }).click()
    await menu.getByLabel('Move its tasks to').selectOption({ label: 'Life' })
    await menu.getByRole('button', { name: 'Delete' }).click()
    await expect(sideButton(page, /^Study/)).toHaveCount(0)
    await expect.poll(() => areaTotal(page)).toBe(before)
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(sideButton(page, /^Study/)).toBeVisible()
  })

  test('Add a task here opens New task in that area', async ({ page }) => {
    await loadSample(page)
    const side = page.getByRole('navigation', { name: 'Main' })
    await side.getByRole('button', { name: /^Career/ }).first().hover()
    await side.getByRole('button', { name: 'Options for Career' }).click()
    await page.getByRole('menuitem', { name: 'Add a task here' }).click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    await dialog.getByLabel('New task').fill('Email the recruiter')
    await expect(dialog.locator('.capture__area select')).toHaveValue('career')
  })
})

test.describe('task menu', () => {
  test('⋯ sets a date, moves and deletes without opening the task', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    const row = page.locator('.trow').filter({ has: taskButton(page, 'Call home') })
    await row.hover()
    await row.getByRole('button', { name: 'Actions for Call home' }).click()
    let menu = page.getByRole('menu', { name: 'Actions for Call home' })
    await menu.getByRole('menuitem', { name: /^Tomorrow/ }).click()
    await expect(row.locator('.due')).toHaveText('Tomorrow')

    await row.click({ button: 'right' })
    menu = page.getByRole('menu', { name: 'Actions for Call home' })
    await menu.getByRole('menuitem', { name: 'Move to area…' }).click()
    await menu.getByRole('menuitemradio', { name: /Career/ }).click()
    const career = page.locator('section.list__group').filter({ has: page.getByRole('heading', { name: /^Career/ }) })
    await expect(taskButton(career, 'Call home')).toBeVisible()

    const moved = career.locator('.trow').filter({ has: taskButton(page, 'Call home') })
    await moved.click({ button: 'right' })
    await page.getByRole('menu', { name: 'Actions for Call home' }).getByRole('menuitem', { name: 'Delete' }).click()
    await expect(taskButton(page, 'Call home')).toHaveCount(0)
  })

  test('drag a task onto an area in the sidebar', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    const row = page.locator('.trow').filter({ has: taskButton(page, 'Call home') }).locator('.trow__main')
    await row.dragTo(sideButton(page, /^Projects/))
    await expect(toast(page).last()).toContainText('Moved to Projects')
    const projects = page.locator('section.list__group').filter({ has: page.getByRole('heading', { name: /^Projects/ }) })
    await expect(taskButton(projects, 'Call home')).toBeVisible()
  })
})
