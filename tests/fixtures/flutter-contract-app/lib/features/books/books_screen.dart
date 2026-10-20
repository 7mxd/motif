import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/catalogue.dart';
import '../../design/motif_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/book_row.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_state.dart';
import '../../widgets/skeleton.dart';

/// The whole catalogue, newest first as the library lists it.
class BooksScreen extends ConsumerWidget {
  const BooksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.booksTitle)),
      body: switch (ref.watch(booksProvider)) {
        AsyncData(:final value) when value.isEmpty => EmptyState(
          icon: Icons.menu_book_outlined,
          message: l10n.booksEmpty,
          actionLabel: l10n.tryAgain,
          onAction: () => ref.invalidate(booksProvider),
        ),
        AsyncData(:final value) => ListView.separated(
          padding: const EdgeInsets.all(MotifSpace.s4),
          itemCount: value.length,
          separatorBuilder: (context, index) =>
              const SizedBox(height: MotifSpace.s2),
          itemBuilder: (context, index) => BookRow(
            book: value[index],
            onTap: () => context.go('/books/${value[index].id}'),
          ),
        ),
        AsyncError() => ErrorState(
          message: l10n.booksError,
          onRetry: () => ref.invalidate(booksProvider),
        ),
        _ => Semantics(
          label: l10n.booksLoading,
          child: ListView(
            padding: const EdgeInsets.all(MotifSpace.s4),
            children: [
              for (var i = 0; i < 6; i++) ...[
                const Skeleton(
                  width: double.infinity,
                  height: MotifSpace.s16 + MotifSpace.s6,
                ),
                const SizedBox(height: MotifSpace.s2),
              ],
            ],
          ),
        ),
      },
    );
  }
}
