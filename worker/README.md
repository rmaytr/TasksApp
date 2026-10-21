# Cairn AI proxy (Cloudflare Worker)

A tiny Worker that lets people use Cairn's assistant without their own Anthropic key. It holds
your key server-side, only answers to invite codes you hand out, only from origins you allow, and
caps each code per day. Its code never logs or stores what people type; the only thing it keeps
is small counters (hashed code per day, hashed IP per hour for wrong codes).

Routes (all `POST`, JSON, header `X-Cairn-Invite: <code>`):

| Route      | Body              | Returns                                   |
| ---------- | ----------------- | ----------------------------------------- |
| `/analyze` | `{ text, ctx }`   | `{ tasks: [...] }` (sanitized suggestions) |
| `/plan`    | `{ ctx }`         | `{ order, dependencies, summary }`        |

Errors are `{ "error": "<friendly message>", "kind": "auth" | "rate" | "network" | "refusal" | "invalid" | "config" }`.

## Deploy

The Worker bundles the shared code in `../src/ai`, so install the repo's dependencies too.

```sh
npm install            # in the repo root (once)
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY     # paste your key
npx wrangler secret put INVITE_CODES          # comma-separated, 16+ characters each
```

Edit `wrangler.toml` and set `ALLOWED_ORIGINS` to the exact origin(s) where the app is served,
comma-separated, no trailing slash, e.g. `https://you.github.io,http://localhost:5173`.
(The path is not part of an origin: `https://you.github.io/TasksApp/` is `https://you.github.io`.)

Make one code per friend with `openssl rand -hex 12` (shorter codes are ignored, so they can't be
guessed). The counters store is **required**: it holds per-code daily limits (default 150 requests
per code per UTC day, change with the `DAILY_LIMIT` var) and slows down anyone guessing codes
(20 wrong codes per IP per hour):

```sh
npx wrangler kv namespace create RATE_KV
```

Paste the printed `id` into the commented `[[kv_namespaces]]` block in `wrangler.toml` and
uncomment it. KV counters are approximate under bursts, so also set a monthly spend limit in the
Anthropic console; that is the hard stop.

```sh
npx wrangler deploy
```

Wrangler prints the Worker URL (`https://cairn-ai.<your-subdomain>.workers.dev`). Build the app
with it:

```sh
VITE_AI_PROXY_URL=https://cairn-ai.<your-subdomain>.workers.dev npm run build
```

Users then paste an invite code in Cairn's assistant settings. The app's build adds the Worker's
origin to its Content Security Policy (`connect-src`) automatically.

To rotate or revoke a code, run `npx wrangler secret put INVITE_CODES` with the new list.

## Run locally

Create `worker/.dev.vars` (git-ignored):

```
ANTHROPIC_API_KEY=sk-ant-...
INVITE_CODES=dev-code
ALLOWED_ORIGINS=http://localhost:5173
```

```sh
cd worker
npx wrangler dev          # serves http://localhost:8787
```

Try it:

```sh
curl -s http://localhost:8787/analyze \
  -H "Content-Type: application/json" -H "X-Cairn-Invite: dev-code" \
  -d '{"text":"Publish the domain this weekend","ctx":{"today":"2026-10-21","weekday":"Wednesday","areas":["Projects"],"openTasks":[]}}'
```

Unit tests run from the repo root with a fake Claude client and need no key or network:
`npx vitest run worker`.

## Cost

The default model is `claude-opus-5-5` at low effort: a typical call is about 2-4k tokens in and
500 out, roughly **$0.02 per request** (the long system prompt is cached, which helps). Set the
`MODEL` var to `claude-haiku-5-5` for about 40 times less. With the default limit of 150
requests per code per day, one code costs at most about $3 a day on Opus, or under 10 cents on
Haiku.

## Notes

- The daily counter uses Workers KV, which has no atomic increment: two simultaneous requests can
  slip past the limit by one or two. It is a cost guard, not a security boundary.
- Requests larger than 64 KB are rejected (413); `text` is capped at 2000 characters, areas at 12
  and open tasks at 150.
- Requests with a browser `Origin` that is not in `ALLOWED_ORIGINS` get 403. Requests without an
  `Origin` (curl) still need a valid invite code.
