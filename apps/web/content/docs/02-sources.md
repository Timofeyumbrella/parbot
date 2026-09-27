# Sources and indexing

Everything the assistant knows comes from the sources you add under Knowledge. Parbot never answers from anything else.

## Kinds of sources

| Kind       | What Parbot does                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website    | Fetches the page you give it and follows links under the same path. A start page of `https://docs.example.com/guide/intro` indexes everything under `/guide/`. Up to three levels deep. |
| Sitemap    | Reads every `<loc>` in the sitemap, including one level of sitemap indexes, and indexes those pages. The most reliable option for a docs site.                                          |
| Upload     | PDF, Word (.docx), Markdown, HTML or plain text files up to 25 MB each.                                                                                                                 |
| Paste text | A title and any text. Handy for release notes, an FAQ or an internal note you do not publish.                                                                                           |

## How pages are processed

1. The page is fetched with a normal browser-like request. JavaScript-only sites are not rendered.
2. Navigation, footers and sidebars are stripped and the main content is converted to Markdown, so headings, lists and code blocks survive.
3. The Markdown is split into passages of about 1,200 characters along its headings. Code blocks are never cut in half.
4. Each passage is embedded and stored with its heading path, for example "Guide › Authentication › API keys".

## Reading what was indexed

Open a source from Knowledge to read the text Parbot indexed from it, as the assistant reads it. A website lists its pages; each opens on its own. Files and pasted text also offer the original: PDF, HTML, Markdown and plain text open in the browser, Word files download. In Chat and the Inbox, a citation to a file or a note opens its text with the cited passage highlighted.

## Pointing a question at a file

In Chat, type @ in the message box to pick a file or source from the assistant's knowledge, or attach a file with the paperclip. An attached file is added to Knowledge like any upload and counts toward your plan's pages; you can send the question while it uploads, and the answer waits a few seconds for it to be indexed.

The files you pick are read first, even when the question does not name them, so "what does this file say about limits?" finds the right passages. They stay with the conversation: follow-up questions keep using them until you remove the chip from the message box. The widget does not offer this, since visitors cannot see your files.

## Keeping sources fresh

Re-index a source from its menu at any time. Pages whose content has not changed are skipped, pages that disappeared are removed, and new or changed pages are indexed again. Parbot does not crawl on a schedule yet.

## Limits

Each plan includes a number of indexed pages: 100 on Hobby, 2,000 on Starter and 20,000 on Growth. A crawl stops when the limit is reached and the source shows how many pages were indexed. Remove a source or move up a plan to index more.

## Disabling or removing a source

Deleting a source removes its pages and passages immediately. Answers already given keep their citations; one that points at a removed page opens a note saying the page is gone.
