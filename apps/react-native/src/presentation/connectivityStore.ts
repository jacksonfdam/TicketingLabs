// State holder for the connectivity banner. `check` always resolves — no infinite spinner.

import { createStore, StoreApi } from 'zustand/vanilla';

import { ReachabilityChecker } from '../data/reachability';

export type Connectivity = 'checking' | 'online' | 'offline';

export interface ConnectivityStore {
  state: Connectivity;
  check: () => Promise<void>;
}

/**
 * Probes the gateway once and resolves `checking` to `online`/`offline` within the checker's
 * timeout. The app stays usable while offline (offline-first); this only informs.
 */
export function createConnectivityStore(checker: ReachabilityChecker): StoreApi<ConnectivityStore> {
  return createStore<ConnectivityStore>((set) => ({
    state: 'checking',
    check: async () => {
      set({ state: 'checking' });
      const reachable = await checker.isServerReachable();
      set({ state: reachable ? 'online' : 'offline' });
    },
  }));
}
