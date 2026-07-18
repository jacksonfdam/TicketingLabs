// expo-secure-store ships untranspiled ESM and the native module is device-only, so replace it
// with an empty module. Every test injects a fake storage, so the real default is never used.
jest.mock('expo-secure-store', () => ({}));

import { SecureStorage, SecureTokenStore } from './secureTokenStore';
import { TokenPair } from '../domain/models';

/** In-memory fake standing in for expo-secure-store, so the mirror contract is verified without
 * the native module. */
class FakeStorage implements SecureStorage {
  readonly map = new Map<string, string>();
  async getItemAsync(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async setItemAsync(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async deleteItemAsync(key: string): Promise<void> {
    this.map.delete(key);
  }
}

const pair: TokenPair = { accessToken: 'a1', refreshToken: 'r1', expiresInSeconds: 900 };

describe('SecureTokenStore', () => {
  it('serves the saved pair from the in-memory mirror and persists it', async () => {
    const storage = new FakeStorage();
    const store = new SecureTokenStore(storage);
    expect(store.current()).toBeNull();

    store.save(pair);
    expect(store.current()).toEqual(pair);
    // The refresh token reaches the secure store (write-through is fire-and-forget).
    await Promise.resolve();
    expect(storage.map.get('ticketing.refresh_token')).toBe('r1');
  });

  it('clears the mirror and the persisted entries', async () => {
    const storage = new FakeStorage();
    const store = new SecureTokenStore(storage);
    store.save(pair);
    store.clear();
    expect(store.current()).toBeNull();
    await Promise.resolve();
    expect(storage.map.size).toBe(0);
  });

  it('hydrates a session from a persisted refresh token', async () => {
    const storage = new FakeStorage();
    storage.map.set('ticketing.refresh_token', 'r9');
    storage.map.set('ticketing.access_token', 'a9');
    storage.map.set('ticketing.expires_in', '900');

    const store = new SecureTokenStore(storage);
    expect(await store.hydrate()).toBe(true);
    expect(store.current()?.refreshToken).toBe('r9');
  });

  it('reports no session when nothing is persisted', async () => {
    const store = new SecureTokenStore(new FakeStorage());
    expect(await store.hydrate()).toBe(false);
    expect(store.current()).toBeNull();
  });
});
