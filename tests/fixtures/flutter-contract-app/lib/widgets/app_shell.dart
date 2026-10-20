import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../l10n/app_localizations.dart';

/// The app's frame: a navigation bar on phones and a side rail on tablets,
/// around the screen for [location].
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  static const _paths = ['/', '/books', '/loans'];

  int get _selected {
    if (location.startsWith('/books')) return 1;
    if (location.startsWith('/loans')) return 2;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final items = [
      (Icons.home_outlined, Icons.home, l10n.navHome),
      (Icons.menu_book_outlined, Icons.menu_book, l10n.navBooks),
      (Icons.bookmarks_outlined, Icons.bookmarks, l10n.navLoans),
    ];
    void go(int index) => context.go(_paths[index]);
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 600;
        return Scaffold(
          body: Row(
            children: [
              if (wide)
                NavigationRail(
                  selectedIndex: _selected,
                  onDestinationSelected: go,
                  labelType: NavigationRailLabelType.all,
                  destinations: [
                    for (final (icon, selectedIcon, label) in items)
                      NavigationRailDestination(
                        icon: Icon(icon),
                        selectedIcon: Icon(selectedIcon),
                        label: Text(label),
                      ),
                  ],
                ),
              Expanded(child: child),
            ],
          ),
          bottomNavigationBar: wide
              ? null
              : NavigationBar(
                  selectedIndex: _selected,
                  onDestinationSelected: go,
                  destinations: [
                    for (final (icon, selectedIcon, label) in items)
                      NavigationDestination(
                        icon: Icon(icon),
                        selectedIcon: Icon(selectedIcon),
                        label: label,
                      ),
                  ],
                ),
        );
      },
    );
  }
}
