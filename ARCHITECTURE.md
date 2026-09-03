# Caselog Architecture

> Normative document. It defines module boundaries and dependency direction.
> Detailed coding, testing, and review rules live in `docs/DEVELOPMENT.md`. Decisions
> that are expensive to reverse are documented in `docs/adr/`.

## 1. Architectural style

Caselog is a **feature-first modular monolith**.

- The backend is one deployable application backed by one database.
- Business capabilities are isolated in modules such as `auth`, `projects`,
  `test-cases`, `test-runs`, `releases`, `quality-evidence`, and
  `release-readiness`.
- Each backend module follows a layered structure internally.
- External systems are integrated through ports and adapters.
- Multi-tenancy is a system invariant, not an optional check.

This is a pragmatic architecture. We do not introduce microservices, strict Clean
Architecture, or rich DDD for their own sake. A new abstraction layer must protect
a real boundary or remove real duplication.

```text
HTTP
  ↓
Controller
  ↓
Application service / use case
  ↓
Repository
  ↓
TenantDatabaseService / Prisma
  ↓
PostgreSQL + RLS
```

Dependencies flow in one direction. A lower layer must not import a higher layer.

## 2. Module boundary

A module owns its behavior and internal implementation. **Every backend feature
module uses the same directory structure from the moment it is created.** Module
size is not a reason to keep files in the module root or to introduce a different
layout.

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

Only the Nest module composition root and an optional `public-api.ts` are allowed as
production files directly in the module root. `public-api.ts` explicitly re-exports
the services, ports, transport primitives, types, or stable domain contracts that
other modules may import. Configuration specific to a feature belongs to
`infrastructure/`; shared application configuration belongs to `core/config`.

The structure describes stable architectural responsibilities:

- `presentation/` contains HTTP and framework entry points: controllers, request and
  response DTOs, guards, transport-specific decorators, and background job workers.
- `application/` contains use cases, orchestration services, and ports required by
  those use cases.
- `domain/` contains business models, policies, state transitions, and pure business
  rules. It must not depend on NestJS, Prisma, HTTP, or infrastructure adapters.
- `infrastructure/` contains repositories, persistence mapping, external-system
  adapters, authentication strategies, and feature-specific configuration.
- `tests/` mirrors the production responsibility being tested and separates unit,
  PostgreSQL-backed integration, and end-to-end tests.

Directories that currently have no files are not committed as empty placeholders,
but any future file must be placed in its defined directory. A module must never
switch to a flat layout because it is small. Additional subdirectories may group a
real capability or aggregate, but they must remain inside the appropriate layer and
must not replace the standard top-level structure.

File names describe responsibilities rather than vague technical patterns. A
repository may be split by aggregate or persistence workflow, but not into arbitrary
`helpers` files.

### Public module API

- A Nest module exports only providers required by another module.
- Cross-module TypeScript imports resolve through the owning module's `public-api.ts`;
  importing another module's layered directories is forbidden.
- A feature module must not import another feature's controllers, repositories,
  persistence types, or internal helpers.
- Feature modules communicate through exported services.
- Shared API contracts belong to `packages/schemas`, not to one consumer.
- A cyclic dependency means the boundary is wrong. `forwardRef()` is not a fix.

### Allowed import direction

```text
presentation → application → domain
                  ↘ infrastructure → domain
feature       → core / common / @caselog/schemas
feature A     → exported service or public port of feature B
domain        ✕ presentation / application / infrastructure
core / common ✕ feature
feature A internals ✕ feature B internals
```

`core` contains application infrastructure such as database, mail, storage,
configuration, and health checks. `common` contains small, stable primitives that do
not belong to a specific feature. Neither directory may become a collection of
unrelated helpers.

### Capability ownership

Entities are grouped by behavior and invariants, not one module per database table.
Implemented modules and accepted target modules share this normative ownership map;
an accepted target row reserves its boundary but does not claim that code already exists:

