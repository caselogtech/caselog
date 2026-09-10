---
title: Your first workspace
description: Register, create an isolated workspace, and invite your team.
sidebar:
  order: 1
---

You need the URL of a running Caselog installation and access to your email inbox.
For a new installation, follow [Install Caselog](../../reference/installation/) first.

## Register and verify your email

1. Open the installation and choose **Create an account** from the sign-in page.
2. Enter your display name, email, and password. Managed deployments also require
   acceptance of their terms, even when access is free.
3. Open the verification email and follow its link.
4. Sign in and open your workspace list.

If registration is unavailable, the instance may use invitation-only registration.
Ask an existing workspace owner or administrator for an invitation. Public evaluation
requires the operator to enable public registration; users cannot override that setting.

## Create a workspace

1. Choose **Create workspace**.
2. Enter the company or team's workspace name and review the proposed URL slug.
3. Wait for the availability check. Change the slug if it is already taken or reserved.
4. Submit the form and open the created workspace.

Your email must be verified. Creation gives you the **owner** role and creates a demo
project to explore. You can create your own project for real work. Each workspace has
separate membership: creating one does not give you access to another company's data.

When managed billing is disabled, no billing account, card, or subscription is required.
Workspaces are unlimited by default; an operator may set a provisioning safety limit.

## Start a project and invite colleagues

Create a project from your workspace, supplying its name, key, and URL slug. Use one
project for a coherent product or testing area. Open workspace settings and the members
page to invite colleagues with an appropriate role. An invitation grants membership to
that workspace only; do not share your login or API token.

Continue with [test cases](../../testing/cases/) and [test runs](../../testing/runs/).

## If onboarding fails

- **No verification email:** check spam, then use the resend action. Operators should
  inspect SMTP delivery configuration without sharing credentials or verification links.
- **Workspace creation disabled:** ask the operator to enable it.
- **Slug unavailable:** use another slug; repeating the same request cannot reserve it.
- **Permission denied:** confirm your current workspace and membership with its owner.

See [Troubleshooting](../troubleshooting/) for operator checks.
