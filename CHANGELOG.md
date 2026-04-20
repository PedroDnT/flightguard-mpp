# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-04-20

### Changed

- Migrated all imports to domain-organized structure (`src/domain/`, `src/integrations/`, `src/config/`, `src/shared/`)
- Updated `app/api/insure/route.ts` and `app/api/policy/[id]/route.ts` to import from new domain paths
- Updated `lib/flight-search.ts` to import from `src/config/types` and `src/integrations/aerodatabox`
- Updated `index.ts` to delegate to `src/app/index.ts` (single-line entry point)
- Updated all unit tests (`checker`, `flight`, `payout`, `server`, `store`, `testnet`) to reference new module paths

### Removed

- Deleted legacy flat files superseded by domain structure: `src/alchemy.ts`, `src/checker.ts`, `src/flight.ts`, `src/payout.ts`, `src/server.ts`, `src/store.ts`, `src/types.ts`

## [0.1.0] - 2026-01-01

### Added

- Initial release: parametric flight delay insurance on Tempo blockchain
- MPP-gated `POST /insure` endpoint (1 pathUSD premium)
- Automatic payout (5 pathUSD) when flight delay ≥ 60 minutes
- Flight Checker worker polling AeroDataBox every 5 minutes
- In-memory policy store with JSON persistence
- Admin panel with audit log
- Hardhat smart contract (`FlightGuard.sol`) for on-chain policy tracking
- Next.js frontend (buy, policies, flights pages)
