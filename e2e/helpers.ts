import { expect, type Locator, type Page } from '@playwright/test'

export const WELCOME_TITLE = 'Everything you’re carrying, at a glance.'

/** Opens the app and waits until the task store has hydrated from IndexedDB. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByLabel('New task')).toBeVisible()
}

export async function startEmpty(page: Page): Promise<void> {
  await openApp(page)
  await page.getByRole('button', { name: 'Start empty' }).click()
  await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeHidden()
}

export async function loadSample(page: Page): Promise<void> {
  await openApp(page)
  await page.getByRole('button', { name: 'Try it with sample tasks' }).click()
  await expect(page.getByRole('heading', { name: WELCOME_TITLE })).toBeHidden()
}

/** Type a task into the capture bar and press Enter. Leaves focus in the input. */
export async function captureTask(page: Page, text: string): Promise<void> {
  const input = page.getByLabel('New task')
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

export function radar(page: Page): Locator {
  return page.getByRole('group', { name: 'Task radar' })
}

/** Task nodes on the radar (excludes the "for today" hub button). */
export function radarNodes(page: Page): Locator {
  return radar(page).locator('g.node[role="button"]')
}

export function hub(page: Page): Locator {
  return radar(page).getByRole('button', { name: /for today\. Open Focus/ })
}

export async function hubCount(page: Page): Promise<number> {
  const label = (await hub(page).getAttribute('aria-label')) ?? ''
  return Number(label.match(/^(\d+)/)?.[1] ?? Number.NaN)
}

/** Sum of the open-task counts in the Areas rail. */
export async function railTotal(page: Page): Promise<number> {
  const counts = await page.locator('.rail__count').allTextContents()
  return counts.reduce((sum, c) => sum + Number(c), 0)
}

export function toast(page: Page): Locator {
  return page.locator('.toast')
}

/** Desktop rail footer buttons ("Import", "Settings"). The top bar copies only show on phones. */
export function railButton(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true })
}

/** Wait until the debounced IndexedDB write has stored a value containing `needle`. */
export async function expectPersisted(page: Page, needle: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          (text) =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open('keyval-store')
              open.onerror = () => resolve(false)
              open.onsuccess = () => {
                const db = open.result
                if (!db.objectStoreNames.contains('keyval')) {
                  db.close()
                  resolve(false)
                  return
                }
                const req = db.transaction('keyval').objectStore('keyval').getAll()
                req.onerror = () => {
                  db.close()
                  resolve(false)
                }
                req.onsuccess = () => {
                  const found = req.result.some((v: unknown) => typeof v === 'string' && v.includes(text))
                  db.close()
                  resolve(found)
                }
              }
            }),
          needle,
        ),
      { message: `IndexedDB should contain "${needle}"` },
    )
    .toBe(true)
}

export async function importText(page: Page, text: string): Promise<void> {
  await railButton(page, 'Import').click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByLabel('Paste tasks').fill(text)
  await dialog.getByRole('button', { name: 'Preview import' }).click()
}
