// Auth session. Tokens live in module memory only — never localStorage/sessionStorage,
// so an XSS payload cannot read them from persistent storage (see the security notes in
// the frontend README). A page reload drops them and the user logs in again; a
// production app would hold the refresh token in an HttpOnly cookie instead.

type Session = { access: string | null; refresh: string | null };
const session: Session = { access: null, refresh: null };

const listeners = new Set<() => void>();
export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

export const isLoggedIn = () => session.access !== null;

export function setTokens(access: string, refresh: string) {
  session.access = access;
  session.refresh = refresh;
  notify();
}

export function clearSession() {
  session.access = null;
  session.refresh = null;
  notify();
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const body = await res.json();
  setTokens(body.access_token, body.refresh_token);
}

// Refresh rotation: spend the current refresh token for a new pair. Uses plain fetch
// (not the auth fetch) to avoid recursion.
async function tryRefresh(): Promise<boolean> {
  if (!session.refresh) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const body = await res.json();
  setTokens(body.access_token, body.refresh_token);
  return true;
}

// The fetch openapi-fetch uses: attach the bearer, and on a 401 rotate the refresh
// token once and retry. A clone is kept so the retry has an unconsumed request body.
export async function authFetch(input: Request): Promise<Response> {
  const retryable = input.clone();
  const withAuth = (req: Request) => {
    if (session.access) req.headers.set('Authorization', `Bearer ${session.access}`);
    return req;
  };
  let res = await fetch(withAuth(input));
  if (res.status === 401 && session.refresh) {
    if (await tryRefresh()) {
      res = await fetch(withAuth(retryable));
    }
  }
  return res;
}
