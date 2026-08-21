---
id: 20260819-0742-idempotency-worry
created: 2026-08-19T07:42:11-05:00
---

Walking to the coffee place and it hit me that our retry logic is probably
double-charging people. We retry on 5xx but the payment provider might have
already committed the charge before the timeout. Need to check whether we send
an idempotency key at all. I don't think we do.
