import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import 'l10n/app_localizations.dart';

void main() => runApp(const MinApp());

final router = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const HomeScreen(),
      routes: [
        GoRoute(
          path: 'settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    ),
  ],
);

/// Latin text in Onest from google_fonts; Arabic falls back to the bundled Noto Naskh Arabic.
ThemeData appTheme(Brightness brightness) {
  final base = ThemeData(
    colorSchemeSeed: const Color(0xFF0F766E),
    brightness: brightness,
  );
  return base.copyWith(
    textTheme: GoogleFonts.onestTextTheme(
      base.textTheme,
    ).apply(fontFamilyFallback: const ['NotoNaskhArabic']),
  );
}

class MinApp extends StatelessWidget {
  const MinApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      routerConfig: router,
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: appTheme(Brightness.light),
      darkTheme: appTheme(Brightness.dark),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.homeTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.homeGreeting, style: text.headlineSmall),
          const SizedBox(height: 8),
          Text(l10n.homeBody, style: text.bodyLarge),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => context.go('/settings'),
            icon: const Icon(Icons.settings),
            label: Text(l10n.openSettings),
          ),
          const SizedBox(height: 24),
          // Plain Material text, not from google_fonts: Roboto, the default on Android.
          const Text('Flutter 1.0', style: TextStyle(fontFamily: 'Roboto')),
        ],
      ),
    );
  }
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.settingsTitle)),
      body: ListView(
        children: [
          SwitchListTile(
            value: true,
            onChanged: (_) {},
            secondary: const Icon(Icons.notifications_outlined),
            title: Text(l10n.settingsNotifications),
          ),
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(l10n.settingsLanguage),
            subtitle: Text(l10n.settingsLanguageValue),
            trailing: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }
}
