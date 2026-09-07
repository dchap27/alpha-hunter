# Alpha Hunter Field Findings

These findings came from live MCP Inspector testing against real Solana, DexScreener, and Helius data. They complement, rather than replace, the offline automated test suite: offline tests confirm logic against controlled inputs, while these findings confirm behavior against real-world data shapes observed in production use.

## Finding 001 — Token-account concentration interpretation

**Observation**

`assess_token_risk` could identify concentration among returned token accounts, but could not distinguish supply held by liquidity pools, bonding curves, or protocol infrastructure from supply held by private wallets. Real token data confirmed a top account holding 86.9% of supply was the token’s own DexScreener `pairAddress`, not a private wallet.

**Implication**

A high concentration percentage must not automatically be interpreted as insider or private-wallet concentration.

**Status**

**PARTIALLY RESOLVED — primary pool case**

**Resolution**

`computeRiskSignals` now accepts an optional `pairAddress`. When a returned token account’s `ownerAddress` matches it exactly, an additive `pool_address_among_holders` signal is surfaced alongside the existing concentration warning. Both facts are retained. `investigate_token` passes the pair address through. The standalone `assess_token_risk` behavior is unchanged when no pair address is available. This resolves the confirmed primary-pool case, but does not fully classify every infrastructure account.

Protocol infrastructure accounts other than the primary pool, such as secondary program accounts, are not distinguished by this fix.

## Finding 002 — Bonding curve liquidity blind spot

**Observation**

Bonding-curve-stage tokens can have `liquidityUsd: null`. This creates an analytical blind spot because discovery and market analysis rely partly on conventional DEX liquidity metrics. This reflects that DexScreener has no pool liquidity to report when a pool does not yet exist.

**Implication**

Early-stage or bonding-curve tokens may require a separate analysis pathway rather than established-market assumptions.

**Status**

**OPEN — partially mitigated**

**Partial mitigation shipped**

`analyze_token` adds an additive `possible_bonding_curve_stage` info signal when `liquidityUsd` is null and `dexId` matches a confirmed pre-migration venue. `BONDING_CURVE_DEX_IDS` currently contains only `"pumpfun"` and should be extended only with new confirmed evidence. This flags a likely cause but does not provide liquidity data for bonding-curve-stage tokens.

**Recommended future work**

Add early-stage or bonding-curve intelligence through a genuinely new data source, such as direct bonding-curve program-state reads or a launch-platform API. This is outside the current scope.

## Finding 003 — Missing creator identity data

**Observation**

Real tokens can return both `creators: []` and `mintAuthorityKnown: false`. Creator information is not guaranteed to be available.

**Implication**

Future creator analysis requires explicit fallback behavior and confidence levels. Unknown information must not automatically be interpreted as suspicious information.

**Status**

**OPEN — design decision recorded, not yet implemented**

**Recorded fallback strategy for future implementation**

Resolve creator identity in this order:

1. `creators[0]?.address` when `creators[]` is non-empty.
2. `mintAuthority` only when non-null; a revoked or unknown authority is not a usable search key.
3. If neither exists, return a distinct typed `no creator/authority identifier available` result. This is not an error and does not justify a guess.

A future tool therefore needs three outcomes, not two.

**Recommended future work**

Build creator and funding-wallet attribution with confidence levels using the recorded fallback order.

## Finding 004 — Wallet activity capability verified

**Observation**

`get_wallet_activity` was tested against the real Helius plan and returned live data, resolving the prior open question about whether the required plan tier was available.

**Status**

**VERIFIED**

**Implication**

Wallet activity intelligence can proceed to future data-normalization work.

## Finding 005 — Swap fragmentation

**Observation**

A single real swap can produce multiple transfer rows sharing one transaction signature. Real data showed one pumpswap/pump.fun swap producing seven tiny outgoing SOL transfers, likely fee/referral splits, plus one incoming token transfer, all under one signature. Raw transfer rows must not be interpreted as independent user actions.

**Implication**

Future wallet-pattern analysis must normalize and group transfers by signature before calculating behavioral metrics.

**Status**

**RESOLVED**

**Resolution**

`get_wallet_activity` now includes `transactionGroups`, grouped by signature in first-seen order with an `activityCount` for each group, alongside the unchanged flat `activities` array. This is purely structural: it performs no swap or trade inference. The existing no-swap-semantics limitation remains and now explicitly covers the grouped field.

## Finding 006 — No Helius retry policy

**Observation**

Helius integrations have timeout and error handling but no retry policy. One transient failure was observed during live testing: a single `get_token_onchain_data` call failed, then succeeded on manual retry hours later with consistent data.

**Implication**

Retry behavior should remain an explicit architecture decision, particularly because Helius requests consume metered API credits.

**Status**

**DECIDED — no automatic retry, by design, for now**

**Rationale**

One anecdotal transient failure is insufficient evidence to justify the credit cost and multi-file complexity of a retry policy. Any future policy would need careful scope: at most one retry, only for genuinely transient categories, and never for `configuration_error`, `not_found`, or `api_error`. The current behavior deliberately surfaces failures honestly and lets the caller retry. This is an explicit documented architecture decision in this findings record; no separate retry-policy module or code-level retry guard has been implemented.

Revisit this decision if transient failures become a demonstrated recurring pattern during real use.
