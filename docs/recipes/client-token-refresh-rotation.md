# Recipe: token storage and refresh rotation

Cross-platform: Kotlin Multiplatform, Flutter, React Native.

## Problem

Access tokens are short-lived on purpose, so they expire mid-session. Handle that badly and
you get one of two bugs: the app logs the user out on the first expiry (infuriating), or it
retries a dead token forever. And the refresh token — the long-lived key to the kingdom —
ends up in plain preferences or, worse, a log line.

## Concept

Access token in memory, refresh token in the platform secure store, both behind one
`TokenStore` port. On a 401 the HTTP layer refreshes once: it exchanges the refresh token for
a **new pair** (the refresh token rotates, so a stolen one is single-use) and retries the
original request. Refresh is single-flight — a burst of 401s triggers one refresh, not a
stampede. A failed refresh is terminal: clear the tokens, flip a signed-out flag, and let the
app bounce to sign-in exactly once. The mutating requests already carry an idempotency key, so
the retried request is safe.

## Implementation ×3

The `SessionManager` is the same shape everywhere: `accessToken()`, `login()`, and a
single-flight `refresh()` that rotates on success and signs out on failure.

**KMP** — `data/auth/SessionManager.kt` (single-flight via a `Mutex`)

```kotlin
suspend fun refresh(): Boolean = refreshMutex.withLock {
    val refreshToken = store.current()?.refreshToken ?: return false
    when (val result = auth.refresh(refreshToken)) {
        is Outcome.Success -> { store.save(result.value); true }   // rotation
        is Outcome.Failure -> { store.clear(); _signedOut.value = true; false }
    }
}
```

The executor attaches the bearer and retries once (`data/http/ApiExecutor.kt`):

```kotlin
var response = send()
if (response.status.value == 401 && session != null && session.refresh()) response = send()
```

**Flutter** — `lib/data/auth.dart` (single-flight via a shared `Future`)

```dart
Future<bool> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
```

`ApiExecutor` in `lib/data/api.dart` does `if (response.statusCode == 401 && session != null &&
await session!.refresh()) response = await send();`.

**React Native** — `src/data/auth.ts` (single-flight via a cached promise)

```ts
refresh(): Promise<boolean> {
  if (!this.refreshing) this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
  return this.refreshing;
}
```

The ky executor recomputes the `Authorization` header on each `send()`, so the retry carries
the rotated token.

In all three, `HttpAuthRepository` calls `/auth/login` and `/auth/refresh` through a **plain**
executor with no session attached — login has no token yet, and refresh must not carry the
expired access token or it would recurse.

## Comparison

The single-flight guard is the one place the platforms differ, and each uses its idiom: a
coroutine `Mutex` (KMP), a shared `Future` (Flutter), a cached `Promise` (React Native). All
three converge on: attach, on 401 refresh-once-and-retry, rotate, sign out on failure.

## How to see it work

The rotation is unit-tested in every app: an expired access token triggers a refresh, the
stored refresh token is asserted to have changed (rotated), and the request succeeds on retry;
a failed refresh clears the store and sets the signed-out flag. KMP drives it through Ktor's
`MockEngine` end to end; Flutter and React Native test the `SessionManager` against a fake
`AuthRepository`.

## Trade-offs

The refresh token lives in memory in the demo (`InMemoryTokenStore`); a production build swaps
in Keychain / Keystore / expo-secure-store behind the same port — no change above it. Rotating
on every refresh means a refresh token is single-use, which is safer but means a lost race (two
devices, one stale token) forces a real re-login; that is the correct trade for a flash sale,
where a compromised long-lived token is the scarier outcome.
