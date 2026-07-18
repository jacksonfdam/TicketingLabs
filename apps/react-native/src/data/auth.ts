// Session and token storage. Pure TypeScript so the rotation logic is unit-testable.

import { Outcome } from '../core/core';
import { TokenPair } from '../domain/models';
import { AuthRepository, TokenStore } from '../domain/repositories';

/** Holds the token pair in memory. Production backs the refresh token with expo-secure-store
 * behind this same TokenStore port; nothing above it changes. */
export class InMemoryTokenStore implements TokenStore {
  private tokens: TokenPair | null;
  constructor(initial: TokenPair | null = null) {
    this.tokens = initial;
  }
  current(): TokenPair | null {
    return this.tokens;
  }
  save(tokens: TokenPair): void {
    this.tokens = tokens;
  }
  clear(): void {
    this.tokens = null;
  }
}

/** Owns the session: current tokens, login, and refresh-with-rotation the HTTP layer calls on
 * a 401. Refresh is single-flight (one shared promise); a failed refresh is terminal. */
export class SessionManager {
  private refreshing: Promise<boolean> | null = null;
  isSignedOut = false;

  constructor(private readonly store: TokenStore, private readonly auth: AuthRepository) {}

  accessToken(): string | null {
    return this.store.current()?.accessToken ?? null;
  }

  async login(email: string, password: string): Promise<Outcome<TokenPair>> {
    const result = await this.auth.login(email, password);
    if (result.ok) {
      this.store.save(result.value);
      this.isSignedOut = false;
    }
    return result;
  }

  /** True when a fresh access token is stored (retry the request); false when there was
   * nothing to refresh with or the refresh failed (now signed out). */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.store.current()?.refreshToken;
    if (!refreshToken) return false;
    const result = await this.auth.refresh(refreshToken);
    if (result.ok) {
      this.store.save(result.value); // rotation: the new pair replaces the old
      return true;
    }
    this.store.clear();
    this.isSignedOut = true;
    return false;
  }

  signOut(): void {
    this.store.clear();
    this.isSignedOut = true;
  }
}
