# Alpha Hunter

Alpha Hunter is an AI-assisted onchain trading intelligence system, initially focused on Solana memecoins. This repository currently provides only the production-minded TypeScript and Model Context Protocol (MCP) server foundation.

## Current status

The initial application skeleton is in place. It exposes a health check, factual Solana token market data from DexScreener, and deterministic analysis derived only from that market data. It deliberately contains no trading logic, token discovery, wallet tracking, other external providers, or AI integrations.

## Local setup

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env
npm run dev
```

The server uses MCP's stdio transport; it is intended to be launched by an MCP-compatible client. Keep standard output reserved for the protocol.

To use the Helius-backed tool, provide `HELIUS_API_KEY` in the process environment before starting the server (for example, `export HELIUS_API_KEY=...`). The existing health, DexScreener, and deterministic analysis tools do not require this key.

Observation data is stored locally with `better-sqlite3`. Set optional `ALPHA_HUNTER_DB_PATH` to override the default `data/alpha-hunter.sqlite`; database files are ignored by Git. `better-sqlite3` is mature and synchronous, while Node's `node:sqlite` remains experimental and has required runtime flags on some Node 22 releases.

## MCP tools

| Tool | Input | Description |
| --- | --- | --- |
| `health` | None | Returns the service health status. |
| `get_token_market_data` | `tokenAddress: string` | Retrieves a normalized Solana market snapshot from DexScreener. |
| `analyze_token` | `tokenAddress: string` | Produces deterministic ratios, data-quality details, and factual market-data observations. |
| `get_token_onchain_data` | `tokenAddress: string` | Retrieves normalized factual Solana asset identity, metadata, mint, and authority data from Helius. |
| `get_token_holders` | `tokenAddress: string`, optional `limit` | Retrieves factual token-account balances from Helius. |
| `discover_tokens` | Optional `sources` and `limit` | Returns a DexScreener Solana candidate seed list. |
| `screen_discovery_candidates` | Optional `limit` | Enriches discovery candidates with market data, applies transparent filters, and returns deterministic ranked candidates. |
| `assess_token_risk` | `tokenAddress: string` | Produces factual authority-status and token-account concentration observations; not a recommendation or score. |
| `add_to_watchlist` | `tokenAddress: string`, optional `reason` | Adds a token idempotently to the local observation watchlist. |
| `get_watchlist` | Optional `limit` | Lists watched tokens. |
| `capture_token_snapshot` | `tokenAddress: string` | Stores a timestamped DexScreener market snapshot and auto-adds unwatched tokens. |
| `compare_token_snapshots` | `tokenAddress: string`, optional snapshot IDs | Reports factual percentage deltas; omitted IDs compare earliest/latest and fewer than two snapshots is insufficient data. |
| `get_wallet_activity` | `walletAddress: string`, optional `limit` | Retrieves normalized factual Solana transfer activity from Helius. |
| `investigate_token` | `tokenAddress: string` | Combines existing market, analysis, onchain, risk, and read-only observation data into one factual report. |
| `add_to_research_queue` | `tokenAddress`, optional status/priority/reason | Adds an idempotent research workflow entry. |
| `update_research_status` | `tokenAddress`, `status` | Changes only the workflow label. |
| `update_research_priority` | `tokenAddress`, `priority` | Changes only the research priority label. |
| `get_research_queue` | Optional status, priority, limit | Lists entries in explicit HIGH, MEDIUM, LOW priority order. |
| `archive_research_token` | `tokenAddress` | Sets an entry to ARCHIVED without touching observation data. |

`get_token_market_data` uses DexScreener's public `token-pairs/v1/solana/{tokenAddress}` endpoint. Requests time out after approximately 8 seconds. When multiple Solana pairs are returned, Alpha Hunter selects the pair with the highest USD liquidity; ties keep DexScreener's response order. The tool reports factual market data only and does not assess token safety or investment quality.

`analyze_token` uses the same normalized DexScreener data and does not call an AI model or another provider. Its output is deterministic, market-data-only, and not investment advice.

`get_token_onchain_data` uses Helius DAS `getAsset`: a `POST` JSON-RPC request to `https://mainnet.helius-rpc.com/?api-key=HELIUS_API_KEY` with the token mint as `params.id`. It provides factual onchain data only and is not investment advice.

`get_token_holders` uses Helius DAS `getTokenAccounts` via `POST` to the same endpoint and reuses `getAsset` for the mint's supply and decimals. It accepts a required `tokenAddress` and optional `limit`; limits are clamped to 1–1,000 (default 100). Raw account amounts are converted to UI amounts using the mint decimals, and percentages are calculated against total supply; percentages remain `null` when supply or decimals are unavailable. Results represent token accounts, not unique people or entities.

