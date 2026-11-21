# Manual accessibility reviews for release candidates

Status: Accepted. Date: 2026-11-21.

## Context

The user requested a simpler accessibility workflow: configure a standard (for example
WCAG 2.2 AA), required pages and manual keyboard/screen-reader checks; record a human
OK / Not OK result and attach reports from Lighthouse, Deque axe or other tools.
Numerical comparisons, measurement profiles and producer IDs are not accessibility inputs.
This decision supersedes the accessibility authoring workflow in
[quality policy scopes](20261121-quality-policy-scopes-and-editing.md). Performance,
native test scopes and draft editing retain their previous contracts.

## Decision

Introduce `accessibility.manual_review` with required dimensions `accessibilityStandard`,
sorted unique HTTP(S) `pageUrls` (1–50), and sorted unique `manualChecks` (keyboard
navigation and/or screen reader; either can be optional). The standard is a bounded
label, defaulting to WCAG 2.2 AA in the UI. Policy inputs contain no tool version or
producer selector. Internally the deterministic gate is equality to integer 1; require
authenticated evidence and block missing/stale reviews. Impact remains configurable.

The quality-evidence module owns a dedicated organization-session-only review endpoint
for owners, admins and leads. It requires an explicit human outcome, 1–10 tool labels,
keyboard/screen-reader results, 1–10 completed candidate report IDs and optional notes.
OK is invalid unless all required manual checks passed. Reports support the review;
Caselog neither executes scanners nor derives WCAG conformance from a scanner score.

Bind each review to an exact immutable candidate and the complete configured standard,
pages and required checks. Reviews have no automatic expiry because their candidate and
requirements are fixed. A changed requirement set needs matching evidence. Store reviews
as append-only normalized observations with actor, tools, checks and report IDs in their
payload. A server-owned `manual_review` producer key `caselog.accessibility-reviews`
provides one current result per candidate/scope across reviewers. Generic evidence
ingestion rejects this metric. Existing WCAG metrics remain accepted/readable for legacy
clients and published policies; the UI offers the new review type for new gates.

Serialize through existing producer/revision locks. A required nullable
`expectedObservationId` conflicts if the current review changed; the same producer-scoped
`Idempotency-Key` and identical request replay the original review without another audit
or revision. Include candidate and actor in the request hash. Corrections supersede the
previous observation and append an audit record in the same transaction. Publish the
existing durable evidence-revision event, so reconciliation and readiness workers use
normal retry/failure paths. Evaluator 1.2.0 pins the server producer and exact review
requirements; older decisions retain their original inputs and evaluator versions.

The attachments module exposes a narrow, preauthorized candidate-report public port.
Quality-evidence resolves candidates through the releases public API and checks route
project identity before using that port. This dependency direction avoids an
attachments → releases → test-runs → attachments cycle. Candidate report upload sessions
use a tenant/project/candidate foreign key, existing quotas, checksums, blob promotion,
reference accounting and storage reconciliation. Accept PDF, JSON, HTML and text up to
100 MB/file. Downloads require workspace access and use attachment disposition; never
render uploaded HTML inside the app. Candidate reports have no deletion endpoint.

## Compatibility and recovery

Apply additive migration `20261121210000_manual_accessibility_reviews` before new
artifacts. It extends the attachment target enum, adds nullable candidate upload targets,
extends the exactly-one-upload-target check and the readiness metric contract. Existing
RLS, table grants and blob reference triggers cover the new targets. No evidence or
published policy is backfilled or rewritten. Existing API requests remain valid.

Drain old evaluator jobs, stop workers, migrate, upgrade all artifacts together and restart
workers. Reconciliation schedules evaluator 1.2.0. Older clients cannot interpret the new
metric/dimensions. Restore a pre-upgrade database and object-store backup before running
older artifacts; enum rollback and old evaluators are not a supported in-place downgrade.
Policy owners explicitly edit/publish/assign successor policies to adopt manual reviews.

## Verification

Test missing/OK/Not OK outcomes, required checks, source and scope matching, report upload,
checksum failures and downloads, idempotency, competing reviewers, audit, historical
preservation, role boundaries and tenant/project/candidate isolation against PostgreSQL.
Verify policy editing and report-backed corrections in Chromium, including a narrow
viewport and report download. Retain form input and uploaded report references on errors.