| Module | Owns |
|---|---|
| `instance` | public deployment identity and server-enforced capability configuration |
| `billing` | managed-service billing accounts, account membership, and commercial workspace grouping; never workspace data access |
| `auth` | identities, sessions, workspace lifecycle, org-scoped token exchange |
| `members` | membership and invitation workflows |
| `projects` | project lifecycle and project defaults |
| `test-cases` | suites, sections, cases, immutable case versions |
| `test-runs` | runs, run items, manual/automated results, JUnit ingestion history |
| `attachments` | logical attachments, physical blobs, upload lifecycle and storage accounting |
| `integrations` | provider connections, normalized external issues, defect links and sync |
| `releases` | environments, releases, immutable release candidates and candidate/run links |
| `quality-evidence` | immutable normalized evidence, producer identity, trust and freshness |
| `release-readiness` | metric definitions, versioned policies, gates, evaluations, decisions and waivers |
| `reporting` | read projections that do not own source-domain decisions |
| `audit` | immutable security and administrative audit events |

The release-readiness capability follows ADR 0010–0012. In particular, a named
release is not the unit of evaluation: an immutable release candidate is. Test runs
and integrations remain the systems of record for their data; readiness consumes
their stable public contracts and records only the normalized evidence required to
reproduce a decision.

Creating `releases`, `quality-evidence`, or `release-readiness` does not permit a
custom directory layout. Each module uses the mandatory structure above from its
first file. Future `deployments` becomes a separate module only when deployment
lifecycle, providers, and policies form an independently cohesive capability.

### Cross-module commands, queries, and events

- A synchronous command or query crosses a module boundary through the provider
  exported by the owner module's `public-api.ts`.
- A source module publishes a stable integration event when consumers need to react
  without creating a reverse dependency. The event contract belongs to the publisher's
  public API.
- Events are facts in past tense, contain tenant and source revision identifiers, and
  are idempotent for every consumer. They do not instruct an unknown consumer what to do.
- Durable cross-module events use the transactional outbox/job boundary. A feature
  never imports pg-boss, another feature's worker, or a consumer-specific job name.
- Eventual consumers expose revision/freshness information and use the same
  self-healing read rule as reporting projections. A delayed worker must not silently
  return a current-looking stale readiness decision.
- A module never both imports another module's internals and asks that module to call
  back into its own internals. `forwardRef()` remains forbidden.

## 3. Backend layer responsibilities

### Presentation

Controllers live in `presentation/controllers/`. DTOs, guards, and decorators live
in their corresponding `presentation/` directories.

- Accepts the HTTP request and extracts transport context.
- Validates the payload with a shared Zod schema.
- Calls an application service or use case.
- Returns a DTO or performs a transport-specific action such as a download.
- Contains no business decisions, Prisma queries, or tenant authorization logic.

### Application service / use case

Application services live in `application/services/`. Interfaces for external or
replaceable dependencies required by a use case live in `application/ports/`.

- Orchestrates a business operation.
- Enforces permissions and domain state.
- Coordinates repositories and external ports.
- Throws domain errors and does not know about HTTP status codes.
- Never calls Prisma directly.

A service does not need to be large. If a rule can be expressed as a pure function,
the service calls that function instead of accumulating private methods.

### Repository

Repositories live in `infrastructure/repositories/`. They implement application
ports when an abstraction is required.

- Encapsulates Prisma and the data storage model.
- Always requires `organizationId` for tenant-owned data.
- Opens tenant-scoped transactions through `TenantDatabaseService`.
- May perform an atomic persistence workflow such as read-modify-write, bulk insert,
  upsert, or row locking.
- Does not know about HTTP, guards, JWT, or UI.
- Does not make business decisions that can be calculated without the database.

By default, a repository owns the transaction for its atomic operation. If one use
case must be atomic across multiple repositories, introduce an explicit module-level
Unit of Work. A raw Prisma transaction client must not be passed to a controller or
become a general service-layer dependency.

#### Prisma and raw SQL

