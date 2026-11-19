# Caselog roadmap

Product direction agreed on 2026-11-18. This roadmap describes planned work, not
capabilities already verified or a promise of launch dates. Complete each acceptance
checkpoint before marking its work done.

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

- [ ] Run repository checks, tests, builds, the critical browser journey, and deployment
  and recovery checks on the pinned toolchain; resolve launch-blocking defects.
- [ ] Rehearse clean installation and backup/restore with the documented runtime roles,
  tenant isolation, object storage, and SMTP configuration.
- [ ] Verify the first useful workflow: register, verify email, create a workspace and
  project, execute a run, ingest CI results, link an exact candidate, and inspect readiness.
- [ ] Verify missing, failed, stale, unauthorized, cross-tenant, and retry behavior in
  the pilot workflow, including evidence history and waivers.
- [ ] Record verified artifacts, compatibility, recovery instructions, and known limits
  before retaining real team data.

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
- [x] Ship the twelve stdio MCP operations and connection instructions described in the
  [MCP scenario guide](apps/docs/src/content/docs/automation/mcp.md).
- [x] Verify the guide's failure matrix and a real stdio → API → browser case workflow,
  policy lifecycle, tenant isolation, token revocation and database recovery compatibility.

**Agent-access acceptance:** documented tools work against the public API with scoped
tokens on the same self-hosted artifacts; concurrent retries create no duplicate records,
unauthorized/cross-tenant calls fail safely, published history remains immutable, and
repository checks, tests and builds pass. Remote transport and other agent operations
remain outside this extension.

Verified on 2026-11-19: `pnpm check`, `pnpm test`, `pnpm build` and both browser journeys
pass, including all twelve MCP operations. The additive migration passed on the existing
development database and empty browser-test databases. The main MVP/pilot checkpoints
above and below remain separate acceptance work.

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
