// Renders the Cairn mark to PNG icons with headless Chromium (run: node scripts/make-icons.mjs).
import { chromium } from '@playwright/test'

const mark = (size, pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#13756a"/>
  <g transform="translate(50 52) scale(${1 - pad * 2})">
    <ellipse cx="0" cy="22" rx="30" ry="12" fill="#ffffff" opacity="0.55"/>
    <ellipse cx="-2.5" cy="1" rx="22" ry="10.5" fill="#ffffff" opacity="0.82"/>
    <ellipse cx="2" cy="-19" rx="14" ry="8.6" fill="#f2b134"/>
  </g>
</svg>`

const targets = [
  ['public/icon-192.png', 192, 0.12],
  ['public/icon-512.png', 512, 0.12],
  ['public/apple-touch-icon.png', 180, 0.08],
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [file, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<body style="margin:0">${mark(size, pad)}</body>`)
  await page.screenshot({ path: file })
}
await browser.close()
