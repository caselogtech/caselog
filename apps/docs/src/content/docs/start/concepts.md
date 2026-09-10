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
