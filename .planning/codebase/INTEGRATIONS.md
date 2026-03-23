# External Integrations

## AeroDataBox (Flight Data API)

- **Provider**: RapidAPI marketplace — `aerodatabox.p.rapidapi.com`
- **Auth**: `X-RapidAPI-Key` header (from `RAPIDAPI_KEY` env var)
- **Endpoint used**: `GET /flights/number/{flightNumber}/{date}`
- **Implementation**: `src/flight.ts` → `fetchFlightInfo()`
- **Called from**: `src/server.ts` (policy creation), `src/checker.ts` (polling loop)
- **Response handling**: Returns `FlightInfo | null`; 404 → null; non-200 → throws
- **Rate limits**: Free tier has request limits — monitor RapidAPI dashboard

### Data extracted
- Flight status: `Scheduled`, `Departed`, `EnRoute`, `Landed`, `Arrived`, `Cancelled`, `Diverted`
- Departure delay minutes (`departure.delays[0].minutes`)
- Scheduled departure UTC (stored at policy creation)
- Actual departure times

---

## Tempo Network (Blockchain)

- **Network**: Tempo (EVM-compatible)
- **Testnet**: Chain ID `42431`, RPC `https://rpc.moderato.tempo.xyz`, explorer `https://explore.testnet.tempo.xyz`
- **Mainnet**: Chain ID `4217`, RPC `https://rpc.tempo.xyz`, explorer `https://explore.tempo.xyz`
- **Auth**: Pool wallet private key (`POOL_PRIVATE_KEY` env var)
- **Implementation**: `src/payout.ts` → `PayoutEngine`
- **Library**: viem (`createWalletClient`, `createPublicClient`)

### Operations
- `balanceOf(poolAddress)` — check pool balance before payout
- `transfer(toAddress, amount)` — ERC-20 pathUSD transfer to policyholder
- `waitForTransactionReceipt` — 30s timeout; Tempo has sub-second finality

---

## pathUSD (Stablecoin)

- **Type**: ERC-20 / TIP-20 stablecoin on Tempo
- **Decimals**: 6 (same as USDC)
- **Testnet address**: `0x20c0000000000000000000000000000000000000`
- **Mainnet address**: configured via `PATHUSD_ADDRESS` env var
- **ABI used**: minimal — only `transfer` and `balanceOf` (`src/payout.ts`)

---

## mppx (Micropayment Protocol)

- **Package**: `mppx@^0.4.5`
- **Role**: Payment gating on `POST /insure` — customer pays premium before policy is issued
- **Flow**:
  1. `Mppx.create()` with `tempo()` adapter pointing `recipient` at `POOL_ADDRESS`
  2. `mppx.charge({ amount: premiumAmount })` — returns 402 challenge if unpaid
  3. On paid request: `r.withReceipt(c.json(response))` attaches payment receipt to response
- **Implementation**: `src/server.ts`

---

## FlightGuard Smart Contract (auxiliary on-chain registry)

- **File**: `contracts/FlightGuard.sol`
- **Purpose**: On-chain policy registry + USDC pool management
- **Note**: The current server (`src/payout.ts`) sends pathUSD via direct ERC-20 transfer — the smart contract is an **auxiliary layer** available for deployment but not used in the live server flow
- **Functions**: `registerPolicy()`, `triggerPayout()`, `expirePolicy()`, `fund()`, `withdraw()`
- **Access control**: `Ownable` — only contract owner (deployer) can call protected functions
- **Events**: `PolicyRegistered`, `PayoutTriggered`, `PolicyExpired`, `PoolFunded`, `PoolWithdrawn`

---

## No External Integrations

- **Database**: none — in-memory `Map` only
- **Auth provider**: none — access gated by MPP payment
- **CI/CD**: none configured
- **Monitoring**: console logging only (`[SERVER]`, `[CHECKER]`, `[PAYOUT]`, `[FLIGHT]`, `[STORE]` prefixes)
- **Webhooks**: none
