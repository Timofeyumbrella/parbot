# Parbot demo video script

Target length: 6 to 7 minutes, recorded on the live deployment at https://parbot-web.vercel.app.
OBS records the whole built-in screen at the left of a 1080p frame, with the browser filling the
screen in the dark scheme at 125% zoom and the camera in the column on the right (see "Recording
setup"). Record one file per section and join them afterwards.

Voiceover lines are in quotes. Actions are in brackets. Keep the mouse still while talking. The
timings in italics were measured on the live site.

The story: a new user, Alex, signs up and sets up an assistant called Northwind Docs for a payments
API. Its public part is Hono's API reference, a real site Alex doesn't control, which shows
crawling works on any public site. Its private part is Northwind's own files, a Word document and a
PDF, and a pasted refund policy. While those index, a second browser profile shows the demo
account, whose seeded history makes the Overview look like two weeks of real traffic. The chat
section answers a reviewer's complaint about a sibling product: there, switching chats took seconds
and a sent message appeared only after the answer. Here both happen in the same frame.

**What was tested.** The landing, sign-up, chat, billing and widget steps were rehearsed in full
on the live site on 28 Sep 2026. Every source in section 3 was added live the same night, between
01:55 and 02:12 (UTC+3), in a new Hobby account, with the questions in `~/Wo/par/utils/README.md`.
These fixes went live after that and have not been through a full take. The dry run covers the
ones the video depends on:

- The Overview opens on the last 7 days.
- The widget settings switches keep their saved values after Save, and the demo page always loads
  the latest settings.
- The widget lists its sources by page, each with the numbers of the citations that used it.
- A question the docs cover only in part gets that part answered, with a sentence on what the docs
  leave out. A question no source touches still gets "I couldn't find that…".
- When a Gemini model sends nothing for 3.5 s, the next model starts beside it and the first to
  answer wins.
- The pages meter keeps up with the sources as they index, and a stopped answer keeps its sources.
- PDF uploads keep their headings, paragraphs and lists.
- Signing out ends only that browser's session.
- Below 1024 px wide, the landing shows a link to the demo page in place of the ⌘K hint.

New in this running order, so the dry run covers them too: the @ question comes as a follow-up in
the Hono chat (it was rehearsed in a chat of its own, and tested with all five files uploaded), the
widget moves to Bottom left, and the demo page question is asked in the palette (it was rehearsed
in the bubble).

## Running order

| #   | Section                                               | Target | Runs         | Optional beats                     |
| --- | ----------------------------------------------------- | ------ | ------------ | ---------------------------------- |
| 1   | Landing: hero, live ⌘K question, embed modes, pricing | 1:00   | 0:00 to 1:00 |                                    |
| 2   | Sign up and create the assistant                      | 0:20   | 1:00 to 1:20 |                                    |
| 3   | Knowledge, with the demo account's Overview and Inbox | 2:00   | 1:20 to 3:20 | The sitemap +0:10                  |
| 4   | Chat                                                  | 1:30   | 3:20 to 4:50 | Stop +0:15, a Project +0:35        |
| 5   | Billing: upgrade to Starter                           | 0:25   | 4:50 to 5:15 |                                    |
| 6   | Widget, install snippet and the demo page             | 1:05   | 5:15 to 6:20 | The lead form in the preview +0:20 |
| 7   | Close                                                 | 0:10   | 6:20 to 6:30 |                                    |

Without the optional beats the video runs about 6:30. Add at most 30 seconds of them to stay under
7 minutes.

## Test inputs

Keep this table where you can read it and the capture can't: an external display, a printout or a
phone. Type or paste exactly these inputs. The files are in `~/Wo/par/utils`, outside the repo.

| Section | Where                  | Input                                                                                                            | What comes back                                                                                                                         |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | Landing ⌘K             | `What happens when the docs don't cover a question?`                                                             | It says so instead of guessing, records the question, and with lead capture offers an email form. Sources listed by page                |
| 2       | Sign up                | Full name `Alex Rivera`, a fresh email you control, any 8+ character password                                    | Onboarding                                                                                                                              |
| 2       | Onboarding             | Name `Northwind Docs`                                                                                            | Slug `northwind-docs` fills in. Create assistant lands on Knowledge                                                                     |
| 3       | Website                | `https://hono.dev/docs/api/context`                                                                              | Everything under `/docs/api/`: 6 pages, 79 passages, Ready in _8 to 16 s_. The row becomes "Context - Hono"                             |
| 3       | Upload                 | `uploads/northwind-api-limits.docx`                                                                              | Word file, 6 passages, Ready in _2 to 4 s_. Document title "Northwind Payments API: limits and retries"                                 |
| 3       | Upload                 | `uploads/northwind-webhooks-guide.pdf`                                                                           | PDF, 6 passages, Ready in _2.4 s_. Document title "Northwind Payments API: webhooks guide"                                              |
| 3       | Upload, optional       | `uploads/northwind-authentication.html`, `uploads/northwind-error-codes.md`, `uploads/northwind-support-sla.txt` | 7, 8 and 5 passages, Ready in _2.3 to 3.3 s_ each                                                                                       |
| 3       | Paste text             | Title `Refund policy`, the text below                                                                            | 1 passage, Ready in _1 to 3 s_                                                                                                          |
| 3       | Sitemap, optional      | `https://webhooks.fyi/sitemap.xml`                                                                               | A sitemap index with one child: 29 pages, 88 passages, Ready in _17 to 24 s_. The row reads "webhooks.fyi"                              |
| 4       | Chat 1                 | `How do I read a query parameter?`                                                                               | `c.req.query()` with two code blocks, cites HonoRequest - Hono                                                                          |
| 4       | Chat 1                 | `@northwind-api`, Enter to pick the file, then `what happens if we go over?`                                     | 429, not queued, safe to resend, Retry-After. Cites only the Word file                                                                  |
| 4       | Chat 2                 | `Our webhook endpoint was down all weekend. How do we get the events we missed?`                                 | Replay within 30 days: Resend in the dashboard, `POST /v1/events/{event_id}/replay`, or a bulk replay of up to 1,000. Cites the PDF     |
| 4       | Chat 3, optional Stop  | `Walk me through routing in Hono, with a code example for every kind of route.`                                  | A long answer. Press Stop after two or three lines                                                                                      |
| 4       | Project, optional      | Name `Support replies`, the instructions below, file `Refund policy`                                             |                                                                                                                                         |
| 4       | Project chat, optional | `A customer on the annual plan paid two months ago and wants their money back. What do I reply?`                 | A two-sentence reply about a pro rata refund, then `Policy: Refund policy`                                                              |
| 6       | Demo page palette      | `How do I set the status code of a response?`                                                                    | `c.status()` with `c.status(201)`, also `c.body()`, `c.redirect()` and `HTTPException`. Cites Context and HTTPException, listed by page |
| 6       | Live preview, optional | `Is there a Go SDK?`                                                                                             | "I couldn't find that…", then the lead form                                                                                             |
| 6       | Lead form, optional    | `sam@example.com`, note `We ship a Go backend and would like an official SDK.`                                   | "Thanks. The team will reply to sam@example.com."                                                                                       |

Refund policy text, pasted as-is (the same as `paste-text/refund-policy.txt` below its first two
lines):

```
Monthly plans are refunded in full when the customer asks within 14 days of the charge.

Annual plans are refunded pro rata for the unused full months when the customer asks within the first 90 days. After 90 days there is no refund, but cancelling stops the plan from renewing.

Refunds go back to the original card within 5 to 10 business days. Support never promises a refund in advance: the billing team at billing@northwind.example confirms every refund.
```

Project instructions, pasted as-is:

```
Write the reply a support agent can send to the customer: two or three short, friendly sentences, no lists. Then add one line starting with "Policy:" that names the document you used.
```

**The @ picker.** Type `@northwind-api`, not `@north`. The picker lists the newest upload first, so
`@north` picks whichever Northwind file went in last: the PDF when only the Word file and the PDF
are uploaded, the support SLA text file when all five are. `@northwind-api` matches only the Word
file. The tested alternative for the PDF is `@northwind-web` with
`what happens if our endpoint is down?`. If you use it, ask chat 2 about the refund policy instead:
`A customer on a monthly plan was charged three weeks ago and wants their money back. Can they get it?`
(No: monthly plans are refunded only within 14 days. Cites Refund policy.)

Do not improvise the questions. `How do I return JSON with a 201 status code?` came back as
unanswered in rehearsal, and has not been asked since the partial-coverage fix. The one question
meant to come back unanswered, the Go SDK, touches nothing in the sources, so it should still get
"I couldn't find that…". That reply is what brings up the lead form, so the dry run checks it.

---

## Recording setup

OBS Studio on the 16-inch M1 Pro MacBook: it is free, has no time limit and records to local files.
Set it up once, then make a 20-second test before the first real take.

**Canvas.** Settings > Video: Base (Canvas) Resolution `1920x1080`, Output (Scaled) Resolution
`1920x1080`, Common FPS Values `30`.

**Screen.** Add a macOS Screen Capture source with Method set to Display Capture, the built-in
display, and the cursor shown. Right-click it, then Transform > Fit to screen, then Transform > Edit
Transform and set Position to `0, 0`. It sits at the left at full height, about 1670×1080, because
that is the screen's shape at 1080 px tall. Right-click > Scale Filtering > Lanczos keeps small text
sharp. This leaves a column about 250 px wide on the right.

**Camera.** Add a Video Capture Device source with the FaceTime HD Camera. In Edit Transform, crop
it square from the middle (for a 1920×1080 camera image, Crop Left and Right `420` each), set Size
to `250x250` and Position to `1670, 0`, so it sits at the top of the right column. Nothing on the
screen may be covered, because Parbot uses every corner: Billing and Account at the bottom of the
sidebar on the left, the landing's Ask AI pill and the widget launcher at the bottom right (bottom
left on the demo page after section 6), and the composer's send and Stop buttons at the bottom of
the chat.

