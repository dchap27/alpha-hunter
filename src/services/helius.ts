import type {
  HeliusAuthority,
  HeliusCreator,
  HeliusServiceResult,
  HeliusTokenData,
} from "../types/helius.js";

const HELIUS_MAINNET_RPC_URL = "https://mainnet.helius-rpc.com/";

type JsonRecord = Record<string, unknown>;

export type HeliusFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseCreators(value: unknown): HeliusCreator[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((creator): HeliusCreator[] => {
    if (!isRecord(creator)) {
      return [];
    }

    const address = asString(creator.address);
    return address
      ? [{ address, share: asNumber(creator.share), verified: asBoolean(creator.verified) }]
      : [];
  });
}

function parseAuthorities(value: unknown): HeliusAuthority[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((authority): HeliusAuthority[] => {
    if (!isRecord(authority)) {
      return [];
    }

    const address = asString(authority.address);
    if (!address) {
      return [];
    }

    const scopes = Array.isArray(authority.scopes)
      ? authority.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    return [{ address, scopes }];
  });
}

export function normalizeHeliusAsset(value: unknown): HeliusTokenData | null {
  if (!isRecord(value)) {
    return null;
  }

  const tokenAddress = asString(value.id);
  if (!tokenAddress) {
    return null;
  }

  const content = isRecord(value.content) ? value.content : null;
  const metadata = content && isRecord(content.metadata) ? content.metadata : null;
  const links = content && isRecord(content.links) ? content.links : null;
  const tokenInfo = isRecord(value.token_info) ? value.token_info : null;

  return {
    tokenAddress,
    name: metadata ? asString(metadata.name) : null,
    symbol: metadata ? asString(metadata.symbol) : null,
    tokenStandard: metadata ? asString(metadata.token_standard) : null,
    decimals: tokenInfo ? asNumber(tokenInfo.decimals) : null,
    supply: tokenInfo ? asNumber(tokenInfo.supply) : null,
    image: links ? asString(links.image) : null,
    metadataUri: content ? asString(content.json_uri) : null,
    creators: parseCreators(value.creators),
    authorities: parseAuthorities(value.authorities),
    assetInterface: asString(value.interface),
    tokenProgram: tokenInfo ? asString(tokenInfo.token_program) : null,
    mintAuthority: tokenInfo ? asString(tokenInfo.mint_authority) : null,
    freezeAuthority: tokenInfo ? asString(tokenInfo.freeze_authority) : null,
  };
}

export class HeliusService {
  constructor(
    private readonly fetcher: HeliusFetcher,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs = 8_000,
  ) {}

  async getTokenOnchainData(tokenAddress: string): Promise<HeliusServiceResult> {
    const apiKey = this.apiKey?.trim();
    if (!apiKey) {
      return {
        ok: false,
        reason: "configuration_error",
        detail: "HELIUS_API_KEY is not configured.",
        statusCode: null,
      };
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);
    const endpoint = `${HELIUS_MAINNET_RPC_URL}?api-key=${encodeURIComponent(apiKey)}`;

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "alpha-hunter",
          method: "getAsset",
          params: { id: tokenAddress.trim() },
        }),
        signal: abortController.signal,
      });
    } catch {
      return {
        ok: false,
        reason: "network_error",
        detail: abortController.signal.aborted
          ? "The Helius request timed out."
          : "Unable to reach the Helius API.",
        statusCode: null,
      };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      return {
        ok: false,
        reason: "not_found",
        detail: "Helius has no asset data for this token.",
        statusCode: 404,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "http_error",
        detail: `Helius API request failed with HTTP ${response.status}.`,
        statusCode: response.status,
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "Helius returned an unreadable JSON response.",
        statusCode: null,
      };
    }

    if (!isRecord(body)) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "Helius returned an unexpected response shape.",
        statusCode: null,
      };
    }

    if (body.result === null) {
      return {
        ok: false,
        reason: "not_found",
        detail: "Helius has no asset data for this token.",
        statusCode: null,
      };
    }

    if (isRecord(body.error)) {
      return {
        ok: false,
        reason: "http_error",
        detail: "Helius returned an API error.",
        statusCode: null,
      };
    }

    const data = normalizeHeliusAsset(body.result);
    if (!data) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "Helius returned an unexpected asset response.",
        statusCode: null,
      };
    }

    return { ok: true, data };
  }
}
