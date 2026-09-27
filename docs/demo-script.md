# Parbot demo video script

Target length: 6 to 7 minutes, recorded on the live deployment at https://parbot-web.vercel.app.
Screen share a 1440×900 browser window in the dark scheme at zoom 100%, dashboard sidebar visible.
Record one take per section and cut between them.

Voiceover lines are in quotes. Actions are in brackets. Keep the mouse still while talking. Every
input below was typed on the live site in a full rehearsal on 28 Sep 2026. The timings in italics
are what that rehearsal measured.

The story: a new user, Alex, sets up an assistant called Northwind Docs. Its public docs part is
Hono's API reference, a real site Alex doesn't control, which shows crawling works on any public
site. Its private part is a Word file and a pasted policy. The demo account's seeded history then
shows what the Overview looks like after two weeks of real traffic.

## Test inputs

Keep this table open on a second screen. Type or paste exactly these inputs.

| Where                | Input                                                                                            | What comes back                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Landing ⌘K           | `What happens when the docs don't cover a question?`                                             | It says so instead of guessing, records the question, and with lead capture offers an email form. Three sources |
| Sign up              | Full name `Alex Rivera`, a fresh email you control, any 8+ character password                    | Onboarding                                                                                                      |
| Onboarding           | Name `Northwind Docs`                                                                            | Slug `northwind-docs` fills in, lands on Knowledge                                                              |
| Website source       | `https://hono.dev/docs/api/context`                                                              | Crawls everything under `/docs/api/`: 6 pages, 79 passages, Ready in _8 to 13 s_                                |
| Upload               | `docs/demo-assets/northwind-api-limits.docx`                                                     | Word file, 6 passages, Ready in _2 to 4 s_                                                                      |
| Paste text           | Title `Refund policy`, text below                                                                | 1 passage, Ready in _1 to 3 s_                                                                                  |
| Chat 1               | `How do I read a query parameter?`                                                               | `c.req.query()` with two code blocks, cites HonoRequest                                                         |
| Chat 1               | `And a path parameter?`                                                                          | `c.req.param()` with code, same source                                                                          |
| Chat 1               | `Does Hono ship a Postgres driver?`                                                              | "I couldn't find that in the documentation…", chat marked unanswered                                            |
| Chat 2               | `@north`, Enter to pick the file, then `what happens if we go over?`                             | 429, not queued, safe to resend, Retry-After. Cites the Word file                                               |
| Chat 2               | `How long should we wait before retrying?`                                                       | Retry-After, then backoff 1, 2, 4, 8 s, five attempts. Cites the file again                                     |
| Chat 3               | `Walk me through routing in Hono, with a code example for every kind of route.`                  | A long answer. Press Stop after two or three lines                                                              |
| Project              | Name `Support replies`, instructions below, file `Refund policy`                                 |                                                                                                                 |
| Project chat         | `A customer on the annual plan paid two months ago and wants their money back. What do I reply?` | A two-sentence reply about a pro rata refund, then `Policy: Refund policy`                                      |
| Demo page bubble     | `How do I set the status code of a response?`                                                    | `c.status()` with `c.status(201)` code, "Powered by Parbot" under it                                            |
| Live preview palette | `Is there a Go SDK?`                                                                             | "I couldn't find that…", then the lead form                                                                     |
| Lead form            | `sam@example.com`, note `We ship a Go backend and would like an official SDK.`                   | "Thanks. The team will reply to sam@example.com."                                                               |

Refund policy text, pasted as-is:

```
Monthly plans are refunded in full when the customer asks within 14 days of the charge.

Annual plans are refunded pro rata for the unused full months when the customer asks within the first 90 days. After 90 days there is no refund, but cancelling stops the plan from renewing.

Refunds go back to the original card within 5 to 10 business days. Support never promises a refund in advance: the billing team at billing@northwind.example confirms every refund.
```

Project instructions, pasted as-is:

```
Write the reply a support agent can send to the customer: two or three short, friendly sentences, no lists. Then add one line starting with "Policy:" that names the document you used.
```

Do not improvise the questions. For example, `How do I return JSON with a 201 status code?` came
back as unanswered in rehearsal, even though the Context page covers `c.json()` and `c.status(201)`
in separate places.

---

## Before recording

**Accounts**

- Demo account: `demo@parbot.dev` / `parbot-demo`, Starter, one assistant, "Parbot Docs". The
  landing's ⌘K palette answers from it. Section 9 shows its Overview.
