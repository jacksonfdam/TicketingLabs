import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:ticketing_client/data/secure_token_store.dart';
import 'package:ticketing_client/domain/models.dart';

class _MockStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late _MockStorage storage;
  late SecureTokenStore store;

  setUp(() {
    storage = _MockStorage();
    when(() => storage.write(key: any(named: 'key'), value: any(named: 'value')))
        .thenAnswer((_) async {});
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((_) async {});
    store = SecureTokenStore(storage);
  });

  const pair = TokenPair(accessToken: 'a1', refreshToken: 'r1', expiresInSeconds: 900);

  test('save exposes the pair from the in-memory mirror and writes through', () {
    expect(store.current(), isNull);
    store.save(pair);
    // The mirror is authoritative for reads within the process...
    expect(store.current(), pair);
    // ...and the refresh token is persisted to the secure store.
    verify(() => storage.write(key: any(named: 'key'), value: 'r1')).called(1);
  });

  test('clear empties the mirror and deletes the persisted entries', () {
    store.save(pair);
    store.clear();
    expect(store.current(), isNull);
    verify(() => storage.delete(key: any(named: 'key'))).called(3);
  });

  test('hydrate restores a session when a refresh token is persisted', () async {
    when(() => storage.read(key: 'ticketing.refresh_token')).thenAnswer((_) async => 'r9');
    when(() => storage.read(key: 'ticketing.access_token')).thenAnswer((_) async => 'a9');
    when(() => storage.read(key: 'ticketing.expires_in')).thenAnswer((_) async => '900');

    final restored = await store.hydrate();

    expect(restored, isTrue);
    expect(store.current()?.refreshToken, 'r9');
  });

  test('hydrate reports no session when nothing is persisted', () async {
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((_) async => null);
    expect(await store.hydrate(), isFalse);
    expect(store.current(), isNull);
  });
}
