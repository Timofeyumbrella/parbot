# Parbot

Turn your documentation into an assistant. Readers ask in plain language and get a streamed answer
drawn from your docs with the pages it used listed underneath, inside the app as a ChatGPT-style chat
and on your own site as a one-script-tag widget: a floating bubble or a ⌘K palette. You get every
conversation in an inbox, an overview of what the docs could not answer, the answers readers
disliked and the pages answers use, and the emails readers leave when the docs fall short.

## Stack

| Package           | What it is                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `apps/web`        | Next.js 16 (App Router, Turbopack): landing, dashboard, API routes  |
| `packages/widget` | The embeddable script: vanilla TypeScript, Shadow DOM, Vite build   |
| `packages/shared` | The chat protocol and widget types shared by app and widget         |
| `supabase/`       | Schema, row level security, pgvector retrieval, analytics functions |

Answers come from the Gemini API free tier (`gemini-3.5-flash-lite` with fallbacks, `gemini-embedding-2`
for retrieval). Without a key the app runs on a deterministic stub, so every screen and test works
offline. Billing is Stripe in test mode, with a mock provider when no key is set.

## Requirements

- Node 24 (`.nvmrc`; `nvm use`)
- pnpm 10
- Docker, for the local Supabase stack

## Getting started

```bash
pnpm install
pnpm db:start            # first run pulls the Supabase images
cp .env.example .env     # then paste the anon and service keys that db:start printed
ln -sf ../../.env apps/web/.env
pnpm dev                 # builds the widget, then http://localhost:3000
```

`pnpm db:status` prints the local keys again. Sign in with `demo@parbot.dev` / `parbot-demo`.

Add `GEMINI_API_KEY` from https://aistudio.google.com/apikey for real answers; the free tier needs no
card. Everything else in `.env.example` is optional.

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Widget build, then the app in development mode |
| `pnpm build`     | Production build of the widget and the app     |
| `pnpm typecheck` | TypeScript across the workspace                |
| `pnpm lint`      | ESLint                                         |
| `pnpm test`      | Vitest across the workspace                    |
| `pnpm db:reset`  | Replays every migration and the seed           |
| `pnpm db:types`  | Regenerates `apps/web/src/lib/db/types.ts`     |

## How an answer is made

1. The question is embedded and matched against the assistant's passages with pgvector
   (`match_chunks`), scoped to that assistant.
2. The closest passages, trimmed to a context budget, go to the model with a system prompt that
   allows answering only from them and asks for `[n]` citations.
3. The answer streams to the client as server-sent events (`packages/shared` defines them): `meta`,
   `token`, `citations`, `done`, or `error`. The first characters are held back so a refusal marker
   never reaches the reader.
4. Both messages are stored with citations, latency and token counts, the monthly usage counter is
   incremented, and unanswered questions are counted on the conversation for the inbox.

The dashboard chat and the widget use the same engine (`apps/web/src/lib/engine`). The chat adds the
user's message to the thread before the request leaves the browser and streams the answer into a
placeholder beneath it; switching conversations reads from a client cache, so nothing waits on the
server except the answer itself.

## Demo data

```bash
pnpm --filter web seed:demo --history --write-env
```

Creates the demo account on the Starter plan, an assistant called Parbot Docs trained on
`apps/web/content/docs`, two weeks of realistic conversations with one lead, and writes the
assistant's public key into `.env` so the landing page runs the live demo and ⌘K. Re-running
re-indexes the docs and leaves the history alone; `--reset` starts over.

## Tests

| Command                                                                  | What it covers                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm test`                                                              | Unit tests, plus integration tests when the local stack is up     |
| `GEMINI_LIVE=1 pnpm --filter web exec vitest run src/lib/ai/gemini.live` | One embedding and one streamed answer against the real Gemini API |
| `pnpm --filter web test:e2e`                                             | Playwright: sign up and onboarding, landing, billing in test mode |

## Deploying

The app is one Next.js project; the widget is built into it before `next build`.

1. **Supabase.** Create a project, then from the repo root `pnpm exec supabase link --project-ref <ref>`
   and `pnpm exec supabase db push`. In Authentication settings set the site URL to your app URL and
   add it to the redirect URLs. Copy the project URL, anon key and service role key.
2. **Gemini.** Create a key at https://aistudio.google.com/apikey. The free tier needs no card.
3. **Vercel.** Import the repo with the root directory set to `apps/web`. Vercel detects pnpm and
   installs the workspace. Set the environment variables from `.env.example`: the Supabase values,
   `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL` set to the deployment URL, and `BILLING_PROVIDER=mock`
   until Stripe is configured. Pick the region closest to the Supabase project.
4. **Stripe, optional.** With a test secret key in `.env`, run `pnpm --filter web stripe:seed` once;
   it creates the two products and four prices and prints the `STRIPE_PRICE_*` lines. Add a webhook
   endpoint for `<app url>/api/stripe/webhook` with the subscription events, set
   `STRIPE_WEBHOOK_SECRET`, then `BILLING_PROVIDER=stripe`. Test cards: `4242 4242 4242 4242`.
5. **Demo content.** Run the seed against the hosted project by pointing `.env` at it, then set
   `NEXT_PUBLIC_DEMO_ASSISTANT_KEY` on Vercel and redeploy. The key turns on the ⌘K palette on the
   landing page; the hero's example conversation is scripted and needs no key.

## Layout

See `CLAUDE.md` for the file map, conventions and the reasoning behind them.