**Output.** Settings > Output, Output Mode Simple. Recording Quality: High Quality, Medium File
Size. Recording Format: Hybrid MP4, or MKV and then File > Remux Recordings to MP4 after the
session. Either one keeps what was recorded if OBS crashes. Encoder: Hardware (Apple, H.264).

**Sound.** Settings > Audio: Mic/Auxiliary Audio is the MacBook Pro Microphone, and Desktop Audio is
Disabled, since the demo makes no sound and a notification chime can't reach the file. Don't use
the AirPods mic: macOS records it at call quality. In the Audio Mixer, open the mic's ⋮ menu >
Filters and add Noise Suppression. Talk at your recording distance and check that peaks reach about
−10 dB, the top of the yellow, never the red. Add a Gain filter if they stay lower.

**Hotkeys.** Settings > Hotkeys: set Start Recording and Stop Recording to keys nothing else uses,
for example ⌃⌥⌘R and ⌃⌥⌘S (⌘K is the palette). Move OBS to its own Space in Mission Control and
start and stop from the browser's Space, so OBS never shows on screen. The first time, allow OBS
Screen Recording, Camera, Microphone and Accessibility (hotkeys need it while another app is in
front) in System Settings > Privacy & Security, then restart OBS.

**The screen.** Hide the Dock (⌥⌘D) and turn on Do Not Disturb. Keep the display at its default
size (looks like 1728×1117). Make each Chrome window fill the screen: ⌥-click the green button,
which fills the screen without going full screen. Hide the bookmarks bar, and set the zoom on
parbot-web.vercel.app to 125% (⌘+ twice) in both profiles. The page is then about 1380×800 CSS px,
close to the rehearsal's 1440×900 window, and text set at 14 px comes out at about 17 px in the
1080p video. Don't zoom past 150%: once the page is narrower than 1024 px, the landing replaces its
⌘K hint and the Ask AI pill with a link for phones. Both profiles are windows of the same Chrome, so
`` ⌘` `` switches between them. If your keyboard layout takes that shortcut, pick the other window
from Chrome's Window menu.

**Test.** Record 20 seconds: talk, scroll the landing, open ⌘K and type, switch to the other
profile and back. Play it back full screen in QuickTime Player and check that the text reads, the
camera covers nothing, the voice is steady with no hiss or echo, the cursor shows, and scrolling
is smooth.

**Takes.** One file per section: start with the hotkey, do the section, stop. To redo a section,
record it again and keep the better file. Only two texts are pasted, so copy each before its
section starts: the refund policy for section 3, and the project instructions for section 4 if you
do the Project beat. Type everything else.

**Joining.** Trim each file's ends in QuickTime Player (Edit > Trim). Open section 1, choose Edit >
Add Clip to End for each next section in order, then File > Export As > 1080p. iMovie does the same
if a take needs a cut in the middle.

**Publishing.** Upload the video to YouTube as Unlisted. In the README, replace the "Video
walkthrough: coming soon" line under Live with the link.

## Before recording

**The Gemini quota**

- The free tier gives the whole project 1,000 embeddings a day (gemini-embedding-2). Each indexed
  passage is one, and so is each question asked anywhere: the landing's palette, the chat, the demo
  page and the live preview. Testing on the night of 28 Sep used it up by 02:10 (UTC+3).
- Record after the daily quota resets: midnight Pacific, which is 10:00 your time (UTC+3). Keep
  everyone and every agent off the key that day: no local `pnpm dev` or seed runs with the hosted
  key, no `GEMINI_LIVE` tests, and no indexing on the live site outside the takes. Visitors to the
  live site share the key too, and that you can't control.
- One Knowledge take (section 3) costs about 120: website 79, uploads about 33 (Word 6, PDF 6, HTML
  7, Markdown 8, text 5; 12 with only the Word file and the PDF), paste 1. The sitemap adds 88.
  The questions of a full run add 5, up to 9 with the optional beats and the warm-up question.
- So plan for at most three or four full takes. Prefer re-recording only the section that went
  wrong: sections 1, 4 and 6 cost only their questions (1, 3 and 1, plus the optional ones), and
  sections 2 and 5 cost nothing. A section 3 retake needs an empty Knowledge: delete the rows from
  their ⋯ menus, or retake section 2 with a new address.
- The free tier also limits embeddings per minute, which is why the sitemap waits until the other
  rows have been Ready for a minute. If a row fails anyway, wait a minute and choose Re-index from
  its ⋯ menu. Pages already indexed are kept.

**Accounts**

- Demo account: `demo@parbot.dev` / `parbot-demo`, Starter, one assistant, "Parbot Docs". The
  landing's ⌘K palette answers from it, and section 3 shows its Overview and Inbox.
- New account: created on camera in section 2. Use an address you control that has never signed
  up before. Plus-addressing works, and email confirmation is off on the hosted project. Don't use
  `maya@northwind.dev`: it is the seeded lead. After recording, delete the account from Account >
  Delete account.

**Windows**

- Window A, for recording everything but the detour in section 3: a clean Chrome profile, signed
  out, on `https://parbot-web.vercel.app`. Turn off "Offer to save passwords" and address autofill
  so no popup covers the sign-up form. Clear the site data for parbot-web.vercel.app. The ⌘K palette
  keeps its last conversation in local storage, and it should open empty with its four suggested
  questions. Then set the zoom to 125%.
