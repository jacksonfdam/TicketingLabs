import { ReachabilityChecker } from '../data/reachability';
import { createConnectivityStore } from './connectivityStore';

class FakeChecker implements ReachabilityChecker {
  constructor(private readonly reachable: boolean) {}
  async isServerReachable(): Promise<boolean> {
    return this.reachable;
  }
}

test('a reachable server resolves to online (never stays checking)', async () => {
  const store = createConnectivityStore(new FakeChecker(true));
  await store.getState().check();
  expect(store.getState().state).toBe('online');
});

test('an unreachable server resolves to offline', async () => {
  const store = createConnectivityStore(new FakeChecker(false));
  await store.getState().check();
  expect(store.getState().state).toBe('offline');
});
