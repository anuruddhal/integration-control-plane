# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WSO2 Integration Control Plane (ICP) — monitors, troubleshoots, and controls WSO2 integration
(Micro Integrator) deployments. Two deliverables, orchestrated by Gradle at the root:

- `icp_server/` — Ballerina backend (GraphQL API, runtime management, auth, observability)
- `frontend/` — React + TypeScript + Vite SPA using the WSO2 Oxygen UI component library

The Gradle `build` produces a single distributable zip: the frontend is built and its `dist/` is
copied into `www/`, which the Ballerina server serves as static content. So the backend both hosts
the API and serves the compiled SPA.

## Toolchain versions

- Ballerina `2201.13.2`, Java 17 (pinned in CI, `.github/workflows/pr-check.yml`)
- Node 20/22, pnpm 8/10

## Commands

Backend (`cd icp_server`):
```bash
bal run                      # run server locally (reads Config.toml); starts on :9446
bal build                    # compile
bal test                     # run all tests (needs H2 dbs initialized first, see below)
bal test --tests <TestName>  # run a single test function
bal format                   # format Ballerina code (CI does NOT check this; frontend prettier IS checked)
../gradlew initAllH2Databases   # create H2 db files required before `bal test` / H2 runs
```

Frontend (`cd frontend`):
```bash
pnpm install
pnpm dev            # vite dev server on :5173
pnpm build          # production build -> dist/ (no typecheck)
pnpm build:check    # tsc -b && vite build (typechecked build)
pnpm lint           # eslint
pnpm format         # prettier --write   (CI enforces `prettier --check`)
```

Root (`./gradlew` or `./build.sh <cmd>`):
```bash
./gradlew build     # full pipeline: bal build + frontend build + package zip into build/distribution/
./gradlew run       # build then run backend
```

Docker Compose (from `icp_server/`, one file per database backend):
`docker-compose.local.yml` (H2), `.mysql.yml`, `.postgresql.yml`, `.mssql.yml`,
`.observability.yml` (Prometheus/Grafana/OpenSearch), `.test.yml` (CI test runner).

## CI (pr-check.yml)

On PRs to `main`: prettier check on `frontend/`, then `./gradlew build`, then init H2 dbs, then run
`bal test` inside `docker-compose.test.yml`. There is no ESLint or `bal format` gate — the only
formatting gate is frontend prettier.

## Backend architecture (`icp_server/`)

Root-level `.bal` files are the **default module** — they wire up the HTTP services. Reusable logic
lives in `modules/`.

### HTTP listeners and services

All frontend-facing services share one TLS listener `httpListener` on `serverPort` (9446), defined
in `runtime_service.bal`. Services attached to it:
- `service /graphql` (`graphql_api.bal`) — main API for the SPA
- `service /auth` (`auth_service.bal`) — login/token issuance, user management proxy
- `service /` (`webserver.bal`) — serves the built SPA from `www/`, rewrites `config.json` at startup
- `/icp/observability` (`observability_service.bal`) — logs/metrics proxy
- `/icp/workflow` (`workflow_proxy_service.bal`) — proxies human-task calls to runtimes

Separate listeners: `runtimeListener` on `runtimeListenerPort` (9445) for **runtime→server**
communication (`service /icp` in `runtime_service.bal`, receives heartbeats); the OpenSearch adapter
on `defaultOpensearchAdaptorPort` (9449). A default-user auth backend and an LDAP auth backend run on
their own ports (`default_user_service.bal`, `ldap_user_service.bal`).

### Four JWT trust domains (all HS256, distinct secrets/issuers in `config.bal`)

1. **frontend ↔ server** — SPA calls carry this token; validated by `/auth` and `/graphql`.
2. **server ↔ user-service** — server calls the auth backend with an issued JWT.
3. **runtime ↔ server** — runtimes authenticate via **kid-based lookup**: the JWT `kid` maps to a
   per-org secret (`extractKidFromJwt → lookupOrgSecretByKeyId → validateRuntimeJwtWithSecret`).
   `service /icp` has no `@ServiceConfig` auth block for this reason — it validates per request.
