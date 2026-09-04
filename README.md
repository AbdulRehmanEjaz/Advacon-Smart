# Tree Control

Tree Translocation Project Control Dashboard for `https://swiftops.web.id`.

## Architecture

- React 19, TypeScript, Vinext/Vite and Cloudflare Workers.
- Cloudflare D1 binding `DB` (`advacon_db`) stores all project and operational data.
- Native prepared D1 statements and `DB.batch()` provide the data layer. The stable application service is `lib/server/service.ts`; it does not use Prisma or PostgreSQL.
- `ADMIN_PIN`, `SUPERVISOR_PIN` and `SESSION_SECRET` provide stateless login. PIN verification and signed-session verification make zero database queries.
- One compact project snapshot is loaded immediately after login and retained in the client Workspace. Ordinary sidebar navigation is client-side. Audit history loads in the rendered page on first visit and is cached for the session.
- Submission photo rows contain metadata and future external-file references only. Large photo bytes are not stored in D1.

The development-only `/design-preview` uses an explicitly labelled empty baseline and returns 404 in production. The D1 seed creates no progress, submissions, approvals, adjustments, inspections or observations.

## Required configuration

Use Node.js 22.13+ and npm.

| Setting | Purpose |
| --- | --- |
| D1 binding `DB` | Existing `advacon_db` database |
| `SESSION_SECRET` | Private random value of at least 32 characters used to sign cookies |
| `ADMIN_PIN` | Private three-digit Project Administrator PIN |
| `SUPERVISOR_PIN` | Private three-digit Site Supervisor PIN; must differ from Admin |
| `PUBLIC_ORIGIN` | Verified HTTPS origin, normally `https://swiftops.web.id` |

Do not use client-prefixed names for secrets. `TRUST_CLOUDFLARE_IP` is not read by this application. `DATABASE_URL` and `DIRECT_DATABASE_URL` are not used by the Worker and should only be retained privately while the old PostgreSQL database is kept as a rollback/export source.

## Local setup

```sh
npm install
npm run build
npm run d1:migrate:local
npm run d1:seed:local
npm run dev -- --host 127.0.0.1 --port 3000
```

The generated Worker configuration is `dist/server/wrangler.json`, so build before running the D1 commands. The migration creates the schema, indexes and integrity triggers. The seed uses `INSERT OR IGNORE`, is safe to rerun, and creates only missing baseline and retained history-identity records. It never deletes or updates operational progress.

## Production D1 initialization

The Cloudflare Worker and D1 binding already exist. From an authenticated local terminal, build and then run:

```sh
npm run build
npm run d1:migrate:remote
npm run d1:seed:remote
```

These commands target binding `DB` through `dist/server/wrangler.json`. Do not paste Cloudflare tokens or database credentials into chat or commit them. Confirm the remote database name displayed by Wrangler is `advacon_db` before accepting any future interactive change.

The existing GitHub-to-Cloudflare build should use:

```sh
npm install
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

This is a Worker application, not a static Pages export. Do not set a static build-output directory and do not point Wrangler at `src/index.ts`.

## Safe PostgreSQL backup/cutover

The migration does not connect to, alter, reset or delete the old PostgreSQL database. Keep it unchanged until the D1 deployment has been verified.

1. Privately inspect the old database for non-baseline submissions, approvals, adjustments, inspections, observations, audit events, block configuration, schedules or settings changes.
2. If it contains only baseline identities and no operational records, the idempotent D1 baseline seed is sufficient.
3. If real records exist, stop before production cutover. Export a read-only snapshot using the database provider's backup/export facility, retain original IDs and ISO timestamps, and test a reviewed one-time table mapping against a separate D1 staging copy.
4. Compare row counts and approved totals by project, activity and block. Exercise return/resubmit and approval once in staging. Only then import the same immutable export into production D1.
5. Never use the baseline seed as a substitute for operational-data migration and never fabricate missing progress.

No automatic PostgreSQL importer is included because silently transforming live operational history without first inspecting the source would be unsafe. The old database remains the backup and is not a runtime fallback.

## Validation commands

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:worker
```

`npm run test:worker` runs the built Worker in Miniflare with persistent local D1 storage. It applies the D1 migration and idempotent seed, verifies both secret-backed roles, then exercises waiting, approval, duplicate-review prevention, return, rejection, resubmission, settings, supervisor rename, inspection, audit, logout and persistence after a Worker restart.

## Data and workflow rules

- Baseline: 13,524 design capacity; approximately 10,000 relocated trees; 3,500 new trees; 17,220 m irrigation; 19 blocks; 312 support rows; 1,560 posts; 5 posts per row.
- Zones A/B/C/D have 4,416 / 6,912 / 1,080 / 1,116 capacity and 6 / 9 / 2 / 2 blocks. Individual block capacities and allocations remain unset until approved values are entered.
- Package weights remain 5 / 5 / 25 / 20 / 30 / 10 / 3 / 2 percent. Existing internal weights and target rules are retained.
- Only `APPROVED` submission quantities plus signed adjustments contribute to progress. `WAITING`, `RETURNED` and `REJECTED` contribute zero. Approval version uniqueness and D1 guards prevent duplicate contribution.
- A block is ready only when irrigation is commissioned and its support system is approved, unless the existing documented Admin override applies.
- Approval, adjustment and audit records are immutable. Historical users are archived rather than deleted whenever references exist.
- Runtime authentication recognizes the two Worker-secret identities. Supervisor record PIN fields are reserved for a future dynamic-auth phase and do not alter the current secret-backed login.

## Security and current limits

- Three-digit PINs have only 1,000 combinations. Put the public login behind Cloudflare rate limiting and preferably Cloudflare Access or another private perimeter.
- Cookies are host-only, HttpOnly, SameSite=Strict, Secure in production and expire after eight hours. Rotating `SESSION_SECRET` revokes all sessions.
- Authorization is enforced server-side, writes require same-origin requests, and private data is returned with `Cache-Control: no-store`.
- Photo upload bytes are intentionally rejected until external storage is connected; D1 keeps metadata/reference fields only.
- Audit detail currently returns the latest 500 rows. Add server pagination if the project grows beyond that operational size.

## Go-live checklist

1. Apply the remote D1 migration and baseline seed once.
2. Verify generated `dist/server/wrangler.json` contains `DB` mapped to `advacon_db`.
3. Verify both PINs, incorrect PIN handling, logout, cookie tampering and Admin/Foreman authorization on the deployed domain.
4. Submit Supervisor work and confirm `WAITING` does not affect progress; approve once and confirm the total changes exactly once.
5. Verify return, correction/resubmit, rejection, settings, supervisor rename, inspection and audit persistence after a new deployment.
6. If operational PostgreSQL data exists, complete the staged export/import verification before relying on D1 in production.
7. After the live D1 workflow is verified, remove `DATABASE_URL`, `DIRECT_DATABASE_URL` and `TRUST_CLOUDFLARE_IP` from the Worker environment. Keep `SESSION_SECRET`, `ADMIN_PIN`, `SUPERVISOR_PIN` and `PUBLIC_ORIGIN`.
