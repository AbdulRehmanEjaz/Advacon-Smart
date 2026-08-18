# Cloudflare Pages deployment

This repository is prepared for a Git-connected Cloudflare Pages project.

## Build settings

- Production branch: `main`
- Build command: `pnpm run build`
- Build output directory: `dist/client`
- Root directory: `/`
- Node.js version: `22.19.0`

## Required D1 binding

Create or select a D1 database in Cloudflare, then add it to both Production and Preview under **Settings → Bindings** with the variable name `DB`.

The Pages Function at `/api/workforce` creates the workforce tables and initial example records on its first request. The dashboard remains readable with bundled example data if the binding is temporarily unavailable, but adding records and updating assignments require `DB`.

## Runtime shape

- The dashboard is emitted as a static Vinext site in `dist/client`.
- Cloudflare builds `functions/api/workforce.ts` as a Pages Function.
- Static security and cache headers are copied from `public/_headers`.
