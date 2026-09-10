---
title: Caselog documentation
description: From your first test case to an explainable release decision.
---

Caselog connects manual and automated testing to one question: **can this exact release
candidate be promoted safely, and what is blocking it?**

This documentation covers the **0.1.0 MVP**. The product is available for evaluation;
its compatibility and operational limits are recorded in the release notes. Hosted
evaluation requires no payment or billing account when enabled by the operator.

## Choose your starting point

- **Try the product:** [Create your workspace and first project](./start/first-workspace/).
- **Manage tests:** [Write a case](./testing/cases/) and [execute a run](./testing/runs/).
- **Assess a release:** [Understand candidates, evidence, and decisions](./readiness/decisions/).
- **Connect CI:** [Use API tokens and automated results](./automation/api/).
- **Operate Caselog:** [Install](./reference/installation/), then prepare
  [backup, restore, and upgrade procedures](./reference/recovery/).

## Before upgrading

Read the [release notes](./reference/release-notes/) and
[compatibility policy](./reference/compatibility/). A new version number alone does
not prove that your existing installation can be upgraded safely.

## Documentation and source

These pages are built from the same repository as the application. They are served
independently, so installation and recovery instructions remain readable when Caselog
is stopped. [Build or deploy this documentation site](./documentation/).

Caselog's server, web, schemas, and documentation use the
[AGPL-3.0-only license](./downloads/LICENSE.txt). The standalone CLI uses MIT.
See the [source repository](https://github.com/caselogtech/caselog) for notices and contributions.
The static site preserves [bundled dependency notices](./third-party-licenses.txt)
and the [Pagefind search license](./pagefind-LICENSE.txt).
