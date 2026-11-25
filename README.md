# Arthi Digital Enterprises Admin Dashboard

Full-stack administration dashboard for shop subscriptions, payment verification, devices, customers, engagement, scratch cards, reports, audit and settings.

## Stack

- React 18, Vite, Tailwind CSS, TanStack Query
- Express TypeScript API for Vercel serverless deployment
- Supabase Auth, Postgres, RPC transactions and RLS
- Vitest and Supertest

## Local development

1. Copy `.env.example` to `.env`.
2. Replace the Supabase and server placeholders.
3. Apply migrations: `npm run db:push`
4. Generate a licence key: `npm run keys:licence`
5. Provision the first administrator: `npm run provision:admin`
6. Start both services: `npm run dev`

The web app runs on `http://localhost:5173` and the API on `http://localhost:3001`.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

No real credentials or customer data are stored in this repository.
