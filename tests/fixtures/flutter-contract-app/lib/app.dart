import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'design/motif_theme.dart';
import 'features/books/book_screen.dart';
import 'features/books/books_screen.dart';
import 'features/home/home_screen.dart';
import 'features/loans/loans_screen.dart';
import 'features/sign_in/sign_in_screen.dart';
import 'l10n/app_localizations.dart';
import 'state/settings.dart';
import 'widgets/app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    // Loans need a member: anyone else signs in first.
    redirect: (context, state) {
      final signedIn = ref.read(signedInProvider);
      return !signedIn && state.matchedLocation == '/loans' ? '/sign-in' : null;
    },
    routes: [
      ShellRoute(
        builder: (context, state, child) =>
            AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
          GoRoute(
            path: '/books',
            builder: (context, state) => const BooksScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) =>
                    BookScreen(id: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: '/loans',
            builder: (context, state) => const LoansScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/sign-in',
        builder: (context, state) => const SignInScreen(),
      ),
    ],
  );
});

class MaktabaApp extends ConsumerWidget {
  const MaktabaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variant = ref.watch(kidsCornerProvider)
        ? MotifVariant.kids
        : MotifVariant.defaultVariant;
    return MaterialApp.router(
      routerConfig: ref.watch(routerProvider),
      onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: MotifTheme.light(variant: variant),
      darkTheme: MotifTheme.dark(variant: variant),
    );
  }
}
