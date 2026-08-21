---
type: note
created: 2026-08-17T21:05:00-05:00
derived_from: [20260817-1930-yt-hohpe-messaging]
tags: [architecture, messaging]
---

Async messaging trades coupling for debuggability. The decoupling is immediate
and visible; the debugging cost arrives months later when a message goes missing
and no single log line explains it.

The practical consequence is that [[Event-driven architecture]] is not a free
upgrade — adopting it obligates you to build correlation tracing at the same
time, not afterwards.
