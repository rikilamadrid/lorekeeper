---
type: note
created: 2026-08-19T20:40:00-05:00
tags: [payments, incident]
about: ["[[Pathfinder]]"]
---

Our payments call retries on 5xx with no idempotency key. The provider commits
before the timeout fires, so the retry is a second real charge.

I am fairly sure I read this exact failure somewhere recently but I cannot find
where, so this is my own reconstruction rather than a sourced note.
