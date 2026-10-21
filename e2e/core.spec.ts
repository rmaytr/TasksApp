import { expect, test } from '@playwright/test'
import {
  areaTotal,
  captureInput,
  captureTask,
  expectPersisted,
  importText,
  loadSample,
  openApp,
  sideButton,
  sidebar,
  startEmpty,
  taskButton,
  toast,
  welcome,
} from './helpers'

test.describe('welcome', () => {
  test('first visit shows one modal welcome that closes once you pick a start', async ({ page }) => {
    await openApp(page)
    await expect(welcome(page)).toBeVisible()
    await expect(welcome(page).getByRole('button', { name: 'Import my list' })).toBeFocused()

    await welcome(page).getByRole('button', { name: 'Try with sample tasks' }).click()

    await expect(welcome(page)).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible()
    await expect.poll(() => areaTotal(page)).toBeGreaterThan(5)
    await expectPersisted(page, '"onboarded":true')

    await page.reload()
    await expect(captureInput(page)).toBeVisible()
    await expect(welcome(page)).toBeHidden()
  })

  test('the brand goes home from anywhere', async ({ page }) => {
    await loadSample(page)
    await sideButton(page, 'All tasks').click()
    await expect(page).toHaveURL(/#tasks$/)
    await sideButton(page, 'Cairn, go to Today').click()
    await expect(page).toHaveURL(/#home$/)
    await expect(captureInput(page)).toBeVisible()
  })
})

test.describe('capture', () => {
  test('"/" focuses capture, the preview reads the words, Enter adds', async ({ page }) => {
    await startEmpty(page)
    await page.locator('body').click({ position: { x: 600, y: 5 } })
    await page.keyboard.press('/')
    const input = captureInput(page)
    await expect(input).toBeFocused()

    await input.pressSequentially('Email mentee #orgs tomorrow !')
    const form = page.getByRole('form', { name: 'Add a task' }).first()
    await expect(form.locator('.capture__area select')).toHaveValue('orgs')
    await expect(form.locator('.due')).toHaveText('Tomorrow')
    await expect(form.locator('.tag--high')).toHaveText('High priority')

    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect(toast(page)).toContainText('Added to Orgs')

    await sideButton(page, /^Orgs/).click()
    const row = page.locator('.trow').filter({ has: taskButton(page, 'Email mentee') })
    await expect(row).toBeVisible()
    await expect(row.locator('.due')).toHaveText('Tomorrow')
    await expect(row.locator('.trow__flag')).toBeVisible()
  })

  test('the area is guessed from the words alone', async ({ page }) => {
    await startEmpty(page)
    await captureInput(page).fill('Finish the calculus homework')
    await expect(page.locator('.capture__area select').first()).toHaveValue('classes')
  })

  test('New task opens a dialog that stays open for a brain dump', async ({ page }) => {
    await startEmpty(page)
    await sideButton(page, 'New task').click()
    const dialog = page.getByRole('dialog', { name: 'New task' })
    const input = dialog.getByLabel('New task')
    await expect(input).toBeFocused()
    for (const title of ['Buy stamps', 'Call the bank']) {
      await input.fill(title)
      await input.press('Enter')
    }
    await expect(dialog.getByRole('list', { name: 'Added just now' }).getByRole('listitem')).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect.poll(() => areaTotal(page)).toBe(2)
  })
})

test.describe('areas', () => {
  test('clicking an area opens its page with only its tasks', async ({ page }) => {
    await loadSample(page)
    await sideButton(page, /^Classes/).click()
    await expect(page).toHaveURL(/#area\/classes$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Classes' })).toBeVisible()
    await expect(taskButton(page, 'Study for the biology midterm')).toBeVisible()
    await expect(taskButton(page, 'Call home')).toHaveCount(0)
    await expect(sideButton(page, /^Classes/)).toHaveAttribute('aria-current', 'page')
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
    await expect.poll(() => areaTotal(page)).toBe(4)

    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => areaTotal(page)).toBe(0)
  })
})

test.describe('persistence', () => {
  test('a task survives a reload', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Remember the milk')
    await expectPersisted(page, 'Remember the milk')

    await page.reload()
    await expect(captureInput(page)).toBeVisible()
    await expect(welcome(page)).toBeHidden()
    await page.keyboard.press('2')
    await expect(taskButton(page, 'Remember the milk')).toBeVisible()
    await expect.poll(() => areaTotal(page)).toBe(1)
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
    await first.click()

    await expect(page.getByRole('checkbox', { name: label, exact: true })).toHaveCount(0)
    await expect(checkboxes).toHaveCount(before - 1)

    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(checkboxes).toHaveCount(before)
  })

  test('sorting by priority puts flagged tasks first in each area, and reverse flips it', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    await page.getByLabel('Sort by').selectOption('priority')
    const career = page.locator('section.list__group').filter({ has: page.getByRole('heading', { name: /^Career/ }) })
    const rows = career.locator('.trow')
    await expect(rows.first().locator('.trow__flag')).toBeVisible()
    await page.getByRole('button', { name: 'Reverse order' }).click()
    await expect(rows.last().locator('.trow__flag')).toBeVisible()
    await expect(rows.first().locator('.trow__flag')).toHaveCount(0)
  })
})