Prisma is the default for ordinary CRUD. Parameterized raw SQL is allowed in a
repository or `*.persistence.ts` when the operation requires row locks, bulk
operations, RLS context, PostgreSQL-specific capabilities, or a measured
optimization. `$queryRawUnsafe` and `$executeRawUnsafe` are forbidden. SQL for
tenant-owned data explicitly filters by `organization_id` even when RLS is enabled,
has a typed result, and is covered by an integration test against PostgreSQL.

SQL is responsible for reading, locking, and persistence. Business decisions are
made by the application or domain layer before the SQL is executed.

### Domain and pure logic

Domain code lives in `domain/`, grouped into `models/`, `policies/`, or another
responsibility-specific domain directory.

Parsing, matching, status mapping, calculations, and state transitions should be
implemented as small, typed pure functions when they do not require I/O or dependency
injection. Do not create a class solely for the sake of OOP.

### Release evidence and decision data

Release readiness has stricter persistence rules than ordinary mutable entities:

- `Release` owns a product-version lifecycle; `ReleaseCandidate` identifies the exact
  commit/build being assessed.
- release lifecycle and readiness classification are separate types and columns;
- normalized evidence is append-only and belongs to one candidate;
- a correction supersedes an observation instead of mutating evidence already used;
- editing a release policy creates an immutable policy version;
- gate evaluations and readiness decisions are appended, never replaced;
- every decision references the exact candidate, policy version, evaluator version,
  metric-definition version, gate evaluations, and evidence set;
- an approval or waiver records an explicit exception and never rewrites the computed
  decision;
- deterministic gates make blocking decisions; AI may summarize evidence but cannot
  silently change a gate outcome.

ADR 0010 and ADR 0011 define the complete identity and auditability decisions.

### Ports and adapters

Ports live in `application/ports/`; their infrastructure implementations live in
`infrastructure/adapters/`.

S3, email, Jira, Monday, and other external systems are hidden behind narrow ports.
An infrastructure adapter implements a port and is connected through dependency
injection. Internal classes do not require interfaces by default; introduce an
abstraction at a real external or replaceable boundary.

### Background jobs and projections

- `core/jobs` owns the generic job-queue port and the pg-boss adapter. Feature modules
  never import pg-boss directly.
- A feature registers its worker in `presentation/workers/`; the worker validates the
  payload and calls an application service.
- Job handlers are idempotent, have bounded retries, and use an explicit dead-letter queue.
- A source mutation invalidates a projection in the same tenant transaction before it
  enqueues refresh work. Projection reads compare revisions and rebuild synchronously if a
  job was delayed or missed, so background processing cannot make the API return stale data.
- Readiness evaluation follows the same rule. Evidence ingestion, policy-version changes,
  candidate/run links, and relevant source revisions schedule evaluation for affected active
  candidates. Historical decisions are not recomputed in place.

## 4. Multi-tenancy

Tenant isolation applies to every path to tenant-owned data:

1. An org-scoped principal contains an immutable `organizationId`.
2. Every tenant-owned table contains `organization_id`.
3. A repository requires `organizationId` in its public methods.
4. `TenantDatabaseService` sets transaction-local `caselog.organization_id`.
5. PostgreSQL RLS restricts visible rows.
6. A cross-tenant API test expects `404` for a resource owned by another tenant.

Direct access to tenant-owned Prisma models outside repositories is forbidden. Global
tables and bootstrap queries are explicit exceptions, not ways to bypass tenant
scope. ADR 0002 and ADR 0006 describe the complete decision.

### Billing account boundary

`BillingAccount` is a managed-service commercial boundary above organizations; it is not
a data tenant. One billing account may group many organizations/workspaces, while every
organization keeps its own memberships, tokens, repositories, transaction context, and
PostgreSQL RLS boundary.

- Billing-account membership authorizes billing-account administration only and never
  grants implicit access to a workspace.
- Creating a workspace under a billing account requires account owner/admin authority and
  creates an explicit workspace owner membership.
- Retryable billing-account and managed-workspace creation is idempotent in the global
  session boundary, scoped by user and use case; its records are protected by user-context
  RLS and do not reuse organization-scoped idempotency storage.
