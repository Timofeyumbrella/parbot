# Frequently asked questions

## Which documentation works best?

Any site with real text. Docs built with Docusaurus, Mintlify, GitBook, Astro Starlight, MkDocs, Sphinx, ReadMe or plain HTML all index well. Sites that render everything with JavaScript after load do not; give Parbot a sitemap or export the pages instead.

## Does the assistant make things up?

It is instructed to answer only from the passages it was given and to say "I could not find that in the documentation" otherwise. Every answer shows the pages it used, so a reader can check. No model is perfect, which is why the citations are always there.

## Can I see what people ask?

Yes. Every conversation is in the Inbox. The Overview groups the questions the docs could not answer, lists the answers readers rated thumbs down, and shows which pages answers use and which they never do.

## What languages are supported?

The assistant answers in the language the question was asked in, as long as your docs cover the topic. Docs in one language and questions in another usually work for common languages.

## How fast are answers?

Answers start streaming within a second or two and finish in a few seconds. The first word appears as soon as the model produces it; readers never wait for the whole answer.

## Can I use it on more than one site?

Yes. One assistant can be installed on any number of pages. To keep the knowledge separate, for example for two products, create two assistants.

## Can I export my data?

Write to support@parbot.dev and we will send your conversations and leads as CSV.

## Is there an API?

Not yet. The endpoints the widget talks to are not documented for direct use and may change. If you want to build your own interface, write to support@parbot.dev.
