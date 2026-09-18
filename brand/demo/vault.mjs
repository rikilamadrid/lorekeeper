/**
 * The synthetic vault the agent integration demo searches.
 *
 * Every byte below is invented for this demo. There is no Harbour, no Tidewater
 * team, and no person behind any of these notes. Nothing here is copied,
 * paraphrased, or derived from anyone's real notes — this repository never
 * carries private content, including in demos and fixtures.
 *
 * The content is static, so two runs write byte-identical files and the demo's
 * printed output is the same on every machine. Nothing is templated with a
 * clock, a username, or a path.
 *
 * The vault is shaped to show one specific thing: why `lore search` takes
 * several wordings of one question rather than one. The question the demo asks
 * is answered in `notes/consumer-leases.md`, which never uses the words
 * "nightly" or "export". `notes/nightly-export.md` uses them constantly and
 * does not answer it. One wording of the question therefore finds the wrong
 * note, and fusing three wordings finds the right one. That is the behavior
 * the agent artifact instructs agents to rely on.
 */

/** Brain-relative POSIX path, and the exact bytes written there. */
export const VAULT_FILES = [
  {
    path: 'notes/harbour-overview.md',
    content: `---
title: Harbour, in one page
tags:
  - harbour
---

# Harbour, in one page

Harbour is the pipeline that moves records out of the transactional store and
into the warehouse the analysts read. It is three pieces and nothing else: a
broker holding the change topics, a pool of consumers reading them, and a
writer that lands files in the warehouse bucket.

## Why it exists

The analysts used to query the transactional store directly, and a long query
could hold locks for minutes at a time. Harbour was built to give them a copy
they cannot slow down.

## What it does not do

Harbour does not transform anything. It moves records and records where they
came from. Every cleaning rule the analysts wanted lives in the warehouse, on
purpose, so that a rule change never means replaying the pipeline.
`,
  },
  {
    path: 'notes/nightly-export.md',
    content: `---
title: The nightly export
tags:
  - harbour
  - runbook
---

# The nightly export

The nightly export is the scheduled run that lands yesterday's records in the
warehouse bucket. It is the most visible thing Harbour does, so it is also the
thing people mean when they say Harbour is failing.

## When it runs

The nightly export starts at 02:10 and usually finishes before 02:40. It is
scheduled rather than triggered, so a failed export does not retry on its own
and waits for the next night unless somebody starts it by hand.

## What it writes

Each nightly export writes one file per topic, named for the topic and the
date, into the warehouse bucket. An export that produced no file for a topic
either had nothing to move or did not finish.

## Restarting a failed export

Starting the nightly export by hand is safe. The writer is keyed on the record
identifier, so an export that runs twice lands the same rows twice and the
warehouse keeps one of them.
`,
  },
  {
    path: 'notes/consumer-leases.md',
    content: `---
title: Consumer leases
tags:
  - harbour
  - broker
---

# Consumer leases

A consumer does not own a partition. It holds a lease on one, and it holds that
lease only as long as it keeps renewing it.

## A lease is lost silently

The renewal interval is thirty seconds. A consumer that spends longer than that
inside a single batch never gets to renew, and the broker hands the partition
to somebody else while the first consumer is still working.

Nothing raises an error at that moment. The consumer finishes its batch and
tries to commit an offset it no longer owns, the commit is refused, and the run
stops at the last offset it did commit. From the outside the job simply stopped
partway through and reported success.

## How to tell this is what happened

Compare the committed offset with the topic's end offset. A run that ended
cleanly has caught up. A run that lost its lease is short by exactly the batch
it was working on when the renewal was missed.

## Making it less likely

Smaller batches renew more often. A batch that can be processed inside the
renewal interval cannot lose its lease partway through, which is why the batch
size is a function of the renewal interval and not of the writer's throughput.
`,
  },
  {
    path: 'notes/broker-topics.md',
    content: `---
title: Broker topics and partitions
tags:
  - harbour
  - broker
---

# Broker topics and partitions

One topic per source table, partitioned by the record identifier so that all
versions of one record are ordered.

## Partition count

Partitions are set when the topic is created and are never changed afterwards,
because changing them would reshuffle which partition a record lands in and
break the ordering the writer depends on.

## Retention

Topics keep seven days. A consumer that falls further behind than that loses
records rather than catching up, and the recovery is a replay from the
transactional store rather than from the broker.
`,
  },
  {
    path: 'notes/certificate-rotation.md',
    content: `---
title: Rotating the broker certificate
tags:
  - harbour
  - runbook
---

# Rotating the broker certificate

The broker presents a certificate that expires every ninety days. Rotation is a
rolling restart and is unrelated to anything the export does.

## The steps

Issue the new certificate, place it beside the old one, restart each broker in
turn, and only then retire the old one. A broker restarted before its
replacement certificate is in place refuses every connection until it is.

## What breaks if it lapses

An expired certificate stops every consumer at once and loudly. This is the
opposite of the failure mode that stops a single run quietly, and the two are
worth keeping straight when reading an incident timeline.
`,
  },
  {
    path: 'notes/writer-retries.md',
    content: `---
title: Writer retries
tags:
  - harbour
---

# Writer retries

The writer retries a failed upload with exponential backoff and jitter, up to
five attempts, and then gives up and fails the run loudly.

## Why it gives up

A writer that retried forever would turn a bucket outage into a run that never
ends and never reports. Failing loudly after five attempts means the failure is
visible the same night rather than the next morning.

## What a retry does not cover

Retries cover the upload. They do not cover anything that happened before the
writer was handed a batch, so a run that stopped before the writer ran has no
retries recorded at all.
`,
  },
  {
    path: 'notes/oncall-triage.md',
    content: `---
title: Triaging a Harbour page
tags:
  - harbour
  - runbook
---

# Triaging a Harbour page

Two questions separate most Harbour incidents: did the run report a failure,
and did it move every record it should have.

## A run that reported a failure

Read the writer's last error first. A loud failure is almost always the writer
or the bucket, and both are covered by the retry policy.

## A run that reported success

A run that reported success and still left the warehouse short did not fail in
the writer. Look at what the consumers committed rather than at what the writer
uploaded.
`,
  },
  {
    path: 'sources/queue-semantics-talk.md',
    content: `---
id: src-demo-queue-semantics-talk
title: Queue semantics talk, invented for this demo
type: source
---

# Queue semantics talk

An invented conference talk, referenced here only so the demo vault has a
source file with the shape a real one would have.

## The claim worth keeping

Ownership in a partitioned log is a lease, not a property, and any consumer
that treats it as a property will eventually commit an offset it no longer
holds.
`,
  },
];
