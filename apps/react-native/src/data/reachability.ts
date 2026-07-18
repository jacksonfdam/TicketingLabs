// Server reachability: a bounded, one-shot probe so the app never blocks on the network.

import ky from 'ky';

export interface ReachabilityChecker {
  /** True if the gateway answered /health within the timeout. Never throws, never hangs. */
  isServerReachable(): Promise<boolean>;
}

/** A ky-based reachability check with a short timeout. */
export class KyReachabilityChecker implements ReachabilityChecker {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 4000) {}

  async isServerReachable(): Promise<boolean> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    try {
      const response = await ky.get(`${base}health`, {
        timeout: this.timeoutMs,
        throwHttpErrors: false,
        retry: 0,
      });
      return response.ok;
    } catch {
      return false; // offline, refused, timed out, TLS error: not reachable now
    }
  }
}