- Window B: a second Chrome profile, signed in as the demo account, on its Overview, which opens on
  the last 7 days. It has to be a second profile, not another tab: tabs of one profile share the
  sign-in, so signing up in one would switch the others to the new account. Zoom 125% here too.
  Other people signing out of the shared demo account no longer sign this window out.
- Both windows fill the screen. Close every other tab. Drag `~/Wo/par/utils/uploads` into the
  Favorites in Finder's sidebar, so the file picker reaches it in one click. Keep the refund policy
  and the project instructions in a note.

**The day before: a dry run**

Run sections 2 to 6 once on a throwaway account, without recording, on the day before's quota: a
dry run costs as much as a take. Check what changed since the rehearsal:

- `@northwind-api` picks the Word file, and asked after the Hono question in the same chat, the
  answer still comes from the Word file. The chat 2 question cites the webhooks guide.
- The Word file opens in the viewer with its headings. If you want to open the PDF on camera, check
  that it shows headings and paragraphs too.
- After Save changes on the Widget page, the switches stay on, and the demo page shows the green
  palette with its launcher at the bottom left.
- The palette's answer on the demo page lists its sources by page.
- For the lead-form beat: `Is there a Go SDK?` still comes back as "I couldn't find that…" and
  brings up the email form, with the sitemap indexed too if you'll add it on camera. If it gets an
  answer, find a question nothing in the sources mentions, check it the same way, and use it in
  the table and the section. `What's the maximum size of a webhook payload?` was refused with
  webhooks.fyi indexed.

