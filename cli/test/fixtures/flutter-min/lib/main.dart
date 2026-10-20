import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'design/motif_theme.dart';
import 'l10n/app_localizations.dart';

/// Whether someone has signed in, read from storage before the app starts.
bool signedIn = false;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  signedIn = prefs.getBool('signedIn') ?? false;
  runApp(const MinApp());
}

final router = GoRouter(
  // Your items need someone signed in: anyone else goes to the sign-in screen.
  redirect: (context, state) =>
      !signedIn && state.matchedLocation == '/home' ? '/sign-in' : null,
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const WelcomeScreen(),
      routes: [
        GoRoute(
          path: 'settings',
          builder: (context, state) => const SettingsScreen(),
        ),
      ],
    ),
    GoRoute(path: '/home', builder: (context, state) => const ItemsScreen()),
    GoRoute(
      path: '/sign-in',
      builder: (context, state) => const SignInScreen(),
    ),
    GoRoute(path: '/audit', builder: (context, state) => const AuditScreen()),
  ],
);

/// The guide's theme (in its design variant), with Latin text in Onest from google_fonts and Arabic in the bundled
/// Noto Naskh Arabic.
ThemeData appTheme(ThemeData base) {
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
      theme: appTheme(MotifTheme.light()),
      darkTheme: appTheme(MotifTheme.dark()),
    );
  }
}

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

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
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () => context.go('/home'),
            child: Text(l10n.homeOpenItems),
          ),
          const SizedBox(height: 24),
          // Plain Material text, not from google_fonts: Roboto, the default on Android.
          const Text('Flutter 1.0', style: TextStyle(fontFamily: 'Roboto')),
        ],
      ),
    );
  }
}

/// The signed-in screen: a list fetched from the app's API.
class ItemsScreen extends StatefulWidget {
  const ItemsScreen({super.key});

  @override
  State<ItemsScreen> createState() => _ItemsScreenState();
}

class _ItemsScreenState extends State<ItemsScreen> {
  late final Future<List<String>> _items = _load();

  static Future<List<String>> _load() async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(
        Uri.parse('https://api.example.com/items'),
      );
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode != 200) return const [];
      return [
        for (final item in jsonDecode(body) as List)
          (item as Map<String, dynamic>)['title'] as String,
      ];
    } finally {
      client.close();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.itemsTitle)),
      body: FutureBuilder<List<String>>(
        future: _items,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final items = snapshot.data!;
          if (items.isEmpty) return Center(child: Text(l10n.itemsEmpty));
          return ListView(
            children: [
              for (final title in items)
                ListTile(
                  leading: const Icon(Icons.inventory_2_outlined),
                  title: Text(title),
                ),
            ],
          );
        },
      ),
    );
  }
}

class SignInScreen extends StatelessWidget {
  const SignInScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.signInTitle)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.signInBody),
            const SizedBox(height: 16),
            TextField(decoration: InputDecoration(labelText: l10n.signInEmail)),
            const SizedBox(height: 16),
            FilledButton(onPressed: () {}, child: Text(l10n.signInButton)),
          ],
        ),
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

/// What Motif's audit should find: a pale caption on white, a 32 by 32 icon button with no name, and an icon that keeps
/// turning when reduce motion is on.
class AuditScreen extends StatelessWidget {
  const AuditScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Audit')),
      body: ColoredBox(
        color: Colors.white,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Prices include tax',
              style: TextStyle(color: Color(0xFFAAAAAA), fontSize: 14),
            ),
            const SizedBox(height: 16),
            // Too faint: dark text at 40% opacity.
            const Opacity(
              opacity: 0.4,
              child: Text(
                'Delivery times are estimates',
                style: TextStyle(color: Color(0xFF111111), fontSize: 14),
              ),
            ),
            const SizedBox(height: 16),
            // Large bold text needs 3:1, which this grey has (it would fail 4.5:1).
            const Text(
              'Fresh today',
              style: TextStyle(
                color: Color(0xFF949494),
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            // White text on a gradient from blue to yellow: no one colour is its background, and any one of them
            // alone would make it fail.
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF60A5FA), Color(0xFFFDE047)],
                ),
              ),
              child: const Text(
                'Summer sale on every shelf',
                style: TextStyle(color: Colors.white, fontSize: 14),
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: SizedBox(
                width: 32,
                height: 32,
                child: IconButton(
                  padding: EdgeInsets.zero,
                  iconSize: 18,
                  onPressed: () {},
                  // Dark on the white panel in dark mode too, where the theme's icons are light.
                  icon: const Icon(Icons.close, color: Color(0xFF111111)),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Spinner(),
          ],
        ),
      ),
    );
  }
}

/// An icon that turns for ever, whatever the reduce motion setting says.
class Spinner extends StatefulWidget {
  const Spinner({super.key});

  @override
  State<Spinner> createState() => _SpinnerState();
}

class _SpinnerState extends State<Spinner> with SingleTickerProviderStateMixin {
  late final AnimationController _turns = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 1),
  )..repeat();

  @override
  void dispose() {
    _turns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: RotationTransition(
        turns: _turns,
        child: const Icon(Icons.autorenew, color: Color(0xFF111111)),
      ),
    );
  }
}
