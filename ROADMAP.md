# Caselog roadmap

Product direction agreed on 2026-11-18; status reviewed on 2026-11-21. This roadmap
tracks implemented work and remaining acceptance, without promising launch dates.
Checked items have passed their stated checkpoint. Unchecked items may have working
foundations but still require implementation, verification or an operator decision.

## Current status

| Area | Implemented and verified | Remaining |
| --- | --- | --- |
| Core MVP | Workspace/project management, manual and automated testing, immutable candidates, policies, evidence, readiness and waivers; local checks, tests and automated deployment/recovery pass. | Independent operator rehearsal and a complete first-user journey on the deployment artifacts. |
| MCP | Fourteen tools, independent scopes, audit, replay-safe authoring and stdio → API → UI verification. | No further MCP expansion is scheduled; prioritize the baseline and pilot checkpoints below. |
| Self-hosted operations | Docker artifacts, runtime roles, digest-pinned SeaweedFS, S3 migration tooling and format-2 backup/restore pass the automated drill. | Independent operator rehearsal, durable artifact retention and operational recovery evidence. |
| Cloud pilot | Self-service workspaces, invitations, registration controls, billing-disabled operation and a managed workspace directory with owner contacts/resource snapshots exist. | Budget, measured resource limits, missing quota enforcement, deployment rehearsal and pilot terms. |
| Demand and monetization | Commercial direction is agreed. | Record pilot usage, costs and willingness to pay before deciding on a paid offer. |

## Product and business direction

Build a sustainable product that a solo maintainer can operate. Caselog connects
manual and automated testing to explainable readiness decisions for exact builds.
Keep the committed feature set closed while improving correctness, usability,
accessibility, performance, operations, and documentation.

- **Open source and self-hosted:** retain the complete core product under AGPL-3.0-only,
  with the standalone CLI under MIT. No license fee, Caselog account, license server,
  or proprietary control plane is required for self-hosting.
- **Cloud pilot:** offer free managed access to validate real team workflows and
  operating costs. Teams create isolated workspaces and invite colleagues without
  a subscription, payment card, or billing account. Managed billing stays disabled.
- **Future revenue:** reserve the option to offer paid managed hosting and services
  after validating demand and costs. Sell operation, capacity, and explicitly defined
  support while keeping the same core application artifacts, schema, migrations,
  and features available to self-hosted users.
- **Transparent transition:** no scheduled trial expiry or automatic paid conversion.
  Decide and communicate future commercial terms separately before offering paid access;
  do not promise unlimited free hosting or a permanent free cloud tier.
- **Separate boundaries:** a workspace remains the data tenant. A future billing account
  may group workspaces commercially but never grants access to their content.

Start by testing the audience hypothesis: small product teams combining manual testing
with CI that need a clear release decision. A fixed monthly workspace package with
included resources is a pricing hypothesis; prices, allowances, paid tiers, and payment
integration remain undecided.

## 1. Verify the existing MVP and self-hosted baseline

### Implemented and locally verified

- [x] Implement registration, email verification, isolated workspaces, explicit ownership,
  projects, membership roles and invitations; verify the API authorization boundaries.
- [x] Implement suites, nested sections, versioned test cases, CSV import, manual runs
  with case-version snapshots, results and JUnit ingestion.
- [x] Implement immutable release candidates, normalized evidence, versioned policies,
  readiness evaluation, freshness handling, decision history and audited waivers.
- [x] Allow owners, admins and leads to edit Draft/Active release metadata, including
  adding a missing environment; verify tenant/project boundaries through API tests and
  version conflicts, terminal-state protection and immutable history through the browser.
- [x] Configure priority-scoped test coverage, separate WCAG 2.2 AA automated/manual
  evidence and Lighthouse profiles with pinned sources, pages, tool versions and device
  settings. Verify frozen case/version scope, report matching and minimum page medians;
  edit drafts or create successors without changing published gate inputs or decisions.
- [x] Simplify accessibility to manual candidate reviews: standard, pages, required keyboard
  and screen-reader checks, multiple tools and attached reports; verify corrections,
  conflict handling, tenant isolation and report downloads through API and browser.
- [x] Replace new-gate presets with one bounded form builder: names, descriptions,
  required/optional typed fields, checkbox/number/choice conditions and native priority-scoped
  test results. Verify report-backed candidate responses, concurrency, immutable history,
  legacy compatibility and end-to-end UI authoring before marking this checkpoint complete.
- [x] Verify missing/failed/stale evidence, unauthorized and cross-tenant access,
  idempotent retries and history preservation in the relevant API/integration suites.
