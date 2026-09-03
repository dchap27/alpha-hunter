export interface HeliusTokenAccount extends Record<string, unknown> {
  tokenAccountAddress: string;
  mint: string;
  ownerAddress: string;
  amount: number;
  decimals: number | null;
  amountUi: number | null;
  delegatedAmount: number | null;
  frozen: boolean | null;
  burnt: boolean | null;
  amountPercentageOfSupply: number | null;
}

export interface HeliusTokenAccountsData extends Record<string, unknown> {
  tokenAddress: string;
  owner: string | null;
  totalSupplyUi: number | null;
  decimals: number | null;
  limit: number | null;
  cursor: string | null;
  lastIndexedSlot: number | null;
  accounts: HeliusTokenAccount[];
  summary: {
    returnedAccountCount: number;
    totalAccountsAvailable: number | null;
    largestReturnedAccountPercentage: number | null;
    top5ReturnedAccountsPercentage: number | null;
    top10ReturnedAccountsPercentage: number | null;
  };
  limitations: string[];
}

export type HeliusTokenAccountsResult =
  | { ok: true; data: HeliusTokenAccountsData }
  | {
      ok: false;
      reason:
        | "configuration_error"
        | "not_found"
        | "http_error"
        | "rate_limited"
        | "api_error"
        | "malformed_response"
        | "network_error";
      detail: string;
      statusCode: number | null;
    };
