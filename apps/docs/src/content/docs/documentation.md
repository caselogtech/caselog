---
title: Build and deploy the documentation
description: Serve the documentation independently of the application.
---

The documentation is a separate static site in `apps/docs`. Its production output does
not need a running Caselog application or database.

## Preview locally

From the repository root, install with the pinned tools and run:

```bash
pnpm install --frozen-lockfile
pnpm docs:dev
```

For a production preview, including search:

```bash
pnpm docs:build
pnpm docs:preview
```

## Publish separately

The repository includes a **Documentation** GitHub Actions workflow. Relevant code
changes build and test the site; deployment requires a manual workflow run after
GitHub Pages has been enabled in repository settings. The default destination is the
repository's GitHub Pages project URL. A custom domain can be configured independently.

You can also deploy `apps/docs/dist/` to your own static host. Set `DOCS_SITE` and
`DOCS_BASE_PATH` when building for its public origin and path. Include the complete
output so search and assets continue to work.

Follow the [complete deployment instructions](https://github.com/caselogtech/caselog/blob/main/apps/docs/README.md)
for GitHub Pages, custom domains, and a Caddy example. No application deployment or
database migration runs as part of this workflow.

## Keep content accurate

Write public guides in `apps/docs/src/content/docs/`. Operator and CLI reference pages
are generated from their tracked source files to avoid maintaining two conflicting
copies. Use each page's edit link to find its source.

Documentation corrections can ship separately from product releases. This site's
version identifies the product behavior being described. Earlier source is preserved
in Git; the current site does not yet provide a selector for archived release lines.