test.describe('task detail', () => {
  test('add a step, move to Today, raise priority; Today shows it', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Plan the trip @later')
    await sideButton(page, 'All tasks').click()
    await taskButton(page, 'Plan the trip').click()

    const detail = page.getByRole('complementary', { name: 'Task details' })
    await expect(detail).toBeVisible()
    const step = detail.getByLabel('New step')
    await step.fill('Book flights')
    await step.press('Enter')
    await expect(detail.getByLabel('Step', { exact: true })).toHaveValue('Book flights')

    await detail.getByRole('button', { name: 'Add a date' }).click()
    await detail.getByRole('group', { name: 'Quick dates' }).getByRole('button', { name: /^Today/ }).click()
    await expect(detail.getByRole('button', { name: /^Due Today/ })).toBeVisible()
    await detail.getByRole('button', { name: /^Priority/ }).click()
    await detail.getByRole('group', { name: 'Priority' }).getByRole('button', { name: /High/ }).click()
    await expect(detail.getByRole('button', { name: 'Priority: High' })).toBeVisible()
    // Rare options stay hidden until asked for.
    await expect(detail.getByLabel('Waiting on')).toHaveCount(0)

    await detail.getByRole('button', { name: 'Close details' }).click()
    await page.keyboard.press('1')
    await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible()
    await expect(page.locator('.home').getByRole('button', { name: 'Plan the trip', exact: true })).toBeVisible()
  })
})

test.describe('reminders', () => {
  test('a task due today shows in the Coming up strip', async ({ page }) => {
    await startEmpty(page)
    await captureTask(page, 'Pay the electric bill today')
    const strip = page.getByRole('region', { name: 'Coming up' })
    await expect(strip).toBeVisible()
    await expect(strip.getByRole('button', { name: /Pay the electric bill/ })).toBeVisible()
  })
})

test.describe('lock in', () => {
  test('picks one thing, and Done moves on and adds a stone', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('3')
    await expect(sidebar(page).getByRole('button', { name: 'Lock in' })).toHaveAttribute('aria-current', 'page')
    await page.locator('.lockin__go').click()
    const step = page.locator('#now-step')
    await expect(step).toBeVisible()
    const first = (await step.textContent()) ?? ''
    expect(first).not.toBe('')

    await page.getByRole('button', { name: 'Done', exact: true }).click()

    await expect(page.getByText('1 done')).toBeVisible()
    await expect(page.getByRole('img', { name: 'A cairn of 1 stone' })).toBeVisible()
    await expect(step).not.toHaveText(first)
  })

  test('Lock in from a task starts with that task', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    await taskButton(page, 'Call home').click()
    await page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Lock in' }).click()
    await expect(page.locator('#now-step')).toHaveText('Call home')
  })

  test('without the assistant, Make it smaller asks for a first step', async ({ page }) => {
    await loadSample(page)
    await page.keyboard.press('2')
    await taskButton(page, 'Call home').click()
    await page.getByRole('complementary', { name: 'Task details' }).getByRole('button', { name: 'Lock in' }).click()
    await page.getByRole('button', { name: 'Make it smaller' }).click()
    const input = page.getByLabel('First step')
    await input.fill('Find a quiet spot')
    await input.press('Enter')
    await expect(page.locator('#now-step')).toHaveText('Find a quiet spot')
  })
})