- The `billing` module verifies account authority, then calls the stable workspace
  provisioning service exported by `auth`. `auth` receives the authorized account ID and
  persists it on the organization; it never reads billing tables or decides commercial
  policy.
- Self-hosted organizations may keep a null billing-account reference. Core feature modules
  never branch on a price, subscription plan, or paid entitlement.
- Usage aggregation may roll workspace-attributed operational measurements up to a billing
  account, but source records remain tenant-scoped and cannot be queried across workspaces
  through a product-domain repository.

ADR 0014 defines the hierarchy and commercial implications.

## 5. API and contracts

- The REST API uses the `/api/v1` prefix.
- Zod schemas in `packages/schemas` are the shared contract between the API and web
  client.
- Request and response DTOs expose those schemas through OpenAPI. The committed
  OpenAPI document and generated frontend types must be regenerated with
  `pnpm openapi:generate` whenever a public endpoint changes.
- DTOs do not expose Prisma entities directly.
- Everything available through the UI must also be available through the public API.
- Collections use cursor pagination.
- CI and import workflows use bulk endpoints.
- Retryable create and write operations define idempotency semantics.

A change to the public contract, data model, or another decision that is expensive to
reverse requires an ADR.

## 6. Frontend

The Angular application is also organized feature-first. **Every frontend feature
uses the same directory structure from the moment it is created:**

```text
app/
  core/                 # auth, interceptors, application-wide providers
  shared/               # reusable UI and API primitives
  features/
    <feature>/
      <feature>.routes.ts
      public-api.ts
      pages/
      components/
      data-access/
      domain/
      state/
      tests/
```

- Use standalone components.
- The feature root contains route composition and, when another feature consumes an
  explicitly supported contract, `public-api.ts`. All implementation files belong
  to the standard directories.
- Cross-feature imports resolve through `public-api.ts`; direct imports from another
  feature's `pages`, `components`, `data-access`, `domain`, or `state` are forbidden.
- `pages/` contains route-level components and `components/` contains feature UI.
- `data-access/` owns server communication, `domain/` owns frontend-only view models and
  mapping, and `state/` owns feature state.
- A feature must not import another feature's internals.
- `core` and `shared` must not import features.
- Route configuration composes features at the application level.
- A component owns presentation and UI events but does not perform HTTP requests
  directly.
- A feature API or service owns server communication.
- Signals hold UI state; RxJS is used for genuine asynchronous streams.
- Move a component to `shared` only after it has a stable shared purpose, not in
  anticipation of possible reuse.

## 7. Code size and decomposition

Split code by responsibility and reason to change, not by an arbitrary line count.

Signals that a file should be split include:

- it mixes transport, orchestration, persistence, and pure logic;
- its name no longer describes its contents accurately;
- independent parts change for different reasons;
- testing a small rule requires excessive setup;
- the file approaches 300–400 lines or a method approaches 50–60 lines.

The last item triggers a review, not an automatic failure. One cohesive 350-line
repository is better than five abstractions without independent responsibilities.

Backend tests live under the owning module's `tests/unit`, `tests/integration`, or
`tests/e2e` directory. Frontend tests live under the owning feature's `tests`
directory. Test file paths should mirror the production responsibility they cover.
Cross-module system tests and shared test infrastructure live in the application-level
`test/` directory.

## 8. Architecture review checklist

Before merging, the author and reviewer verify:

1. Which module owns the new behavior?
2. Do dependencies flow only downward through the layers?
3. Does any feature import another module's internals?
4. Where is `organizationId` enforced, and which cross-tenant test proves it?
5. Is the business decision in a service or pure function rather than a controller or
   persistence mapping?
6. Is the new class, interface, or dependency genuinely necessary?
7. Does every new file follow the mandatory module directory structure?
8. Does this change require an ADR?
9. If this is release evidence, which immutable candidate and producer revision does it
   describe?
10. Can a historical readiness decision be reproduced after policies and source data change?
11. Does a cross-module reaction use a stable public event without introducing a dependency
   cycle?

Rules that can be checked automatically should gradually become lint rules,
architecture tests, and CI checks. A documented boundary remains mandatory before an
automated check exists.
