export interface WalletActivityItem extends Record<string, unknown> {
  signature: string;
  timestamp: number | null;
  slot: number | null;
  type: string;
  mint: string | null;
  direction: "in" | "out" | null;
  counterparty: string | null;
  amountRaw: string | null;
  decimals: number | null;
  uiAmount: string | null;
  confirmationStatus: string | null;
}

export interface WalletActivityData extends Record<string, unknown> {
  walletAddress: string;
  activities: WalletActivityItem[];
  pagination: { token: string | null };
  limitations: string[];
}

export type WalletActivityServiceResult =
  | { ok: true; data: WalletActivityData }
  | {
      ok: false;
      reason: "configuration_error" | "not_found" | "http_error" | "api_error" | "malformed_response" | "network_error";
      detail: string;
      statusCode: number | null;
    };
