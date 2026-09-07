/**
 * A 24-hour volume multiple above this value is surfaced because activity is
 * large relative to the liquidity currently reported for the representative pair.
 * It is an observation threshold, not an investment recommendation.
 */
export const HIGH_VOLUME_TO_LIQUIDITY_RATIO = 5;

/** Confirmed live pattern: pumpfun pairs with null liquidity can precede pumpswap pairs with tracked liquidity. Extend only with new evidence. */
export const BONDING_CURVE_DEX_IDS = ["pumpfun"] as const;