4. **observability** — short-lived tokens for the observability adapter.

### Initialization and secrets

- `modules/storage/init.bal` creates the shared `sql:Client` at **module load** time.
- Root `init.bal` `init()` builds HTTP clients (auth backend, OpenSearch) using **resolved** secrets.
- Config values may be encrypted; `utils:resolveConfig` / `modules/utils/cipher.bal` decrypt them
  (WSO2 cipher tool, packaged into `lib/` in the distribution). Anything named `resolved*` in the
  default module is a decrypted secret produced during init — use those, not the raw `configurable`.

### `modules/`

- `storage` — the data layer. One repository file per aggregate (`runtime_repository.bal`,
  `component_repository.bal`, `project_repository.bal`, `environment_repository.bal`,
  `auth_repository.bal`, etc.). `connection_manager.bal` + `database_dialect.bal` abstract over
  MySQL / PostgreSQL / MSSQL / H2 — **when writing SQL, respect dialect differences here** rather
  than hardcoding vendor syntax. `DEFAULT_ORG_ID` lives here.
- `auth` — RBAC v2 authorization (not authentication). Permission checks are permission-based, not
  role-string-based: the path is `permission → role → group → user`, scoped by `AccessScope`
  (`orgUuid`/`projectUuid`/`envUuid`/`integrationUuid`). Use `auth:hasPermission` /
  `auth:hasAnyPermission` with a scope built via `buildScopeFromContext`. See
  `rbac_v2_implementation.md` for the model. GraphQL resolvers call `extractUserContext(context)`
  then authorize before touching storage.
- `sync` — reconciliation engine. Compares **desired** state (ICP db) vs **observed** state
  (reported by runtimes), diffs into actions, and dispatches with exponential backoff
  (`reconcile_engine.bal` `backoffInterval`, `reconcile_dispatch.bal`). Background schedulers in the
  default module (`runtime_offline_scheduler.bal`, `refresh_token_cleanup_scheduler.bal`) drive
  periodic work.
- `mi_management` — Micro Integrator specific management calls.
- `observability` — OpenSearch/metrics spec.
- `types` — shared records (`AccessScope`, `UserContextV2`, reconcile types, etc.).
- `utils` — cipher/secret resolution and helpers.

### Config

`Config.toml` holds runtime configuration (db backend via `[icp_server.storage] dbType`, ports,
JWT secrets, backend URLs). In the packaged distribution it becomes `conf/deployment.toml`. Ports
and all `configurable` defaults are in `config.bal`.

## Frontend architecture (`frontend/src/`)

- **Runtime config**: backend URLs come from `public/config.json` (fetched at runtime, not baked in
  at build) so the same build works across environments. The server rewrites this file on startup.
- `api/` — data access. GraphQL goes through `graphql.ts` (`queries.ts` / `mutations.ts`); REST
  helpers for `auth`, `logs`, `metrics`, `workflows`, `miUsers`. Data fetching uses TanStack Query.
- `auth/` — `AuthContext.tsx`, `tokenManager.ts` (frontend JWT handling), `ProtectedRoute.tsx`.
- Access control in the UI mirrors backend RBAC: `contexts/AccessControlContext.tsx`,
  `hooks/usePermissionLoader.ts`, and `components/Authorized.tsx` gate UI by permission.
- `pages/` are route components (routes in `paths.ts` / `nav.ts`); `layouts/` wrap them
  (`AppLayout`, `PublicLayout`, `PolicyLayout`); `components/` are shared UI.
- UI is built on `@wso2/oxygen-ui` (MUI-based) — use its components and `OxygenUIThemeProvider`.

## Conventions

- Ballerina files carry the Apache-2.0 license header (see any existing `.bal`).
- Isolation: many backend functions are `isolated` — keep new concurrent-safe functions `isolated`
  and guard shared mutable state (e.g. the `isolated map<http:Client>` client caches).
- The committed H2 db files (`icp_server/database/*.mv.db`) are checked in and packaged into the
  distribution; they change on local runs — avoid committing incidental modifications.
