# Tree Control

Tree Translocation Project Control Dashboard. A fresh application; the previous workforce app is not part of this implementation.

## Current status

Implemented: green responsive dashboard and PIN entry; stateless signed-cookie authentication from Cloudflare Worker secrets; role-authorized APIs; submission, review, return, rejection and revision; signed quantity corrections; approval-only calculation engine; irrigation/support/translocation/new-tree stages; block readiness and allocations; schedule; supervisor records; project/internal weights; quality inspections and observations; filtered CSV/print submissions; immutable audit history; PostgreSQL schema, migrations and seed.

The local design preview is **not an authenticated application or a live database**. `/design-preview` is development-only and uses an explicitly labelled empty baseline. Production returns 404 for this route. No progress or fake operational records are seeded.

**Production initialization:** the owner has configured Prisma Postgres and the live Cloudflare Worker secrets. This checkout does not have access to those secrets. Runtime login does not depend on database initialization. Run `npm run db:setup` only to initialize the project baseline and retained database user records; a successful build does not initialize project data.

The entire original definition of done is not yet verified. Quality-specific document/photo attachments (separate from daily-submission photos), a full set of dedicated executive/productivity report layouts, and exhaustive populated-state browser/end-to-end tests remain follow-up work. Do not call this production-ready until those requirements and the live database test pass.

## Architecture

- TypeScript + React, Next-compatible App Router through **Vinext**, Vite, Cloudflare Workers output. This is not a stock Next.js Node deployment: the Sites scaffold uses the Worker-compatible Vinext runtime.
- Tailwind theme with customized shadcn/Base UI button, input and dialog primitives; Lucide icons; Recharts.
- PostgreSQL + Prisma 6.19, JavaScript query compiler (`engineType = "client"`), `@prisma/adapter-pg` and `pg`. The Worker uses the normal pooled `postgres://` URL and `nodejs_compat`. No Accelerate. Each request owns its client/pool through AsyncLocalStorage and disconnects in `finally`; sockets are never reused across Worker requests.
- Zod input validation and stateless HMAC-SHA-256 signed sessions using Web Crypto. Login compares only the two server-side Worker PIN secrets and makes zero database queries. PostgreSQL remains the source of project and operational data.
- Normalized `DailySubmissionItem` ledger plus immutable `Adjustment` records. Package-specific progress is derived rather than duplicated into separate progress tables.

## Files

`app/` routes, login, workspace and private APIs; `components/` dashboard, management pages and forms; `lib/domain/` baseline/calculations/workflow; `lib/server/` authentication/database/transactions; `prisma/` schema/migrations/seed; `tests/` calculation/security/isolated PostgreSQL checks. `public/og.png` is the project-specific sharing image.

## Requirements and configuration

Use Node.js 22.13+ and npm. Copy `.env.example` to `.env` and configure it locally. Never send credentials in chat, commit them, or use `NEXT_PUBLIC_` / `VITE_` prefixes for secrets.

| Variable              | Purpose                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`        | Normal pooled Prisma Postgres connection (`postgres://…` or `postgresql://…`) for Worker runtime |
| `DIRECT_DATABASE_URL` | Direct PostgreSQL connection for migrations/seed                                                 |
| `SESSION_SECRET`      | Cryptographically random secret, at least 32 characters; signs runtime session cookies           |
| `ADMIN_PIN`           | Worker-only three-digit administrator login secret; never expose to client code                  |
| `SUPERVISOR_PIN`      | Worker-only three-digit Site Supervisor login secret; must differ from Admin                     |
| `INITIAL_ADMIN_PIN`   | Seed-only initial administrator PIN from the approved brief                                      |
| `INITIAL_FOREMAN_PIN` | Seed-only initial foreman PIN from the approved brief; must differ from Admin                    |
| `TRUST_CLOUDFLARE_IP` | `true` only behind Cloudflare where the platform overwrites the IP header; local default `false` |
| `PUBLIC_ORIGIN`       | Verified HTTPS origin with no trailing slash, for absolute Open Graph / X image URLs             |

Keep `SESSION_SECRET`, `ADMIN_PIN`, and `SUPERVISOR_PIN` only in private local configuration and Cloudflare Worker secrets. Rotating `SESSION_SECRET` immediately invalidates all existing signed cookies. Never paste these values into source, build configuration, client-prefixed variables, or logs.

