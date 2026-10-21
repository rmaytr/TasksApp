# Architecture

## 1. Shape
A static, local-first single-page app. No server, no account. Everything the
user creates lives in IndexedDB on their device; the build is a folder of
static files served from GitHub Pages and cached by a service worker so the app
opens offline and can be installed to the home screen / dock.

```
 ┌───────────── browser ──────────────────────────────────────────┐
 │  React views (Radar · List · Focus · Reset · Import)          │
 │        │ select / dispatch                                     │
 │  Zustand store  ── persist (debounced) ──►  IndexedDB (idb-keyval)
 │        │                                                       │
 │  pure libs: dates · capture · classify · import · export · layout
 └────────────────────────────────────────────────────────────────┘
        ▲ service worker (Workbox via vite-plugin-pwa) caches the shell
```

## 2. Stack (versions verified 2026-10-21)
| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 8 + @vitejs/plugin-react 6 | fast, first-class PWA plugin |
| UI | React 19 + TypeScript 6 | ecosystem, path to React Native later. TS 7 skipped until its JS API ships (7.1) |
| State | Zustand 5 + `persist` | tiny, works outside React, built-in migrations |
| Storage | idb-keyval 6 | whole state is one small document; swap for Dexie if indexed queries are needed |
| Validation | Zod 4 | untrusted import files and persisted state are parsed, never trusted |
| Motion | motion 14 (`motion/react`) | layout + gesture animation; respects reduced motion |
| Radar | hand-rolled SVG + Pointer Events | full control of layout, drag, zoom; no graph library needed |
| Styling | plain CSS with custom-property tokens | design is bespoke; no utility-class sameness |
| PWA | vite-plugin-pwa 2 (Workbox 7) | precache shell, autoUpdate |
| Tests | Vitest 5 + Testing Library + fake-indexeddb; Playwright smoke | |
| Deploy | GitHub Pages via Actions (`VITE_BASE=/TasksApp/`) | free, no extra account. Move to Cloudflare Pages when monetizing (Vercel Hobby forbids commercial use) |

## 3. Modules
```
src/
  model/types.ts        domain types + constants (no logic)
  model/defaults.ts     default areas, sample data
  model/derive.ts       effective horizon, staleness, sorting
  lib/dates.ts          local-day ISO helpers, natural date tokens
  lib/capture.ts        quick-capture parser → TaskDraft + chips
  lib/classify.ts       keyword area guessing, area resolution
  lib/import/*.ts       txt · md · json · csv → TaskDraft[]
  lib/export.ts         JSON backup, Markdown
  lib/radarLayout.ts    deterministic node placement (polar → xy, collision relax)
  store/useStore.ts     the single store: areas, tasks, ui prefs, undo
  store/persist.ts      idb storage adapter, debounce, migrate
  components/…          views and shared UI
```
Pure libs have no React and no store imports, so they are unit-tested in isolation.

## 4. Key decisions
- **Effective horizon** is derived, never stored: `nearer(task.horizon, horizonForDue(task.due))`.
  The user's choice is preserved when a due date is removed.
- **No routing library.** The app has one screen; the active view lives in the store and
  is mirrored to `location.hash` so refresh/back work and GitHub Pages needs no 404 trick.
- **Undo** is a single-level snapshot for destructive or spatial actions (drag, delete, done),
  surfaced as a toast. Cheap and covers the "oops" cases.
- **Staleness instead of overdue.** A task untouched for 14+ days renders faded; Reset
  surfaces it first. Nothing turns red.
- **Persistence** writes are debounced 300 ms and flushed on `visibilitychange`/`pagehide`.
  `navigator.storage.persist()` is requested after the first task is created.
- **Schema versioning.** Persisted state carries `version`; `migrate()` upgrades old shapes.
  JSON imports of our own export go through the same Zod schema.

## 5. Security & privacy
- No network calls at runtime besides loading the app itself. No analytics, no cookies.
- Imported text is rendered as React text nodes only (no `dangerouslySetInnerHTML`).
- Import files are size-capped (2 MB) and validated; unknown fields are dropped.
- CSP meta tag restricts scripts/styles to self.

## 6. Future sync (v2)
Every entity already has a UUID and `updatedAt`, so sync can be layered on:
Supabase (auth + Postgres) with PowerSync for offline-first replication, Stripe for
paid tiers. Keep storage behind `store/persist.ts` so the swap stays local.
