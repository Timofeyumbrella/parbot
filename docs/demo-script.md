# Parbot demo video script

Target length: 6 to 7 minutes, recorded on the live deployment at https://parbot-web.vercel.app.
OBS records the whole built-in screen at the left of a 1080p frame, with the browser filling the
screen in the dark scheme at 125% zoom and the camera in the column on the right (see "Recording
setup"). Record one file per section and join them afterwards.

Voiceover lines are in quotes. Actions are in brackets. Keep the mouse still while talking. Every
input below was typed on the live site in a full rehearsal on 28 Sep 2026. The timings in italics
are what that rehearsal measured.

The story: a new user, Alex, sets up an assistant called Northwind Docs. Its public docs part is
Hono's API reference, a real site Alex doesn't control, which shows crawling works on any public
site. Its private part is a Word file and a pasted policy. The demo account's seeded history then
shows what the Overview looks like after two weeks of real traffic.

**Fixed since the rehearsal.** These fixes are merged and covered by tests, but were not rehearsed
on the live site. The dry run the day before covers the ones the video depends on.

- The Overview opens on the last 7 days.
- The widget settings switches keep their saved values after Save, and the demo page always loads
  the latest settings.
- The widget lists its sources by page, each with the numbers of the citations that used it.
- A question the docs cover only in part gets that part answered, with a sentence on what the docs
  leave out. A question no source touches still gets "I couldn't find that…".
- When a Gemini model sends nothing for 3.5 s, the next model starts beside it and the first to
  answer wins.
- The pages meter keeps up with the sources as they index, a stopped answer keeps its sources, and
  the paperclip attaches a file already in Knowledge instead of uploading it again.
- PDF uploads keep their headings, paragraphs and lists.
- Signing out ends only that browser's session.
- Below 1024 px wide, the landing shows a link to the demo page in place of the ⌘K hint.
- `seed-demo.ts --refresh-history` gives the demo history new dates and keeps the public key.

## Test inputs

Keep this table where you can read it and the capture can't: an external display, a printout or a
phone. Type or paste exactly these inputs.

| Where                | Input                                                                                            | What comes back                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Landing ⌘K           | `What happens when the docs don't cover a question?`                                             | It says so instead of guessing, records the question, and with lead capture offers an email form. Sources listed by page |
| Sign up              | Full name `Alex Rivera`, a fresh email you control, any 8+ character password                    | Onboarding                                                                                                               |
| Onboarding           | Name `Northwind Docs`                                                                            | Slug `northwind-docs` fills in, lands on Knowledge                                                                       |
| Website source       | `https://hono.dev/docs/api/context`                                                              | Crawls everything under `/docs/api/`: 6 pages, 79 passages, Ready in _8 to 13 s_                                         |
| Upload               | `docs/demo-assets/northwind-api-limits.docx`                                                     | Word file, 6 passages, Ready in _2 to 4 s_                                                                               |
| Paste text           | Title `Refund policy`, text below                                                                | 1 passage, Ready in _1 to 3 s_                                                                                           |
| Chat 1               | `How do I read a query parameter?`                                                               | `c.req.query()` with two code blocks, cites HonoRequest                                                                  |
| Chat 1               | `And a path parameter?`                                                                          | `c.req.param()` with code, same source                                                                                   |
| Chat 1               | `Does Hono ship a Postgres driver?`                                                              | "I couldn't find that in the documentation…", chat marked unanswered                                                     |
| Chat 2               | `@north`, Enter to pick the file, then `what happens if we go over?`                             | 429, not queued, safe to resend, Retry-After. Cites the Word file                                                        |
| Chat 2               | `How long should we wait before retrying?`                                                       | Retry-After, then backoff 1, 2, 4, 8 s, five attempts. Cites the file again                                              |
| Chat 3               | `Walk me through routing in Hono, with a code example for every kind of route.`                  | A long answer. Press Stop after two or three lines                                                                       |
| Project              | Name `Support replies`, instructions below, file `Refund policy`                                 |                                                                                                                          |
| Project chat         | `A customer on the annual plan paid two months ago and wants their money back. What do I reply?` | A two-sentence reply about a pro rata refund, then `Policy: Refund policy`                                               |
| Demo page bubble     | `How do I set the status code of a response?`                                                    | `c.status()` with `c.status(201)` code, sources listed by page, "Powered by Parbot" under it                             |
| Live preview palette | `Is there a Go SDK?`                                                                             | "I couldn't find that…", then the lead form                                                                              |
| Lead form            | `sam@example.com`, note `We ship a Go backend and would like an official SDK.`                   | "Thanks. The team will reply to sam@example.com."                                                                        |

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

Do not improvise the questions. `How do I return JSON with a 201 status code?` came back as
unanswered in rehearsal, even though the Context page covers `c.json()` and `c.status(201)` in
separate places. The partial-coverage fix was written for that case, but the question has not been
asked on the live site since, so the demo page keeps the rehearsed status code question. The two
questions meant to come back unanswered, the Postgres driver and the Go SDK, touch nothing in the
sources, so the new rules should still turn them into "I couldn't find that…". That reply is what
flags the chat and brings up the lead form, so the dry run checks both.

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
sidebar on the left, the widget bubble and the landing's Ask AI pill at the bottom right, and the
composer's send and Stop buttons at the bottom of the chat.

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
⌘K hint and the Ask AI pill with a link for phones.

**Test.** Record 20 seconds: talk, scroll the landing, open ⌘K and type. Play it back full screen
in QuickTime Player and check that the text reads, the camera covers nothing, the voice is steady
with no hiss or echo, the cursor shows, and scrolling is smooth.

**Takes.** One file per section: start with the hotkey, do the section, stop. To redo a section,
record it again and keep the better file. Each section pastes at most one text, so copy it before
you start: the refund policy for section 3, the chat 3 question for section 4, the project
instructions for section 5. Type everything else.

**Joining.** Trim each file's ends in QuickTime Player (Edit > Trim). Open section 1, choose Edit >
Add Clip to End for each next section in order, then File > Export As > 1080p. iMovie does the same
if a take needs a cut in the middle.

**Publishing.** Upload the video to YouTube as Unlisted. In the README, replace the "Video
walkthrough: coming soon" line under Live with the link.

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
  Clear the site data for parbot-web.vercel.app. The ⌘K palette keeps its last conversation in
  local storage, and it should open empty with its four suggested questions. Then set the zoom to
  125%.
- Window B: a second profile, signed in as the demo account, on its Overview, which opens on the
  last 7 days. Zoom 125% here too. Used in section 9 only. Other people signing out of the shared
  demo account no longer sign this window out.
- Both windows fill the screen. Close every other tab. Put `northwind-api-limits.docx` on the
  Desktop so the file picker finds it in one click. Keep the three pasted texts (the refund
  policy, the chat 3 question and the project instructions) in a note.

**The day before: a dry run**

Run sections 2 to 7 once on a throwaway account, without recording. Check what changed since the
rehearsal:

- `Does Hono ship a Postgres driver?` and `Is there a Go SDK?` still come back as "I couldn't find
  that…", and the Go SDK question still brings up the email form. If either now gets an answer,
  find a question that nothing in Hono's API pages or the two Northwind documents mentions, check
  it the same way, and use it in the table and the section.
- After Save changes on the Widget page, the switches stay on, and the demo page shows the palette.
- The bubble's answer on the demo page lists its sources by page.

Delete the throwaway account afterwards from Account > Delete account.

**On recording day: refresh the demo data**

The live site must run main with these fixes. After the push, check that Vercel's production
deployment is the pushed commit. In window B, the Overview opening on 7 days, with no `?days=` in
the address, shows the new build is live.

Refresh the demo history from `apps/web`, against the hosted project:

```bash
node --env-file=../../.env.hosted --conditions=react-server --import tsx scripts/seed-demo.ts --refresh-history
```

`.env.hosted` is the gitignored file at the repo root with the hosted values. It must have
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` and
`NEXT_PUBLIC_APP_URL=https://parbot-web.vercel.app`. The first lines should say the docs are
indexed "on the Gemini provider". The run first re-indexes any doc whose text changed, and passages
indexed on the stub don't match Gemini's questions. "Inbox and analytics" changed when the Overview
moved to 7 days, so the first run re-indexes that one ("docs: 1 re-indexed, 8 unchanged"). Later
runs leave all 9 unchanged.

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
- Keep everything else off the Gemini key until you're done: no local `pnpm dev`, live tests or
  seed runs with the same key. Visitors to the live site share it too, and that you can't control.

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
press Enter. Point at the answer, then at Sources: one row per page, with the numbers that cite
it.]