- [x] Run `pnpm check`, `pnpm test` and `pnpm build` on the pinned toolchain; verify the
  CI → candidate → readiness → waiver/history and MCP authoring browser journeys.
- [x] Provide self-hosted Docker artifacts, configuration tooling, separate runtime
  roles, offline backup/restore scripts and installation/recovery runbooks.
- [x] Replace bundled MinIO with digest-pinned SeaweedFS in development, CI and
  production Compose; verify S3 contracts, attachment workflows, copy-and-verify migration
  and same-version physical recovery without reusing MinIO volumes.
- [x] Provide the public documentation site, product website, REST/OpenAPI contracts,
  CLI and CI examples. Local builds pass; publication is a separate operator action.

Local verification at `cad0338`: 673 tests and both browser journeys passed on
2026-11-19. The MCP scope migrations passed on existing and empty databases. Existing
lint and component CSS-budget warnings remained; those checks did not establish deployed
capacity or successful recovery of that revision's application images.

Automated verification on 2026-11-20: 760 tests, all five browser journeys, `pnpm check`
and `pnpm build` passed with SeaweedFS. The Docker drill passed clean install, TLS/SMTP/S3,
runtime isolation, format-2 backup/restore, immutable history and object/queue preservation,
including rejection of corrupt backups and nonempty restore targets. This host required
`COMPOSE_BAKE=false COMPOSE_PARALLEL_LIMIT=1` for image builds after a parallel-export
snapshot error. Real MinIO-to-SeaweedFS fixture migration passed, including replay,
metadata/checksum verification and conflict/missing/extra-object rejection. Existing
lint, CSS-budget and PostgreSQL-client deprecation warnings remain.

Release-editing verification on 2026-11-21: `pnpm check`, all 786 tests and `pnpm build`
passed. An isolated Chromium journey verified missing-environment correction, persistence,
mobile layout, independent-client conflict recovery, terminal-state protection and
unchanged candidate/lifecycle/decision history. No database migration is required.

Quality-policy verification on 2026-11-21 covers 815 tests, `pnpm check`, `pnpm build`
and seven Chromium journeys across self-hosted and managed modes. Empty-database and
existing-database migration checks pass. Apply `20261121190000_quality_policy_scopes`
before new artifacts; drain old evaluator jobs before stopping old workers and upgrading. The core
now supports frozen priority coverage, WCAG reports, Lighthouse profiles and policy
draft/successor editing; scanners and environment-based assignment remain outside scope.


Manual-accessibility verification on 2026-11-21 covers all 833 tests, `pnpm check`,
`pnpm build` and seven Chromium journeys across self-hosted and managed modes. The
accessibility journey verifies simple policy requirements, human Not OK → OK corrections,
multiple tools, report uploads/downloads, review history and mobile layout. PostgreSQL/API
coverage verifies missing evidence, required checks, checksum failures, retries, competing
reviewers, role/token boundaries, tenant/project/candidate isolation and unchanged historical
decisions. Migration `20261121210000_manual_accessibility_reviews` passes on an existing
local database and disposable empty databases. New evaluations use evaluator 1.2.0;
legacy WCAG policy versions and decisions retain their original meaning.

Custom-gate verification on 2026-11-22 covers all 849 tests, `pnpm check`, `pnpm build`
and seven Chromium journeys across self-hosted and managed modes. The form journey
builds and edits a custom policy, combines native priority-scoped tests with manual
answers, uploads/downloads reports and verifies failed-to-passed corrections and history
on a narrow viewport. API/PostgreSQL coverage proves roles/token restrictions, report
and tenant isolation, replay, concurrent corrections, audit and unchanged published
versions/decisions. A failed immediate enqueue preserves the accepted response and recovers
through the durable revision event. Migration `20261122100000_custom_gate_forms` passes
on the existing local database and disposable empty databases. New decisions use evaluator
1.3.0; existing gates remain available through explicit legacy retention/replacement.

### Operational acceptance

- [x] Run `pnpm test:deployment` for the current revision, including Docker image builds,
  TLS/SMTP/S3 transfers, runtime role isolation and same-version recovery; resolve defects.
- [ ] Rehearse clean installation and backup/restore with the documented runtime roles,
  tenant isolation, object storage and SMTP configuration. Restore into a separate
  installation and record the backup timestamp, recovery duration and exact image IDs.
- [ ] Verify the first useful workflow: register, verify email, create a workspace and
  project, execute a manual run, ingest CI results, link an exact candidate and inspect
  readiness on the deployment artifacts. Existing browser journeys start with demo users;
  API tests of individual steps do not complete this first-user deployment checkpoint.
