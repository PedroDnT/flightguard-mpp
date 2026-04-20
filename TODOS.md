# TODOS

## Architecture

- [ ] Resolve 600+ JSX TypeScript errors in `app/` pages caused by missing `.next/types/routes.d.ts` — run `next build` to generate it and verify `tsconfig.json` includes it
  **Priority:** P1

- [ ] Remove `test_output.txt` from repo root (add to `.gitignore`)
  **Priority:** P2

- [ ] Move `lib/` helpers (`audit.ts`, `auth.ts`, `flight-search.ts`) into `src/` to keep all backend logic co-located
  **Priority:** P3

- [ ] Add `src/workers/` directory and move `index.ts` entry point delegation there for clarity
  **Priority:** P3

## Testing

- [ ] Fix `npm run typecheck` (exit code 2) — JSX intrinsic element errors need `.next/types/routes.d.ts` generated
  **Priority:** P1

- [ ] Add integration test coverage for Next.js API routes (`app/api/insure`, `app/api/policy`)
  **Priority:** P2

## Completed

- [x] Migrate all imports to domain-organized structure (`src/domain/`, `src/integrations/`, `src/config/`, `src/shared/`)
  **Completed:** v0.1.1 (2026-04-20)

- [x] Delete legacy flat src/ files (`src/alchemy.ts`, `src/checker.ts`, `src/flight.ts`, `src/payout.ts`, `src/server.ts`, `src/store.ts`, `src/types.ts`)
  **Completed:** v0.1.1 (2026-04-20)
