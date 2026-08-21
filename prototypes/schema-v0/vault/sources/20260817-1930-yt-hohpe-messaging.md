---
id: 20260817-1930-yt-hohpe-messaging
type: source
created: 2026-08-17T19:30:00-05:00
url: https://www.youtube.com/watch?v=aQb3Q9nCsK4
about: ["[[Event-driven architecture]]"]
tags: [messaging, video]
---

# Gregor Hohpe — Messaging patterns, revisited

Rough notes taken while watching. Not a transcript.

- Opens with the claim that async messaging buys you decoupling and charges you
  in debuggability. Says teams underestimate the second half.
- Dead letter queues described as "the place where you find out what you were
  wrong about." Argues you should read them weekly, not alert on them.
- Long section on exactly-once being a marketing term. At-least-once plus
  idempotent consumers is the real answer.
- Ends on observability: correlation IDs across hops or you are guessing.
