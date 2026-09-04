# Caselog Agent Guide

This file is the repository-level working agreement for coding agents and contributors.
It applies to the entire repository. More specific `AGENTS.md` files may add rules for a
subtree, but they must not weaken the architecture, tenancy, security, or Definition of
Done defined here.

## 1. Product intent

Caselog is an open-source, self-hostable release-readiness platform with built-in manual
and automated test management. Its primary product question is:

> Can this immutable release candidate be promoted safely, why, and what is blocking it?

Keep these invariants visible in every design:

- a release candidate identifies an exact build or commit and is immutable;
- evidence, policy, evaluation, decision, approval, and waiver are separate records;
- readiness decisions are deterministic, explainable, and historically reproducible;
- source modules remain systems of record; readiness consumes public contracts;
- the complete core product works self-hosted without a Caselog account, license server,
  or proprietary control plane;
- a future managed service must run the same application artifacts, schema, migrations,
  and core features as the self-hosted product;
- the managed shared-service launch offer is USD 199 per billing account/month, with
  unlimited users, workspaces, projects, and product features plus explicit allowances for
  cost-driving usage;
- a billing account is a commercial grouping above workspaces, never a tenant or an
  implicit source of workspace access;
- API and CLI behavior are first-class product surfaces, not secondary wrappers around UI;
- implement validated product scope only; avoid speculative integrations and generic
  platform abstractions;
- the committed feature set is intentionally closed while it is hardened; prioritize
  correctness, UX, accessibility, performance, operability, and documentation over new
  feature categories.

## 2. Sources of truth

The current user request defines the task and may explicitly change repository policy.
Within the repository, follow this order when rules conflict and correct the inconsistency
in the same change:

1. an accepted ADR for its specific irreversible decision;
2. `ARCHITECTURE.md` for boundaries, layers, and dependency direction;
3. this file for repository-wide agent behavior;
4. `README.md`, workspace manifests, configuration, and executable scripts for commands;
5. an accepted issue or task description for the change's scope.

The local `docs/` directory contains detailed product, roadmap, design, development, and
Definition of Done material. Read the relevant documents when they are available, but
`docs/` is intentionally ignored and must not be staged or committed unless the user
explicitly changes that policy. Keep this file and `ARCHITECTURE.md` self-contained enough
for work from a fresh clone.

Visual references guide look and feel only. They never override domain behavior,
accessibility, API contracts, or committed scope.

## 3. How we work

- Communicate with the user in Ukrainian unless they request another language. Keep code,
  identifiers, committed technical documentation, API messages, and product copy in
  English.
- Before editing, inspect the smallest relevant code path, its tests, public contract,
  architecture rules, and current Git state. Reading files is part of safe implementation.
- Work in logical dependency order rather than time-boxed phases. Finish and verify one
  coherent vertical slice before starting the next.
- Prefer a reasonable, documented assumption when it is easy to reverse. Ask before a
  choice that materially changes product behavior, architecture, public contracts, data,
  cost, security, or external state.
- Keep scope focused. Do not bundle unrelated cleanup into a feature or fix.
- Prefer readable, explicit code and the smallest design that protects a real boundary.
  Do not add patterns, layers, classes, dependencies, or configuration for appearance.
- Preserve existing user changes. Never overwrite, delete, format, stage, or commit files
  unrelated to the current task.
- Diagnose root causes. A workaround is acceptable only when its limitation is explicit
  and a proper correction is out of scope.
- Update applicable local roadmap checkboxes only after the acceptance checkpoint passes.
  Never mark partial implementation as complete.
- Complete safe in-scope implementation and verification autonomously. Do not publish,
  deploy, push, or mutate third-party systems unless the user explicitly asks.

## 4. Technology baseline

Use repository-pinned tools and existing libraries:

- Node.js `24.18.0` from `.nvmrc`;
- pnpm `10.15.0` from the root `packageManager` field;
- Angular 22 with standalone components;
- NestJS 11 on Fastify;
- Prisma 7 and PostgreSQL 16;
- S3-compatible object storage;
- TypeScript strict mode;
- Vitest for workspace tests and Playwright for browser journeys when configured.

Use pnpm, not npm or Yarn. Do not replace an established library or architectural choice
without a concrete need and an accepted decision.

Common local commands:

