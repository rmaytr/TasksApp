/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /TasksApp/; the deploy workflow sets VITE_BASE.
const base = process.env.VITE_BASE ?? '/'

// Production-only CSP: locked to 'self' plus the few hosts the opt-in features need.
// (Dev is excluded because Vite's HMR preamble is an inline script.)
// Sync (optional) talks to exactly one Supabase project; nothing else is reachable.
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseOrigin = supabaseUrl.startsWith('https://') ? new URL(supabaseUrl).origin : ''
// The assistant (opt-in) reaches either Anthropic directly (user's own key) or the Cairn proxy.
const aiProxy = process.env.VITE_AI_PROXY_URL?.trim() ?? ''
const aiProxyOrigin = /^(https:\/\/|http:\/\/localhost(:\d+)?(\/|$))/.test(aiProxy) ? new URL(aiProxy).origin : ''
const connectSrc = ["'self'", supabaseOrigin, 'https://api.anthropic.com', aiProxyOrigin].filter(Boolean).join(' ')

// A service-role / secret key in a VITE_ variable would be published to every visitor.
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''
if (anonKey.startsWith('sb_secret_') || /service_role/.test(Buffer.from(anonKey.split('.')[1] ?? '', 'base64').toString())) {
  throw new Error('VITE_SUPABASE_ANON_KEY is a secret/service-role key. Use the anon or publishable key.')
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'sha256-THEME_HASH'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${connectSrc}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'cairn-csp',
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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'privacy.html'],
      manifest: {
        name: 'Cairn — one step at a time',
        short_name: 'Cairn',
        description: 'A calm to-do app that sorts your tasks and shows you one next step. Free, private, no sign-up.',
        theme_color: '#F3F1F8',
        background_color: '#F3F1F8',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The privacy page is its own document; don't answer it with the app shell.
        navigateFallbackDenylist: [/privacy\.html$/],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
  },
})
