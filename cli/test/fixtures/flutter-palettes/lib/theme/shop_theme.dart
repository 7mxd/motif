import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'shop_colors.dart';

class ShopTheme {
  static ThemeData light([ShopColors? palette]) => _build(palette ?? ShopColors.light, Brightness.light);
  static ThemeData dark([ShopColors? palette]) => _build(palette ?? ShopColors.dark, Brightness.dark);

  static ThemeData _build(ShopColors palette, Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: palette.accent,
      brightness: brightness,
      primary: palette.accent,
      onPrimary: Colors.white,
      surface: palette.bg,
      onSurface: palette.text,
    );
    return ThemeData(
      colorScheme: scheme,
      scaffoldBackgroundColor: palette.bg,
      textTheme: GoogleFonts.onestTextTheme(),
      extensions: [palette],
    );
  }
}
