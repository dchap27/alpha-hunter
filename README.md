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

## MCP tools

| Tool | Input | Description |
| --- | --- | --- |
| `health` | None | Returns the service health status. |
| `get_token_market_data` | `tokenAddress: string` | Retrieves a normalized Solana market snapshot from DexScreener. |
| `analyze_token` | `tokenAddress: string` | Produces deterministic ratios, data-quality details, and factual market-data observations. |
| `get_token_onchain_data` | `tokenAddress: string` | Retrieves normalized factual Solana asset identity, metadata, mint, and authority data from Helius. |
| `get_token_holders` | `tokenAddress: string`, optional `limit` | Retrieves factual token-account balances from Helius. |
| `discover_tokens` | Optional `sources` and `limit` | Returns a DexScreener Solana candidate seed list. |

`get_token_market_data` uses DexScreener's public `token-pairs/v1/solana/{tokenAddress}` endpoint. Requests time out after approximately 8 seconds. When multiple Solana pairs are returned, Alpha Hunter selects the pair with the highest USD liquidity; ties keep DexScreener's response order. The tool reports factual market data only and does not assess token safety or investment quality.

`analyze_token` uses the same normalized DexScreener data and does not call an AI model or another provider. Its output is deterministic, market-data-only, and not investment advice.

`get_token_onchain_data` uses Helius DAS `getAsset`: a `POST` JSON-RPC request to `https://mainnet.helius-rpc.com/?api-key=HELIUS_API_KEY` with the token mint as `params.id`. It provides factual onchain data only and is not investment advice.

`get_token_holders` uses Helius DAS `getTokenAccounts` via `POST` to the same endpoint and reuses `getAsset` for the mint's supply and decimals. It accepts a required `tokenAddress` and optional `limit`; limits are clamped to 1–1,000 (default 100). Raw account amounts are converted to UI amounts using the mint decimals, and percentages are calculated against total supply; percentages remain `null` when supply or decimals are unavailable. Results represent token accounts, not unique people or entities.

`discover_tokens` queries DexScreener's `GET /token-profiles/latest/v1`, `GET /token-boosts/latest/v1`, and `GET /token-boosts/top/v1` endpoints (each documented at a 60 requests/minute rate limit). It filters to Solana, deduplicates by token address, labels each candidate by source, and merges boost values. This is a candidate seed list from self-submitted profiles and paid boosts—not trending or volume-ranked discovery. True trending/new-pair discovery is deferred to a future Birdeye or Solana RPC integration.

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
