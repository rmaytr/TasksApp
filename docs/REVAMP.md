# Cairn revamp: plan and engineering pipeline

_October 2026. Supersedes the "Nearer" v1 look and navigation._

## Why

Feedback from daily use: v1 worked but felt **busy and unpolished**. The radar showed every
title at once, adding a task surfaced eight fields, the sidebar's area click *hid* an area,
buttons were thin outlines, the welcome card floated over other views, and there were no
reminders. The target user includes people with ADHD, so **calm, one-thing-at-a-time and
zero-friction capture** are the bar.

## Product changes

| Area | Before | After |
| --- | --- | --- |
| Name | Nearer | **Cairn** — stacked stones that mark a path: big goals become small steps, one at a time |
| Home | Radar | **Today**: big "What's on your mind?" capture, one *Up next* card, today's short list, heads-up strip |
| Navigation | 5 peer views | **Home · Tasks · Focus**; Tasks switches between List, Map and Radar; Reset lives on Home |
| Areas in sidebar | Click hides the area | Click **opens the area page**; hiding moves to the area's menu |
| Capture | Inline chips + eight fields in the panel | Type and press Enter. Everything else is inferred (local parser, or the AI assistant) and editable later |
| Task panel | Every field visible | Title, area, when, priority, steps; **More options** reveals the rest |
| Priority | High only | **High / Normal / Low**, with filters everywhere |
| Radar | Every label drawn | Dots only; labels for Today and This week, details on hover |
| Reminders | None | Heads-up strip in the app, plus optional system notifications (morning of, evening before, overdue) |
| Order | Urgency only | **Dependencies** ("do after") and an ordering engine; the assistant can suggest them |
| Assistant | None | Optional Claude-powered sorting: dates, priority, area, steps, dependencies, and a "Plan my day" order |
| Onboarding | Floating card | Real first-run dialog |

## Engineering pipeline

1. **Contracts first** (lead): domain types (`after`, `low`, reminder/AI prefs), the AI
   result schema, and module boundaries are fixed before parallel work starts.
2. **Parallel, test-first logic** (subagents, isolated folders):
   - `src/ai/` + `worker/`: assistant prompts, Zod result schema, browser client (own key or
     proxy), Cloudflare Worker proxy holding the API key, all unit-tested with a fake transport.
   - `src/plan/` + `src/reminders/`: dependency-aware ordering (topological + urgency, cycle-safe)
     and reminder scheduling, plus "this weekend" style date phrases.
3. **Design system + UI** (lead, in parallel): tokens, typography (Lexend), buttons, inputs,
   cards; then shell, Home, Tasks, area pages, task panel, onboarding.
4. **Integration**: wire assistant, reminders and ordering into capture, Home and Focus.
5. **Verification gates**: typecheck, lint, unit tests, Playwright e2e, screenshot review at
   desktop and phone in both themes, then review agents (design critique, React, security for the
   assistant). Fix, re-run, deploy.

## Design system (summary — tokens live in `src/index.css`)

- **Palette "Dusk"**: lilac-grey canvas, white surfaces, deep iris primary for actions, marigold
  for "today / soon", rose for danger; area colors are soft tints with darker text variants.
  Full dark theme.
- **Type**: Lexend (designed for reading ease; a good fit for ADHD and dyslexic readers), one
  family, weights 400–700.
- **Shape**: 12px controls, 18px cards, pill chips. Filled primary, tonal secondary and quiet
  buttons. Every interactive element has hover, active, focus-visible and disabled states.
- **Motion**: only in response to actions (adding, completing, opening).

## Assistant: privacy and cost

- Off by default. When on, the text of the task being added plus the titles, areas and due dates of
  open tasks are sent to Claude (Anthropic API) to sort it. Nothing is stored by Cairn's servers.
  This is separate from encrypted sync and is stated in the privacy policy.
- Two modes: **your own API key** (kept on the device, sent only to api.anthropic.com) or the
  **Cairn proxy** (a Cloudflare Worker holding the operator's key, gated by invite codes and
  rate limits).
- Default model `claude-opus-5-5` at low effort. A typical call is about 2–4k tokens in and 500 out,
  roughly $0.02. The proxy's `MODEL` variable can switch to `claude-haiku-5-5`, which is about
  40 times cheaper.
