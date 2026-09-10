---
title: Create and maintain test cases
description: Organize cases, choose a template, and preserve test history.
sidebar:
  order: 1
---

You need a project and a workspace role with write access. Open the project's case
repository. Cases belong to sections; create a suite and section when the repository
has no suitable destination.

## Write your first case

1. Choose the section, then open the new-case form.
2. Enter a specific title, such as **Verified user can create a workspace**.
3. Select the destination section and a template.
4. Describe prerequisites, actions, and observable expected behavior.
5. Save the case and inspect its detail page before adding it to a run.

The supported templates represent different styles of test definition:

| Template | Content to supply |
| --- | --- |
| Steps | Ordered actions, with expected results where applicable. |
| Text | A free-form test description. |
| Exploratory | A charter defining the objective and scope of exploration. |
| BDD | A Gherkin scenario. |

For example, a steps case can describe signing in with a verified account, entering a
workspace name and available slug, and submitting the form. The expected result is a
new workspace visible to its owner. Describe separate cases for unverified accounts,
unavailable slugs, and disabled provisioning.

## Edit and review

Open a case's detail page to review content and its version history. Saving an edit
creates a new case version. Existing run items retain their captured version, so a
later edit does not change the instructions or result history of an earlier execution.
Create a new run when you need to execute the updated definition.

Use archive actions for cases you no longer want to select for new work. Review the
confirmation and current permissions before changing their lifecycle state.

## Prepare for automation

Set an automation identifier when matching an automated test to a case. Keep it stable
and consistent with the producer's JUnit identifiers. Review unmatched results after
ingestion instead of assuming every XML test matched an existing case.

For a bulk starting point, use [CSV import](../csv-import/). To execute your cases,
continue with [test runs](../runs/).

## Common problems

- **No sections:** create the required repository structure first.
- **Validation error:** correct the highlighted field and preserve the rest of the draft.
- **Read-only view:** request a suitable workspace role; a hidden button is not an API bypass.
- **Older content in a run:** inspect its captured case version and create a new run if needed.