- New account: created on camera in section 2. Use an address you control that has never signed
  up before. Plus-addressing works, and email confirmation is off on the hosted project. Don't use
  `maya@northwind.dev`: it is the seeded lead. After recording, delete the account from Account >
  Delete account.

**Windows**

- Window A, for recording: a clean Chrome profile, signed out, on `https://parbot-web.vercel.app`.
  Turn off "Offer to save passwords" and address autofill so no popup covers the sign-up form.
  Hide the bookmarks bar. Clear the site data for parbot-web.vercel.app. The ⌘K palette keeps its
  last conversation in local storage, and it should open empty with its four suggested questions.
- Window B: a second profile, signed in as the demo account, on its Overview with **7 days**
  selected. Used in section 9 only.
- Close every other tab. Turn on Do Not Disturb. Put `northwind-api-limits.docx` on the Desktop so
  the file picker finds it in one click. Keep the two text blocks above in a note, ready to copy.

**Demo data that must be in place.** Check this in window B:

- Knowledge: 9 sources, all Ready, "9 of 2,000 pages".
- Billing: Starter, active.
- Chat: no projects and only the two seeded in-app chats. Delete any project someone made while
  testing. During today's parallel checks, a project called "demoproj" appeared in the demo account.
- Inbox: only the seeded conversations. Leads: only `maya@northwind.dev`. As of 28 Sep there are
  leftovers from testing, all visible on camera: a lead `lead-…@parbot.test` with the note
  "Walkthrough test lead, safe to delete."; widget chats titled "What is this" and "How many pages
  can I index on the Starter plan?" asked from `parbot-web.vercel.app`; two landing questions from
  26 Sep; and a "Does Parbot integrate with Zendesk…" knowledge gap. Delete them, or better,
  reseed the history on recording day as described in the "Demo data" section below. The seeded
  history is dated relative to when it was seeded, so it slides out of the 7-day window within a
  week.

**Warm up, 10 minutes before**

- Open `https://parbot-web.vercel.app/api/health`. It should read
  `{"ok":true,"ai":"gemini","billing":"mock",…}`.
- In window B, open Overview, Chat, Knowledge, Inbox, Widget and Billing once each. The first
  visit to a cold function took up to _4.3 s_ in rehearsal. Warm ones take _about 0.8 s_.
- In window B's Chat, ask `How do I install the widget?`. The first words should appear within
  about 3 s. Then delete that chat from its ⋯ menu. If the first words take more than 5 s, the
  Gemini free tier is slow right now. Wait 10 minutes and try again. In rehearsal most answers
  began in _1.3 to 2.4 s_, but two took _12.8 s_ and _21.4 s_ while other people were using the
  same key.
- Ask the landing ⌘K palette one question from window B, then delete that conversation in the
  demo account's Inbox (open it, then Delete conversation). This warms the widget route without
  leaving a conversation behind.

---

## 1. Landing (0:00 to 0:50)

