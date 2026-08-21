---
type: note
created: 2026-08-18T16:45:00-05:00
tags: [observability]
derived_from: [20260817-1930-yt-hohpe-messaging]
---

Without correlation IDs propagated across every hop, distributed debugging is
guesswork dressed up as investigation.

The gap is almost never the tracing library. It's the two services in the middle
that were written before the convention existed and quietly drop the header.
