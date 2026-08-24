---
type: note
created: 2026-08-19T20:11:00-05:00
derived_from: [20260817-1930-yt-example-messaging, 20260818-0810-example-article-queues]
tags: [reliability, payments]
---

Idempotency keys have to derive from something stable in the domain, or the
retry produces a new key and the mechanism does nothing.