Delete the throwaway account afterwards from Account > Delete account.

**On recording day: refresh the demo data**

The live site must run main with the fixes above. After a push, check that Vercel's production
deployment is the pushed commit. In window B, the Overview opening on 7 days, with no `?days=` in
the address, shows the new build is live.

Refresh the demo history from `apps/web`, against the hosted project:

```bash
node --env-file=../../.env.hosted --conditions=react-server --import tsx scripts/seed-demo.ts --refresh-history
```

`.env.hosted` is the gitignored file at the repo root with the hosted values. It must have
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and
`NEXT_PUBLIC_APP_URL=https://parbot-web.vercel.app`. The first lines should say the docs are
indexed "on the Gemini provider": passages indexed on the stub don't match Gemini's questions. The
run re-indexes only a doc whose text changed, and the last refresh (28 Sep, after the fixes went
live) already did that, so it should report "docs: 0 re-indexed, 9 unchanged" and spend no
embeddings. A re-indexed doc costs one embedding per passage.

The refresh writes the history again with dates ending yesterday, then deletes everything else the
assistant has collected: conversations, leads and chat projects, including anything left from
testing. It keeps the assistant, its settings, its sources and its public key. The summary at the
end should read "created: 14 conversations (28 messages), 1 lead".

Never run the hosted seed with `--reset`. It deletes the assistant, and the new one gets a new
public key, so the landing's ⌘K palette and the README's widget links stop working until
`NEXT_PUBLIC_DEMO_ASSISTANT_KEY` is updated on Vercel and the app is redeployed. The script refuses
`--reset` together with `--refresh-history`.

Then check in window B:

- Knowledge: 9 sources, all Ready, "9 of 2,000 pages". The refresh keeps sources, so delete any
  that someone added.