```bash
corepack enable
pnpm install
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Common verification commands:

```bash
pnpm check
pnpm test
pnpm build
```

## 5. Architectural standard

Caselog is a feature-first modular monolith. Keep one deployable backend and one database
until measured scaling or isolation requirements justify something else. Group code by
business capability and behavior, not by database table or framework type.

Dependencies flow in one direction:

```text
presentation -> application -> domain
                    |
                    +-> infrastructure -> domain

feature -> core / common / @caselog/schemas
feature A -> feature B public API only
```

Mandatory rules:

- every module uses the same structure from its first file; small modules are not flat;
- `core` owns application-wide infrastructure and cannot import a feature;
- `common` contains only small, stable primitives and cannot become a helper dump;
- a feature never imports another feature's internal directory, repository, persistence
  type, controller, or helper;
- cross-module synchronous work uses the owner's `public-api.ts` contract;
- cross-module asynchronous reactions use stable past-tense integration events and a
  durable outbox/job boundary;
- cyclic dependencies and `forwardRef()` are forbidden; correct the boundary instead;
- external systems are behind narrow application ports and infrastructure adapters;
- use pure typed functions for calculations, parsing, mapping, matching, and transitions
  that do not need I/O or dependency injection. Do not create classes solely for OOP.

## 6. Backend module layout

Every backend feature follows this layout:

```text
<feature>/
  <feature>.module.ts
  public-api.ts
  presentation/
    controllers/
    dto/
    guards/
    decorators/
    workers/
  application/
    services/
    ports/
  domain/
    models/
    policies/
  infrastructure/
    repositories/
    adapters/
    strategies/
  tests/
    unit/
    integration/
    e2e/
```

Do not commit empty directories. Only the Nest composition root and optional
`public-api.ts` may be production files directly in a feature root.

Layer responsibilities:

- `presentation` validates transport input, extracts context, calls one application use
  case, and maps the output. It contains no business decisions, Prisma queries, or tenant
  authorization decisions.
- `application` authorizes and orchestrates use cases, coordinates repositories and ports,
  and throws domain errors. It knows neither HTTP status codes nor raw Prisma clients.
- `domain` contains framework-free models, policies, calculations, and state transitions.
- `infrastructure` contains Prisma repositories, persistence mapping, external adapters,
  strategies, and feature-specific configuration.
- `tests` mirrors the production responsibility under `unit`, `integration`, or `e2e`;
  do not scatter new test files beside production files.

Repositories may contain Prisma queries and parameterized SQL because persistence is their
responsibility. They must not contain business decisions. Prefer Prisma for ordinary CRUD.
Raw SQL is justified only for locks, bulk operations, RLS context, PostgreSQL features, or
measured performance. Unsafe raw-query APIs are forbidden.

Split code by responsibility and reason to change, not arbitrary line counts. A file near
300–400 lines or a function near 50–60 lines triggers review. Split when transport,
orchestration, persistence, parsing, mapping, or independent rules are mixed. Do not trade
one cohesive file for several meaningless wrappers.

## 7. Multi-tenancy, authorization, and security

Tenant isolation is a system invariant:

- tenant-owned records include `organization_id`; project-owned data also carries the
  appropriate project identity;
- every tenant repository public method requires `organizationId`;
- use `TenantDatabaseService` to set the transaction-local tenant context;
- PostgreSQL RLS protects every tenant-owned table;
- tenant SQL also includes an explicit `organization_id` predicate;
- cross-tenant access must behave as not found and be proven at API, repository, and RLS
  levels where applicable;
- tenant context comes from the authenticated principal, never from a trusted body field;
- authorization is enforced server-side; hidden UI controls are convenience only.

Managed billing uses a separate hierarchy:

```text
Billing account / company -> workspace / organization -> project
```

Billing-account membership authorizes commercial administration only. It never replaces
workspace membership, organization tokens, repository tenant context, or RLS. A workspace
created under an account still receives an explicit owner. Self-hosted workspaces may have
no billing account. Prices and allowances belong to product documentation and managed
configuration; never hard-code them into readiness, test-management, or tenant-domain
behavior. Logical workspace count is unlimited by default. Any deployment safety limit
must be explicit, validated configuration rather than a product or licensing restriction.

Managed cloud administration uses a third, independent authorization boundary. The
`staff` module owns expiring operator grants and global operational metadata. Staff roles
never imply billing-account or workspace membership, and the staff console must not read
customer test cases, results, evidence, attachments, or secrets through an implicit bypass.
Privileged mutations require an explicit reason and append-only staff audit. Self-hosted
mode keeps the managed staff API and UI unavailable. Support access to customer content or
impersonation requires a separate, customer-visible, time-bounded design; never add a hidden
“log in as user” shortcut.

Never place secrets, tokens, credentials, raw sensitive evidence, or unnecessary PII in
source, fixtures, logs, errors, or commits. Validate and bound all external input, parsing,
uploads, bulk operations, and pagination. Audit sensitive and destructive actions.

## 8. Persistence, migrations, and asynchronous work

- Use `snake_case` for database identifiers, UTC `timestamptz` for instants, and ISO 8601
  at public boundaries.
- Protect durable invariants with constraints and tenant-prefixed indexes, not application
  memory alone.
- Evidence, policy versions, evaluations, readiness decisions, audit records, approvals,
  and waivers are append-only according to their domain contracts. Corrections supersede;
  they do not rewrite history.
- Use committed Prisma migrations. Never use `db push` or manual production schema edits
  as a migration workflow.
- Migrations must work on empty and realistic existing databases. Define rollback or
  roll-forward recovery in proportion to risk; make backfills bounded and idempotent.
- A repository owns its atomic transaction by default. Introduce an explicit module-level
  unit of work for an operation spanning repositories; never leak a Prisma transaction
  client into controllers.
- Jobs and event handlers are tenant-scoped, idempotent, bounded, retry-safe, observable,
  and safe for duplicate, delayed, concurrent, and out-of-order delivery.
- Use bounded retries, explicit permanent-failure handling, a dead-letter path, and
  reconciliation. Background work must not make stale data look current.

## 9. API and shared contracts

- REST endpoints use the `/api/v1` prefix, plural resources, explicit DTOs, and shared Zod
  schemas from `packages/schemas`.
- Never expose Prisma entities as response contracts.
- Growing collections use cursor pagination with deterministic ordering and limits.
- Retryable writes define `Idempotency-Key` scope, replay behavior, and conflicts.
- Errors use stable machine-readable codes, concise English fallback messages, safe
  details, and a request identifier. Never expose raw exceptions or tenant existence.
- Everything available through the UI must be possible through the public API.
- CLI JSON and exit codes are versioned public contracts.
- After a public endpoint or schema change, run `pnpm openapi:generate` and commit both the
  OpenAPI document and generated Angular types.
- Breaking or expensive-to-reverse API, schema, security, deployment, or domain decisions
  require an ADR and a compatibility/migration plan.

## 10. Frontend and design standard

Every Angular feature follows this layout from its first file:

```text
features/<feature>/
  <feature>.routes.ts
  public-api.ts
  pages/
  components/
  data-access/
  domain/
  state/
  tests/
