---
title: Configure and edit release policies
description: Require test coverage, WCAG 2.2 AA review and Lighthouse performance for an exact candidate.
---

Open **Release policies → Create policy**, or select an existing policy and choose
**Edit policy**. Workspace owners, admins and leads can save changes. Saving updates
an existing draft or creates a successor draft from the published version. Review it,
publish explicitly, then assign that version to a candidate. Existing assignments and
decisions retain their version. A policy's name is current display context; renaming
it does not change recorded gate inputs or outcomes.

Conflicting edits keep your form input. **Reload policy and discard my edits** loads
the latest version. Publication also checks the version reviewed in your browser.
Environment names do not automatically select a policy.

## Example production policy

| Metric | Scope and condition |
| --- | --- |
| Test pass rate | Minimum priority Medium, required runs, ≥ 100%. |
| Test completion rate | The same scope, ≥ 100%. |
| Accessibility review | WCAG 2.2 AA, required pages, keyboard navigation and screen reader; manual OK with attached reports. |
| Lighthouse performance score | Required pages, pinned tool version, Mobile, 3 runs/page, ≥ 90. |

Use Blocking impact for production requirements. Manual accessibility reviews block when
missing and require an authenticated human assessment; there are no numerical settings,
measurement profiles or evidence source IDs to fill in for this gate.

## Manual accessibility review

In the policy editor choose **Accessibility review**, enter **Accessibility standard**
(default WCAG 2.2 AA) and required HTTP(S) page URLs, one per line. Select which manual
checks are required: **Keyboard navigation** and **Screen reader** are enabled by default.
The policy defines what must be reviewed. Tools and results belong to each candidate review.

After publishing and assigning the policy, open the candidate's readiness page. Owners,
admins and leads can choose **OK** or **Not OK**, list the tools used (for example
Lighthouse, Deque axe and NVDA, including versions), record both manual check results,
attach reports and add notes. OK requires every mandatory check to have passed. Not OK
can document incomplete or failed checks. Attach 1–10 PDF, HTML, JSON or text reports,
up to 100 MB each. Downloads are workspace-authorized attachments; uploaded HTML is
never embedded in Caselog. Scanners do not run inside Caselog, and a scanner score alone
does not establish WCAG conformance: the reviewer owns the overall assessment and coverage.

The history shows the reviewer name, standard, pages, tools, checks, notes and downloadable
reports. Another review replaces the current result for the same scope without deleting
it or rewriting previous readiness decisions. A concurrent edit returns a conflict;
inspect the refreshed history before submitting again. Unsaved input and uploaded reports
survive a failed save. Reviews have no scheduled expiry for their immutable candidate and
requirements. A changed build needs a new candidate; a changed standard, required page set
or manual-check set needs matching review evidence.

The public API mirrors this workflow under
`/api/v1/projects/:projectSlug/candidates/:candidateId/accessibility-reviews`:

1. `POST reports/uploads` declares filename, content type, byte size and SHA-256, returning
   a short-lived PUT URL and required headers.
2. Upload the file, then `POST reports` with `uploadId` to verify and complete it.
3. `POST` the review with `dimensions` (`testRunRole: "required"`, `accessibilityStandard`,
   sorted `pageUrls`, sorted `manualChecks`), `outcome` (`ok` / `not_ok`), `tools`,
   `keyboardNavigation`, `screenReader` (`passed` / `failed` / `not_checked`), `reportIds`,
   optional `notes` and `expectedObservationId` (current review UUID, initially null).
   Supply an `Idempotency-Key`; identical retries replay the same review. Use an
   organization session: API tokens cannot submit human reviews.
4. `POST reports/:reportId/download` returns an authorized attachment URL. List current or
   historical reviews through the evidence endpoint with `metricKey=accessibility.manual_review`
   and `currentOnly=true` / `false`; follow its cursor.

Legacy published WCAG count/review gates keep their original behavior and remain readable.
Edit, publish and explicitly assign a successor using **Accessibility review** to adopt
this workflow. Caselog does not silently reinterpret earlier policies or decisions.

## Test priority and coverage

Set Low, Medium, High or Critical in the case editor. Priority belongs to the case
version; restoring or duplicating preserves it. Existing versions and cases created
without a priority use Medium. Older API clients that omit priority on update preserve
the current value. CSV-created cases currently use the Medium default.

