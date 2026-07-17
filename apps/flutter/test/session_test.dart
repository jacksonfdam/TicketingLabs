import 'package:flutter_test/flutter_test.dart';
import 'package:ticketing_client/core/core.dart';
import 'package:ticketing_client/data/auth.dart';
import 'package:ticketing_client/domain/models.dart';
import 'package:ticketing_client/domain/repositories.dart';

class FakeAuth implements AuthRepository {
  final Outcome<TokenPair> Function(String refreshToken) onRefresh;
  FakeAuth({Outcome<TokenPair> Function(String)? onRefresh})
      : onRefresh = onRefresh ??
            ((_) => const Success(TokenPair(accessToken: 'a2', refreshToken: 'r2', expiresInSeconds: 900)));
  @override
  Future<Outcome<TokenPair>> login(String email, String password) async =>
      const Success(TokenPair(accessToken: 'a1', refreshToken: 'r1', expiresInSeconds: 900));
  @override
  Future<Outcome<TokenPair>> refresh(String refreshToken) async => onRefresh(refreshToken);
}

void main() {
  test('refresh rotates the stored pair and returns true', () async {
    final store = InMemoryTokenStore(const TokenPair(accessToken: 'a1', refreshToken: 'r1', expiresInSeconds: 900));
    final session = SessionManager(store, FakeAuth());
    expect(await session.refresh(), isTrue);
    expect(store.current()!.refreshToken, 'r2'); // rotated
    expect(session.isSignedOut, isFalse);
  });

  test('a failed refresh clears the tokens and signs out', () async {
    final store = InMemoryTokenStore(const TokenPair(accessToken: 'a1', refreshToken: 'r1', expiresInSeconds: 900));
    final session = SessionManager(store, FakeAuth(onRefresh: (_) => const Failure(Unauthorized())));
    expect(await session.refresh(), isFalse);
    expect(store.current(), isNull);
    expect(session.isSignedOut, isTrue);
  });

  test('login stores the pair', () async {
    final store = InMemoryTokenStore();
    final session = SessionManager(store, FakeAuth());
    await session.login('buyer@ticketing.local', 'password123');
    expect(store.current()!.accessToken, 'a1');
  });
}
