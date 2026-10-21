import { expect, test } from '@playwright/test'
import {
  WELCOME_TITLE,
  captureTask,
  expectPersisted,
  hub,
  hubCount,
  importText,
  loadSample,
  openApp,
  radar,
  radarNodes,
  railTotal,
  startEmpty,
  toast,
} from './helpers'

test.describe('welcome and sample data', () => {
  test('first visit shows welcome and sample tasks populate the radar and rail', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeVisible()

    await page.getByRole('button', { name: 'Try it with sample tasks' }).click()

    await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeHidden()
    await expect(radar(page)).toBeVisible()
    await expect(radarNodes(page).first()).toBeVisible()
    expect(await radarNodes(page).count()).toBeGreaterThan(5)
    await expect.poll(() => railTotal(page)).toBeGreaterThan(0)
    await expect(page.locator('.rail__count').first()).not.toHaveText('0')
  })
})

test.describe('quick capture', () => {
  test('"/" focuses capture, chips preview tokens, Enter adds, List shows the row', async ({ page }) => {
    await startEmpty(page)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('/')
    const input = page.getByLabel('New task')
    await expect(input).toBeFocused()

    await input.pressSequentially('Email mentee #orgs tomorrow !')
    await expect(page.getByLabel('Area for this task')).toHaveValue('orgs')
    const chips = page.locator('.capture__chips')
    await expect(chips.locator('.chip--due')).toHaveText('Tomorrow')
    await expect(chips.locator('.chip--high')).toHaveText('High priority')

    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect(toast(page)).toContainText('Added to Orgs')

    await input.press('Escape')
    await page.keyboard.press('2')
    const orgs = page.locator('section.list__group').filter({ has: page.getByRole('heading', { name: /^Orgs/ }) })
    const row = orgs.locator('li.row').filter({ hasText: 'Email mentee' })
    await expect(row).toBeVisible()
    await expect(row.locator('.tag--high')).toHaveText('High')
    await expect(row.getByText('Tomorrow')).toBeVisible()
  })
})

test.describe('import', () => {
  test('preview shows steps and areas, Add adds, Undo removes', async ({ page }) => {
    await startEmpty(page)
    await importText(
      page,
      [
        'Apply for scholarship: get rec letter, research the application',
        'CS303 homework 5',
        'Email professor about office hours',
        'Buy groceries',
      ].join('\n'),
    )

    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByText(/Found 4 tasks/)).toBeVisible()
    const scholarship = dialog.locator('li.pv__row').filter({ hasText: 'Apply for scholarship' })
    await expect(scholarship).toContainText(/get rec letter/i)
    await expect(scholarship).toContainText(/research the application/i)
    const classes = dialog.locator('section.pv').filter({ has: page.getByRole('heading', { name: /^Classes/ }) })
    await expect(classes.getByText('CS303 homework 5')).toBeVisible()

    await dialog.getByRole('button', { name: 'Add 4 tasks' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(toast(page)).toContainText('Added 4 tasks')
    await expect.poll(() => railTotal(page)).toBe(4)
    await expect(radarNodes(page)).toHaveCount(4)

    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => railTotal(page)).toBe(0)
    await expect(radarNodes(page)).toHaveCount(0)
  })
})

test.describe('persistence', () => {
  test('a task survives a reload', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Remember the milk')
    await expectPersisted(page, 'Remember the milk')

    await page.reload()
    await expect(page.getByLabel('New task')).toBeVisible()
    await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeHidden()
    await expect(radar(page).getByRole('button', { name: /^Remember the milk/ })).toBeVisible()
    await expect.poll(() => railTotal(page)).toBe(1)
  })
})

test.describe('list', () => {
  test('checking a task hides it, Undo restores it', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    const checkboxes = page.getByRole('checkbox', { name: /^Done: / })
    await expect(checkboxes.first()).toBeVisible()
    const before = await checkboxes.count()

    const first = checkboxes.first()
    const label = (await first.getAttribute('aria-label')) ?? ''
    const title = label.replace(/^Done: /, '')
    await first.click()

    await expect(page.getByRole('checkbox', { name: label, exact: true })).toHaveCount(0)
    await expect(checkboxes).toHaveCount(before - 1)
    await expect(toast(page)).toBeVisible()

    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(checkboxes).toHaveCount(before)
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
  })
})

test.describe('task detail', () => {
  test('open a node, add a step, move to Today, hub count increases', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Plan the trip @later')
    await page.getByLabel('New task').press('Escape')

    const before = await hubCount(page)
    expect(before).toBe(0)

    await radarNodes(page).first().click()
    const detail = page.getByRole('complementary', { name: 'Task details' })
    await expect(detail).toBeVisible()

    const step = detail.getByLabel('New step')
    await expect(step).toHaveAttribute('placeholder', 'Break it into smaller steps')
    await step.fill('Book flights')
    await step.press('Enter')
    await expect(detail.getByLabel('Step', { exact: true })).toHaveValue('Book flights')

    await detail.getByRole('button', { name: 'Today', exact: true }).click()
    await expect(detail.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => hubCount(page)).toBe(before + 1)
    await expect(hub(page)).toHaveAttribute('aria-label', /^1 for today/)
  })
})

test.describe('focus', () => {
  test('Done advances to the next task', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('3')
    const title = page.locator('#focus-title')
    await expect(title).toBeVisible()
    const first = (await title.textContent()) ?? ''
    expect(first).not.toBe('')

    await page.getByRole('button', { name: 'Done' }).click()

    await expect(title).toBeVisible()
    await expect(title).not.toHaveText(first)
  })
})