## Setup and commands

```sh
npm install
npm run db:setup
npm run dev -- --host 127.0.0.1 --port 3000
```

### One-time production initialization (local terminal, not the Cloudflare build field)

In a terminal in this repository folder, after `npm install`, run **`npm run db:setup`**. It prompts for hidden input and keeps values only in memory:

1. Prisma Postgres **direct** URL from Prisma Console → database → Connect (not the pooled URL).
2. The exact existing production `SESSION_SECRET`, from your private saved copy.
3. Your requested initial administrator PIN (including its leading zero).
4. Your requested initial supervisor PIN.

The command applies all committed migrations, generates Prisma Client and seeds the baseline and retained initial account records. No public migration endpoint is created. Runtime login is now controlled separately by the Worker-only `ADMIN_PIN` and `SUPERVISOR_PIN` secrets.

The direct URL is migration-time only. Prisma recommends direct connections for migrations/admin tools because pooled connections use transaction pooling and do not preserve session continuity ([Prisma connection guidance](https://www.prisma.io/docs/postgres/database/connecting-to-your-database)). It is **not required in the live Worker**. The CLI wrapper substitutes it for `DATABASE_URL` only in its child processes; the runtime pooled URL is unchanged. Advanced users can supply the same inputs in an ignored `.env` or private process environment instead of the prompts.

Migrations create the schema, checks and immutable-history triggers. Baseline seed is idempotent: it does not overwrite operational quantities, weights, schedules or baseline settings. It creates four zones, nineteen blocks and activities. **Individual block capacities, row allocations and pipeline allocations remain null** until entered from approved drawings.

**Rerunning setup/seed explicitly resets the two retained database account records** (`initial-admin` and `initial-foreman`), including their names, roles, legacy PIN hashes/lookups and active status. Other users and all submissions, approvals, corrections and audit history are preserved. These legacy credential fields remain only for schema and Supervisor-management compatibility; they are not read by runtime login. For future schema upgrades use **`npm run db:migrate`**, not setup, to avoid resetting records. Do not disable database integrity triggers.

Sign in at `http://localhost:3000/` using the private runtime PIN variables. There are no role selectors, saved PINs, role hints or localStorage login shortcuts. During this temporary authentication phase, the administrator is always `initial-admin` and the Site Supervisor is always `initial-foreman`; changing a database User PIN does not change either Worker secret.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:worker
npm run start -- --port 3001
```

`npm test` uses a disposable in-memory PGlite/PostgreSQL engine for SQL migration/integrity tests and never connects to the configured live database. On this Windows sandbox, Node's account lookup required running the test command outside the restricted sandbox; the normal local command is unchanged.

The build regenerates the Rust-free Prisma client, checks TypeScript and produces `dist/server/index.js`, `dist/server/wrangler.json` and `dist/client/`. `--no-engine` is intentionally not used: the JavaScript query compiler is needed for the PostgreSQL adapter. Package installers that require explicit dependency-script consent must allow Prisma's generation tools and the official esbuild/workerd binary installers.

## Deployment

This is a server-backed application, **not a static Cloudflare Pages export**. Do not deploy just `dist/client` or point Wrangler at `src/index.ts`.

1. Run the one-time local `npm run db:setup` command against Prisma Postgres.
2. Keep seed-only PINs and the direct connection URL out of the permanent Worker environment.
3. Configure `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PIN`, `SUPERVISOR_PIN`, `TRUST_CLOUDFLARE_IP=true` and `PUBLIC_ORIGIN` as hosting secrets/environment values. Do not put secrets in Wrangler `vars` or Git.
4. Build with `npm run build`.
5. The existing GitHub → Cloudflare Workers integration deploys `main` using `npx wrangler deploy --config dist/server/wrangler.json`. Source `vite.config.ts` preserves `nodejs_compat` and the compatibility date in generated configuration. Do not use a static Pages output-directory configuration for this application.
6. Verify authentication, cookie flags, data persistence, every role restriction and the workflow below on the actual hosting target before operational use.

Production origin: `https://swiftops.web.id`. Cookies are host-only (no Domain attribute), HttpOnly, Secure in production, SameSite=Strict and expire after eight hours. No localhost is hardcoded into cookie scope. Cloudflare resources, billing and Prisma Postgres credentials remain owner-managed. Project mutations still use interactive database transactions and need compatible hosting limits. See [Prisma's Cloudflare guide](https://docs.prisma.io/docs/guides/deployment/cloudflare-workers) for adapter / Node compatibility guidance.

Before public use, configure a Cloudflare rate-limiting rule for `POST /api/login`, keyed by source IP. A conservative starting policy is 5 attempts per 15 minutes followed by a 15-minute block or managed challenge; adjust for legitimate shared networks and the Cloudflare plan in use. This perimeter rule replaces the former PostgreSQL `AuthThrottle` query. The retained `AuthThrottle` table is not used by runtime login.

## Supervisor management

Admin → Supervisors supports add, rename, legacy PIN-record reset with confirmation, deactivate/reactivate, deletion/archive, status/role/name filters, pagination and read-only submission history with approved totals and review outcomes. Names come from the current User record, including historical submissions and reports. Audit snapshots remain immutable, while the actor display resolves the current name.

Only a verified Admin session can call the management API. Foreman URLs are guarded server-side and Admin-only API actions return 403. In this temporary phase, runtime authentication recognizes only the fixed `initial-foreman` identity from `SUPERVISOR_PIN`; dynamically created Supervisor records and database PIN changes do not create or alter login access. Dynamic per-Supervisor authentication is intentionally deferred to a later D1-backed phase.

Delete permanently removes only accounts with no submissions, approvals, adjustments or audit references. All other accounts are archived/inactivated. New accounts already have a creation audit event and will therefore normally archive. Archived users retain their ID, name and history and can be reactivated. PINs remain unique even for inactive/archived accounts so reactivation never creates an ambiguous login. No cascade deletes are used.

## Calculations and assumptions

- Design capacity 13,524; approximate relocation target 10,000; new trees 3,500; irrigation 17,220 m; 19 blocks; 312 rows; 1,560 posts; 19 valves/decoders. Relocation is independent of nursery capacity minus new trees.
- Zones A/B/C/D: 4,416 / 6,912 / 1,080 / 1,116 capacity with 6 / 9 / 2 / 2 blocks. Per-block capacities are not assumed.
- Overall weights: mobilization 5, drawings 5, irrigation 25, support 20, translocation 30, new trees 10, testing 3, handover 2.
- Stage completion = approved effective quantity ÷ target, clamped 0–100. Package = sum(stage completion × internal weight / 100); overall = sum(package completion × package weight / 100). Display only rounds to two decimals. Six-decimal checklist weights assign the residual to the last activity so persisted weights total 100 exactly.
- The combined valve/decoder weight is split equally (7.5 each); cable installation/tension share 20% equally (10 each). Checklist stages initially share package weight equally. Settings edits are audited and must total 100. Official translocation is always correctly placed trees; loading/transport are tracking stages and cannot be reweighted into physical completion.
- New-tree delivery alone is not completion. Sourcing 10 / preinspection 10 / delivery 20 / planting 35 / irrigation 10 / final acceptance 15.
- Only `APPROVED` submissions contribute. Effective item quantity = original + signed adjustments. Original approved quantities are immutable. An adjustment cannot make an item or total negative.
- A project-level row lock serializes approvals, adjustments and configuration. Unique submission/version approval records and optimistic revision checks prevent double approval. Record status, review and audit change in one transaction.
- Placement/planting checks block commissioning, passed testing and every support row prerequisite. Five aligned posts/foundations/holes per row are required. Missing capacity blocks normal placement. Holds block placement. Administrator readiness/capacity/target overrides require a meaningful reason and are rechecked at approval time. Stage ordering itself cannot be overridden.
- Ready nursery percentage is known ready capacity ÷ 13,524, not ready-block count ÷ 19. Unknown capacities contribute no assumed capacity.
- Planned progress is linear from the configured start/finish for each weighted activity. Missing dates yield unavailable planned progress, not zero. Same-day milestones jump from 0 to 100 on that date. Actual historical curves include only work approved by the displayed day; later corrections enter on their correction date. Baseline changes revalue the displayed curve against the current baseline, with the old baseline retained in audit history.
- Seven-day production average includes zero-production days. Forecast needs at least three positive approved-production days; otherwise displays insufficient data. All work dates / daily cutoffs currently use UTC.
- Retests belong in Quality, not duplicate commissioned/tested physical quantities. Inspections do not directly increase progress; submit the relevant acceptance milestone through approval.

## Security and operational limitations

- **A three-digit PIN has only 1,000 combinations. It is not sufficient as the only protection for a public operational system.** Use a restricted private host, Cloudflare Access/IP perimeter, or approve stronger authentication before public exposure. Distinct PINs are required for role resolution, which also limits possible accounts.
- Runtime PINs exist only as Cloudflare Worker secrets and are compared server-side. Login does not import bcrypt, query User/Session/AuthThrottle, or write login audit events. Protect the public login route with the Cloudflare rate-limit rule described above.
- Sessions contain only user ID, role, name and expiration, protected by an HMAC-SHA-256 signature. Every authenticated request verifies the signature and expiration locally with zero database queries. Cookies use HttpOnly + SameSite=Strict + Secure in production. Role checks remain server-side and all writes require same origin. Stateless sessions cannot be individually revoked; rotate `SESSION_SECRET` to revoke all active sessions.
- Photo files use private authenticated endpoints, signature/type/size validation, and database byte storage. JPEG/PNG/WebP only; five photos per submission, max 5 MB each. Large-scale media storage should move to private object storage when deployment requirements are confirmed.
- CSV exports escape spreadsheet formulas. No request credentials or PINs are printed in audit/error responses.
- Four outstanding high-severity audit findings are in Prisma CLI dependencies (`prisma`, `@prisma/config`, `effect`, `deepmerge-ts`), not the deployed client. Do not execute untrusted Prisma configuration files. Resolve via a tested Prisma toolchain upgrade before a strict zero-advisory production policy; do not run `npm audit fix --force` blindly. The web-runtime advisories were patched.
- Audit UI currently returns the latest 500 events; records remain persisted. Submission filtering/pagination is client-side. Add server pagination for large projects.
- The browser WebMCP action opens daily-progress entry but never approves work. Its live authenticated contract is unverified while the database is unavailable.

## Verification checklist before go-live

1. Verify both Worker-secret PINs, an incorrect PIN, cookie tampering, expiry, logout and each role boundary on staging.
2. Submit foreman work; verify waiting quantities do not affect official totals.
3. Approve it as Admin, then attempt the same approval twice/concurrently; confirm one contribution and one review.
4. Return another submission, revise as its owner and resubmit; reject another; verify both excluded until approval.
5. Verify another Foreman cannot read or edit those records, photos, management pages or Admin endpoints.
6. Configure a block, approve complete prerequisites and test placement both before/after readiness, including hold and documented Admin override.
7. Apply a signed correction; confirm history, totals and nonnegative guards.
8. Test session expiry and the Cloudflare login rate-limit rule; restart the service and verify project-data persistence.
9. Verify photo uploads, CSV/print reports, schedule/weights, private social metadata, and populated-state responsive forms on the deployment target.

Automated checks include the existing calculation/security suite and migration/rollback/immutability tests, plus a disposable PGlite PostgreSQL wire-protocol bridge exercising the real `pg` driver and Prisma adapter: seed/rerun, both stateless roles, database record management, archive/delete, and preservation of approved totals. Tests never connect to production. The bridge has a single backend; it does not prove multi-connection PostgreSQL concurrency or live Cloudflare latency/limits. Live secret and perimeter-rule verification are still required.

`npm run test:worker` additionally loads the generated Worker and its compiler WASM module into the installed Cloudflare runtime (Miniflare), proves login succeeds with no `DATABASE_URL`, then checks both roles over the TCP adapter, signed host-only secure cookies, cookie tamper rejection, Admin-route restrictions, logout cookie expiry and production preview isolation. It uses disposable local data. Run it after `npm run build`. Vite explicitly selects Prisma's WASM entry because Node compatibility can otherwise resolve the filesystem-dependent Node entry; the query-compiler WASM is emitted into the Worker build. The local Wrangler development proxy was intermittently unstable during smoke tests, so this command tests the runtime directly, with explicit teardown.
