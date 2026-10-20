import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/catalogue.dart';
import '../../design/motif_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/availability_label.dart';
import '../../widgets/book_cover.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_state.dart';
import '../../widgets/skeleton.dart';

/// A book's page: what it is, where it sits, and whether a copy is in.
class BookScreen extends ConsumerWidget {
  const BookScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final book = ref.watch(bookProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text(book.value?.title ?? l10n.booksTitle)),
      body: switch (book) {
        AsyncData(value: final Book book) => _BookDetails(book),
        AsyncData() => EmptyState(
          icon: Icons.search_off,
          message: l10n.bookNotFound,
          actionLabel: l10n.backToBooks,
          onAction: () => context.go('/books'),
        ),
        AsyncError() => ErrorState(
          message: l10n.booksError,
          onRetry: () => ref.invalidate(booksProvider),
        ),
        _ => Semantics(
          label: l10n.booksLoading,
          child: const Padding(
            padding: EdgeInsets.all(MotifSpace.s4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: MotifSpace.s3,
              children: [
                Skeleton(
                  width: MotifSpace.s16 * 1.5,
                  height: MotifSpace.s16 * 2,
                ),
                Skeleton(width: double.infinity, height: MotifSpace.s6),
                Skeleton(width: MotifSpace.s16 * 3, height: MotifSpace.s4),
              ],
            ),
          ),
        ),
      },
    );
  }
}

class _BookDetails extends StatelessWidget {
  const _BookDetails(this.book);

  final Book book;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    return ListView(
      padding: const EdgeInsets.all(MotifSpace.s4),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: MotifSpace.s4,
          children: [
            BookCover(title: book.title, large: true),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: MotifSpace.s2,
                children: [
                  Text(
                    book.title,
                    style: MotifText.heading.copyWith(
                      color: colors.textPrimary,
                    ),
                  ),
                  Text(
                    book.author,
                    style: MotifText.body.copyWith(color: colors.textSecondary),
                  ),
                  Text(
                    l10n.bookDetails(book.year, book.shelfMark),
                    style: MotifText.caption.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                  AvailabilityLabel.book(book),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: MotifSpace.s8),
        Semantics(
          header: true,
          child: Text(
            l10n.bookAbout,
            style: MotifText.heading.copyWith(color: colors.textPrimary),
          ),
        ),
        const SizedBox(height: MotifSpace.s2),
        Text(
          book.summary,
          style: MotifText.body.copyWith(color: colors.textPrimary),
        ),
        const SizedBox(height: MotifSpace.s6),
        DecoratedBox(
          decoration: BoxDecoration(
            color: colors.actionSecondary,
            borderRadius: BorderRadius.circular(MotifRadius.md),
          ),
          child: Padding(
            padding: const EdgeInsets.all(MotifSpace.s4),
            child: Row(
              spacing: MotifSpace.s3,
              children: [
                ExcludeSemantics(
                  child: Icon(
                    Icons.info_outline,
                    color: colors.onActionSecondary,
                  ),
                ),
                Expanded(
                  child: Text(
                    l10n.bookBorrowHint(book.shelfMark),
                    style: MotifText.body.copyWith(
                      color: colors.onActionSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