- [ ] Record verified artifacts, compatibility, recovery instructions, and known limits
  before retaining real team data. The runbooks and compatibility policy are written;
  independent operator evidence and durable artifact retention remain to be completed.

**Acceptance checkpoint:** the documented installation and critical workflow pass end
to end; recovery succeeds into a separate installation, tenant boundaries are proven,
and operational limitations match the published documentation. Self-hosting works
without managed billing or a Caselog control plane.

## 2. Prepare a bounded free cloud pilot

### Approved agent-access extension (2026-11-19)

- [x] Add scoped API access for project discovery, test-case reads/writes, and separate
  policy reads, authoring and publishing; expose the scopes in workspace token settings.
- [x] Make agent case writes replay-safe while preserving existing browser clients and
  optimistic version conflicts.
- [x] Ship the fourteen stdio MCP operations and connection instructions described in the
  [MCP scenario guide](apps/docs/src/content/docs/automation/mcp.md).
- [x] Add independent `structure:write` access and replay-safe suite/section creates,
  preserving browser compatibility and enforcing tenant/project/parent ownership.
- [x] Verify nested structure → case → UI authoring, policy lifecycle, tenant isolation,
  token revocation, concurrent replay and additive migration compatibility.

**Agent-access acceptance:** documented tools work against the public API with scoped
tokens on the same self-hosted artifacts; concurrent retries create no duplicate records,
unauthorized/cross-tenant calls fail safely, published history remains immutable, and
repository checks, tests and builds pass. Remote transport and other agent operations
remain outside this extension.

Completed in `26168f2` and `cad0338`, with the local verification recorded in section 1.
These checks do not complete the deployment/recovery or cloud-pilot checkpoints.

### Implemented pilot foundations

- [x] Support public or invitation-only registration, email verification, workspace
  self-service and explicit colleague invitations with membership/role enforcement.
- [x] Keep managed billing disabled for the pilot; workspace creation requires no
  billing account, payment card or subscription and has no scheduled paid transition.
- [x] Implement storage usage accounting, pending-upload safety checks, bounded JUnit
  parsing and optional workspace provisioning limits; workspace count is unlimited by
  default. These controls do not provide a measured total storage or ingestion quota.
- [x] Implement private metrics, structured logging, bounded background retries,
  dead-letter support and reconciliation. Pilot alerting and incident drills remain open.

- [x] Verify the approved managed staff workspace directory: owner contacts, state
  filters and timestamped resource snapshots, with live staff authorization, unchanged
  tenant isolation and a managed API → browser journey. Counts do not measure engagement.

Staff-directory acceptance passed locally on 2026-11-20: PostgreSQL/API isolation and
revocation checks, UI state tests, managed browser discovery/detail/refresh/mobile
coverage and existing self-hosted MCP/readiness journeys. The additive migration ran
on existing and disposable empty databases. Deployment and pilot operations remain open.

### Administration improvements (2026-11-20)

The first implementation slice extends the existing read-only metadata console.
Follow-ups below are proposed priorities, not permission to introduce unapproved
access rules, telemetry, quotas, customer-content access or paid behavior.

- [x] Add user cards with verification/deletion states, paginated workspace roles,
  user → workspace → owner navigation, scoped caches, API/SQL authorization and a
  managed browser journey. See the [user-card decision](architecture/decisions/20261120-staff-user-directory.md).
- [x] Preserve directory search, filters and pagination on return from a card; support
  shareable URLs and browser back/forward without confusing pending and empty states.
- [x] Filter staff audit by actor, action, target and time range, retaining owner-only
  access and append-only records. Keep pagination bounded and deterministic.
- [ ] Define and expose read-only operational summaries for failed ingestion, job
  retries/dead letters and storage reconciliation without job payloads or customer data.
- [ ] Show effective configured safety limits alongside measured usage after the
  pilot's resource model and enforcement are defined; do not invent paid allowances.
- [ ] Agree collection, retention and definitions for activation/repeat-use metrics
  before adding usage history or engagement telemetry. Existing counts are resources.
- [ ] Define workspace suspension/resumption, its effects on UI/API/CI/jobs, recovery,
  customer notification, authorization, reason and audit before implementing it.
- [ ] Define customer-visible, scoped and expiring support access before implementation.
  Hidden impersonation remains forbidden. Billing remains deferred to section 4.

User-card acceptance requires metadata-only contracts, unknown/empty/deleted cases,
removed-membership exclusion, pagination, live role/expiry/revocation checks in HTTP
and SQL, unchanged tenant RLS, self-hosted denial and successful repository/browser
verification. This slice passed locally on 2026-11-20: `pnpm check`, 716 tests,
`pnpm build` and the managed browser navigation/mobile/unknown-record journey. The
additive migration passed on an existing database and an empty disposable database.
Other administration follow-ups and deployment/pilot acceptance remain open.

