// Renders the app mark to PNG icons with headless Chromium (run: node scripts/make-icons.mjs).
import { chromium } from '@playwright/test'

const mark = (size, inset) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#17212b"/>
  <g transform="translate(50 50) scale(${(1 - inset * 2) * 1.0})">
    <circle r="36" fill="none" stroke="#e8ece6" stroke-opacity=".3" stroke-width="3.4"/>
    <circle r="22" fill="none" stroke="#e8ece6" stroke-opacity=".6" stroke-width="3.4"/>
    <circle r="9.5" fill="#e8ece6"/>
    <circle cx="19.5" cy="-17.5" r="7" fill="#f2b02e"/>
  </g>
</svg>`

const targets = [
  ['public/icon-192.png', 192, 0.12],
  ['public/icon-512.png', 512, 0.12],
  ['public/apple-touch-icon.png', 180, 0.1],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size, inset] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0">${mark(size, inset)}</body>`)
  await page.screenshot({ path: file, omitBackground: false })
}
await browser.close()
