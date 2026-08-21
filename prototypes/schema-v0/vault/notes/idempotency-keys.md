---
type: note
created: 2026-08-19T20:11:00-05:00
derived_from: [20260817-1930-yt-hohpe-messaging, 20260818-0810-pragmatic-engineer-queues]
tags: [reliability, payments]
---

At-least-once delivery plus an idempotent consumer is the achievable version of
exactly-once. The key has to be derived from something stable in the domain —
an order ID — not generated per request, or the retry produces a new key and
the whole mechanism does nothing.

Provider-side retention matters as much as the key. A 24-hour window is fine for
checkout, useless for a job that retries for a week.