The first native evidence processing freezes the candidate's active project inventory
of case IDs, exact versions and priorities. Medium includes Medium, High and Critical.
The denominator includes every required frozen case, including cases missing from linked
runs. Skipped cases and results for different versions do not pass. Duplicate versions
across runs count once, using the latest item update; run ID resolves timestamp ties.
An empty eligible inventory or unfinished linked run supplies incomplete evidence.

Set case priorities before registering a candidate. Changing or adding cases later does
not rewrite that inventory. Create a new candidate
to capture a new scope. Evidence details expose capture time, scope hash, required and
missing counts, and up to 100 missing case IDs. The current safety bound is 20,000 cases
per inventory and 20,000 items per source run. Older candidates capture their inventory
on the next native processing after upgrade; previous evidence stays intact.

Leaving minimum priority unset retains the legacy behavior: aggregate selected linked
runs without claiming coverage of the whole project.

## Performance reports

For performance and legacy external metrics, Caselog accepts reports through `POST /api/v1/projects/:projectSlug/evidence`; scanners
run in your existing workflow. Reports must identify the exact candidate,
match the configured source and measurement dimensions, and link their report URL.
**Measurement profile** is the stable key of your measurement setup (pages and conditions).
**Evidence source key** identifies the authenticated user or CI token allowed to supply
measurements; it is an ID, not a secret. **Use my account** selects your user ID. For CI,
copy the source ID from **Workspace settings → API tokens** and grant `evidence:write`.
These fields apply to performance and legacy external gates, not manual accessibility.
Use a versioned profile key and pin all required page URLs and tool/procedure version.
URLs are compared as exact strings, must be unique and sorted, and are limited to 50.
Caselog does not fetch these URLs. The reporting source remains responsible for truthful
measurements, complete page/scenario coverage and the retained report artifact.

Lighthouse uses `performance.lighthouse_score` on a 0–100 scale. Configure mobile or
desktop and 3–10 runs per page. Submit `details.performanceSamples` in groups matching
the sorted page URLs. Caselog validates the reported value against the minimum of the
per-page medians, so a fast page cannot compensate for a slow required page.

```json
{
  "candidateId": "11111111-1111-4111-8111-111111111111",
  "metricKey": "performance.lighthouse_score",
  "metricVersion": "1.0.0",
  "value": { "type": "percentage", "value": "92" },
  "state": "available",
  "dimensions": {
    "testRunRole": "required",
    "profile": "production-mobile-v1",
    "pageUrls": ["https://example.com/", "https://example.com/checkout"],
    "toolVersion": "your-pinned-lighthouse-version",
    "device": "mobile",
    "runsPerPage": 3
  },
  "observedAt": "2026-11-21T12:00:00.000Z",
  "expiresAt": "2026-11-22T12:00:00.000Z",
  "source": {
    "type": "lighthouse-ci",
    "id": "pipeline-42",
    "revision": "1",
    "url": "https://ci.example.com/reports/42"
  },
  "details": { "performanceSamples": [95, 96, 97, 90, 92, 94] }
}
```

Provide an `Idempotency-Key` and the reporting token as a bearer credential. Use actual
timestamps and the candidate's actual UUID. External expiry is required and may be at
most 30 days after observation. A changed source, profile, URL list, device, run count
or tool version supplies different evidence and cannot satisfy the original gate.

## API editing and upgrade

`PUT /api/v1/projects/:projectSlug/release-policies/:policyId/draft` accepts `name`,
nullable `description`, complete `gates`, `expectedUpdatedAt` from the last policy read
and `expectedDraftId` (the draft UUID, or null for a published-only policy). A differing
stale save returns `409 release_policy_draft_changed`. Identical saves do not duplicate
audit records. This edit endpoint uses an organization session; existing MCP operations
can create and publish successor versions with the expanded gate schemas.

Drain previous evaluator jobs before stopping old workers. Apply migration
`20261121190000_quality_policy_scopes` and
`20261121210000_manual_accessibility_reviews`, then upgrade all artifacts together and restart
workers. Reconciliation schedules evaluations with the new evaluator version.
Evaluator 1.2.0 creates new decisions; previous decisions remain readable. Restore a
pre-upgrade backup before starting older backend artifacts: older evaluators ignore
new scope dimensions and can misinterpret priority-scoped observations. Retaining the
additive columns alone does not make an application downgrade safe. Older clients cannot
interpret the new metrics.
