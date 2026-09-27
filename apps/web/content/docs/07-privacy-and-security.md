# Privacy and security

## Where your content goes

The pages you index are stored in Parbot's database as text and as vectors. When a reader asks a question, only the handful of passages closest to the question are sent to the language model along with the question and the recent turns of that conversation. Parbot does not train models on your content.

## Who can see what

Each account sees only its own assistant, sources, conversations and leads. This is enforced in the database itself, on every row, not just in the application.

The widget is anonymous by design. It never receives an assistant's sources, only answers. It can be restricted to the origins you list.

## Readers

Readers are identified by a random id stored in their browser. No cookies are set by the widget. A reader who leaves an email through lead capture is doing so knowingly, through a form that says what it is for.

## Rate limits

The widget accepts twelve questions a minute per reader, thirty a minute per network address and sixty a minute per assistant. The in-app chat accepts thirty a minute per account. These protect your monthly answer allowance from abuse.

## Deleting data

Delete a source or a conversation from the app and it is gone from the database at that moment. Deleting your assistant in Settings removes everything it owns, uploaded files included, and you start over with a new one. Deleting your account on the Account page removes the account and everything in it.
