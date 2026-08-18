# Workforce

A modern workforce-management dashboard for construction operations. Manage projects, rental companies, labour, equipment, and live project assignments from one responsive workspace.

## Local development

```bash
pnpm install
pnpm dev
```

The local dashboard uses bundled example records when the Pages Function is not available.

## Production build

```bash
pnpm check
pnpm build
```

The static site is generated in `dist/client`. See [CLOUDFLARE_PAGES.md](./CLOUDFLARE_PAGES.md) for the Cloudflare Pages build settings and required D1 binding.

## Main capabilities

- Project portfolio and delivery progress
- Labour directory with rental-company ownership
- Equipment fleet with supplier and daily-rate records
- Direct labour and equipment assignment to projects
- D1-backed persistent records through Cloudflare Pages Functions
