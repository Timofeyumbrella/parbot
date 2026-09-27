# Parbot

[![CI](https://github.com/Timofeyumbrella/parbot/actions/workflows/ci.yml/badge.svg)](https://github.com/Timofeyumbrella/parbot/actions/workflows/ci.yml)

**Live: https://parbot-web.vercel.app** · demo login `demo@parbot.dev` / `parbot-demo`

**Video walkthrough: coming soon**

Parbot is an Ask-AI assistant for developer docs. Point it at your documentation, and readers ask
in plain language and get a streamed answer drawn from your docs with the pages it used listed
underneath: inside the app as a ChatGPT-style chat, and on your own site as a one-script-tag widget,
a floating bubble or a ⌘K palette. You get every conversation in an inbox, an overview of what the
docs could not answer, the answers readers disliked and the pages answers use, and on paid plans the
emails readers leave when the docs fall short. Each account has one assistant, created right after
sign-up.

## Try it

The live deployment runs on free tiers: Vercel, Supabase and the Gemini API. When the free Gemini
quota runs out, the assistant says it is busy; wait a minute and ask again. Billing runs on the mock
provider, so upgrading needs no card and nothing is charged.

| What                                                     | Where                                                                                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page: features, embed modes, pricing             | https://parbot-web.vercel.app                                                                                                                                                                   |
| Your own account, free, no card                          | https://parbot-web.vercel.app/signup                                                                                                                                                            |
| The demo account, with two weeks of seeded conversations | https://parbot-web.vercel.app/login as `demo@parbot.dev` / `parbot-demo`                                                                                                                        |
| The widget on a sample docs site                         | [bubble](https://parbot-web.vercel.app/demo/pb_6270ea27a00043b5aa0967eb4bec490f?mode=bubble), [⌘K palette](https://parbot-web.vercel.app/demo/pb_6270ea27a00043b5aa0967eb4bec490f?mode=palette) |

A new account starts on the free Hobby plan with no docs: name the assistant, add a source on
Knowledge, then ask about it in Chat. Palette mode, colours and lead capture unlock when you apply
Starter on Billing.

The demo account is on Starter with Parbot's own docs indexed and two weeks of seeded conversations,
so it is the quickest way to see the Inbox and the Overview with data in them. The account is shared
with everyone who reads this, and the ⌘K palette on the landing page answers from it, so please try
billing changes and deleting sources on your own account.

| Requirement                            | Where it is                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page with features and pricing | `/`: a scripted example conversation in the hero, the bubble and ⌘K modes, features, and pricing with a monthly or yearly toggle. On a desktop, ⌘K opens the live palette, answering from Parbot's docs; on a phone, a link in the hero opens the same assistant on its demo page.                                           |
| Upload docs to build a chatbot         | Knowledge: PDF, Word (.docx), HTML, Markdown or plain text files, pasted text, a website or a sitemap. Sources index live, and each one opens as its extracted text, headings and lists kept, with a link to the original file or page.                                                                                      |
| ChatGPT-like chat in the app           | Chat: your message appears at once and the answer streams in under it, with citations that open the cited passage. `@` or the paperclip points the chat at a file (one already in Knowledge is not uploaded again), Stop keeps what you saw and its sources, and Projects are folders with their own files and instructions. |
| Embeddable widget                      | Widget: bubble or palette, colours, position, welcome line, suggested questions, the sites allowed to use it, branding and lead capture, with a preview that reloads on save and a one-line install snippet. Palette, colours, branding and lead capture need a paid plan.                                                   |
| Pricing and billing                    | Billing: the plan and usage meters. Choose Starter or Growth, then Apply on the card that stands in for Stripe Checkout. A paid plan turns on palette mode, a custom theme, lead capture and removing the branding, and raises the limits.                                                                                   |
| Beyond the brief                       | Inbox: every conversation from the chat and the widget, and the leads. Overview: answer quality over the last 7 days, or 30, against the period before, knowledge gaps, disliked answers, where readers ask, the docs answers use and the ones they never do, leads, and usage against the plan.                             |

## Stack

| Package           | What it is                                                          |
| ----------------- | ------------------------------------------------------------------- |
| `apps/web`        | Next.js 16 (App Router, Turbopack): landing, dashboard, API routes  |
| `packages/widget` | The embeddable script: vanilla TypeScript, Shadow DOM, Vite build   |
| `packages/shared` | The chat protocol and widget types shared by app and widget         |
| `supabase/`       | Schema, row level security, pgvector retrieval, analytics functions |

Answers come from the Gemini API free tier (`gemini-3.5-flash-lite` with fallbacks, `gemini-embedding-2`
for retrieval). Without a key the app runs on a deterministic stub, so every screen and test works
without the Gemini API. Billing is Stripe in test mode when `BILLING_PROVIDER=stripe` and a Stripe
key are set, and a mock provider otherwise; the live deployment uses the mock.

## Requirements

- Node 24 (`.nvmrc`; `nvm use`)
- pnpm 10
- Docker, for the local Supabase stack

## Getting started

```bash
pnpm install
pnpm db:start            # first run pulls the Supabase images
cp .env.example .env     # then paste ANON_KEY and SERVICE_ROLE_KEY from `pnpm db:status -o env`
ln -sf ../../.env apps/web/.env
pnpm dev                 # builds the widget, then http://localhost:3000
```

The database seed creates `demo@parbot.dev` / `parbot-demo` as an empty Hobby account; run the demo
seed (see Demo data) to give it the Parbot Docs assistant and its history.

Add `GEMINI_API_KEY` from https://aistudio.google.com/apikey for real answers; the free tier needs no
card. Everything else in `.env.example` is optional.

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Widget build, then the app in development mode |
| `pnpm build`        | Production build of the widget and the app     |
| `pnpm typecheck`    | TypeScript across the workspace                |
| `pnpm lint`         | ESLint                                         |
| `pnpm format:check` | Prettier, as CI runs it                        |
| `pnpm test`         | Vitest across the workspace                    |
| `pnpm db:reset`     | Replays every migration and the seed           |
| `pnpm db:types`     | Regenerates `apps/web/src/lib/db/types.ts`     |

## How an answer is made

1. The question is embedded and matched against the assistant's passages with pgvector
   (`match_chunks`), scoped to that assistant. When the reader pointed the conversation at files
   (with `@` or the paperclip), or the conversation is in a project with files, the best passages of
   those files are read first whatever their similarity (`match_chunks_in_sources`).
2. The closest passages, trimmed to a context budget, go to the model with a system prompt that
   allows answering only from them and asks for `[n]` citations. When they cover only part of the
   question, the answer gives that part and says what the docs leave out; a question they do not
   touch at all gets the unanswered reply. A project's instructions are added after the
   assistant's own, and the prompt tells the model they never override that rule.
   A model that sends nothing within `GEMINI_FIRST_CHUNK_DEADLINE_MS` (3.5 s) gets the next model
   in the chain started beside it; the first to send a chunk answers and the other is aborted.
3. The answer streams to the client as server-sent events (`packages/shared` defines them): `meta`,
   `status` (in the app, while a file the reader just attached finishes indexing), `token`,
   `citations`, `done`, or `error`. The first characters are held back so a refusal marker
   never reaches the reader.
4. Both messages are stored with citations, latency and token counts, the monthly usage counter is
   incremented, and unanswered questions are counted on the conversation for the inbox. An answer
   the reader stopped keeps exactly the text they saw and is not counted against the plan.

The dashboard chat and the widget use the same engine (`apps/web/src/lib/engine`). The chat adds the
user's message to the thread before the request leaves the browser and streams the answer into a
placeholder beneath it. Switching conversations shows the thread in the same frame: from the client
cache when it was opened or hovered before, otherwise as a skeleton while its messages load.

## Demo data

```bash
pnpm --filter web seed:demo --history --write-env
```

Creates the demo account on the Starter plan, an assistant called Parbot Docs indexed from
`apps/web/content/docs`, two weeks of realistic conversations with one lead, and writes the
assistant's public key into `.env` so the ⌘K palette on the landing page answers from it (restart
`pnpm dev` to pick it up). Any assistant's widget can be tried at `/demo/<public key>`. Re-running
re-indexes only the docs whose text changed, moves any saved citation of a re-indexed page to its
new copy, and leaves the history alone; `--reset` deletes the assistant and starts over, which gives
it a new public key.

The history is dated relative to the day it was seeded, so after a few days it drops out of the
Overview's default week. `seed:demo --refresh-history` replaces it with two weeks ending yesterday
and keeps the assistant, its settings and its public key: it deletes the assistant's
conversations, leads and chat projects, seeds the history again with citations to the pages
indexed now, sets this month's answer count to match, and prints what it deleted and created.
Run it on the day of a demo. With the hosted values in a separate env file, run it from `apps/web`:

```bash
node --env-file=<file> --conditions=react-server --import tsx scripts/seed-demo.ts --refresh-history
```

Never use `--reset` on a deployment: the ⌘K palette on the landing page and the widget links under
Try it depend on the public key.

## Tests

| Command                                                                  | What it covers                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                              | Unit tests, plus integration tests when `.env` has the local stack's keys (start the stack first)                                                 |
| `GEMINI_LIVE=1 pnpm --filter web exec vitest run src/lib/ai/gemini.live` | One embedding and one streamed answer against the real Gemini API                                                                                 |
| `pnpm --filter web test:e2e`                                             | Playwright end to end against the local stack, on the stub AI. Install the browser once with `pnpm --filter web exec playwright install chromium` |

The Playwright suite covers sign-up, sign-in and onboarding, the landing page, Knowledge, the chat
(streaming, Stop, `@` references, projects), the widget and its settings, the Inbox, the Overview,
billing, starting the assistant over and deleting the account, and long messages on a phone. After
`pnpm build`, `E2E_WEB_SERVER=start` runs it against `next start` instead of `next dev`; CI does that
on every push to main and every pull request.

## Deploying

The app is one Next.js project; the widget is built into it before `next build`.

1. **Supabase.** Create a project, then from the repo root `pnpm exec supabase link --project-ref <ref>`
   and `pnpm exec supabase db push`. In Authentication settings set the site URL to your app URL, add
   it to the redirect URLs, and turn off Confirm email so a new account can sign in at once, as the
   live deployment does. Copy the project URL, anon key and service role key.
2. **Gemini.** Create a key at https://aistudio.google.com/apikey. The free tier needs no card.
3. **Vercel.** Import the repo with the root directory set to `apps/web`. Vercel detects pnpm and
   installs the workspace. Set the environment variables from `.env.example`: the Supabase values,
   `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL` set to the deployment URL, `BILLING_PROVIDER=mock` until
   Stripe is configured, and `ENABLE_EXPERIMENTAL_COREPACK=1` so the build uses the pnpm version
   pinned in `package.json`. `apps/web/vercel.json` pins the functions to `dub1` (Dublin), next to
   the live Supabase project; change it to the region closest to yours.
4. **Stripe, optional.** With a test secret key in `.env`, run `pnpm --filter web stripe:seed` once;
   it creates the two products and four prices and prints the `STRIPE_PRICE_*` lines. Add a webhook
   endpoint for `<app url>/api/stripe/webhook` with `checkout.session.completed`,
   `customer.subscription.updated` and `customer.subscription.deleted`. On Vercel set
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and the four `STRIPE_PRICE_*` values, then
   `BILLING_PROVIDER=stripe`. Test cards: `4242 4242 4242 4242`.
5. **Demo content.** Point `.env` at the hosted project, with `GEMINI_API_KEY` set (documents
   indexed on the stub do not match Gemini's queries) and `NEXT_PUBLIC_APP_URL` set to the
   deployment. Run `pnpm --filter web seed:demo --history`, then set `NEXT_PUBLIC_DEMO_ASSISTANT_KEY`
   on Vercel to the key it prints and redeploy. The key turns on the ⌘K palette on the
   landing page; the hero's example conversation is scripted and needs no key.

## Layout

See `CLAUDE.md` for the file map, conventions and the reasoning behind them.
