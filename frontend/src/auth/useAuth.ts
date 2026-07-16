import { useSyncExternalStore } from 'react';
import { isLoggedIn, onAuthChange } from './session';

// React-friendly view of the in-memory session, so components re-render on login/logout.
export function useAuth(): boolean {
  return useSyncExternalStore(onAuthChange, isLoggedIn, () => false);
}