```

Do not commit empty directories. `core` and `shared` cannot import features. Cross-feature
imports use a deliberate `public-api.ts`; implementation directories stay private.

Angular conventions:

- use standalone components, `inject()`, modern control flow, OnPush change detection,
  signals for local UI state, and RxJS for genuine asynchronous streams;
- route pages orchestrate; focused components render and emit user intent;
- data-access services own HTTP and runtime validation; components never call
  `HttpClient` directly;
- use generated API contracts and explicit view-model mapping rather than duplicate
  transport interfaces;
- do not duplicate server state or calculate release gate outcomes in the browser;
- move UI to `shared` only after it has stable reuse and no feature-specific meaning;
- preserve input on recoverable failures and define rollback for optimistic updates.

Use the established Framed Log visual language, logo, CSS tokens, and components. Extend
the design system before introducing one-off colors, spacing, typography, radii, or
shadows. Every page-level `main` uses the shared `--content-gutter` token, currently
`clamp(16px, 5vw, 96px)`, unless a documented split-layout rule applies.

Meet WCAG 2.2 AA intent: keyboard operation, visible focus, semantic landmarks and labels,
announced async state, logical focus movement, reduced motion, responsive layouts, and at
least 4.5:1 text contrast. Color is never the only status channel. Muted text must remain
clearly readable on gray surfaces.

Implement relevant loading, empty, validation, forbidden, not-found, offline, server-error,
background-pending/failed, stale, unknown, and waived states. Loading must not flash as an
empty result.

Product UI is English-only for now, but every user-visible string uses a stable semantic
Transloco key. Maintain only the English catalogue; do not add a language switcher until a
second language is committed. Use sentence case and concise, actionable messages.

## 11. TypeScript and naming

- Keep `strict` and `noUncheckedIndexedAccess` enabled.
- Avoid `any`; accept `unknown` at untrusted boundaries and validate before narrowing.
- Do not use assertions merely to silence the compiler.
- Use `PascalCase` for types and classes, `camelCase` for values and functions,
  `SCREAMING_SNAKE_CASE` for true constants, and kebab-case role-specific filenames.
- Prefer named exports, early returns, small functions, and explicit inputs and outputs.
- Comments explain non-obvious intent, invariants, or external constraints—not syntax.
- Do not create vague `utils.ts`, `helpers.ts`, `manager.ts`, or `common.ts` dumping grounds.
- Match existing formatter and lint output; do not hand-format against repository tooling.

## 12. Testing and verification

Test at the lowest layer that proves the behavior, then add boundary coverage according to
risk:

- domain unit tests for pure rules, parsers, state transitions, and decision tables;
- application tests for orchestration and ports where isolation adds value;
- real-PostgreSQL integration tests for repositories, transactions, constraints, RLS, and
  SQL;
- API/E2E tests for contracts, authorization, tenant isolation, and critical workflows;
- Angular tests for components, mapping, data access, state, and system states;
- a small set of Playwright journeys for critical cross-stack behavior;
- benchmarks/load tests for ingestion, projections, large lists, and hot queries.

Mock external boundaries such as Jira, SMTP, or S3 failure modes; do not mock internal
services into confirming their own assumptions. Add a regression test for a defect when
practical. Flaky tests are defects—fix the cause instead of adding blind retries.

Verification must be proportional to the change:

- while iterating, run focused tests and type/lint checks for the affected workspace;
- before a coherent code change is called complete, run `pnpm check` and relevant tests;
- run `pnpm test` and `pnpm build` for broad, cross-workspace, dependency, build, or release
  changes;
- validate migrations against real PostgreSQL and run OpenAPI generation/drift checks when
  those contracts change;
- documentation-only changes require at least formatting/link/path review and
  `git diff --check`; they do not require unrelated application tests.

Never claim a check passed unless it was executed. Report skipped or blocked verification
and the reason.

## 13. Definition of Done

A change is Done only when all applicable statements are true:

1. Scope and acceptance behavior are explicit, including invalid, missing, unauthorized,
   cross-tenant, retry/concurrency, and boundary behavior where relevant.
2. One module clearly owns the behavior and every file follows the mandatory layout and
   dependency direction.
3. Domain logic is separated from HTTP, ORM, queues, and rendering; no cross-module
   internals or foreign tables are accessed.
4. Tenant context, authorization, constraints, RLS, secrets, audit, and input bounds are
   handled and tested in proportion to risk.
5. Data lifecycle, migration, compatibility, idempotency, recovery, and observability are
   complete where applicable.
6. API, generated contracts, CLI, and UI agree; user-visible copy and error states are
   complete and accessible.
7. Focused tests cover the change, required repository-wide checks pass, and verification
   evidence is honestly reported.
8. Relevant tracked documentation, examples, ADRs, and architecture contracts match the
   implementation.
9. The change is reviewable, contains no unrelated files or secrets, and its coherent
   commit is independently understandable.

A rendered page, happy-path endpoint, unit test, or green CI alone is not Done. A roadmap
item is complete only after its acceptance checkpoint passes end to end.

## 14. Git and repository hygiene

- Check `git status --short` before and after work. Treat all pre-existing modifications
  and untracked files as user-owned unless the current task clearly created them.
- Never stage or commit `.env`, `.env.local`, secrets, runtime data, ignored `docs/`, or
  editor state such as `.vscode/`.
- Do not use destructive Git commands, broad restores, or history rewriting without an
  explicit request and verified targets.
- Keep commits coherent and independently understandable. Separate refactoring, behavior,
  schema, tests, and formatting when combining them would obscure review.
- Commit completed coherent changes after verification; do not leave finished work
  uncommitted. Do not push unless the user explicitly requests it.
- Use an imperative, specific subject without a trailing period and one allowed prefix:

```text
[FEAT] Add immutable release candidates
[FIX] Preserve evidence on duplicate delivery
[REFACTOR] Split JUnit result mapping
[PERF] Reduce candidate projection queries
[TEST] Cover readiness threshold boundaries
[DOCS] Define repository agent rules
[BUILD] Update production image
[CHORE] Update development tooling
```

Before committing, inspect the staged diff and ensure only intended files are included.
After committing, report the commit hash, verification performed, uncommitted user files,
and whether the commit was pushed.
