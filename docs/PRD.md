# Nearer — Product Requirements

> Everything you're carrying, at a glance. Pull what matters closer.

Status: v1.0 (October 2026) · Owner: Rodion · Repo: github.com/rmaytr/TasksApp

## 1. Problem

Busy students carry 30+ open loops across very different parts of life: classes,
student orgs, job search, applications, passion projects and self-study.
Existing tools fail them in predictable ways (see `docs/RESEARCH.md`):

1. **Guilt piles.** Lists grow, overdue counters turn red, people stop opening the app.
2. **Paralysis.** Twenty visible items at once feel like an attack, not a plan.
3. **Setup as procrastination.** Notion-style systems take a weekend to build and are abandoned.
4. **Out of sight, out of mind.** Phone notes and flat lists hide the shape of your week.
5. **Nothing helps you start.** A list says *what*, never *when* or *how*.

## 2. Product thesis

Show the user's whole load as **one picture organized by distance**: what is
near (today) sits at the center, what is far (someday) sits at the edge, and
each part of life has its own wedge. The core gesture is *pulling* a task
closer. Old tasks don't turn red; they quietly drift outward until the weekly
Reset asks what to do with them.

Three research-backed mechanics sit underneath the picture:

| Mechanic | Evidence | Where it lives |
| --- | --- | --- |
| Implementation intentions ("I'll do it Tue after lab") | meta-analytic d ≈ 0.65 | `plan` field, prompted in Focus |
| Fresh-start effect | Dai, Milkman & Riis 2014 | weekly Reset ritual |
| One thing at a time | ADHD community practice | Focus view |

## 3. Users

- **Primary:** a college student juggling 5–8 areas of life, mostly on a laptop
  during the day and a phone in between. Wants it to be fast, pretty and private.
- **Secondary (growth):** anyone with too many open loops who bounced off
  Notion, Todoist or Google Tasks.

## 4. Principles

1. **Useful in five seconds.** No sign-up, no setup wizard, works offline.
2. **Distance, not deadlines.** Urgency is shown by position, never by red badges.
3. **Bigger things, smaller steps.** Every task can hold a checklist of steps.
4. **Your data is yours.** Stored only on the device; one-click export to JSON/Markdown.
5. **Calm by default, one moment of delight.** Completing a task sends a ripple
   through the radar. Nothing else moves unless you touch it.

## 5. Scope — v1.0

### 5.1 Data model
- **Area**: name, color. Defaults: Classes, Orgs, Career, Projects, Learning, Life.
  Users can rename, recolor, add (max 8) and remove areas.
- **Task**: title, notes, area, horizon, priority (none/high), effort (S/M/L),
  optional due date, optional "waiting on" note, optional plan ("when/where"),
  steps (checklist), done flag, timestamps, time spent in Focus.
- **Horizon** (ring): Today · This week · This month · Later · Someday.
  If a task has a due date, its ring is the *nearer* of the chosen ring and the
  ring implied by the due date (due ≤ today → Today, ≤ 7 days → Week, ≤ 31 → Month).

### 5.2 Views
| View | Job | Key interactions |
| --- | --- | --- |
| **Radar** (home) | See everything at once by area × distance | Click node → detail; drag node across rings/wedges to change horizon/area; wheel/pinch zoom, drag to pan; keyboard: arrows to move selection, `[`/`]` push/pull, `Enter` open |
| **List** | Fast editing, scanning, power use | Grouped by area or by ring; inline check; expand steps; inline add step; search |
| **Focus** | Do one thing | Shows the nearest open task and its next step; "I'll do it…" plan prompt; optional timer; Done / Not now / Skip |
| **Reset** | Weekly fresh start, ~3 min | Card-by-card sweep of every open task: Pull closer · Keep · Push out · Done · Drop. Ends with a summary |

### 5.3 Capture
- One always-visible "Add anything" field (`/` or `n` to focus).
- Inline tokens: `#area`, `!` (high priority), `today` `tomorrow` `fri` `next week`
  `nov 3` `11/3` `in 3 days` (due), `@week` `@month` `@later` `@someday` (ring),
  `~s` `~m` `~l` (effort). Recognized tokens are previewed as chips before saving.
- Area is auto-guessed from keywords when no `#area` is given (e.g. "CS303" → Classes,
  "internship" → Career). The guess is shown and can be changed.

### 5.4 Import / export
- **Import** from file (drag-and-drop or picker) or pasted text:
  - Plain text / numbered lists (`Title: step, step` becomes a task with steps; indented lines become steps)
  - Markdown checklists (`- [ ]`, nested items as steps, `## Heading` sets area)
  - JSON (Nearer export, or a simple array of `{title, area, steps}`)
  - CSV (Todoist-style `TYPE,CONTENT,...` or any CSV with a `title`/`content` column)
- Every import goes through a **preview** where the user can fix the area per
  task before anything is saved.
- **Export** to JSON (lossless backup) and Markdown (readable).

### 5.5 Platform
- Installable PWA (desktop + phone), offline after first load.
- Data in IndexedDB; requests persistent storage to resist Safari eviction.
- Light and dark themes following the system, with manual override.
- Keyboard-first on desktop, thumb-first on phone (bottom tabs, bottom sheets).
- WCAG 2.2 AA: visible focus, 44px targets on touch, reduced-motion respected,
  radar has a full keyboard path and every action also exists in List.

## 6. Out of scope for v1 (roadmap)
- v1.1 Week view (capacity per day), recurring tasks, Canvas iCal feed import
- v1.2 Optional AI "break it down" for steps (bring-your-own key or proxied)
- v2 Optional account + sync across devices (see `docs/ARCHITECTURE.md` §6), sharing an area with an org board
- Monetization ideas: free forever locally; paid sync/backup, themes, and AI breakdown

## 7. Success metrics
- Time to first task < 10 s for a new visitor.
- Day-7 return rate (local analytics-free proxy: user-reported) — for v1, the owner
  uses it daily for two weeks without going back to phone notes.
- Import of the owner's 33-item list produces correctly-grouped tasks with ≤ 3 manual fixes.

## 8. Acceptance checklist (v1.0)
- [ ] New visitor sees a welcome with three choices: start empty, try sample, import
- [ ] Quick capture parses all tokens in §5.3 and shows chips
- [ ] Radar renders 5 rings × N wedges, nodes don't overlap at 40 tasks on a 1280px screen
- [ ] Dragging a node changes ring and/or area, with an undo toast
- [ ] Completing a task triggers the ripple and removes it from the radar
- [ ] List, Focus and Reset are fully usable with keyboard only
- [ ] Import preview works for txt / md / json / csv, including the owner's list
- [ ] Export JSON → import JSON round-trips without loss
- [ ] Works offline after first load; installable
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95 on desktop
