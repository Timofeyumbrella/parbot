# Installing the widget

The widget is one script tag. Add it to any page and the assistant is there.

```html
<script src="https://app.parbot.dev/widget.js" data-parbot="pb_your_public_key" async></script>
```

Find your public key and the exact snippet on the Widget page of your assistant. The key is public on purpose: it only identifies the assistant, and the origins allowed to use it are controlled on the same page.

## Two modes

**Bubble.** A round launcher in a corner of the page opens a chat panel. Familiar to everyone. This is the default and it works on every plan.

**Palette.** No launcher in the way. Readers press ⌘K (Ctrl+K on Windows and Linux) and a command-palette style dialog opens with the question box on top. Built for documentation sites where readers already expect ⌘K. Available on Starter and Growth.

You can force a mode on a specific page with `data-mode="bubble"` or `data-mode="palette"`, and hide the small palette launcher with `data-launcher="false"`.

## Allowed origins

By default any site can load your widget. To restrict it, add the origins on the Widget page, one per line. `docs.example.com`, `https://docs.example.com` and `*.example.com` are all accepted. Requests from anywhere else are refused.

## What the widget stores in the browser

A random visitor id and the id of the current conversation, in local storage, so a reader can close the panel and come back to the same thread. No cookies are set. A reader can start a new conversation from the panel menu at any time.

## Frameworks

- **Plain HTML, Docusaurus, Mintlify, Astro, Hugo:** paste the script tag into the site's head or footer template.
- **Next.js:** use `next/script` with `strategy="afterInteractive"` and the same attributes.
- **Single-page apps:** the widget mounts once per page load and survives client-side navigation.

## Programmatic control

The script exposes `window.Parbot` with `open()`, `close()`, `toggle()`, `setMode(mode)` and `ask(question)`, so a "Ask AI" button of your own can open the assistant with a prefilled question.
