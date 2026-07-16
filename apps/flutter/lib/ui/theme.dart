/// Design tokens and the app theme, mirrored from `/shared/tokens/tokens.json`. No widget
/// types a raw hex code; they read [Tokens] or the Material [ColorScheme].
library;

import 'package:flutter/material.dart';

class Tokens {
  static const bg = Color(0xFF0F1115);
  static const surface = Color(0xFF1A1E26);
  static const surfaceAlt = Color(0xFF232834);
  static const line = Color(0xFF2A2F3A);
  static const text = Color(0xFFE6E8EC);
  static const muted = Color(0xFF8B93A1);
  static const accent = Color(0xFF4F8CFF);
  static const onAccent = Color(0xFFFFFFFF);
  static const ok = Color(0xFF3FB950);
  static const warn = Color(0xFFF0883E);
  static const err = Color(0xFFF85149);

  static const spaceXs = 4.0;
  static const spaceSm = 8.0;
  static const spaceMd = 12.0;
  static const spaceLg = 16.0;
  static const spaceXl = 20.0;
  static const spaceXxl = 24.0;

  static const radiusSm = 8.0;
  static const radiusMd = 12.0;
}

/// The dark-only app theme. A light scheme would branch here; the reference app is dark.
ThemeData ticketingTheme() {
  const scheme = ColorScheme.dark(
    primary: Tokens.accent,
    onPrimary: Tokens.onAccent,
    surface: Tokens.surface,
    onSurface: Tokens.text,
    error: Tokens.err,
    onError: Colors.white,
    outline: Tokens.line,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Tokens.bg,
    cardTheme: const CardThemeData(color: Tokens.surface),
  );
}