Navigation/audit acceptance passed locally on 2026-11-20: repository checks, builds,
752 tests across the workspace/tool suites, and all three managed staff browser
journeys, including shared links, reload/back/forward, owner-only audit filtering and
UTC boundary validation. The additive audit projection migration passed on existing
and empty disposable databases. See the [navigation/audit decision](architecture/decisions/20261120-staff-navigation-audit-filters.md).

### Pilot operations

- [ ] Set a pilot infrastructure budget, initial cohort size, and support expectations
  that one maintainer can sustain. Aim initially for 3–5 teams.
- [ ] Measure representative workloads and publish operational limits before onboarding:
  total attachment storage including pending reservations, ingestion volume, heavy-job
  concurrency, and registration/invitation traffic. Set exact values from measurements.
- [ ] Implement and verify any missing resource enforcement. Existing pending-upload
  limits and storage usage counters do not establish a total storage quota or an
  ingestion allowance. Keep deployment safety configuration independent of payment;
  self-hosted workspace creation remains unlimited by default.
- [ ] Verify quota boundaries under concurrent requests and retries. Reject excess work
  with stable API errors and actionable UI messages; never silently discard accepted
  results, change readiness outcomes, or erase historical evidence to meet a quota.
- [ ] Verify invitation-based cohort onboarding and workspace self-service, with explicit
  memberships, billing disabled, and no payment setup. Expand public registration only
  after the same protections are verified.
- [ ] Rehearse monitoring, bounded background retries, failed-job handling, backups,
  recovery, and incident communication for the actual pilot deployment.
- [ ] Publish pilot terms covering resource limits, data handling, retention, support,
  leaving the service, and any planned closure or future commercial offer. Verify how
  teams can retrieve their data; retention must preserve decision reproducibility.

**Acceptance checkpoint:** a pilot team can complete a real release workflow on a
verified deployment within published limits. Resource enforcement and recovery work,
costs are observable, accepted history remains intact, and access requires no payment.
Hosting publication and deployment require a separate explicit operator action.

## 3. Validate repeat use, costs, and willingness to pay

- [ ] Onboard the initial teams with one real project each; observe where setup fails
  or the testing/readiness model is unclear.
- [ ] Track activation, return for a subsequent release, practical use of readiness,
  and why teams leave. Agree measurement and data handling with participants.
- [ ] Measure database growth, object storage, background processing, email, backups,
  and maintainer support time per active workspace.
- [ ] Ask participating teams whether they would pay for continued managed hosting,
  which service commitments matter, and whether self-hosting better fits their needs.
- [ ] Prioritize defects and improvements to the existing workflow using that evidence.

**Acceptance checkpoint:** document observed repeat use, operating and support costs,
and concrete willingness-to-pay feedback. Choose to continue validation, revise the
audience or offer, pause onboarding, or prepare a commercial proposal. Signups alone
do not establish demand.

## 4. Decide whether to offer paid managed hosting

- [ ] Review evidence from the pilot and explicitly approve or defer a paid offer.
- [ ] If approved, define the service, workspace package, resource allowances, pricing,
  support commitments, and whether a bounded free cloud tier is sustainable.
- [ ] Define how existing pilot teams can opt in, remain on any offered free tier, or
  leave and retrieve their data. Communicate terms before changes take effect.
- [ ] Specify billing lifecycle, consent, cancellation, payment failures, and account
  grouping before implementing subscriptions. Preserve independent tenant authorization.
- [ ] Implement and verify only the approved commercial scope. Consider self-hosted
  installation or maintenance services separately when there is concrete demand.

**Acceptance checkpoint:** an approved commercial decision and compatibility plan exist,
the agreed lifecycle is verified end to end, core self-hosted functionality remains
available, and no pilot participant is charged without opting in. Until then, keep
managed billing disabled and make no paid launch commitment.

## Next work, in dependency order

1. Complete section 1's independent operator rehearsal, artifact retention and first-user journey;
   record the exact revision, image IDs, results and remaining limitations.
2. Measure representative pilot workloads, agree the infrastructure budget and limits,
   then implement and verify the missing resource enforcement in section 2.
3. Rehearse invitation-only pilot operations and publish the agreed terms before
   onboarding the first teams. Keep deployment/publication as explicit operator actions.
4. Use real repeat usage and cost evidence from section 3 to decide whether section 4
   should proceed. Additional MCP tools and billing integration are not prerequisites.
