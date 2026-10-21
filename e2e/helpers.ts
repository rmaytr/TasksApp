import { expect, type Locator, type Page } from '@playwright/test'

export const WELCOME_TITLE = 'Welcome to Cairn'

/** Opens the app and waits until the task store has hydrated from IndexedDB. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(captureInput(page)).toBeAttached()
}

export function welcome(page: Page): Locator {
  return page.getByRole('dialog', { name: WELCOME_TITLE })
}

export async function startEmpty(page: Page): Promise<void> {
  await openApp(page)
  await welcome(page).getByRole('button', { name: 'Start fresh' }).click()
  await expect(welcome(page)).toBeHidden()
}

export async function loadSample(page: Page): Promise<void> {
  await openApp(page)
  await welcome(page).getByRole('button', { name: 'Try with sample tasks' }).click()
  await expect(welcome(page)).toBeHidden()
}

/** The big capture box on Today. */
export function captureInput(page: Page): Locator {
  return page.locator('#capture-input')
}

/** Type a task into the Today capture box and press Enter. Leaves focus in the input. */
export async function captureTask(page: Page, text: string): Promise<void> {
  const input = captureInput(page)
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

export function sidebar(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' })
}

/** Sidebar footer and nav buttons ("Import", "Settings", "All tasks", …). Phones use the More sheet instead. */
export function sideButton(page: Page, name: string | RegExp): Locator {
  return sidebar(page).getByRole('button', { name, exact: typeof name === 'string' })
}

/** Sum of the open-task counts next to each area in the sidebar. */
export async function areaTotal(page: Page): Promise<number> {
  const counts = await sidebar(page).locator('.side__count').allTextContents()
  return counts.reduce((sum, c) => sum + Number(c), 0)
}

/** A task row's open button in any list (its name starts with the title, then quiet metadata). */
export function taskButton(scope: Page | Locator, title: string): Locator {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return scope.locator('.trow__body').filter({ hasText: new RegExp(`^${escaped}`) })
}

export function radar(page: Page): Locator {
  return page.getByRole('group', { name: 'Task radar' })
}

/** Task nodes on the radar (excludes the hub button). */
export function radarNodes(page: Page): Locator {
  return radar(page).locator('g.node[role="button"]')
}

export function toast(page: Page): Locator {
  return page.locator('.toast')
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
  await sideButton(page, 'Import').click()
  const dialog = page.locator('dialog[open]')
  await dialog.getByLabel('Paste tasks').fill(text)
  await dialog.getByRole('button', { name: 'Preview import' }).click()
}
