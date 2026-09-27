# Northwind Payments API: limits and retries

Internal reference for the developer support team. Version 3.2, September 2026.

## Rate limits by plan

Every API key has a request budget per second. The budget depends on the account's plan:

- Sandbox keys: 25 requests per second.
- Standard plan: 100 requests per second.
- Enterprise plan: 500 requests per second, with bursts of up to 1,000 requests per second for 10 seconds.

The budget is shared by every key on the same account. Webhook deliveries do not count toward it.

## When a client goes over the limit

A request over the budget is rejected at once with status 429 Too Many Requests. It is not queued and it has no side effects, so it is always safe to send again. The response carries a Retry-After header with the number of seconds to wait, usually 1 or 2.

## Retrying safely

Wait for the number of seconds in Retry-After, then retry with exponential backoff: 1 second, then 2, 4 and 8, and give up after five attempts. Send an Idempotency-Key header with every POST /payments request. Northwind remembers each key for 24 hours, so a retried payment is never charged twice.

## Webhook retries

A webhook that does not get a 2xx response within 10 seconds is retried 8 times over 24 hours: after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours, 18 hours and 24 hours. After the last attempt the event is marked failed in the dashboard and can be resent by hand.

## Payout limits

A single payout can be at most 250,000 EUR. Standard accounts can pay out up to 1,000,000 EUR a day; Enterprise accounts agree their daily cap with their account manager.
