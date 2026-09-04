/** Minimum reported USD liquidity required when that field is available. */
export const MIN_LIQUIDITY_USD = 1_000;

/** Minimum reported 24-hour USD volume required when that field is available. */
export const MIN_VOLUME_24H_USD = 1_000;

/** Maximum pair age used for the recency filter when pairCreatedAt is available. */
export const MAX_PAIR_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/** Caps enrichment requests to protect DexScreener rate limits and invocation latency. */
export const MAX_CANDIDATES_TO_ENRICH = 30;

/** Default number of screened candidates returned after filtering and ranking. */
export const DEFAULT_SCREENING_LIMIT = 10;

/** Maximum number of screened candidates a caller may request. */
export const MAX_SCREENING_LIMIT = 50;
