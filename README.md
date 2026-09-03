# Tree Control

Tree Translocation Project Control Dashboard. A fresh application; the previous workforce app is not part of this implementation.

## Current status

Implemented: green responsive dashboard and PIN entry; server-side PIN/session authentication; role-authorized APIs; submission, review, return, rejection and revision; signed quantity corrections; approval-only calculation engine; irrigation/support/translocation/new-tree stages; block readiness and allocations; schedule; supervisor access; project/internal weights; quality inspections and observations; filtered CSV/print submissions; immutable audit history; PostgreSQL schema, migrations and seed.

The local design preview is **not an authenticated application or a live database**. `/design-preview` is development-only and uses an explicitly labelled empty baseline. Production returns 404 for this route. No progress or fake operational records are seeded.

**Deployment blocker:** supply a PostgreSQL database with an HTTPS Prisma Accelerate connection, configure the environment, migrate/seed, then verify the actual PIN → submission → approval → KPI flow. No remote database has been provisioned or connected, and no GitHub push/deployment has been performed. User confirmation is required before pushing.

The entire original definition of done is not yet verified. Quality-specific document/photo attachments (separate from daily-submission photos), a full set of dedicated executive/productivity report layouts, and exhaustive populated-state browser/end-to-end tests remain follow-up work. Do not call this production-ready until those requirements and the live database test pass.

## Architecture

- TypeScript + React, Next-compatible App Router through **Vinext**, Vite, Cloudflare Workers output. This is not a stock Next.js Node deployment: the Sites scaffold uses the Worker-compatible Vinext runtime.
- Tailwind theme with customized shadcn/Base UI button, input and dialog primitives; Lucide icons; Recharts.
- PostgreSQL + Prisma 6. Runtime uses Prisma Accelerate over HTTPS, not raw TCP. A direct PostgreSQL URL is used only for migrations and seed.
- Zod input validation, bcrypt cost 12, HMAC PIN lookup, random opaque database-backed sessions.
- Normalized `DailySubmissionItem` ledger plus immutable `Adjustment` records. Package-specific progress is derived rather than duplicated into separate progress tables.

## Files

`app/` routes, login, workspace and private APIs; `components/` dashboard, management pages and forms; `lib/domain/` baseline/calculations/workflow; `lib/server/` authentication/database/transactions; `prisma/` schema/migrations/seed; `tests/` calculation/security/isolated PostgreSQL checks. `public/og.png` is the project-specific sharing image.

## Requirements and configuration

Use Node.js 22.13+ and npm. Copy `.env.example` to `.env` and configure it locally. Never send credentials in chat, commit them, or use `NEXT_PUBLIC_` / `VITE_` prefixes for secrets.

| Variable              | Purpose                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | Prisma Accelerate HTTPS connection (`prisma://…` or `prisma+postgres://…`) for runtime PostgreSQL access |
| `DIRECT_DATABASE_URL` | Direct PostgreSQL connection for migrations/seed                                                         |
| `SESSION_SECRET`      | Cryptographically random secret, at least 32 characters; also protects PIN lookup                        |
| `INITIAL_ADMIN_PIN`   | Seed-only initial administrator PIN from the approved brief                                              |
| `INITIAL_FOREMAN_PIN` | Seed-only initial foreman PIN from the approved brief; must differ from Admin                            |
| `TRUST_CLOUDFLARE_IP` | `true` only behind Cloudflare where the platform overwrites the IP header; local default `false`         |
| `PUBLIC_ORIGIN`       | Verified HTTPS origin with no trailing slash, for absolute Open Graph / X image URLs                     |

Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and save it directly to your private environment settings. Rotating this secret requires resetting account PIN lookups with the same new secret; it is not a casual deployment setting.

