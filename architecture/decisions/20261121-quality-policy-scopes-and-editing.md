# Quality policy scopes and draft editing

Status: Accepted. Date: 2026-11-21.

## Context and scope

The user approved configurable release gates for Medium-and-higher test cases,
WCAG 2.2 accessibility and Lighthouse performance, together with policy editing.
This explicitly extends the closed feature scope in the agent guide. Caselog accepts
reports from existing CI and review workflows; it does not run external scanners.

## Decision

Retain the three existing test metrics and their linked-run behavior when no priority
scope is supplied. Add optional versioned case priority (`low`, `medium`, `high`,
`critical`); existing versions and new cases default to Medium. Omitted priority on
an update preserves the current value. Restore and duplicate preserve source priority.

Priority-scoped gates use native evidence only. At the first native processing of a
candidate, freeze the active project's case/version/priority inventory through the
test-cases public API. Store it once in the existing tenant-protected evidence revision
record, guarded against replacement. Each threshold includes itself and higher
priorities. Deduplicate exact case versions across linked runs, selecting the latest
item update (run-ID order breaks ties). Missing versions and skipped cases cannot pass.
Pass rate and completion rate use the full frozen inventory as denominator; an empty
scope or open run is incomplete. Case changes after capture require a new candidate
for a new inventory. Existing candidates capture on their next native processing after
upgrade; earlier evidence and decisions remain unchanged. Bound inventories/run snapshots
to 20,000 cases/items and expose capture time, hash and bounded missing-case diagnostics.

Add external metrics `accessibility.wcag22_aa_violations` (integer count),
`accessibility.wcag22_aa_manual_review` (0 failed, 1 passed), and
`performance.lighthouse_score` (0–100). A manual gate requires equality to 1. Automated
and manual WCAG evidence remain separate; scores alone do not certify conformance.

External gates pin an authenticated producer key and a versioned profile, required page
URLs and tool/review-procedure version. Performance also pins mobile/desktop and 3–10
runs per page. Evidence must match these dimensions exactly and link a report. Lighthouse
reports submit bounded samples in sorted page-URL order; ingestion validates that the
reported score is the minimum of per-page medians. Caselog does not fetch report URLs.
The authenticated source remains responsible for accurate measurements and review
coverage. Missing, incomplete, untrusted and expired evidence retain explicit gate behavior.

Add organization-token-only `PUT .../release-policies/:policyId/draft` for owner/admin/lead
to edit name, description and gates. Require the last policy timestamp and nullable
draft ID. Serialize with policy version creation/publication and advance the policy
timestamp on editing, version creation and publication. Save an existing draft or
atomically create a successor draft from a published policy; never edit published gates,
assignments or historical decisions. The policy name is mutable display context; historical
API responses show its current label while retaining the original version and inputs.
Identical saves return current state without another audit record. Differing stale saves conflict. Explicitly publish and assign successors;
environment-based automatic assignment and additional MCP tools remain outside this task.

## Compatibility and recovery

Apply additive migration `20261121190000_quality_policy_scopes` before new artifacts.
No destructive backfill is required. Existing request shapes remain valid. Regenerate
REST/Angular contracts and rebuild CLI/MCP against the shared schemas. Evaluator 1.1.0
records new calculations; historical evaluator 1.0.0 decisions stay readable. Deploy
by draining previous evaluator jobs before stopping old workers, applying the migration,
then upgrading all artifacts together. Restart workers; reconciliation schedules the new
evaluator version without rewriting older decisions.
Restore a pre-upgrade backup before starting older backend artifacts. Older evaluators
ignore the new dimensions and can misinterpret priority-scoped observations; additive
columns alone do not provide behavioral downgrade compatibility. Older clients cannot
interpret the new metrics. Do not delete or rewrite recorded decisions or frozen
inventories to force a downgrade.

## Verification

Prove priority version preservation, full-scope coverage, duplicate/missing/skipped cases,
scope freezing and tenant isolation with PostgreSQL. Test external source/profile/page/
device/version matching, median validation, missing/stale/untrusted reports and manual
review semantics. Cover draft edits, successor creation, races, retries, authorization,
published-history preservation and input retention through API, Angular and Chromium.
