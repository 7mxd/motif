import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The phone's storage, read once in main() before the app starts.
final prefsProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('Override prefsProvider in main().'),
);

/// Whether a member has signed in with their library card.
final signedInProvider = NotifierProvider<SignedIn, bool>(SignedIn.new);

class SignedIn extends Notifier<bool> {
  static const _key = 'signedIn';

  @override
  bool build() => ref.watch(prefsProvider).getBool(_key) ?? false;

  Future<void> signIn() async {
    await ref.read(prefsProvider).setBool(_key, true);
    state = true;
  }

  Future<void> signOut() async {
    await ref.read(prefsProvider).remove(_key);
    state = false;
  }
}

/// Whether the app wears the kids' corner colours.
final kidsCornerProvider = NotifierProvider<KidsCorner, bool>(KidsCorner.new);

class KidsCorner extends Notifier<bool> {
  static const _key = 'kidsCorner';

  @override
  bool build() => ref.watch(prefsProvider).getBool(_key) ?? false;

  Future<void> set(bool on) async {
    state = on;
    await ref.read(prefsProvider).setBool(_key, on);
  }
}
