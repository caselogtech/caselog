# Custom gate forms and deterministic passing conditions

Status: Accepted. Date: 2026-11-22.

## Context

The user requested one configurable gate editor instead of accessibility/performance
presets: a name, description, required and optional fields, and selectable criteria such
as test results or a manual checkbox. This is a scoped extension to the closed feature
set. It supersedes new-gate UI authoring in the quality-policy and manual-accessibility
ADRs; their published contracts and historical behavior remain supported.

## Decision

Release-readiness owns a bounded form definition on an immutable published gate. A form
has a name, description, up to 30 typed fields and 1–20 AND conditions. Field types are
short/long text, number, checkbox, single choice, HTTP(S) link and candidate report files.
Fields have stable keys, labels, help text and an explicit required-answer flag. Choice
options have stable keys and labels. Definitions cannot exceed 120,000 UTF-8 bytes;
answers support 30 fields, 4,000 characters/text field and 64,000 characters total.
No scripts, expressions, nesting, conditional fields, remote lookups or workflow engine
are introduced.

Requiredness checks presence and type, independently of passing criteria. Zero and false
are answers. A checkbox condition requires true; number conditions use bounded finite
numeric comparisons; choice conditions require a configured option. Native test-result
conditions reuse pass rate, completion rate and failed count, required/informational
linked runs, and optional minimum case priority. Priority conditions consume the existing
frozen candidate test inventory and native producer; they do not select arbitrary case
IDs or accept externally asserted native results. All conditions must pass. Missing or
invalid required answers block a blocking gate; a warning gate produces a warning.
Tests-only forms need no human response. There is no automatic WCAG conformance claim,
scanner execution or environment-based assignment.

The `gate.form_response` metric carries a server-owned marker, not a client-computed
outcome. Its legacy envelope is equality to integer 1, authenticated trust and blocking
missing/stale evidence. Evaluator 1.3.0 derives the actual outcome from the definition,
authenticated answers and native observations. It stores individual condition results,
actual/expected displays, diagnostics and exact consumed observation IDs in the immutable
evaluation. The immutable gate retains the definition; evidence retains all answers and
report names. Old decisions are never recalculated in place.

Human answers belong to quality-evidence. Release-readiness resolves the authenticated
tenant, candidate, route project and currently assigned published gate, validates the
answers and candidate reports, then calls a narrow quality-evidence public service.
Only owner/admin/lead organization sessions can submit; API tokens cannot impersonate a
human review. Generic evidence ingestion rejects `gate.form_response`. A server-owned
`manual_review` producer `caselog.gate-forms` maintains one current response per exact
candidate/gate across reviewers, with no automatic expiry. Gate identity prevents a
response from satisfying another gate or a successor version.

Producer/revision locks serialize writes. Required nullable `expectedObservationId`
prevents lost corrections; an unchanged idempotency request replays its original result.
The request hash includes actor, candidate, gate and answers. A correction appends an
observation, supersedes the old one, appends `gate_form.recorded` audit and emits the
existing durable evidence-revision event atomically. Release-readiness immediately requests
an evaluation after an accepted response; a failed enqueue is logged and recovered by
the durable revision event and reconciliation. A concurrent policy reassignment
can leave a response for the previously resolved gate; it cannot satisfy the new gate.

The attachments public port provides PDF/JSON/HTML/text reports, existing upload limits,
checksums, quotas, blob promotion and attachment-disposition downloads. Files are checked
against the exact tenant/project/candidate. Up to 10 reports per field and 30 per response
are supported. Upload failures retain accepted file references. Reports are not rendered
as active HTML. No new storage backend or report-deletion path is introduced.

The UI offers only the form builder for new gates. Existing legacy gates are retained
with a read-only summary in draft editing. An explicit replacement action creates a form;
native comparisons can be copied into a native condition. Replacing a legacy
external/accessibility gate starts a manual form that must be configured explicitly.
No automatic conversion or backfill changes published meanings. The public API continues
to accept legacy gate definitions for existing clients.

## Compatibility and recovery

Apply additive migration `20261122100000_custom_gate_forms` before new artifacts. It adds
nullable gate definitions and condition-result arrays, extends the metric constraint and
protects the form envelope. Existing RLS, immutable-row triggers and grants apply. No new
tenant table or history rewrite is required. Old requests and responses remain readable;
older clients cannot interpret new forms/metrics.

Drain old evaluator jobs, stop old workers, migrate and upgrade all application artifacts
together. Reconciliation schedules evaluator 1.3.0. Roll forward after publishing a form
or recording a response. Running old artifacts against form policies is unsupported;
a downgrade requires restoring the corresponding pre-upgrade database/object-store backup.

## Verification

Cover field types, bounds, required false/zero answers, valid references/options, AND
conditions, native priority/source scopes, missing/stale/untrusted evidence and stable
ordering at the domain boundary. PostgreSQL/API checks cover uploads/downloads, candidate
report isolation, idempotency, concurrent human corrections, audit, role/token boundaries,
RLS, policy successors and unchanged decisions. Browser verification covers building,
editing and publishing a form, linked passing tests, manual failed-to-passed corrections,
report transfer, response history and a narrow viewport. UI checks cover input retention
and explicit conflict rebasing.
