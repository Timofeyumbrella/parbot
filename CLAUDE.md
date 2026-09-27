# Parbot

Parbot turns a product's documentation into an assistant: a ChatGPT-style chat inside the app, and an
embeddable widget (floating bubble or ⌘K palette) customers drop onto their docs site. Each account
owns exactly one assistant, created at onboarding; a unique index on `assistants.owner_id` enforces
it, and deleting it in Settings is a reset back to onboarding. There are no teams, roles or
invites. Plans are Hobby (free), Starter and Growth; they differ in pages, answers and widget
features, not in assistants. Billing is Stripe in test mode with a mock provider when no key is
set. AI runs on the Gemini free tier with a deterministic stub when no key is set.

Perceived speed is a first-class requirement, not polish. A reviewer of a sibling product called out
exactly this: switching chats took seconds, and a sent message only appeared after the answer came
back. Our bar: click a conversation and see content or a skeleton in the same frame; send a message
and see your bubble in the same frame with the answer streaming into a placeholder beneath it.

## Toolchain

- Node 24 via nvm. Every shell: `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null` before `pnpm`.
- pnpm workspace: `apps/web` (Next.js 16, App Router, Turbopack), `packages/widget` (Vite, IIFE,
  Shadow DOM, vanilla TS), `packages/shared` (protocol types, no dependencies), `supabase/` at root.
- Local Supabase needs Docker: `pnpm db:start`, `pnpm db:reset` (replays migrations + seed),
  `pnpm db:types` (regenerates `apps/web/src/lib/db/types.ts`, never edit it by hand).
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter web test`. Run them before you
  say something works. `pnpm --filter web build` is the final gate.
- Next.js 16 differs from your training data: `proxy.ts` (not middleware), `params`/`searchParams`/
  `cookies()`/`headers()` are async, `next lint` is gone, Turbopack is default, `LayoutProps<'/x'>` and
  `PageProps<'/x'>` are generated globals. Read `apps/web/node_modules/next/dist/docs/01-app/` when
  unsure; do not guess an API.

## Where things live

- `packages/shared/src/index.ts`: the chat SSE protocol (`ChatStreamEvent`), `readChatStream`,
  widget config types, `citedIndexes`. The app and the widget both import it. Change it carefully.
- `apps/web/src/lib/ai`: `AiProvider` interface, Gemini implementation with retries and a model
  fallback chain, deterministic stub. `getAiProvider()` picks one from env.
- `apps/web/src/lib/engine`: `streamAnswer()` retrieves, prompts, streams, persists and meters one
  exchange and yields protocol events; `streamResponse()` turns that into an SSE `Response`;
  `chargeRateLimits()` charges sliding-window buckets in the database (`take_rate_limits`, shared
  by every function instance) and falls back to the in-memory `rateLimit()` only when that call
  fails. Route handlers wrap these; do not reimplement them.
- `apps/web/src/lib/plans.ts`: plan limits and gated features. Enforce limits server-side.
- `apps/web/src/lib/supabase`: `server.ts` (visitor's session, RLS applies), `client.ts` (browser,
  RLS applies), `service.ts` (service role, bypasses RLS: verify ownership first).
- `apps/web/src/lib/session.ts`: `getSession()` is request-cached; `requireUser()` redirects.
- `apps/web/src/lib/assistants.ts`: `getAccountAssistant()` (the account's one assistant, or null
  before onboarding), `getAssistant(id)`, request-cached.
- `apps/web/src/components/ui`: shadcn (radix-nova). Import `cn` from `'cn'`. Icons from lucide-react.
- `apps/web/src/components/page-header.tsx`: `PageContainer` and `PageHeader` for every dashboard
  screen except the chat.
- `apps/web/src/components/assistant-context.tsx`: `useAssistant()` under `/a/[assistantId]`.
- Routes: `(marketing)` landing, `(auth)` login/signup, `(dashboard)` everything signed in:
  `/dashboard` (redirects to the assistant's Overview, or to onboarding), `/onboarding`,
  `/a/[assistantId]/{,chat,knowledge,inbox,widget,settings}`, `/billing`, `/account`. API under
  `src/app/api`. The widget script is built to `apps/web/public/widget.js` by `pnpm widget:build`.

## Patterns

- Server components load the first paint; client components own interaction. Lists and threads live in
  TanStack Query (`Providers` mounts the client) so navigation reads from cache. Mutations update the
  cache optimistically and roll back on error.
- Every dashboard route ships a `loading.tsx` shaped like its content. Links to dynamic routes use
  `prefetch`. Never call `revalidatePath` on a chat path; never make the chat wait for a server
  round trip to show the user's own message.
- Streaming goes through route handlers and `streamResponse()`. Settings forms may use server actions
  with `useActionState`. Read data in the browser through `getSupabaseBrowserClient()` (RLS applies).
- Validate every request body with zod. Widget routes: look the assistant up by public key, check the
  `Origin` against `allowed_origins` (empty list allows any), rate limit per visitor and per IP, and
  never expose ids the visitor did not send.
- Copy: plain sentences, no exclamation marks, no hype, no emoji in product UI. Empty states say what
  to do next. Errors say what happened and what to try.
- Design: dark-first charcoal with an amber primary, Geist, compact radii, no glassmorphism. Tokens
  are in `apps/web/src/app/globals.css`; use them, never raw hex in components.
- Tests: Vitest, colocated `*.test.ts(x)`, jsdom. Test behaviour through the public surface. Keep
  the stub AI provider working; it is what tests and keyless dev run on.
- Comments explain why, not what. No TODOs left behind; either do it or write it in the report.

## Rules learned from the first audit

- Realtime: `await realtimeReadyClient()` from `lib/supabase/client.ts` before `.channel(...).subscribe(...)`.
  A channel that joins before the session is loaded runs as anon and the server rejects filtered
  subscriptions silently. Always pass a status callback to `subscribe` and log a failed join.
- TanStack keys are namespaced by screen: `['chat', ...]`, `['inbox', ...]`, `['knowledge', ...]`.
  Never share a key between screens that store different shapes. A mutation that changes
  conversations invalidates the other screens' namespaces (`queryClient.invalidateQueries({ queryKey: ['inbox'] })`).
- Links: leave `prefetch` at its default. `prefetch={true}` on a dynamic route caches its full payload
  for minutes in Next 16, so Inbox and Overview showed stale data after a chat. The `loading.tsx`
  skeleton keeps navigation instant without it.
- Dates and counts: `relativeTime`, `formatDate`, `formatDateTime`, `formatCount`, `formatPercent`
  from `lib/format.ts`. No screen defines its own.
- Row level security now also checks `owns_assistant(assistant_id)` on inserts and updates, and
  `increment_usage` is service-role only. `proxy.ts` no longer runs for `/api/sources`, `/api/health`
  and `/demo/`; those handle their own auth, and uploads up to 25 MB reach the route.
- Library and provider error text never reaches a visitor unchanged: map it to a sentence that says
  what happened and what to try.
