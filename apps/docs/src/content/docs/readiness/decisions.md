---
title: Evaluate release readiness
description: Connect an exact candidate to evidence and a published policy.
---

Readiness evaluates an **immutable candidate**, not a mutable release name or branch.
You need a release, an exact build or commit identity, and a published policy appropriate
to the release decision. Policy authoring and waivers require suitable workspace roles.

## Prepare and evaluate a candidate

1. Open the project's releases area and create or select the release.
2. Create a candidate identifying the exact commit or build to be assessed.
3. Link relevant test runs and ingest any required external evidence.
4. Author and publish a policy version, then assign it to the candidate.
5. Request evaluation and inspect each gate's evidence and diagnostics.
6. Resolve blockers through new results or observations, then evaluate the current inputs.

For a new build, create a new candidate. Do not repurpose an earlier candidate by
changing its identity or assume evidence from another build applies automatically.

## Interpret the result

| State | How to act |
| --- | --- |
| Ready | Required gates are satisfied for the evaluated inputs; inspect the evidence before promotion. |
| At risk | Warnings remain; review them according to your team's release process. |
| Blocked | One or more required conditions are not satisfied. Inspect their diagnostics. |
| Unknown | The system cannot establish a sufficient current decision. Obtain the missing inputs. |
| Pending or stale | Processing or reevaluation is needed; do not treat an earlier ready result as current. |
| Failed processing | Investigate the background error and retry through the supported workflow. |
| Approved with waiver | Inspect the recorded exception, its authority, scope, reason, and expiry. |

These include decision classifications and processing/freshness states; consult both
the summary and gate details. Missing, untrusted, incomplete, and expired evidence have
different remedies. A closed run may fix incompleteness; it cannot repair a failed test
or make expired external evidence fresh.

## History and exceptions

Policy edits produce new versions. Evaluations and decisions preserve the policy,
evidence, and evaluator inputs used at that time. Later evidence or expiry can produce
a successor decision without rewriting the previous one.

Use a waiver only through the explicit authorized workflow, with a reason and the
required scope and expiry. A waiver records an exception; it does not change a failed
observation into a passed result. CI tokens cannot author policies or create waivers.

For automation, see the [CLI readiness workflow](../../reference/cli/).
