// Platform-backed TokenStore: the refresh token lives in the iOS Keychain / Android Keystore
// via expo-secure-store, so it survives a cold start and never touches AsyncStorage or plain
// disk. This file is the only one that touches the native module; the session/rotation logic in
// auth.ts stays pure and unit-testable.

import * as SecureStore from 'expo-secure-store';

import { TokenPair } from '../domain/models';
import { TokenStore } from '../domain/repositories';

/** The slice of expo-secure-store this store needs. Injectable so unit tests supply a fake and
 * never reach the native module. */
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const ACCESS = 'ticketing.access_token';
const REFRESH = 'ticketing.refresh_token';
const EXPIRES = 'ticketing.expires_in';

/** expo-secure-store is async, but the TokenStore port is synchronous because the HTTP layer
 * reads the access token on every request. The bridge is an in-memory mirror: reads come from
 * memory; writes update memory synchronously and fan out to the secure store (write-through).
 * Call hydrate() once at startup to load a persisted session back into memory. */
export class SecureTokenStore implements TokenStore {
  private cache: TokenPair | null = null;

  constructor(private readonly storage: SecureStorage = SecureStore) {}

  /** Loads any persisted pair into the in-memory mirror. Resolves true when a session was
   * restored, so the app can skip the login screen. */
  async hydrate(): Promise<boolean> {
    const refreshToken = await this.storage.getItemAsync(REFRESH);
    if (!refreshToken) return false;
    const accessToken = (await this.storage.getItemAsync(ACCESS)) ?? '';
    const expiresInSeconds = Number(await this.storage.getItemAsync(EXPIRES)) || 0;
    this.cache = { accessToken, refreshToken, expiresInSeconds };
    return true;
  }

  current(): TokenPair | null {
    return this.cache;
  }

  save(tokens: TokenPair): void {
    this.cache = tokens;
    // Write-through, fire-and-forget: the mirror is authoritative for this process, and
    // persistence only matters for the next cold start.
    void this.storage.setItemAsync(ACCESS, tokens.accessToken);
    void this.storage.setItemAsync(REFRESH, tokens.refreshToken);
    void this.storage.setItemAsync(EXPIRES, String(tokens.expiresInSeconds));
  }

  clear(): void {
    this.cache = null;
    void this.storage.deleteItemAsync(ACCESS);
    void this.storage.deleteItemAsync(REFRESH);
    void this.storage.deleteItemAsync(EXPIRES);
  }
}
