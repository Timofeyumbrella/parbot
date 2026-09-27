# Parbot demo video script

Target length: 5 to 6 minutes. Screen share at 1440×900 in the dark scheme, browser zoom 110%,
the dashboard sidebar visible. Record in one take per section; cut between sections.

Before recording:

- `pnpm dev` running with `GEMINI_API_KEY` set and `NEXT_PUBLIC_DEMO_ASSISTANT_KEY` in `.env`
  (the seed writes it). Sign out in the browser.
- A second browser window or profile signed out, for the widget on the demo page.
- A third profile signed in as the demo account, for the Overview with history (an account has
  one assistant, so the fresh account from section 2 cannot show the seeded traffic).
- The demo account (`demo@parbot.dev`) on Starter with the "Parbot Docs" assistant, its history
  refreshed on the day with `pnpm --filter web seed:demo --refresh-history`, so the Inbox and the
  Overview's week (it opens on the last 7 days) have two weeks of conversations ending yesterday.
  The public key stays the same.
- A public docs site to index live. `https://docs.astro.build/sitemap-index.xml` or the Hono docs
  work well; pick something with a sitemap so progress is visible. Do the crawl once before
  recording so DNS and images are warm.
- Close every other tab. Turn off notifications.

Voiceover lines are in quotes. Actions are in brackets. Keep the mouse still while talking.

---

## 1. Landing (0:00 to 0:40)

[Open `/`. Scroll slowly through the hero, the two embed modes, features, pricing.]

"This is Parbot. You point it at your documentation, and it answers your readers' questions
inside your docs: as a chat bubble, or as a ⌘K palette, the way developers already expect."

[Press ⌘K on the landing itself. Ask: "What happens when the docs don't cover a question?"
Let it stream. Point at the sources line.]

"The palette on this page is the real product, trained on Parbot's own docs. Every answer streams
and cites the page it came from. When the docs don't cover something, it says so, and can collect
the reader's email instead of guessing."

[Esc. Scroll to pricing, click the yearly toggle.]

"Three plans. The free one is enough to try it on one site. Yearly is twelve months for the price
of ten. I'll start free."

## 2. Sign up and first assistant (0:40 to 1:20)

[Click Start free. Fill the form with a fresh email, e.g. `maya@northwind.dev`. Create account.]

"An account is an email and a password. No card."

[Onboarding: name the assistant "Hono Docs". Show the slug filling in. Create.]

"Each account has one assistant: a knowledge base and a widget. This one is for a docs site I
don't control, to show it works on anything public."

## 3. Knowledge (1:20 to 2:20)

[You land on Knowledge. Click Add source, choose Sitemap, paste the sitemap URL. Add.]

"Sources can be a website, a sitemap, files like PDF and Word, or text you paste. I'm giving it a
sitemap."

[Watch the row move Queued → Crawling → Indexing n of m → Ready. Open View pages.]

"It crawls, strips the navigation and footers, keeps the headings and code blocks, and splits
each page into passages. This is live, not a recording. The free plan indexes a hundred pages,
and it tells you when it stops."

[Point at the pages meter. Close the sheet.]

## 4. Chat (2:20 to 3:30)

[Click Chat. Ask a question the docs answer, e.g. "How do I return JSON from a route?"]

"The chat inside the app is where you test what readers will get."

[As it streams, point at the cursor, then the citation chips, then the Sources row.]

"The question shows the instant I press Enter, and the answer streams token by token with
citations you can open."

[Ask a short follow-up: "And with a status code?"]

"Follow-ups keep the context of the conversation."

[Ask something the docs don't cover: "Does Hono ship a Postgres driver?"]

"When the docs don't cover it, it doesn't invent. It says so, and the question is recorded as
unanswered."

[Click New chat, ask one more question, then click between the two conversations twice.]

"Switching between conversations is instant; nothing waits on the server except the answer
itself."

## 5. Widget (3:30 to 4:30)

[Click Widget. Change the accent colour, switch Position to left, press Save. Watch the preview
update.]

"This is what readers get on your site. Bubble or palette, your colour, your welcome line, your
suggested questions, and the sites allowed to use it."

[Point at the install snippet. Copy it.]

"Installing it is this one script tag."

[Click Open the demo page. In the demo page, click the bubble, ask "How do I set a cookie?".]

"Here it is on a page that isn't Parbot, answering from the docs we just indexed."

[Open the second, signed-out browser window on the same demo page. Ask a question the docs don't
cover, e.g. "Do you have a Deno Deploy discount?". When the lead form appears, enter an email
and a note, submit.]

"When it can't answer, it offers to take a message. That lands in the inbox."

## 6. Inbox and Overview (4:30 to 5:20)

[Back in the app, click Inbox. The widget conversation is already at the top; open it.]

"Every conversation, from the widget and from the chat, in one inbox. The one we just had arrived
while we were on the other page."

[Click the Leads tab, show the lead, set it to Contacted.]

[Switch to the profile signed in as the demo account. Its Parbot Docs assistant opens on the
Overview.]

"With two weeks of traffic it looks like this: how often the docs answered and whether readers
found it helpful, against the week before. Then the knowledge gaps, the questions the docs couldn't
answer with different wordings grouped, and Add docs right there. That list is your writing
backlog. Below it, the answers readers disliked, the pages answers use and the ones they never do,
and where on the site people ask."

## 7. Billing (5:20 to 5:50)

[Click Billing. Show the plan card and the meters. Click Choose Starter, then Apply.]

"Plans and usage live here. Checkout is Stripe; this account runs in test mode so nothing is
charged. Upgrading lifts the limits at once."

[Go back to Widget, show that Palette mode and the branding switch are now enabled.]

"And the paid features, like palette mode and removing our branding, switch on immediately."

## 8. Close (5:50 to 6:00)

[Back to the landing page, top.]

"That's Parbot: your docs, answering, wherever your readers are. Thanks for watching."

---

## If something goes wrong on camera

- **The model is slow or busy.** The engine falls back through three Gemini models. Wait it out
  once; if it fails, say "the free tier is rate limited, let me ask again" and resend.
- **The crawl is slower than expected.** Keep talking through what indexing does; the row updates
  live. If it stalls, switch to the demo account's profile and use its pre-indexed Parbot Docs
  assistant for the chat section.
- **A question comes back unanswered when it shouldn't.** Rephrase closer to the docs' wording.
  Retrieval is by meaning, but very short questions carry little signal.
- **The widget on the demo page shows the old colour.** Reload the demo page; the config is
  cached for up to a minute on installed sites, the preview in the app is not.
