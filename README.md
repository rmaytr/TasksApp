# Nearer

**Your to-dos on a radar.** Today sits in the middle, someday at the edge, and each part of your life
gets its own slice. Drag things closer as they start to matter. Free, private, no sign-up.

![Nearer radar view](docs/screenshot.png)

## Why another to-do app?

Most lists turn into a guilt pile: everything in one long column, overdue items going red, and no
sense of what actually matters this week. Nearer shows your whole load as **one picture organized by
distance**:

- **Radar.** Rings are *Today · This week · This month · Later · Someday*. Wedges are your areas
  (Classes, Orgs, Career, Projects, Learning, Life, or your own). Dot size is effort, a halo means high
  priority, a hollow dot is waiting on something, and faded dots haven't been touched in two weeks.
  Drag a dot to a different ring or wedge to move it.
- **List.** Everything grouped by area or by ring, with search, inline steps and quick add.
- **Focus.** One task and its next step, with a 25-minute timer and an “I’ll do it…” prompt.
  Naming when and where you'll do something
  [roughly doubles follow-through](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions).
- **Reset.** A three-minute weekly sweep: pull closer, keep, push out, done or drop, one card at a time.

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

Everything is stored in your browser (IndexedDB) on your device. There's no account, no server, no
analytics and no cookies. Install it from your browser menu (“Install app” or “Add to Home Screen”)
to use it like a native app, offline.

## Keyboard

| Key | Action |
| --- | --- |
| `/` or `n` | Add a task |
| `1`–`4` | Radar, List, Focus, Reset |
| `i` | Import |
| `[` `]` | On a radar dot: pull closer, push out |
| `z` | Undo the last change |
| `Esc` | Close the open task |

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright)
npm run build        # production build in dist/
```

Stack: Vite 8, React 19, TypeScript, Zustand (persisted to IndexedDB), Zod, Motion, vite-plugin-pwa.
See [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/RESEARCH.md](docs/RESEARCH.md).

Deploys to GitHub Pages from `main` once Pages is enabled (Settings → Pages → Source: GitHub Actions).

## License

MIT
