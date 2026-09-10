---
title: Execute a test run
description: Select case versions, record results, and close a completed run.
sidebar:
  order: 2
---

A run groups a selected set of case versions for an execution. You need write access
and at least one suitable active case in the project.

## Create and execute

1. Open the project's runs page and choose the new-run action.
2. Enter a descriptive name and, when relevant, the build being tested.
3. Select the cases for this execution. Review the selection before submitting.
4. Create a draft or start the run using the available action.
5. Open each run item, follow its captured instructions, and record the result status
   with comments and supporting attachments where needed.
6. Review incomplete items and failures, then close the run when execution is finished.

Results are historical records. Record a subsequent result for a retest rather than
trying to replace the previous execution. Inspect result history to understand the
sequence and the case version used.

## Automated results

CI can upload JUnit XML into a run with the [CLI](../../reference/cli/). Check the upload
summary for unmatched tests and request failures. Retrying the same content uses
idempotency to avoid duplicate ingestion.

Upload all intended results before closing a run. In readiness calculations, an active
run represents incomplete evidence even if all results recorded so far are passing.

## Connect the run to a release

Create an immutable candidate for the exact build and link the run to that candidate.
Choose the link role deliberately: required runs contribute required execution evidence;
informational runs provide context. Evaluate the candidate against its assigned policy.

Native evidence and readiness projections are processed asynchronously. A pending or
stale state is not a successful release decision. Wait for current results and inspect
the reported blockers. See [Readiness decisions](../../readiness/decisions/).
