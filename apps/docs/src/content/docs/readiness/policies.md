---
title: Configure and edit release policies
description: Build custom gate forms with manual answers, reports and native test conditions.
---

Open **Release policies → Create policy**, or choose **Edit policy** on an existing policy.
Workspace owners, admins and leads can save a draft. Review and publish it, then explicitly
assign the policy to a candidate. Saving a published policy creates a successor draft;
existing assignments and decisions retain their version. Environment names do not assign
policies automatically.

## One form for each gate

Choose **Add gate**, give it a name and description, and configure its fields and passing
conditions. A gate can block promotion or issue a warning. Every condition must pass.
Caselog evaluates conditions on the server and records an explanation for each one.

| Response field | Use |
| --- | --- |
| Short text / Long text | Standards, pages, tool versions, notes or other review context. |
| Number | Scores or measurements; optionally require a numeric comparison. |
| Checkbox | A manual check; add a condition when it must be checked. |
| Single choice | Your own options; optionally require one accepted option. |
| Link | An HTTP(S) report or supporting reference. |
| Reports and files | PDF, JSON, HTML or text reports, up to 10 files per field, 100 MB/file. |

Each field has a label, optional help text and a **Required answer** setting. Required
means an answer must be present and have the correct type. False and zero are valid
answers. A required checkbox does not imply approval: add **Checkbox must be checked**
to require it to pass. Optional fields can provide context without blocking the form.
A passing condition referencing an optional field still needs its value to evaluate.

Supported conditions are **Checkbox must be checked**, **Number meets a threshold**,
**Choice matches an option**, and **Test results meet a threshold**. Native test conditions
support pass rate, completion rate, failed count, linked-run role and minimum case priority.
A form without manual fields can evaluate automatically from test results.

A gate supports 30 fields, 30 options per choice and 20 conditions. Labels are limited to
120 characters, help text to 500, gate descriptions to 2,000 and text answers to 4,000.
There are no scripts, conditional layouts, custom integrations or scanner execution.

## Example production gate

Create a gate named **Production quality review**:

- Required text fields: **Standard**, **Pages reviewed**, **Tools used**.
- Required checkboxes: **Keyboard navigation**, **Screen reader**, **Review approved**.
- Required number: **Lighthouse score**.
- Required report files, plus optional notes.
- Conditions: each check must be checked, Lighthouse score ≥ 90, test pass rate ≥ 100%
  and test completion rate ≥ 100% for required runs with minimum priority Medium.

The candidate response records WCAG 2.2 AA, the actual pages/tools and the human review
with attached reports. Caselog does not infer WCAG conformance from a score or parse
uploaded reports into authoritative measurements. The reviewer owns the assessment and
coverage. Use precise labels and help text to explain your team's measurement method.

## Respond on the candidate page

Publish and assign the policy, then open the candidate's readiness page. **Gate forms**
shows its configured fields. Owners, admins and leads submit answers and upload reports;
other workspace members can read responses. Saving a response triggers the normal
readiness evaluation. Failed checks can be recorded and corrected later.

**Response history** retains the author, time, answers and downloadable reports.
Corrections supersede the current response without deleting it or changing earlier
decisions. A changed build requires a new candidate. A successor policy has new gate
identities and needs fresh responses even when its labels look similar.

If another reviewer saves first, your save conflicts and retains your inputs. Inspect the
latest history, then explicitly choose **Keep my answers and reload the latest response**
before resubmitting. Uploaded file references survive failed saves. Responses have no
scheduled expiry for their fixed candidate and gate. HTML reports download as attachments
and are never embedded as active pages inside Caselog.

## Test priority and coverage

Case versions carry Low, Medium, High or Critical priority. Existing versions and newly
created cases without an explicit priority use Medium. Priority edits create a new case
version; restoring and duplicating preserve it.

The first native evidence processing freezes the candidate's active project inventory of
case IDs, exact versions and priorities. Medium includes Medium, High and Critical. Every
eligible frozen case must be covered; missing, skipped or different-version cases do not
pass. Duplicate versions across runs count once, using the latest item update with run ID
as a tie-breaker. Empty eligible inventories and unfinished linked runs produce incomplete
evidence. Set priorities before candidate processing; create a new candidate for new scope.

Without a minimum priority, conditions aggregate linked runs for the selected role. They
do not claim coverage of the complete project. Native conditions only trust Caselog's
native test-result producer.

## Public API

Policy creation/version/draft endpoints accept the existing gate envelope plus `form`:

```json
{
  "key": "release-approval",
  "metricKey": "gate.form_response",
  "metricVersion": "1.0.0",
  "dimensions": { "testRunRole": "required" },
  "operator": "eq",
  "expected": { "type": "integer", "value": 1 },
  "impact": "blocking",
  "missingEvidenceBehavior": "block",
  "staleEvidenceBehavior": "block",
  "minimumTrust": "authenticated",
  "form": {
    "name": "Release approval",
    "description": "Review the attached production report.",
    "fields": [
      { "key": "approved", "label": "Approved", "type": "checkbox", "required": true }
    ],
    "criteria": [{ "type": "checkbox", "fieldKey": "approved" }]
  }
}
```

The integer envelope is an internal marker. Clients submit answers, never the computed
outcome. Human responses require an owner/admin/lead organization session; API tokens and
generic evidence ingestion cannot submit them.

Under `/api/v1/projects/:projectSlug/candidates/:candidateId/gate-forms`:

1. `POST reports/uploads` declares filename, content type, byte size and SHA-256. Upload
   using the returned PUT URL and headers, then `POST reports` with `uploadId`.
2. `POST :gateId/responses` accepts `values` keyed by field key and
   `expectedObservationId` (the current response ID, initially null). File values are
   completed candidate report IDs. Send an `Idempotency-Key`; identical retries replay
   the same result. A stale correction returns `409 gate_form_changed`.
3. `POST reports/:reportId/download` returns an authorized attachment URL.
4. List answers using the evidence endpoint with `candidateId`, `gateId`,
   `metricKey=gate.form_response`, `producerKey=caselog.gate-forms` and
   `currentOnly=true` or `false`; follow its pagination cursor.

Draft editing uses `PUT /api/v1/projects/:projectSlug/release-policies/:policyId/draft`
with name, description, complete gates, `expectedUpdatedAt` and `expectedDraftId`.
Conflicting edits retain input; published versions are immutable.

## Legacy gates and upgrades

Existing native, WCAG, manual-accessibility and Lighthouse gates keep their original
contracts and histories. In the editor they appear as retained legacy gates. Choose
**Replace with a custom form** to change a gate explicitly in the draft. Native conditions
can be copied; replacing external or accessibility gates requires configuring the new
fields and conditions. Review, publish and assign the successor. Old API clients may
continue authoring legacy metric gates, and the old accessibility-review API remains
available for policies that use it.

Drain old evaluator jobs, stop old workers, apply
`20261122100000_custom_gate_forms` (and preceding migrations), then upgrade all artifacts
together. Evaluator 1.3.0 records new decisions; previous decisions remain readable.
Roll forward after adopting forms. Starting older artifacts against form policies is
unsupported; restore a matching pre-upgrade database and object-store backup to downgrade.