[Window A on `/`. Let the hero's example play for three seconds.]

"This is Parbot. You point it at your documentation, and it answers your readers' questions inside
your docs, with the pages it used listed under every answer."

[Point at the example panel on the right.]

"This panel is a scripted example on made-up docs, so it always shows a good exchange: a streamed
answer, a code block, numbered sources, and an email form when the docs can't help."

[Scroll to "One script tag. A bubble or a palette."]

"On your site it's one script tag, either a floating bubble or a ⌘K palette, the way developer
docs already work."

[Scroll through "From a URL to answers in three steps" and the features to Pricing. Click Yearly.
The prices change to $290 and $990.]

"Three plans. Hobby is free with no card. Starter adds the palette, your own colours, lead capture
and no Parbot branding. Yearly is twelve months for the price of ten."

[Scroll back to the top. Press ⌘K. The question box already has focus. Type the landing question and
press Enter. Point at the answer, then at Sources.]

"The palette on this page isn't scripted: it's the real widget, answering from Parbot's own docs.
It streams, and it cites where each part came from."

_Palette opens in about 10 ms. First words in 3.8 s in one run and 12.8 s in another._

[Esc.]

## 2. Sign up and the one assistant (0:50 to 1:10)

[Click Start free. Fill in Alex Rivera, the email and a password. Create account.]

"An account is an email and a password. No card."

[Onboarding, "Create your assistant". Type `Northwind Docs` into Name and let the slug fill in.
Click Create.]

"Every account has exactly one assistant: one knowledge base, one widget. There's nothing to
switch between."

_Create account to onboarding: 0.7 to 0.8 s. Create to Knowledge: 0.5 to 1.4 s._

## 3. Knowledge (1:10 to 2:05)

[You land on Knowledge, which is empty. Click Add source, open the Website tab, paste
`https://hono.dev/docs/api/context` and click Add website.]

"Sources can be a website, a sitemap, files or pasted text. I'll start with a public docs site I
don't control, Hono's API reference. From a start page, Parbot follows the links under the same
path."

[While the row shows "Crawling · n pages" and then "Indexing n of 6 pages": click Add source, open
Upload, choose `northwind-api-limits.docx` and click Upload file. Then click Add source, open Paste
text, set the Title to `Refund policy`, paste the text and click Add text.]

"Our own material goes in too: an internal Word document with our API limits, and a refund policy
I paste in. All three index at the same time. This is live."

[Wait until all three rows say Ready. Then point at the pages meter, which should read "8 of 100
pages". If it still shows fewer pages, wait a moment: it catches up within about 3 s.]

"Six pages from the website, one file, one note. The free plan indexes a hundred pages, and the
meter shows how close you are."

[The website row takes the first page's title, "Context - Hono". Open its ⋯ menu and choose View
pages. The sheet lists App, Context, HonoRequest,
HTTPException, Presets and Routing. Close it. Click the title `northwind-api-limits.docx`.]

"Any source opens as the text the assistant reads: headings, lists and all."

[The document viewer shows the headings. Click Back.]

_Website Ready in 8.4 s and 12.5 s over two runs. Word file 2.3 to 4.0 s. Text 1.3 to 2.6 s. Viewer
opens in about 1.1 s._

## 4. Chat (2:05 to 3:40)

[Click Chat. Type chat question 1 and press Enter.]

"The chat inside the app is ChatGPT-style. My question is on screen the moment I press Enter, and
the answer streams in underneath it."

[As it streams, point at the code block, then the citation numbers, then the Sources row with
"HonoRequest - Hono".]

_Question bubble in 7 to 32 ms. First words in 1.8 s._

[Type `And a path parameter?` and press Enter.]

"A follow-up keeps the context of the conversation."

[Type `Does Hono ship a Postgres driver?` and press Enter.]

"When the docs don't cover something, it says so instead of guessing. The chat is flagged, and the
question will show up as a gap to write."

[Point at the amber dot next to the chat in the list.]

[Click New chat. Type `@north`, press Enter to pick `northwind-api-limits.docx`, type
`what happens if we go over?` and press Enter.]

"With @ I can point a question at a file. This question doesn't name the file or say what 'over'
means, but the file is read first, so the answer comes from our limits document."

[Point at the file chip on the question and at the source "Northwind Payments API: limits and
retries".]

[Type `How long should we wait before retrying?` and press Enter. Point at the chip still sitting in
the message box.]

"The file stays attached to the conversation, so follow-ups keep using it until I remove it. The
paperclip does the same for a new file: it uploads the file to Knowledge and attaches it in one
step."

[Click the source under the last answer.]

"Every citation opens the source with the passage it used highlighted."

[The viewer highlights the "Retrying safely" passage. Click Back. The chat is still there.]

[Click New chat. Paste the chat 3 question and press Enter. When two or three lines have streamed,
click the Stop button in the message box.]

"Stop ends an answer where it is. The answer is saved as stopped and doesn't count against the
plan."

[Now click between the three chats in the list, slowly, twice.]

"And switching between conversations is instant. The list and every thread are cached in the
browser, so nothing waits on the server except a new answer."

_Answers began in 1.3 to 2.3 s. The unanswered reply arrives whole after 4.8 s, because a refusal
is held back until the answer is done. New chat in about 50 ms. Switching between chats took 34 to
55 ms. Citation to viewer took 0.8 s, and Back took 40 ms._

## 5. Projects (3:40 to 4:20)

[In the chat sidebar, under Projects, click New project. Type `Support replies` and press Enter.
The folder shows at once and the project's home page opens.]

"Projects are folders for chats, and each one can have its own files and instructions."

[Click Edit project. Paste the instructions. In "Find a file or source in Knowledge", type
`Refund` and pick Refund policy. Click Save.]

"This one is for the support team: it always reads the refund policy and answers as a reply an
agent can send. The instructions shape the tone. They can't make it answer from anything but our
sources."

[In the project's message box, type the project question and press Enter.]

"I don't mention the policy. The project brings it along."

[Point at the reply, at "Policy: Refund policy", and at the fixed Refund policy chip in the
message box.]

[Optional: drag the "what happens if we go over?" chat onto the Support replies folder. The chat's
⋯ menu > Move to project does the same.]

_Project folder in 16 ms. Save in 0.2 s. First words in 1.8 to 2.1 s. Both rehearsals followed the
format and cited Refund policy._

## 6. The widget on the free plan (4:20 to 4:50)

[Click Widget.]

"This is what readers get on your site. On the free plan it's a bubble in Parbot's amber. Palette
mode, your colours, removing our branding and lead capture are marked Starter and up."

[Point at the "Starter and up" badges, then at the Install card. Click Copy.]

"Installing it is this one script tag."

[Click Open the demo page. A new tab opens: "Example docs for Northwind". Click the bubble in the
corner, type the demo page bubble question and press Enter.]

"Here it is on a page that isn't Parbot, answering from the Hono docs we just indexed, with our
small 'Powered by Parbot' line underneath."

[Close the tab with ⌘W.]

_Widget page in 0.8 s. Bubble ready 1.5 s after the demo page loads. First words in 1.4 to 1.9 s._

## 7. Billing, then the paid widget (4:50 to 5:35)

[Click Billing. Point at the "Billing runs in test mode. No card is charged." banner and the usage
meters. Click Choose Starter, then Apply.]

"Plans and usage live here. Checkout runs in test mode, so nothing is charged, and an upgrade
lifts the limits at once."

[The plan card now says Starter and the sidebar badge says STARTER. Click Widget. The Starter and
up badges are gone. Click Palette (⌘K), pick the green accent, switch on Hide "Powered by Parbot"
and Lead capture. Click Save changes **once**, then scroll straight to Live preview.]

"The paid features switch on immediately. The live preview is our demo page with the saved
settings: now it's a ⌘K palette in our colour, with no Parbot branding."

[In the live preview, type `Is there a Go SDK?` and press Enter. When the email form appears, fill
in `sam@example.com` and the note, then click Send.]

"When the docs can't answer, the widget offers to take the reader's email instead of guessing.
That lead goes straight to the inbox."

_Apply took 1.3 to 2.1 s. Save took 0.8 s. Lead form after 1.4 to 1.5 s, and Send took 0.26 s._

> Known issue until it's fixed: right after Save changes, the two switches jump back to off even
> though they were saved on. A second Save would then turn them off for real. Don't look back at
> the switches and don't press Save twice. The preview shows the saved state. The same goes for a
> demo page tab opened before the upgrade: it keeps the old settings for up to a minute, which is
> why this section uses the live preview.

## 8. Inbox (5:35 to 5:55)

[Click Inbox. The "Is there a Go SDK?" conversation is at the top, marked Widget and Unanswered.
Below it are the in-app chats, and the ones in the project say "Project: Support replies". Open
the top one.]

"Every conversation, from the widget and from the chat, lands in one inbox, with the page the
reader was on."

[Click the Leads tab. Set the lead's status to Contacted.]

"And every lead, with the reader's note and a status to work through."

_Inbox in 0.8 s. Transcript in about 25 ms._

## 9. Overview, on an account with history (5:55 to 6:40)

[Switch to window B, the demo account, with Overview on 7 days.]

"This is an assistant that has had two weeks of traffic. The Overview is built around what to fix
next."

[Point at Answer quality.]

"The answer rate is how often the docs had the answer. When it drops, the docs have a hole. Next
to it, how helpful readers found the answers, with the number of ratings so a small sample reads
as one, and the median time to answer. Each is compared with the week before."

[Scroll to Knowledge gaps.]

"Knowledge gaps are the questions the docs couldn't answer, with different wordings grouped. That
list is your writing backlog. Add docs goes straight to Knowledge."

[Scroll past "Answers readers disliked" and "Where readers ask".]

"The answers readers disliked point at pages that are wrong or out of date. Where readers ask
shows which pages of your site need help, and flags a low answer rate on a page."

[Scroll to "Content that works, and content that does not", then to Usage and Leads.]

"Which pages answers use, and which they never use. Usage against the plan, with a projection for
the month. And the leads still waiting for a reply."

> If a section is empty on 7 days because the seeded history is old, click 30 days. The lists
> fill, but the comparison arrows disappear, because there is nothing in the 30 days before.

## 10. Close (6:40 to 6:50)

[Back in window A, open the landing page and scroll to the top.]

"That's Parbot: your docs, answering, in your app and on your site. Thanks for watching."

---

## If something goes wrong on camera

- **The model is slow.** The typing dots show at once, so keep talking. Answers usually begin
  within 1 to 3 s. On the free tier, a first answer after a quiet spell, or while someone else uses
  the key, took 13 to 21 s in rehearsal. The engine retries and falls back through three Gemini
  models. If a message fails, it says so with a Retry button. Say "the free tier is rate limited"
  and click Retry. If it stays slow, stop and record later.
- **The crawl takes long or fails.** Keep going with the upload and the pasted text while it runs;
  the row updates live. If it fails, open "Show what happened", then choose Re-index from the row's
  menu. If it still fails, skip the two Hono questions and ask the Word file something instead,
  for example "What are the rate limits on the Standard plan?". That one was not rehearsed.
- **The pages meter shows too few pages.** It re-reads the count after a source finishes, which
  took up to about 3 s in rehearsal. Wait, or reload Knowledge.
- **A question comes back unanswered when it shouldn't.** Use the exact wording from the inputs
  table. Retrieval is by meaning, but a question that combines two things the docs cover in
  different places can miss.
- **Stop was pressed before any text arrived.** The question stays, marked as stopped, and
  nothing is counted against the plan. Ask the question again and stop later.
- **The widget switches look off after Save.** Known display issue, and the settings are saved.
  Reload the Widget page to see them on. Don't press Save again before reloading.
- **A demo page tab shows the old settings.** Installed widgets cache their settings for up to a
  minute. Use the live preview, wait a minute and reload, or add `?v=2` to the demo page address.
- **⌘K doesn't open the palette on the landing.** Click an empty part of the page first so it has
  focus, or click the "Ask AI ⌘K" pill in the bottom right corner.
- **Dragging a chat onto a project doesn't take.** Use the chat's ⋯ menu > Move to project.
- **A screen takes seconds to open.** That's a cold function. It only happens on the first visit
  after a quiet spell. Warming up covers it.

## Demo data

The demo account is created by `apps/web/scripts/seed-demo.ts`. With `--history` it contains:

- `demo@parbot.dev` / `parbot-demo` on Starter, with a 30-day period from the time of seeding.
- One assistant, "Parbot Docs": palette mode, amber accent, lead capture on, branding hidden, four
  suggested questions, and instructions to answer about Parbot.
- 9 sources, all pasted text: the product docs in `apps/web/content/docs` (getting started,
  sources, widget, theming, inbox and analytics, plans, privacy, FAQ, projects).
- 12 conversations spread from 13 days to 2 days before the seed ran: 10 from the widget on
  `docs.example.com` pages and 2 in-app. 5 answers are rated thumbs up and 1 thumbs down. 3
  questions are unanswered (a Slack integration, a weekly CSV export, an API).
- 1 lead, `maya@northwind.dev`, about the Slack integration.

To re-index the docs (history is left alone), point `.env` at the hosted project and run from
the repo root:

```bash
pnpm --filter web seed:demo --history
```

The script reads `apps/web/.env` (the symlink to the root `.env`). It needs the hosted
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY`, and
`NEXT_PUBLIC_APP_URL=https://parbot-web.vercel.app`, because the seeded install answer quotes the
widget URL. If you keep the hosted values in a separate gitignored file instead, run from
`apps/web`:
`node --env-file=<that file> --conditions=react-server --import tsx scripts/seed-demo.ts --history`.
See the README, "Demo data" and "Deploying".

To give the history fresh dates for recording day while keeping the public key the landing uses,
first delete the old history in the Supabase SQL editor:

```sql
delete from leads where assistant_id = (select a.id from assistants a
  join profiles p on p.id = a.owner_id where p.email = 'demo@parbot.dev');
delete from conversations where assistant_id = (select a.id from assistants a
  join profiles p on p.id = a.owner_id where p.email = 'demo@parbot.dev');
delete from chat_projects where assistant_id = (select a.id from assistants a
  join profiles p on p.id = a.owner_id where p.email = 'demo@parbot.dev');
```

Then run the seed command above. With no conversations left, `--history` writes the 12 exchanges
and the lead again. The newest is about two days old, so on 7 days the Overview has five seeded
conversations to show and seven in the week before to compare with. Don't use `--reset` on the hosted project. It deletes the
assistant, and the new one gets a new public key, so the landing's ⌘K palette stops working until
`NEXT_PUBLIC_DEMO_ASSISTANT_KEY` is updated on Vercel and the app is redeployed.

The file uploaded in section 3 is `docs/demo-assets/northwind-api-limits.docx`. Its source is the
Markdown file next to it (`pandoc northwind-api-limits.md -o northwind-api-limits.docx`). Upload
the Word file, not a PDF. PDF text is currently extracted without line breaks, so the viewer shows
one long paragraph and a citation highlights half the document.