- Billing: Starter, active.
- Widget: palette, amber accent, lead capture on, "Powered by Parbot" hidden. The refresh keeps the
  settings as they are. If someone changed them, set them back and wait a minute before section 1,
  because the landing's palette caches its settings for up to a minute.
- Chat: no projects, and only the two seeded in-app chats.
- Inbox: the 14 seeded conversations, the newest from yesterday. Leads: only `maya@northwind.dev`,
  New.
- Overview: every section has data on 7 days.

**Warm up, 10 minutes before**

- Open `https://parbot-web.vercel.app/api/health`. It should read
  `{"ok":true,"ai":"gemini","billing":"mock",…}`.
- In window B, open Overview, Chat, Knowledge, Inbox, Widget and Billing once each, and the demo
  page from the README's bubble link. The first visit to a cold function took up to _4.3 s_ in
  rehearsal. Warm ones take _about 0.8 s_.
- Ask one warm-up question. In window B, open the landing page, press ⌘K and ask
  `How do I install the widget?`. The first words should appear within about 3 s. Then delete that
  conversation in the demo account's Inbox (open it, then Delete conversation), so the Overview
  doesn't count it. If the first words take more than about 6 s, the first two models are both slow
  right now. Wait 10 minutes and try again. In rehearsal, before the hedge, most answers began in
  _1.3 to 2.4 s_, but two took _12.8 s_ and _21.4 s_ while other people were using the same key.
- Go back to the Overview in window B, so section 3 opens on it.

---

## 1. Landing (0:00 to 1:00)

