---
type: note
created: 2026-08-11T14:00:00-05:00
tags: [agents, retrieval]
---

Agents don't need the document, they need the paragraph.

Every retrieval tool I've used returns whole files, which means the model spends
its budget on material that was never relevant. The unit of retrieval should be
the smallest span that still makes sense on its own — usually a heading section.

Revised 2026-08-20 after the daily-note thought: this also implies the index
cannot address files. It has to address positions inside them, or you can never
return a span narrower than a document.

Revised 2026-08-21: the counter-argument is that a paragraph without its
document often loses meaning. So the span needs to carry its ancestry with it.
