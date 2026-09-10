# Copyright and third-party notices

Copyright (c) 2026 Caselog contributors.

Except where a file or subdirectory states otherwise, Caselog's server, web application,
shared schemas, deployment scripts and documentation are licensed under the GNU Affero
General Public License, version 3 only (`AGPL-3.0-only`). See [LICENSE](LICENSE). The
license's appendix includes a generic “or later” example; this project's grant is version
3 only, as stated here and in workspace manifests. The software comes without warranty.

The standalone CLI in `apps/cli` is licensed under its [MIT license](apps/cli/LICENSE).
Third-party dependencies and fonts retain their respective licenses. The Caselog name
and marks are covered separately by [TRADEMARKS.md](TRADEMARKS.md).

## Bundled assets

| Asset | Source and notice | License |
| --- | --- | --- |
| Figtree Latin font | Copyright 2022 The Figtree Project Authors; [bundled notice](apps/web/public/fonts/OFL.txt), [upstream](https://github.com/erikdkennedy/figtree) | SIL OFL 1.1 |
| IBM Plex Mono | Copyright 2017 IBM Corp.; supplied through pinned `@fontsource/ibm-plex-mono`; [upstream](https://github.com/IBM/plex) | SIL OFL 1.1 |
| Caselog SVG/raster marks and favicon | Project brand artwork in `apps/web/public` and the shared brand component | AGPL-3.0-only; trademark rights are not granted by the software license |
| Demo/test fixtures | Synthetic project fixtures in the repository; never substitute customer exports or third-party copyrighted reports | AGPL-3.0-only, except CLI fixtures under its MIT license |
| Generated OpenAPI and Angular types | Generated from Caselog contracts; kept with their source and regeneration commands | AGPL-3.0-only |

Production Angular builds generate `3rdpartylicenses.txt`, including the IBM Plex Mono
notice. The web image serves this file, the root license and a source archive alongside
the UI. The API image retains dependency license files and the corresponding project
source archive. Container base images, PostgreSQL and MinIO are independent upstream
artifacts with their own notices and source-distribution terms; retain those when
redistributing a complete deployment. A pinned dependency version is not a blanket
license approval for a future replacement or update.

The static documentation site in `apps/docs` emits `third-party-licenses.txt` for its
Vite bundles and includes `pagefind-LICENSE.txt` for the generated search runtime.
The latter preserves the [Pagefind 1.5.2 upstream license](https://github.com/Pagefind/pagefind/blob/v1.5.2/LICENSE).
Keep these files, the project license, and source links with the complete site output.

Lockfile review on 2026-09-10 used `pnpm licenses list --prod --json` and the installed
package notices. The sole `Unknown` metadata entry, `pause@0.0.1`, includes its MIT grant
and TJ Holowaychuk copyright in `Readme.md`; preserve that file. `elkjs@0.11.1` is EPL-2.0
and arrives through the Prisma CLI/Studio peer dependency, not the Caselog UI. Its license
is retained with that package; corresponding upstream source and build instructions are
at [kieler/elkjs](https://github.com/kieler/elkjs). Other resolved notice families include
MIT/MIT-0, Apache-2.0, ISC, BSD, Blue Oak, Python-2.0, OFL-1.1 and Unlicense. Repeat the
inventory and review changed notices when updating the lockfile.

## Source availability

The supported Docker web artifact offers `Source code` and `License` links in its footer.
`/caselog-source.tar.gz` contains the build-context application source, schema, migrations,
lockfile and build/deployment instructions; `/LICENSE.txt` and `/3rdpartylicenses.txt`
contain the associated notices. Build only from a reviewed checkout and keep these files
with the images. Local Angular development builds are not distribution packages; use the
Docker artifacts for deployment and source delivery. If you modify or redistribute the
application, preserve the applicable notices and provide the corresponding source for
that actual version. The complete license defines the conditions.

The root license text is reproduced verbatim from the
[SPDX AGPL-3.0-only text](https://spdx.org/licenses/AGPL-3.0-only.html).
