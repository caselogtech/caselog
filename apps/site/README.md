# Caselog public website

The standalone Astro site serves the homepage, `/contact/`, and a custom 404 page.
It is independent of the Angular product and Starlight documentation. It renders static
HTML with no application API, database, cookies, analytics, or client-side JavaScript.
The contact page opens the visitor's email app; it does not submit a form or store messages.

## Develop and verify

From the repository root with the pinned Node.js and pnpm:

```bash
pnpm install --frozen-lockfile
pnpm site:dev
pnpm site:build
pnpm site:preview
pnpm test:site
```

Public English copy is maintained in `src/content/en.ts` with semantic keys. Reuse the
Framed Log palette and the existing Caselog mark and Figtree font. `scripts/prepare.mjs`
copies only explicitly named public assets and license files; never source ignored
root `docs/`, editor settings, or `.env` files for a public build.

## Configure links before building

| Build variable | Default | Purpose |
| --- | --- | --- |
| `SITE_URL` | `https://caselog.tech` | Public origin used for canonical and social metadata. |
| `SITE_BASE_PATH` | `/` | Base path for a static host; the Docker example serves at `/`. |
| `SITE_DOCS_URL` | Repository documentation README | Set to the published documentation URL when that site is available. |
| `SITE_CONTACT_EMAIL` | `ivan.pelykh@protonmail.com` | Public contact address, explicitly approved for this website. |

These values are public build configuration, not secrets. Changing them requires a new
build. The get-started link opens the actual installation guide, not an unprovisioned
hosted signup page. The release decision illustration is labeled as an example.

## Deploy the static output

```bash
SITE_URL=https://caselog.tech pnpm site:build
```

Deploy **the entire `apps/site/dist/` directory** to your static host. Serve directory
URLs using their `index.html`, and return `404.html` with HTTP 404 for unknown paths.
Do not configure an SPA fallback. Keep `_astro/`, `assets/`, and license files with the
HTML. Publish atomically and retain the previous output for rollback.

The **Website** GitHub workflow builds, tests, and uploads the `caselog-website`
artifact. It does not publish or change DNS. Download that artifact for a static host,
or configure your hosting provider to run the same build from the repository root.
Set the build variables on the provider before enabling automatic deployment.

Do not deploy this site into the repository's existing GitHub Pages destination if it
is used for documentation: one repository Pages site cannot independently host both
artifacts at the same path. Use your main-domain host for this website and a separate
documentation destination or subdomain.

## Deploy with Docker on your own server

Build from the repository root; pin the checkout and choose a unique image tag:

```bash
docker build -f apps/site/Dockerfile \
  --build-arg SITE_URL=https://caselog.tech \
  -t caselog-site:YOUR_REVISION .
docker run -d --name caselog-site --restart unless-stopped \
  --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1:8081:8080 caselog-site:YOUR_REVISION
```

The image runs as UID 101, serves static files with Nginx, and has a `/healthz` check.
It requires no application secrets or database connection. The runtime needs a writable
`/tmp`, as supplied above. Point your public domain to the host, then configure the
existing TLS proxy. For example, with Caddy:

```caddyfile
caselog.tech {
  reverse_proxy 127.0.0.1:8081
}
```

Configure and test any `www` redirect separately if you use that hostname. On update,
start the new image on a second loopback port, check `/`, `/contact/`, and an unknown
path, then switch the proxy. Retain the old image/container until the new site is verified.
Only the public website changes; documentation and product deployments are separate.

The Docker example accepts `SITE_URL`, `SITE_DOCS_URL`, and `SITE_CONTACT_EMAIL` as
build arguments. For a subpath on a generic static host, build and test with matching
`SITE_BASE_PATH` values. Tests check links, mobile layout at 320/390 px, keyboard use,
the font, email destination, FAQ behavior without JavaScript, and real 404 responses.
