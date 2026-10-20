// Every screenshot starts signed in, so Loans shows a member's loans. Variants need nothing here: Motif draws them through MotifTheme.
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<Widget?> motifSetup({
  required String variant,
  required Locale locale,
  required Brightness brightness,
}) async {
  // ignore: invalid_use_of_visible_for_testing_member
  SharedPreferences.setMockInitialValues({'signedIn': true});
  return null;
}
