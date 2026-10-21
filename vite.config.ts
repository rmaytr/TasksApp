/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /TasksApp/; the deploy workflow sets VITE_BASE.
const base = process.env.VITE_BASE ?? '/'

// Production-only CSP: the app makes no network calls, so everything is locked to 'self'.
// (Dev is excluded because Vite's HMR preamble is an inline script.)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'sha256-THEME_HASH'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'nearer-csp',
    apply: 'build',
    async transformIndexHtml(html) {
      const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
      const { createHash } = await import('node:crypto')
      const hash = createHash('sha256').update(inline).digest('base64')
      const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP.replace('THEME_HASH', hash)}" />`
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`)
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nearer — everything you carry, at a glance',
        short_name: 'Nearer',
        description: 'A radar for your to-dos. Free, private, no sign-up.',
        theme_color: '#E8ECE6',
        background_color: '#E8ECE6',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
