# Caselog documentation site

Astro Starlight builds this workspace into static HTML, CSS, JavaScript, and a local
Pagefind search index. It has no Caselog API, PostgreSQL, S3, authentication, or runtime
Node.js dependency when deployed. Content is English and follows the product version.

## Local work

Run from the repository root with the pinned Node.js and pnpm versions:

```bash
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

Write public guides under `apps/docs/src/content/docs/`. The root `/docs/` directory is
private local planning material and must never be imported or published by this site.
The `reference/` pages and `public/downloads/` are generated from an explicit list of
tracked repository sources by `scripts/prepare.mjs`. Edit the original deployment, CLI,
security, compatibility, or changelog file, then rebuild/restart the documentation
preview. Do not edit generated copies. Search is available in the production preview.

## Separate deployment with GitHub Pages

The checked-in `.github/workflows/docs.yml` builds and checks documentation on relevant
pull requests and pushes. **Only a manual workflow dispatch deploys the site.** Pushing
application changes or a version tag does not deploy documentation or the application.

1. In the GitHub repository, open **Settings → Pages** and select **GitHub Actions** as
   the build and deployment source.
2. Open **Actions → Documentation → Run workflow**, selecting the reviewed `main` branch.
3. Read the deployment URL in the completed `github-pages` environment.

The default configuration targets `https://caselogtech.github.io/caselog/`. That is the
configured destination, not a claim that Pages is already enabled or the site is live.
This workflow needs Pages to be available and enabled for the repository.

For a custom domain, configure DNS and the domain under GitHub Pages settings, enable
HTTPS, and set repository Actions variables `DOCS_SITE=https://docs.example.com` and
`DOCS_BASE_PATH=/` before dispatching again. For the default project URL, the variables
are `DOCS_SITE=https://caselogtech.github.io` and `DOCS_BASE_PATH=/caselog`.
Do not add `/caselog` to `DOCS_SITE`; the path is supplied separately.

## Deploy to your own static host

Build for the actual public origin and path:

```bash
DOCS_SITE=https://docs.example.com DOCS_BASE_PATH=/ pnpm docs:build
```

Upload the entire `apps/docs/dist/` directory, including `_astro/`, `pagefind/`, and
`downloads/`, to a static host. Configure directory URLs to serve `index.html`, genuine
missing pages to return `404.html` with HTTP 404, and HTTPS at the host. There is no SPA
fallback to the root index. Deploy the whole output atomically to avoid mixing search
indexes or assets from different builds. Retain the previous output to roll back.

For a self-managed Caddy host, an example is:

```caddyfile
docs.example.com {
  root * /srv/caselog-docs/current
  encode zstd gzip
  file_server
  handle_errors {
    rewrite * /404.html
    file_server
  }
}
```

The host directory must contain the built files. A documentation deployment changes no
application containers, migrations, or customer data. Keep its source revision in the
deployment record; preview servers are for local verification, not public serving.

## Verification and future versions

```bash
pnpm docs:build
pnpm test:docs
DOCS_BASE_PATH=/caselog pnpm docs:build
DOCS_BASE_PATH=/caselog pnpm test:docs
```

The browser check traverses generated pages, checks local links and anchors, exercises
search, mobile navigation, and 404 handling, and detects JavaScript errors.
Use a matching `DOCS_BASE_PATH` for the build and its test.

There is one current documentation set for 0.1.0. Release notes identify behavior changes;
the versioned Git source preserves earlier content. Before multiple supported release
lines exist, add explicit archived version paths and a selector. Never label current
instructions as compatible with an older version without checking them.
