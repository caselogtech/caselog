---
title: Import cases from CSV
description: Preview column mappings and import cases atomically.
sidebar:
  order: 3
---

Open the project's case import page with write access. The current limit is **1,000 rows
and 5 MB per request**.

1. Select your CSV file and review its detected columns.
2. Map the source columns to title, section, template, automation ID, prerequisites,
   expected result, or template content as appropriate.
3. Run the preview and inspect errors before committing.
4. Correct invalid rows or mappings and preview again.
5. Commit the import and inspect the reported result in the repository.

For the steps template, the content cell can contain a JSON array of steps or one
`action => expected result` pair per line. For example, a JSON value is:

```json
[{ "action": "Submit valid credentials", "expected": "The workspace list opens" }]
```

When embedded inside CSV, quote and escape that value according to CSV rules. Preview
checks the interpreted content; do not assume a spreadsheet's visual layout is the
payload the importer receives.

The API separates preview and commit under
`/api/v1/projects/:projectSlug/imports/csv`. Commit is atomic and requires an
`Idempotency-Key`. If a response is lost, retry the same payload with the same key;
do not generate a different key just because the outcome is uncertain.

Use the [API reference](../../automation/api/) for exact request and response schemas.
