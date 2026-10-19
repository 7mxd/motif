import 'package:flutter/material.dart';

/// The shop's colours: a neutral palette, and one for each gender, each in light and dark.
@immutable
class ShopColors extends ThemeExtension<ShopColors> {
  const ShopColors({required this.bg, required this.text, required this.accent});

  final Color bg;
  final Color text;
  final Color accent;

  static const ShopColors light = ShopColors(
    bg: Color(0xFFF8FAF9),
    text: Color(0xFF0A1733),
    accent: Color(0xFF0F766E),
  );

  static const ShopColors dark = ShopColors(
    bg: Color(0xFF0F1413),
    text: Color(0xFFF5F7F6),
    accent: Color(0xFF5EEAD4),
  );

  static const ShopColors lightMale = ShopColors(
    bg: Color(0xFFF1F5F9),
    text: Color(0xFF0B1F33),
    accent: Color(0xFF1D4ED8),
  );

  static const ShopColors lightFemale = ShopColors(
    bg: Color(0xFFFDF2F8),
    text: Color(0xFF3B0A2A),
    accent: Color(0xFFBE185D),
  );

  static const ShopColors darkMale = ShopColors(
    bg: Color(0xFF0B1220),
    text: Color(0xFFE2E8F0),
    accent: Color(0xFF60A5FA),
  );

  static const ShopColors darkFemale = ShopColors(
    bg: Color(0xFF1F0A16),
    text: Color(0xFFFCE7F3),
    accent: Color(0xFFF472B6),
  );

  // An old palette, kept for reference; it isn't one any more.
  // static const ShopColors lightRetro = ShopColors(bg: Color(0xFFFFFFFF), text: Color(0xFF000000), accent: Color(0xFFFF0000));

  @override
  ShopColors copyWith({Color? bg, Color? text, Color? accent}) =>
      ShopColors(bg: bg ?? this.bg, text: text ?? this.text, accent: accent ?? this.accent);

  @override
  ShopColors lerp(ThemeExtension<ShopColors>? other, double t) {
    if (other is! ShopColors) return this;
    return ShopColors(
      bg: Color.lerp(bg, other.bg, t)!,
      text: Color.lerp(text, other.text, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
    );
  }
}