"The palette on this page isn't scripted: it's the real widget, answering from Parbot's own docs.
It streams, and it cites where each part came from."

_Palette opens in about 10 ms. First words in 3.8 s in one run and 12.8 s in another. Since then, a
model that sends nothing for 3.5 s gets the next one started beside it._

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

[You land on Knowledge, which is empty. Click Add source, open the Website tab, type
`https://hono.dev/docs/api/context` and click Add website.]

"Sources can be a website, a sitemap, files or pasted text. I'll start with a public docs site I
don't control, Hono's API reference. From a start page, Parbot follows the links under the same
path."

[While the row shows "Crawling · n pages" and then "Indexing n of 6 pages": click Add source, open
Upload, choose `northwind-api-limits.docx` and click Upload file. Then click Add source, open Paste
text, set the Title to `Refund policy`, paste the text and click Add text.]

"Our own material goes in too: an internal Word document with our API limits, and a refund policy
I paste in. All three index at the same time. This is live."

[Wait until all three rows say Ready. The pages meter counts up with the rows. Point at it: "8 of
100 pages".]

"Six pages from the website, one file, one note. The free plan indexes a hundred pages, and the
meter shows how close you are."

[The website row takes the first page's title, "Context - Hono". Open its ⋯ menu and choose View
pages. The sheet lists App, Context, HonoRequest, HTTPException, Presets and Routing. Close it.
Click the title `northwind-api-limits.docx`.]

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
step. A file that's already in Knowledge is attached, not uploaded twice."

[Click the source under the last answer.]

"Every citation opens the source with the passage it used highlighted."

[The viewer highlights the "Retrying safely" passage. Click Back. The chat is still there.]

[Click New chat. Paste the chat 3 question and press Enter. When two or three lines have streamed,
click the Stop button in the message box. If the lines you kept cite a source, its Sources row
appears under the stopped answer.]

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
corner, type the demo page bubble question and press Enter. Point at Sources under the answer: one
row per page, with the numbers of the citations that used it.]