`discover_tokens` queries DexScreener's `GET /token-profiles/latest/v1`, `GET /token-boosts/latest/v1`, and `GET /token-boosts/top/v1` endpoints (each documented at a 60 requests/minute rate limit). It filters to Solana, deduplicates by token address, labels each candidate by source, and merges boost values. This is a candidate seed list from self-submitted profiles and paid boosts—not trending or volume-ranked discovery. True trending/new-pair discovery is deferred to a future Birdeye or Solana RPC integration.

`screen_discovery_candidates` builds on (and does not replace) `discover_tokens`. A `CandidateSource` adapter supplies those identities, then the existing `get_token_market_data` service enriches each candidate with pair data. Enrichment is capped at 30 candidates per call to protect DexScreener rate limits and latency; the output `limit` is separate and defaults to 10 (maximum 50).

Screening thresholds are configurable in `src/config/discoveryThresholds.ts`: minimum liquidity is `$1,000`, minimum 24-hour volume is `$1,000`, and maximum pair age is 7 days. A missing field is not treated as a failed criterion. Ranking is auditable and non-composite: newest pair first, then liquidity descending, then 24-hour volume descending, with token address as a stable tie-breaker. Each result includes factual `reasons` tags. This is not investment advice; candidates are not recommendations.

`assess_token_risk` combines existing Helius authority data and token-account concentration data into deterministic factual observations. It reports authority status and the percentage of total supply represented by returned token accounts in the top 10, using `TOP10_CONCENTRATION_WARNING_PCT = 50` as an observation threshold. It does not produce a numeric score, verdict, creator or wallet history, bundle detection, or investment advice; those capabilities are deferred.

## Observation Engine v0.1

The Observation Engine records factual historical data for research. It does not predict future performance or provide trading recommendations. The local schema contains `watchlist_entries` (primary key `token_address`) and `token_snapshots` (foreign-keyed to the watchlist); an index on `(token_address, captured_at)` keeps per-token history queries efficient. Repeated watchlist adds preserve the original timestamp and reason. Snapshot capture stores only normalized DexScreener fields and returns typed provider failures without writing a row.

Capture is explicit when the MCP tool is called. This stdio server has no background scheduler; automated interval capture is deferred to a future external cron/timer mechanism.

## Research Queue & Workflow Engine v0.1

The research queue is a separate `research_queue` table from the observation watchlist. Entries use workflow statuses `DISCOVERED`, `SCREENED`, `INVESTIGATED`, `WATCHING`, and `ARCHIVED`, plus independent priorities `LOW`, `MEDIUM`, and `HIGH`. New entries default to `DISCOVERED` and `MEDIUM`; duplicate adds preserve the original record. Queue listing uses an explicit `CASE` ordering for HIGH → MEDIUM → LOW (plain alphabetical ordering would be incorrect), then `updated_at` descending. Archiving changes only the queue row and never deletes or modifies watchlist entries or snapshots. Research workflow status and priority represent research organization only. They are not investment recommendations or trading signals.

`get_wallet_activity` uses Helius's `getTransfersByAddress` JSON-RPC method (`POST` to `https://mainnet.helius-rpc.com/?api-key=HELIUS_API_KEY`) with positional parameters `[walletAddress, { limit }]`. It was chosen over `getTransactionsForAddress` because Helius returns parsed transfer objects, avoiding custom transaction parsing; the deprecated Enhanced Transactions API is not used. The method requires a Helius Developer plan or higher and costs 10 credits per request; an unsupported plan may return an authorization error. Provider `type` values are passed through exactly, with no inferred swap or trade semantics. The default activity limit is 50 and the maximum is 100, matching Helius's documented range. Wallet activity data does not by itself establish wallet profitability, intelligence, or future trading success.

## Token Investigation

`investigate_token` orchestrates the existing DexScreener and Helius services. Market, identity, and token-account requests run in parallel; successful results populate the corresponding market, deterministic analysis, onchain, and risk sections, while independent failures are listed as limitations. Observation history is read-only during investigation. Status values are `ok` (all sections succeeded), `partial` (at least one section or observation read failed), `not_found` (both market and identity explicitly report not found), and `error` (both market and identity failed for other reasons). The `not_found` and `error` cases are checked before `partial` so genuine absence or total failure is not masked by degradation. The investigation report provides factual market and onchain intelligence. It does not provide investment recommendations or trading instructions.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the MCP server with file watching. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run typecheck` | Check types without emitting files. |
| `npm test` | Build and run the Node test suite. |

## Roadmap

1. Add configuration validation and application services.
2. Introduce data-source adapters and scanners.
3. Add analysis, intelligence, and monitoring capabilities.
4. Evaluate trading workflows only after the intelligence layer is established.
