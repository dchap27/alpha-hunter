export interface HeliusCreator extends Record<string, unknown> {
  address: string;
  share: number | null;
  verified: boolean | null;
}

export interface HeliusAuthority extends Record<string, unknown> {
  address: string;
  scopes: string[];
}

/** Normalized factual identity data from Helius DAS getAsset. */
export interface HeliusTokenData extends Record<string, unknown> {
  tokenAddress: string;
  name: string | null;
  symbol: string | null;
  tokenStandard: string | null;
  decimals: number | null;
  supply: number | null;
  image: string | null;
  metadataUri: string | null;
  creators: HeliusCreator[];
  authorities: HeliusAuthority[];
  assetInterface: string | null;
  tokenProgram: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export type HeliusServiceResult =
  | { ok: true; data: HeliusTokenData }
  | {
      ok: false;
      reason:
        | "configuration_error"
        | "not_found"
        | "http_error"
        | "malformed_response"
        | "network_error";
      detail: string;
      statusCode: number | null;
    };
