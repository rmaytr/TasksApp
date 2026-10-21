# Research notes (October 2026)

Condensed from a desk review of Reddit (r/productivity, r/ADHD, r/college), HN,
app reviews and the behavioral-science literature. Sources linked inline.

## Why people abandon to-do apps
1. **Guilt piles.** Overdue counters turn the app into a scorecard ([IndieHackers](https://www.indiehackers.com/post/i-stopped-opening-todo-apps-because-of-the-guilt-so-i-built-one-with-no-overdue-label-at-all-gEmxidjhiObz4OgDfPs4), [Todoist on "bankruptcy"](https://todoist.com/inspiration/todo-list-bankruptcy)).
2. **Paralysis** from long visible lists ([get-alfred](https://get-alfred.ai/blog/best-adhd-task-manager)).
3. **Setup as procrastination** in Notion-style systems ([Medium](https://medium.com/@explrerhere/why-your-notion-setup-always-fails-fix-this-first-ea057ec65618)).
4. **Out of sight, out of mind** — passive lists are forgotten.
5. **Onboarding walls**, paywalls and trials before any value.
6. **Nothing helps you start** — lists say what, not when/how ([affine](https://affine.pro/blog/best-adhd-planner-apps)).
7. **Bloat vs. bareness** — power apps feel heavy, plain text lacks steps/dates.
8. **Childish gamification** — points and pets wear off.

## Mechanics with evidence
- **Implementation intentions** ("I'll do X at time/place Y"): d ≈ 0.65 on goal attainment
  ([NCI summary](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions)).
  Making a plan also reduces intrusive thoughts about unfinished goals (Masicampo & Baumeister 2011).
  → Nearer's `plan` field, prompted in Focus.
- **Fresh-start effect** — people act more on goals at temporal landmarks such as a new week
  ([Dai, Milkman & Riis 2014](https://anderson-review.ucla.edu/wp-content/uploads/2021/03/Dai-Milkman-Riis_FreshStartEffect_2014_Mgmt_Sci.pdf)).
  → the weekly Reset ritual; stale tasks drift outward instead of going red.
- **Planning fallacy** — students finish later than predicted most of the time
  ([Buehler 1994](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf)).
  → Focus records actual minutes against the S/M/L estimate.
- **Gamification** effects are small (g ≈ .36, unstable; Sailer & Homner 2020).
  → one subtle completion ripple, no points.
- **Breaking tasks into steps** — Tiimo (Apple iPhone App of the Year 2025) and goblin.tools
  are loved for it. → every task holds a checklist of steps.

## What viral no-sign-up tools share
Excalidraw, tldraw and goblin.tools are useful in seconds, need no account, save locally and
work offline. Goblin.tools' weak spot is that nothing persists without an account — Nearer
autosaves to the device from the first keystroke.

## Import formats people expect
Markdown checklists (`- [ ]`, nested), plain lines with natural dates, Todoist CSV,
Things-style JSON, todo.txt. v1 supports text, Markdown, JSON and CSV.

## Design bets (no rigorous evidence; tested by use)
- The radar / distance metaphor for horizons
- Area wedges as the primary grouping