"Here it is on a page that isn't Parbot, answering from the Hono docs we just indexed, with its
sources and our small 'Powered by Parbot' line underneath."

[Close the tab with ⌘W.]

_Widget page in 0.8 s. Bubble ready 1.5 s after the demo page loads. First words in 1.4 to 1.9 s._

## 7. Billing, then the paid widget (4:50 to 5:35)

[Click Billing. Point at the "Billing runs in test mode. No card is charged." banner and the usage
meters. Click Choose Starter, then Apply.]

"Plans and usage live here. Checkout runs in test mode, so nothing is charged, and an upgrade
lifts the limits at once."

[The plan card now says Starter and the sidebar badge says STARTER. Click Widget. The Starter and
up badges are gone. Click Palette (⌘K), pick the green accent, switch on Hide "Powered by Parbot"
and Lead capture. Click Save changes. The switches stay on. Scroll to Live preview.]

"The paid features switch on immediately. The live preview is our demo page with the saved
settings: now it's a ⌘K palette in our colour, with no Parbot branding."

[In the live preview, type `Is there a Go SDK?` and press Enter. When the email form appears, fill
in `sam@example.com` and the note, then click Send.]

"When the docs can't answer, the widget offers to take the reader's email instead of guessing.
That lead goes straight to the inbox."

_Apply took 1.3 to 2.1 s. Save took 0.8 s. Lead form after 1.4 to 1.5 s, and Send took 0.26 s._

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

[Switch to window B, the demo account's Overview. It opens on the last 7 days.]

"This is an assistant that has had two weeks of traffic. The Overview shows the last week against
the week before, and it's built around what to fix next."

[Point at Answer quality. With the refreshed history, the answer rate is down on the week before,
while helpfulness and the time to answer are better.]

"The answer rate is how often the docs had the answer. When it drops, the docs have a hole. Next
to it, how helpful readers found the answers, with the number of ratings so a small sample reads
as one, and the median time to answer. Each is compared with the week before."

[Scroll to Knowledge gaps. The two Slack questions are one gap, asked twice.]

"Knowledge gaps are the questions the docs couldn't answer, with different wordings grouped. That
list is your writing backlog. Add docs goes straight to Knowledge."

[Scroll past "Answers readers disliked" and "Where readers ask".]

"The answers readers disliked point at pages that are wrong or out of date. Where readers ask
shows which pages of your site need help, and flags a low answer rate on a page."

[Scroll to "Content that works, and content that does not", then to Usage and Leads.]

"Which pages answers use, and which they never use. Usage against the plan, with a projection for
the month. And the leads still waiting for a reply."

## 10. Close (6:40 to 6:50)

[Back in window A, open the landing page and scroll to the top.]

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
- **The crawl takes long or fails.** Keep going with the upload and the pasted text while it runs;
  the row updates live. If it fails, open "Show what happened", then choose Re-index from the row's
  menu. If it still fails, skip the two Hono questions and ask the Word file something instead,
  for example "What are the rate limits on the Standard plan?". That one was not rehearsed.
- **A question comes back unanswered when it shouldn't.** Use the exact wording from the inputs
  table. Retrieval is by meaning, and a question whose parts sit in different places can still
  miss.
- **The Go SDK question gets an answer and no email form.** A question that some source touches
  now gets an answer about that part. Retake the section. If it happens again, stop and find
  another question as in the dry run.
- **Stop was pressed before any text arrived.** The question stays, marked as stopped, and
  nothing is counted against the plan. Ask the question again and stop later.
- **A demo page tab shows the old settings.** A tab opened before Save keeps the widget it loaded.
  Reload it: the demo page reads the latest settings on every load. Only the landing's palette and
  sites that install the widget cache the settings, for up to a minute.
- **⌘K doesn't open the palette on the landing.** Click an empty part of the page first so it has
  focus, or click the "Ask AI ⌘K" pill in the bottom right corner. If there is no pill and the hero
  says "Try it live on the Parbot docs" instead of the ⌘K hint, the page is narrower than 1024 px:
  set the zoom back to 125% and reload.
- **Dragging a chat onto a project doesn't take.** Use the chat's ⋯ menu > Move to project.
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

The file uploaded in section 3 is `docs/demo-assets/northwind-api-limits.docx`. Its source is the
Markdown file next to it (`pandoc northwind-api-limits.md -o northwind-api-limits.docx`). Upload
the Word file, as rehearsed. PDFs now keep their headings, paragraphs and lists too, but headings
are found by font size, so a bold heading at body size reads as a paragraph, and no PDF has been
uploaded on the live site since the fix.
