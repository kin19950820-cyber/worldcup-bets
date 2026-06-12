# World Cup Bets

## Working Style

- Read only files relevant to the request. Start with `rg`/`rg --files`; do not scan the whole repository.
- Ignore generated or secret-bearing paths unless the task explicitly requires them: `.next/`, `node_modules/`, `.vercel/`, `*.tsbuildinfo`, `.env*`.
- Never print, edit, or commit secret values. Use `.env.local.example` only for variable names.
- Preserve unrelated working-tree changes. Make the smallest coherent change and avoid speculative refactors.
- Do not repeatedly summarize files already read. Keep responses concise and report changed files plus verification.

## Stack

- Next.js App Router + React + strict TypeScript
- Tailwind CSS
- Supabase Auth/Postgres/RLS via `@supabase/ssr`
- Server actions in `lib/actions/`
- Path alias: `@/*` maps to the repository root
- Product locale: Traditional Chinese (`zh-Hant-HK`)
- Business timezone: `Asia/Hong_Kong`; currency: `HK$`

## Source Map

- `app/`: routes, layouts, and API handlers
- `components/`: client and shared UI
- `lib/actions/`: server-side reads and mutations
- `lib/supabase/client.ts`: browser Supabase client
- `lib/supabase/server.ts`: cookie-aware server client and service-role client
- `lib/types.ts`: shared domain types
- `lib/utils.ts`: formatting and timezone helpers
- `supabase/migrations/`: schema, indexes, triggers, and RLS
- `middleware.ts`: auth session refresh and route protection
- `SETUP.md`: deployment/setup reference; read only for setup tasks

## Invariants

- Use `supabase.auth.getUser()` for trusted server-side identity checks.
- `createServiceClient()` bypasses RLS. Use it only in server-only code after authorization; never import it into client components.
- Admin mutations must verify `profiles.role === "admin"` before using service-role access.
- Treat bet placement and settlement as financial operations. Validate inputs, match state, ownership/role, and balance; keep bet, balance, and transaction records consistent.
- Store timestamps as UTC ISO values. Format display times with helpers from `lib/utils.ts`.
- Revalidate every affected route after server mutations.
- Database changes require a new migration; do not rewrite an applied migration unless explicitly requested.
- Keep user-facing copy in Traditional Chinese and preserve existing terminology.

## Commands

```bash
npm run dev
npx tsc --noEmit
npm run build
```

Run `npx tsc --noEmit` for normal code changes. Run `npm run build` for routing, configuration, dependency, or release-sensitive changes. There is currently no test suite; do not claim tests passed.

## Task Completion

1. Inspect the narrow dependency path before editing.
2. Implement the requested behavior end to end.
3. Run the smallest relevant verification.
4. Report failures plainly, including whether they pre-existed.