[Window A on `/`. Let the hero's example play for three seconds.]

"This is Parbot. You point it at your documentation, and it answers your readers' questions inside
your docs, with the pages it used listed under every answer."

[Point at the example panel on the right.]

"This panel is a scripted example on made-up docs, so it always shows a good exchange: a streamed
answer, a code block, numbered sources, and an email form when the docs can't help."

[Press ⌘K. The question box already has focus. Type the landing question and press Enter. Point at
the answer, then at Sources: one row per page, with the numbers that cite it.]

"This palette isn't scripted. It's the real widget, answering live from Parbot's own docs. It
streams, and it cites where each part came from."

_Palette opens in about 10 ms. First words in 3.8 s in one rehearsal run and 12.8 s in another.
Since then, a model that sends nothing for 3.5 s gets the next one started beside it._

[Esc. Scroll to "One script tag. A bubble or a palette."]

"On your site it's one script tag: a floating bubble in the corner, or a ⌘K palette, the way
developer docs already work."

[Scroll through "From a URL to answers in three steps" and the features to Pricing, on Monthly.]

"Hobby is free: a hundred pages, two hundred answers a month, and the bubble with Parbot branding.
Starter, at twenty-nine dollars, is two thousand pages and three thousand answers, with the ⌘K
palette, your own theme, lead capture and no branding. Growth, at ninety-nine, is the same with
twenty thousand of each."

[Click Yearly. The prices change to $290 and $990 a year.]

"Paid yearly, it's ten months' price."

## 2. Sign up and create the assistant (1:00 to 1:20)

[Scroll to the top and click Start free in the header. Fill in Alex Rivera, the email and a
password. Click Create account.]

"An account is an email and a password. No card."

[Onboarding, "Create your assistant". Type `Northwind Docs` into Name and let the slug fill in.
Click Create assistant.]

"Every account has exactly one assistant: one knowledge base, one widget. There's nothing to
switch between. Ours answers for Northwind, a payments API."

_Create account to onboarding: 0.7 to 0.8 s. Create assistant to Knowledge: 0.5 to 1.4 s._

## 3. Knowledge, and an assistant with history (1:20 to 3:20)

[You land on Knowledge, which is empty. Click Add source. It opens on the Website tab. Type
`https://hono.dev/docs/api/context` and click Add website. The row appears at once.]

"Sources can be a website, a sitemap, files or pasted text. I'll start with a public docs site I
don't control, Hono's API reference. From a start page, Parbot follows the links under the same
path, in the background."

[While the row shows "Crawling · n pages" and then "Indexing n of 6 pages": click Add source, open
Upload, click Choose file, pick `northwind-api-limits.docx` and click Upload file. Do the same for
`northwind-webhooks-guide.pdf`. Each file is its own trip through the dialog.]

"Then our own material: an internal Word document with our API limits, and our webhooks guide as a
PDF. HTML, Markdown and plain text files work the same way."

[Optional, not in the time budget: upload `northwind-authentication.html`,
`northwind-error-codes.md` and `northwind-support-sla.txt` the same way. They add 20 embeddings to
the same minute as the crawl, so leave them out if the dry run showed a failed row.]

[Click Add source, open Paste text, type `Refund policy` as the Title, paste the policy and click
Add text.]

"And a refund policy I paste in. They all index at the same time."

_Website Ready in 8.4 s and 12.5 s in rehearsal and 16.1 s in the test. Word file 2.3 to 4.0 s,
PDF 2.4 s, HTML and Markdown 2.3 s, text file 3.3 s, pasted text 1.3 to 2.6 s._

[Switch to window B, the demo account's Overview. It opens on the last 7 days.]

"While that runs, here's an assistant that has had two weeks of traffic. This is another browser
profile, signed in to our demo account. The Overview shows the last week against the week before,
and it's built around what to fix next."

[Point at Answer quality. With the refreshed history, the answer rate is down on the week before,
while helpfulness and the time to answer are better.]

"The answer rate is how often the docs had the answer. When it drops, the docs have a hole. Next
to it, how helpful readers found the answers, with the number of ratings so a small sample reads
as one, and the median time to answer."

[Scroll to Knowledge gaps. The two Slack questions are one gap, asked twice. Point at Add docs,
without clicking it.]

"Knowledge gaps are the questions the docs couldn't answer, with different wordings grouped. That
list is your writing backlog, and Add docs goes straight to Knowledge."

[Scroll to "Answers readers disliked" and "Where readers ask", side by side.]

"The answers readers disliked point at pages that are wrong or out of date. Where readers ask
shows which pages of your site need help, and flags a low answer rate on a page."

[Scroll to "Content that works, and content that does not", then to "Usage against the plan" and
Leads.]

"Which docs the answers use, and which were never cited. Usage against the plan, with a projection
for the month. And the leads still waiting for a reply."

[Click Inbox. If you recorded section 1 today, its question is at the top, marked Widget. Open the
top conversation, then click the Leads tab. Leave the lead's status as it is, so a retake looks the
same.]

"Every conversation, from the widget and from the chat, lands in one inbox, with the page the
reader was on. And every lead, with the reader's note."

_Inbox in 0.8 s. Transcript in about 25 ms._

[Switch back to window A. Every row says Ready. Point at the pages meter: "9 of 100 pages", or
"12 of 100" with the three optional files.]

"Back on the new account, everything is ready: six pages from the website, two files and a note.
The free plan indexes a hundred pages, and the meter shows how close you are."

(With the optional files, say "five files".)

[Open the website row's ⋯ menu and choose View pages. The sheet lists App, Context, HonoRequest,
HTTPException, Presets and Routing. Close it. Click the title `northwind-api-limits.docx`.]

"Any source opens as the text the assistant reads: headings, lists and all."

[The document viewer shows the headings. Click Back.]

_View pages took 6.5 s the first time in the test (a cold function) and 0.3 s after. If it spins,
keep talking. The viewer opens in about 1.1 s._

[Optional, the sitemap: if the other rows turned Ready at least a minute ago, click Add source,
open Sitemap, type `https://webhooks.fyi/sitemap.xml` and click Add sitemap. Otherwise open the
Sitemap tab, say the line and close the dialog.]

"A sitemap works too. This one is an index of sitemaps, and Parbot follows it to every page."

_29 pages, 88 passages. Ready in 24.2 s on a fresh add, 17.0 s on a Re-index. The first try in the
test, started 25 s after the website was Ready, failed at page 5; a Re-index a minute later
worked. If you add it, wait a minute after it is Ready before you ask section 4's first question._

## 4. Chat (3:20 to 4:50)

[Click Chat. Type `How do I read a query parameter?` and press Enter.]

"The chat inside the app is ChatGPT-style. My question is on screen the moment I press Enter, and
the answer streams in underneath it."

[As it streams, point at the code block, then the citation numbers, then the source "HonoRequest -
Hono" with hono.dev next to it.]

"The numbers mark where each part came from, and the sources list those pages. A web page opens
on its own site."

_Question bubble in 7 to 32 ms. First words in 1.8 s._

Don't click this source: a web page's source opens the page itself in a new tab. The viewer beat
comes with the file answer next.

[Type `@northwind-api`, press Enter to pick `northwind-api-limits.docx`, type
`what happens if we go over?` and press Enter.]

"With @ I can point a question at a file. This question doesn't say what 'over' means, but the
file is read first, so the answer comes from our limits document."

[Point at the file chip on the question, and at the chip still sitting in the message box.]

"The file stays attached to this conversation, so follow-ups keep using it until I remove it."

[Click the source "Northwind Payments API: limits and retries" under the answer.]

"A file's citation opens the viewer, with the passage the answer used highlighted."

[The viewer opens on the highlighted passage. Click Back. The chat is still there.]

_Citation to viewer 0.8 s. Back 40 ms._

[Click New chat. Type
`Our webhook endpoint was down all weekend. How do we get the events we missed?` and press Enter.]

"A new chat, and no file picked this time. It finds the webhooks guide on its own."

_New chat in about 50 ms. First words in 1.3 to 1.7 s in the test._

[Optional, Stop: click New chat, type the Stop question and press Enter. When two or three lines
have streamed, click the Stop button in the message box. If the lines you kept cite a source, its
Sources row appears under the stopped answer.]

"Stop ends an answer where it is. The answer is saved as stopped and doesn't count against the
plan."

[Optional, a Project: in the chat sidebar, under Projects, click New project, type
`Support replies` and press Enter. Click Edit project, paste the instructions, and in "Find a file
or source in Knowledge" type `Refund` and pick Refund policy. Click Save. In the project's message
box, type the project question and press Enter. Point at the reply, at "Policy: Refund policy",
and at the fixed Refund policy chip in the message box.]

"Projects are folders for chats, each with its own files and instructions. This one always reads
the refund policy and writes a reply the support team can send. I don't mention the policy: the
project brings it along."

_Project folder in 16 ms. Save in 0.2 s. First words in 1.8 to 2.1 s. Both rehearsals followed the
format and cited Refund policy._

[Now click between the chats in the list, slowly, twice.]

"And switching between conversations is instant. The list and every thread are cached in the
browser, so nothing waits on the server except a new answer."

_Switching between chats took 34 to 55 ms._

## 5. Billing (4:50 to 5:15)

[Click Billing. Point at the "Billing runs in test mode. No card is charged." banner and at the
Usage meters: indexed pages of 100, answers this month of 200. Click Choose Starter on Monthly. On
the "Apply Starter in test mode" card, click Apply Starter.]

"Plans and usage live here. Checkout runs in test mode, so nothing is charged."

[The plan card now says Starter, the sidebar badge says STARTER, and the meters read of 2,000
pages and of 3,000 answers.]

"And the upgrade lifts the limits at once."

_Apply took 1.3 to 2.1 s._

To retake this section, first click Switch to Hobby on the Hobby card, then Switch to Hobby on the
test-mode card it opens.

## 6. Widget (5:15 to 6:20)

[Click Widget. The "Starter and up" badges are gone. Work down the settings on the left: click
Palette (⌘K), pick the green accent, set Position to Bottom left, and switch on Hide "Powered by
Parbot" (and Lead capture, for the optional lead form). Click Save changes. The switches stay on.
Point at Live preview in the right column.]

"Starter unlocks the rest of the widget: the ⌘K palette, our own colour, the launcher on the left,
and no Parbot branding. The live preview is our demo page with the saved settings."

_Widget page in 0.8 s. Save took 0.8 s._

[Point at the Install card above the preview and click Copy.]

"On your site, installing it is this one script tag. Settings changed here reach the site without
touching the tag again."

[Click Open the demo page on the Live preview card. A new tab opens: "Example docs for
Northwind". Press ⌘K, or click the launcher at the bottom left. Type the demo page question and
press Enter. Point at the code, then at Sources: one row per page, with the numbers of the
citations that used it.]

"And here it is on a page that isn't Parbot: the palette in our colour, answering from the Hono
docs we indexed a few minutes ago, with its sources."

_Rehearsed in bubble mode: the widget was ready 1.5 s after the demo page loaded, and first words
came in 1.4 to 1.9 s. The same question in the chat: first words in 2.7 s._

[Close the tab with ⌘W.]

[Optional, the lead form: in the live preview, open the palette if it is closed, type
`Is there a Go SDK?` and press Enter. When the email form appears, fill in `sam@example.com` and
the note, then click Send.]

"When the docs can't answer, the widget offers to take the reader's email instead of guessing.
That lead goes straight to the inbox."

_Lead form after 1.4 to 1.5 s, and Send took 0.26 s._

## 7. Close (6:20 to 6:30)

[In window A, open the landing page and scroll to the top.]

"That's Parbot: your docs, answering, in your app and on your site. Thanks for watching."

---

## If something goes wrong on camera

- **The model is slow.** The typing dots show at once, so keep talking. Answers usually begin
  within 1 to 3 s. In rehearsal, a first answer after a quiet spell, or while someone else used the
  key, took 13 to 21 s. Since then, when a model sends nothing for 3.5 s, the engine starts the
  next of its three Gemini models beside it and keeps whichever answers first, so a stall should
  cost a few seconds, not twenty. It still retries and falls back on errors. If a message fails, it
  says so with a Retry button. Say "the free tier is rate limited" and click Retry. If it stays
  slow, stop and record the section later.
- **A row fails.** "Failed · The embedding model is busy right now" means an embedding limit, not a
  problem with the source. Keep going with the other sources while it waits. After a minute, open
  the row's ⋯ menu and choose Re-index: pages already indexed are kept. If every new source fails
  after its first page, the daily quota is gone: stop for the day, since chat answers fail too.
- **hono.dev is slow or down.** Use `https://docs.lemonsqueezy.com/help/webhooks/signing-requests`
  as the website: 5 pages, 21 passages, Ready in 6.4 s, and the row becomes "Signing Requests".
  The Hono questions no longer apply. Ask `Which webhook event fires when an order is refunded?`
  (`order_refunded`, from Event Types) in chat 1 and on the demo page, and avoid retry questions:
  its retry timings differ from the Word file's.
- **`@north…` picked the wrong file.** Remove the chip with its ×, and type `@northwind-api` again.
- **The @ answer talks about Hono instead of the limits.** The file is read first, but the earlier
  answer is context too. Retake the section with the @ question in a New chat of its own, as
  rehearsed, and the chat 2 question in another New chat.
- **A question comes back unanswered when it shouldn't.** Use the exact wording from the inputs
  table. Retrieval is by meaning, and a question whose parts sit in different places can still
  miss.
- **The Go SDK question gets an answer and no email form.** A question that some source touches
  now gets an answer about that part. Skip the beat, or retake the section with the question the
  dry run found.
- **Stop was pressed before any text arrived.** The question stays, marked as stopped, and
  nothing is counted against the plan. Ask the question again and stop later.
- **A demo page tab shows the old settings.** A tab opened before Save keeps the widget it loaded.
  Reload it: the demo page reads the latest settings on every load. Only the landing's palette and
  sites that install the widget cache the settings, for up to a minute.
- **⌘K doesn't open the palette.** Click an empty part of the page first so it has focus, or click
  the "Ask AI ⌘K" pill in the bottom right corner (the launcher at the bottom left on the demo
  page). If the landing has no pill and the hero says "Try it live on the Parbot docs" instead of
  the ⌘K hint, the page is narrower than 1024 px: set the zoom back to 125% and reload.
- **Window B shows the new account.** The sign-up happened in window B's profile. Sign out there,
  sign in as the demo account again, and retake from section 2 in window A.
- **A screen takes seconds to open.** That's a cold function. It only happens on the first visit
  after a quiet spell. Warming up covers it.

## Demo data

The demo account comes from `apps/web/scripts/seed-demo.ts`. After `--refresh-history` it has:

- `demo@parbot.dev` / `parbot-demo` on Starter, with a 30-day period from the time of the run.
- One assistant, "Parbot Docs": palette mode, amber accent, lead capture on, branding hidden, four
  suggested questions, and instructions to answer about Parbot. The seed sets these only when it
  creates the assistant. A refresh leaves them as they are.
- 9 sources, all pasted text: the product docs in `apps/web/content/docs` (getting started,
  sources, widget, theming, inbox and analytics, plans, privacy, FAQ, projects).
- 14 conversations from 13 days before the run to yesterday: 12 from the widget on
  `docs.example.com` pages and 2 in-app. The last 7 days hold 8 of them and the 7 days before hold
  6, so the Overview's default week has a week to compare with. 6 answers are rated thumbs up and 2
  thumbs down. 4 questions are unanswered: a private Notion workspace the week before, then this
  week a Slack integration in two wordings (one gap) and a weekly CSV export.
- 1 lead, `maya@northwind.dev`, from this week's first Slack question.

The options, run from the repo root against the project in `.env` (`apps/web/.env` is a symlink to
it):

```bash
pnpm --filter web seed:demo                    # re-index the docs whose text changed
pnpm --filter web seed:demo --history          # also seed the history when there is none
pnpm --filter web seed:demo --refresh-history  # replace the history with one ending yesterday
```

With the hosted values in a separate gitignored file, run from `apps/web`:
`node --env-file=<that file> --conditions=react-server --import tsx scripts/seed-demo.ts` with the
same options, as in "On recording day" above. The seed needs `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and
`NEXT_PUBLIC_APP_URL=https://parbot-web.vercel.app`, because the seeded install answer quotes the
widget URL. Don't use `--reset` on the hosted project: the new assistant gets a new public key (see
above). See the README, "Demo data" and "Deploying".

The new account's sources are the tested inputs in `~/Wo/par/utils`, outside the repo: the website
and sitemap addresses in `website.txt` and `sitemap.txt` (with their timelines, page lists and
backups), the five files in `uploads/` and the refund policy in `paste-text/`. `utils/README.md` is
the one-page crib sheet. The Word file has the same bytes as
`docs/demo-assets/northwind-api-limits.docx`, whose source is the Markdown file next to it
(`pandoc northwind-api-limits.md -o northwind-api-limits.docx`). PDFs keep their headings,
paragraphs and lists, but headings are found by font size, so a bold heading at body size reads as
a paragraph.
