---
title: Product concepts
description: Understand workspaces, projects, case versions, candidates, and evidence.
sidebar:
  order: 2
---

| Concept | Meaning |
| --- | --- |
| Workspace | An isolated team environment with explicit members and roles. |
| Project | A product or testing area inside one workspace. |
| Test case | A reusable test definition, with versions recording changes. |
| Test run | A selected set of case versions and their execution results. |
| Release | A named release lifecycle that can contain multiple candidates. |
| Release candidate | The immutable identity of an exact commit or build. |
| Evidence | A recorded observation from native runs or an external producer. |
| Policy version | Published rules determining what evidence a candidate must satisfy. |
| Evaluation and decision | A calculation and its explainable, historical outcome. |
| Waiver | An explicit, audited exception; it does not rewrite the evidence or decision. |

A useful workflow is to write cases, execute them in a run, link the run to an exact
candidate, and evaluate that candidate against a published policy. Automated systems
can submit JUnit results or external observations through the API and CLI.

A passing test run alone does not establish readiness. A policy can also require other
producers, sufficient coverage, trusted observations, and evidence that is still fresh.

Historical results and decisions describe the inputs used at that time. Editing a case,
publishing a new policy, or receiving fresh evidence does not silently rewrite history.

## Edit a release

Workspace owners, admins and leads can open a Draft or Active release and select
**Edit release**. Change its name, choose or clear an environment, set or clear the target
date, and update the external reference. A release created without an environment can
be assigned to an active environment in the same project later. The key stays fixed;
Released and Cancelled releases are read-only.

If another tab changes the release, saving explains the conflict and keeps your input.
Review it before choosing **Reload release and discard my edits**, then apply your
changes to the latest version. Candidate identities, lifecycle history and historical
readiness decisions remain unchanged. Actual edits are audited.

API clients use `PUT /api/v1/projects/:projectSlug/releases/:releaseId` with all four
editable fields (`null` clears an optional value) and `expectedUpdatedAt` from the last
read. A differing stale update returns `409 release_changed`. An identical retry returns
the current release without another audit entry. Use an organization access token;
this endpoint does not add API-token or MCP permissions.
