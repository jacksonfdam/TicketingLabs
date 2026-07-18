/// Platform-backed [TokenStore]: the refresh token lives in the Keychain (iOS) / Keystore
/// (Android) via `flutter_secure_storage`, so it survives a cold start and never touches
/// plain preferences or disk. This is the only file that imports the plugin, keeping the
/// session/rotation logic in `auth.dart` pure Dart and unit-testable.
library;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../domain/models.dart';
import '../domain/repositories.dart';

/// The secure store's API is async, but the [TokenStore] port is synchronous because the HTTP
/// layer reads the access token on every request. The bridge is an in-memory mirror: reads are
/// served from memory; writes update memory synchronously and fan out to the secure store
/// (write-through). Call [hydrate] once at startup to load a persisted session back into memory.
class SecureTokenStore implements TokenStore {
  static const _kAccess = 'ticketing.access_token';
  static const _kRefresh = 'ticketing.refresh_token';
  static const _kExpires = 'ticketing.expires_in';

  final FlutterSecureStorage _storage;
  TokenPair? _cache;

  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  /// Loads any persisted pair into the in-memory mirror. Returns true when a session was
  /// restored, so the app can skip the login screen. Safe to call before any read.
  Future<bool> hydrate() async {
    final refresh = await _storage.read(key: _kRefresh);
    if (refresh == null) return false;
    final access = await _storage.read(key: _kAccess) ?? '';
    final expires = int.tryParse(await _storage.read(key: _kExpires) ?? '') ?? 0;
    _cache = TokenPair(accessToken: access, refreshToken: refresh, expiresInSeconds: expires);
    return true;
  }

  @override
  TokenPair? current() => _cache;

  @override
  void save(TokenPair tokens) {
    _cache = tokens;
    // Write-through. Fire-and-forget: the in-memory mirror is already authoritative for this
    // process, and persistence only matters for the next cold start.
    _storage.write(key: _kAccess, value: tokens.accessToken);
    _storage.write(key: _kRefresh, value: tokens.refreshToken);
    _storage.write(key: _kExpires, value: tokens.expiresInSeconds.toString());
  }

  @override
  void clear() {
    _cache = null;
    _storage.delete(key: _kAccess);
    _storage.delete(key: _kRefresh);
    _storage.delete(key: _kExpires);
  }
}
