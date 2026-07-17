/// Session and token storage. Pure Dart (no Flutter imports) so the rotation logic is
/// unit-testable without a widget binding.
library;

import '../core/core.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';

/// Holds the token pair in memory. A production build backs the refresh token with
/// `flutter_secure_storage` behind this same [TokenStore] port; nothing above it changes.
class InMemoryTokenStore implements TokenStore {
  TokenPair? _tokens;
  InMemoryTokenStore([this._tokens]);
  @override
  TokenPair? current() => _tokens;
  @override
  void save(TokenPair tokens) => _tokens = tokens;
  @override
  void clear() => _tokens = null;
}

/// Owns the session: current tokens, login, and the refresh-with-rotation the HTTP layer
/// calls on a 401. Refresh is single-flight (one in-flight future is shared) so a burst of
/// 401s triggers one refresh; a failed refresh is terminal — tokens cleared, [isSignedOut] set.
class SessionManager {
  final TokenStore _store;
  final AuthRepository _auth;
  Future<bool>? _refreshing;
  bool isSignedOut = false;

  SessionManager(this._store, this._auth);

  String? accessToken() => _store.current()?.accessToken;

  Future<Outcome<TokenPair>> login(String email, String password) async {
    final result = await _auth.login(email, password);
    if (result is Success<TokenPair>) {
      _store.save(result.value);
      isSignedOut = false;
    }
    return result;
  }

  /// Refreshes and rotates. True when a fresh access token is stored (retry the request);
  /// false when there was nothing to refresh with or the refresh failed (now signed out).
  Future<bool> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<bool> _doRefresh() async {
    final refreshToken = _store.current()?.refreshToken;
    if (refreshToken == null) return false;
    final result = await _auth.refresh(refreshToken);
    if (result is Success<TokenPair>) {
      _store.save(result.value); // rotation: the new pair replaces the old
      return true;
    }
    _store.clear();
    isSignedOut = true;
    return false;
  }

  void signOut() {
    _store.clear();
    isSignedOut = true;
  }
}