## Setup and commands

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev -- --host 127.0.0.1 --port 3000
```

Migrations create the schema, checks and immutable-history triggers. Seed is idempotent: it does not overwrite existing accounts, PINs, quantities, weights or baseline settings. It creates the project, four zones, nineteen blocks, activities and two initial accounts. **Individual block capacities, row allocations and pipeline allocations remain null** until entered from approved drawings. Start/finish dates are not invented. Existing database users must not have permission to disable triggers in normal application operation.

Sign in at `http://localhost:3000/`. Enter initial PINs supplied privately through the seed variables. There are no role selectors, saved PINs, role hints or localStorage login shortcuts. Admin should immediately replace initial PINs under Supervisors. The app warns if the default administrator PIN is still active.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run start -- --port 3001
```

`npm test` uses a disposable in-memory PGlite/PostgreSQL engine for SQL migration/integrity tests and never connects to the configured live database. On this Windows sandbox, Node's account lookup required running the test command outside the restricted sandbox; the normal local command is unchanged.

The build regenerates the edge Prisma client, checks TypeScript and produces `dist/server/index.js`, `dist/server/wrangler.json` and `dist/client/`. Seed regenerates the native client for the direct PostgreSQL connection. Package installers that require explicit dependency-script consent must allow Prisma's generation tools and the official esbuild/workerd binary installers.

## Deployment

This is a server-backed application, **not a static Cloudflare Pages export**. Do not deploy just `dist/client` or point Wrangler at `src/index.ts`.

1. Configure PostgreSQL/Accelerate and apply migrations with the direct URL.
2. Seed the initial accounts from private variables. Remove seed-only PIN variables from the hosted runtime afterward.
3. Configure `DATABASE_URL`, `SESSION_SECRET`, `TRUST_CLOUDFLARE_IP=true` and `PUBLIC_ORIGIN` as hosting secrets/environment values. Do not put secrets in Wrangler `vars` or Git.
4. Build with `npm run build`.
5. For a user-managed Cloudflare Worker, deploy the generated configuration: `npx wrangler deploy --config dist/server/wrangler.json`. For Sites-managed hosting, use the Sites save/deploy flow and its runtime environment controls. Do not use a static Pages output-directory configuration for this application.
6. Verify authentication, cookie flags, data persistence, every role restriction and the workflow below on the actual hosting target before operational use.

Cloudflare resources, billing and PostgreSQL/Accelerate accounts must be configured by the owner. bcrypt cost 12 and interactive transactions need a hosting CPU budget / database transaction limits that support them; test on the intended plan before launch.

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
- PINs are bcrypt-hashed and HMAC-indexed with a server secret; never serialized to client state. Unknown PINs take the bcrypt comparison path too. Login failures are persisted and audited; five attempts lock the trusted-IP bucket for 15 minutes. Without a trusted Cloudflare IP header, a shared bucket is used rather than trusting spoofed client headers.
- Sessions are random 256-bit tokens, SHA-256 hashed in the DB, expire after eight hours, and use HttpOnly + SameSite=Strict + Secure in production. Role and active status are checked for every request and again within mutations. PIN reset/deactivation revokes sessions. All writes require same origin.
- Photo files use private authenticated endpoints, signature/type/size validation, and database byte storage. JPEG/PNG/WebP only; five photos per submission, max 5 MB each. Large-scale media storage should move to private object storage when deployment requirements are confirmed.
- CSV exports escape spreadsheet formulas. No request credentials or PINs are printed in audit/error responses.
- Four outstanding high-severity audit findings are in Prisma CLI dependencies (`prisma`, `@prisma/config`, `effect`, `deepmerge-ts`), not the deployed client. Do not execute untrusted Prisma configuration files. Resolve via a tested Prisma toolchain upgrade before a strict zero-advisory production policy; do not run `npm audit fix --force` blindly. The web-runtime advisories were patched.
- Audit UI currently returns the latest 500 events; records remain persisted. Submission filtering/pagination is client-side. Add server pagination for large projects.
- The browser WebMCP action opens daily-progress entry but never approves work. Its live authenticated contract is unverified while the database is unavailable.

## Verification checklist before go-live

1. Seed an isolated staging database, sign in as each role and change the default Admin PIN.
2. Submit foreman work; verify waiting quantities do not affect official totals.
3. Approve it as Admin, then attempt the same approval twice/concurrently; confirm one contribution and one review.
4. Return another submission, revise as its owner and resubmit; reject another; verify both excluded until approval.
5. Verify another Foreman cannot read or edit those records, photos, management pages or Admin endpoints.
6. Configure a block, approve complete prerequisites and test placement both before/after readiness, including hold and documented Admin override.
7. Apply a signed correction; confirm history, totals and nonnegative guards.
8. Test supervisor deactivation/PIN reset/session expiry/lockout; restart the service and verify persistence.
9. Verify photo uploads, CSV/print reports, schedule/weights, private social metadata, and populated-state responsive forms on the deployment target.

Completed local checks: TypeScript, production build, calculation/security unit tests, SQL migration/rollback/immutability tests, and empty-state visual checks of required desktop pages plus representative 375px/768px/1440px layouts. These do not replace a live PostgreSQL/Accelerate end-to-end test.
