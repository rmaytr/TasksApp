# Nearer

**Your to-dos on a radar.** Today sits in the middle, someday at the edge, and each part of your life
gets its own slice. Drag things closer as they start to matter. Free, private, no sign-up.

**Try it: <https://rmaytr.github.io/TasksApp/>**

![Nearer radar view](docs/screenshot.png)

## Why another to-do app?

Most lists turn into a guilt pile: everything in one long column, overdue items going red, and no
sense of what actually matters this week. Nearer shows your whole load as **one picture organized by
distance**:

- **Radar.** Rings are *Today · This week · This month · Later · Someday*. Wedges are your areas
  (Classes, Orgs, Career, Projects, Learning, Life, or your own). Dot size is effort, a halo means high
  priority, a hollow dot is waiting on something, and faded dots haven't been touched in two weeks.
  Drag a dot to a different ring or wedge to move it.
- **Map.** A mind map of everything: areas branch from the middle, tasks branch from areas,
  steps from tasks. Add tasks or a new area right on the map. On phones it becomes an outline.
- **List.** Everything grouped by area or by ring, with search, filters (waiting, high priority),
  inline steps and quick add.
- **Focus.** One task and its next step, with a 25-minute timer and an “I’ll do it…” prompt.
  Naming when and where you'll do something
  [roughly doubles follow-through](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions).
- **Reset.** A three-minute weekly sweep: pull closer, keep, push out, done or drop, one card at a time.

**Also:** repeating tasks (daily, weekly, monthly), one-tap due dates, links in notes become
clickable chips, `Ctrl K` finds any task, and **New area** is one click away in every view.

## Getting your tasks in

- **Type them.** The bar at the top understands `#area`, `!` (high priority), dates like `fri`,
  `nov 3` or `in 2 weeks`, rings like `@week` or `@someday`, and sizes `~s ~m ~l`.
  Example: `Email mentee #orgs tomorrow !`
- **Import a file or paste a list.** Plain text, numbered lists, Markdown checklists, JSON or CSV
  (Todoist exports work). `Title: step one, step two` becomes a task with steps, and areas are guessed
  from the words. You review everything before it's added.
- **Back up.** Settings → *Back up (JSON)* or *Export Markdown*.

### JSON import format

```json
[
  {
    "title": "Apply for scholarship",
    "area": "Career",
    "horizon": "week",
    "priority": "high",
    "effort": "m",
    "due": "2026-11-15",
    "waiting": null,
    "plan": "Sunday afternoon at the library",
    "notes": "",
    "steps": ["Get rec letter", "Research the application"]
  }
]
```

`horizon` is one of `today | week | month | later | someday`; `effort` is `s | m | l`.
Only `title` is required.

## Privacy

By default everything is stored in your browser (IndexedDB) on your device: no account, no
analytics, no cookies. Install it from your browser menu (“Install app” or “Add to Home Screen”)
to use it like a native app, offline.

**Optional sync** (if the deployment has it turned on): sign in with a one-time email code and
choose an encryption passphrase. Your tasks are encrypted on your device before upload, so the
server, and whoever runs it, only ever stores ciphertext. Details: [docs/SYNC.md](docs/SYNC.md),
[privacy policy](docs/PRIVACY.md), [SECURITY.md](SECURITY.md). Operators: [docs/DEPLOY.md](docs/DEPLOY.md).

## Keyboard

| Key | Action |
| --- | --- |
| `/` or `n` | Add a task |
| `Ctrl K` | Find any task |
| `1`–`5` | Radar, Map, List, Focus, Reset |
| `i` | Import |
| `[` `]` | On a radar dot: pull closer, push out |
| `z` | Undo the last change |
| `Esc` | Close the open task |
| `?` | Show shortcuts |

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run build        # production build in dist/
```

Stack: Vite 8, React 19, TypeScript, Zustand (persisted to IndexedDB), Zod, Motion, vite-plugin-pwa;
optional Supabase (Auth + Postgres with RLS) for encrypted sync, with WebCrypto doing the encryption.
See [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/RESEARCH.md](docs/RESEARCH.md) and [docs/RELEASE.md](docs/RELEASE.md).

Every push to `main` deploys to GitHub Pages: <https://rmaytr.github.io/TasksApp/>.

## License

MIT
