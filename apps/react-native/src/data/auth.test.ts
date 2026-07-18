import { appError, fail, ok, Outcome } from '../core/core';
import { TokenPair } from '../domain/models';
import { AuthRepository } from '../domain/repositories';
import { InMemoryTokenStore, SessionManager } from './auth';

const pair = (access: string, refresh: string): TokenPair => ({
  accessToken: access,
  refreshToken: refresh,
  expiresInSeconds: 900,
});

class FakeAuth implements AuthRepository {
  constructor(private readonly onRefresh: (rt: string) => Outcome<TokenPair>) {}
  async login(): Promise<Outcome<TokenPair>> {
    return ok(pair('a1', 'r1'));
  }
  async refresh(refreshToken: string): Promise<Outcome<TokenPair>> {
    return this.onRefresh(refreshToken);
  }
}

test('refresh rotates the stored pair and returns true', async () => {
  const store = new InMemoryTokenStore(pair('a1', 'r1'));
  const session = new SessionManager(store, new FakeAuth(() => ok(pair('a2', 'r2'))));
  expect(await session.refresh()).toBe(true);
  expect(store.current()?.refreshToken).toBe('r2'); // rotated
  expect(session.isSignedOut).toBe(false);
});

test('a failed refresh clears the tokens and signs out', async () => {
  const store = new InMemoryTokenStore(pair('a1', 'r1'));
  const session = new SessionManager(store, new FakeAuth(() => fail(appError('Unauthorized'))));
  expect(await session.refresh()).toBe(false);
  expect(store.current()).toBeNull();
  expect(session.isSignedOut).toBe(true);
});
