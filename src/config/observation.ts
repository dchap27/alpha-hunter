import path from "node:path";

/** Default local SQLite file used when ALPHA_HUNTER_DB_PATH is not set. */
export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "alpha-hunter.sqlite");

export function getDatabasePath(): string {
  return process.env.ALPHA_HUNTER_DB_PATH?.trim() || DEFAULT_DB_PATH;
}

/** Default number of watchlist entries returned by get_watchlist. */
export const DEFAULT_WATCHLIST_LIMIT = 100;

/** Maximum number of watchlist entries returned by get_watchlist. */
export const MAX_WATCHLIST_LIMIT = 1_000;
