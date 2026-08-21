---
id: 20260818-0810-pragmatic-engineer-queues
type: source
created: 2026-08-18T08:10:00-05:00
url: https://newsletter.pragmaticengineer.com/p/queues-in-production
tags: [newsletter, messaging]
---

# Queues in production (newsletter)

Case study heavy. The useful part was the section on payment retries.

Their incident: a timeout on the payment provider triggered a retry, the first
call had already succeeded, and customers were charged twice. Fix was an
idempotency key derived from the order ID, stored provider-side for 24 hours.

Also a good line about queue depth being a lagging indicator — by the time it
alarms, the users already felt it.
