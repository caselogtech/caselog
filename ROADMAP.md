# Caselog roadmap

Product direction agreed on 2026-11-18; status reviewed on 2026-11-20. This roadmap
tracks implemented work and remaining acceptance, without promising launch dates.
Checked items have passed their stated checkpoint. Unchecked items may have working
foundations but still require implementation, verification or an operator decision.

## Current status

| Area | Implemented and verified | Remaining |
| --- | --- | --- |
| Core MVP | Workspace/project management, manual and automated testing, immutable candidates, policies, evidence, readiness and waivers; local checks and tests pass. | Current-version clean-install/recovery drill and a complete first-user journey on the deployment artifacts. |
| MCP | Fourteen tools, independent scopes, audit, replay-safe authoring and stdio → API → UI verification. | No further MCP expansion is scheduled; prioritize the baseline and pilot checkpoints below. |
| Self-hosted operations | Docker artifacts, runtime roles, configuration tooling, backup/restore scripts and runbooks exist. | Rehearse the current revision, retain exact artifacts and record recovery evidence. |
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
- [x] Verify missing/failed/stale evidence, unauthorized and cross-tenant access,
  idempotent retries and history preservation in the relevant API/integration suites.
- [x] Run `pnpm check`, `pnpm test` and `pnpm build` on the pinned toolchain; verify the
  CI → candidate → readiness → waiver/history and MCP authoring browser journeys.
- [x] Provide self-hosted Docker artifacts, configuration tooling, separate runtime
  roles, offline backup/restore scripts and installation/recovery runbooks.
- [x] Provide the public documentation site, product website, REST/OpenAPI contracts,
  CLI and CI examples. Local builds pass; publication is a separate operator action.

Local verification at `cad0338`: 673 tests and both browser journeys passed on
2026-11-19. The MCP scope migrations passed on existing and empty databases. Existing
lint and component CSS-budget warnings remain; these checks do not establish deployed
capacity or successful recovery of the current application images.

### Operational acceptance still open

- [ ] Run `pnpm test:deployment` for the current revision, including Docker image builds,
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
  current deployment evidence and artifact retention remain to be completed.

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

1. Complete section 1's current-version deployment/recovery drill and first-user journey;
   record the exact revision, image IDs, results and remaining limitations.
2. Measure representative pilot workloads, agree the infrastructure budget and limits,
   then implement and verify the missing resource enforcement in section 2.
3. Rehearse invitation-only pilot operations and publish the agreed terms before
   onboarding the first teams. Keep deployment/publication as explicit operator actions.
4. Use real repeat usage and cost evidence from section 3 to decide whether section 4
   should proceed. Additional MCP tools and billing integration are not prerequisites.
