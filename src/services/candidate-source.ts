import type { CandidateSource } from "../types/discovery-screening.js";
import type { DexScreenerDiscoveryService } from "./dexscreener-discovery.js";

/** Adapts the existing discovery service to the source contract used by screening. */
export class DexScreenerCandidateSource implements CandidateSource {
  constructor(private readonly discoveryService: DexScreenerDiscoveryService) {}

  getCandidates() {
    return this.discoveryService.discoverTokens();
  }
}
