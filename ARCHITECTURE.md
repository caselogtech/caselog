# Caselog Architecture

> Normative document. It defines module boundaries and dependency direction.
> Detailed coding, testing, and review rules live in `docs/DEVELOPMENT.md`. Decisions
> that are expensive to reverse are documented in `docs/adr/`.

## 1. Architectural style

Caselog is a **feature-first modular monolith**.

- The backend is one deployable application backed by one database.
- Business capabilities are isolated in modules such as `auth`, `projects`,
  `test-cases`, `test-runs`, and `attachments`.
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

A module owns its behavior and internal implementation. A typical module looks like
this:

```text
test-runs/
  test-run.module.ts
  test-run.controller.ts
  test-run.service.ts
  test-run.repository.ts
  test-result.repository.ts
  junit-parser.ts
  *.spec.ts
```

File names describe responsibilities rather than technical patterns. A large
repository may be split by aggregate or persistence workflow, but not into arbitrary
`helpers` files.

### Public module API

- A Nest module exports only application services or explicitly named public ports.
- A feature module must not import another feature's controllers, repositories,
  persistence types, or internal helpers.
- Feature modules communicate through exported services.
- Shared API contracts belong to `packages/schemas`, not to one consumer.
- A cyclic dependency means the boundary is wrong. `forwardRef()` is not a fix.

### Allowed import direction

```text
feature controller → feature service → feature repository
feature            → core / common / @caselog/schemas
feature A           → exported service or public port of feature B
core / common       ✕ feature
feature A internals ✕ feature B internals
```

`core` contains application infrastructure such as database, mail, storage,
configuration, and health checks. `common` contains small, stable primitives that do
not belong to a specific feature. Neither directory may become a collection of
unrelated helpers.

## 3. Backend layer responsibilities

### Controller

- Accepts the HTTP request and extracts transport context.
- Validates the payload with a shared Zod schema.
- Calls an application service or use case.
- Returns a DTO or performs a transport-specific action such as a download.
- Contains no business decisions, Prisma queries, or tenant authorization logic.

### Application service / use case

- Orchestrates a business operation.
- Enforces permissions and domain state.
- Coordinates repositories and external ports.
- Throws domain errors and does not know about HTTP status codes.
- Never calls Prisma directly.

A service does not need to be large. If a rule can be expressed as a pure function,
the service calls that function instead of accumulating private methods.

### Repository

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

Parsing, matching, status mapping, calculations, and state transitions should be
implemented as small, typed pure functions when they do not require I/O or dependency
injection. Do not create a class solely for the sake of OOP.

### Ports and adapters

S3, email, Jira, Monday, and other external systems are hidden behind narrow ports.
An infrastructure adapter implements a port and is connected through dependency
injection. Internal classes do not require interfaces by default; introduce an
abstraction at a real external or replaceable boundary.

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

## 5. API and contracts

- The REST API uses the `/api/v1` prefix.
- Zod schemas in `packages/schemas` are the shared contract between the API and web
  client.
- DTOs do not expose Prisma entities directly.
- Everything available through the UI must also be available through the public API.
- Collections use cursor pagination.
- CI and import workflows use bulk endpoints.
- Retryable create and write operations define idempotency semantics.

A change to the public contract, data model, or another decision that is expensive to
reverse requires an ADR.

## 6. Frontend

The Angular application is also organized feature-first:

```text
app/
  core/                 # auth, interceptors, application-wide providers
  shared/               # reusable UI and API primitives
  features/
    auth/
    workspace/
      cases/
      projects/
      runs/
```

- Use standalone components.
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

Tests live next to production files as `*.spec.ts`. Separate test directories are
appropriate for end-to-end or integration suites and shared test infrastructure.

## 8. Architecture review checklist

Before merging, the author and reviewer verify:

1. Which module owns the new behavior?
2. Do dependencies flow only downward through the layers?
3. Does any feature import another module's internals?
4. Where is `organizationId` enforced, and which cross-tenant test proves it?
5. Is the business decision in a service or pure function rather than a controller or
   persistence mapping?
6. Is the new class, interface, or dependency genuinely necessary?
7. Does this change require an ADR?

Rules that can be checked automatically should gradually become lint rules,
architecture tests, and CI checks. A documented boundary remains mandatory before an
automated check exists.
