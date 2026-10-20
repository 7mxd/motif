import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/catalogue.dart';
import '../../design/motif_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../state/settings.dart';
import '../../widgets/app_button.dart';
import '../../widgets/book_row.dart';
import '../../widgets/skeleton.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    final books = ref.watch(booksProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.appTitle)),
      body: ListView(
        padding: const EdgeInsets.all(MotifSpace.s4),
        children: [
          Text(
            l10n.homeGreeting,
            style: MotifText.title.copyWith(color: colors.textPrimary),
          ),
          const SizedBox(height: MotifSpace.s2),
          Text(
            l10n.homeIntro,
            style: MotifText.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: MotifSpace.s8),
          _SectionHeading(l10n.homeLoansHeading),
          const SizedBox(height: MotifSpace.s3),
          const _LoansSummary(),
          const SizedBox(height: MotifSpace.s8),
          _SectionHeading(
            l10n.homeNewHeading,
            action: AppButton(
              label: l10n.homeSeeAll,
              kind: AppButtonKind.quiet,
              onPressed: () => context.go('/books'),
            ),
          ),
          const SizedBox(height: MotifSpace.s3),
          ...switch (books) {
            AsyncData(:final value) => [
              for (final book in value.take(3)) ...[
                BookRow(
                  book: book,
                  onTap: () => context.go('/books/${book.id}'),
                ),
                const SizedBox(height: MotifSpace.s2),
              ],
            ],
            AsyncError() => [
              Text(
                l10n.booksError,
                style: MotifText.body.copyWith(color: colors.textSecondary),
              ),
            ],
            _ => [
              for (var i = 0; i < 3; i++) ...[
                const Skeleton(
                  width: double.infinity,
                  height: MotifSpace.s16 + MotifSpace.s6,
                ),
                const SizedBox(height: MotifSpace.s2),
              ],
            ],
          },
          const SizedBox(height: MotifSpace.s6),
          const _KidsCornerSwitch(),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.text, {this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(
              text,
              style: MotifText.heading.copyWith(color: colors.textPrimary),
            ),
          ),
        ),
        ?action,
      ],
    );
  }
}

/// The member's loans in a sentence, or an invitation to sign in.
class _LoansSummary extends ConsumerWidget {
  const _LoansSummary();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    final signedIn = ref.watch(signedInProvider);
    final Widget content;
    if (!signedIn) {
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: MotifSpace.s4,
        children: [
          Text(
            l10n.homeSignInPrompt,
            style: MotifText.body.copyWith(color: colors.textPrimary),
          ),
          AppButton(
            label: l10n.signInButton,
            onPressed: () => context.go('/sign-in'),
          ),
        ],
      );
    } else {
      content = switch (ref.watch(loansProvider)) {
        AsyncData(:final value) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: MotifSpace.s2,
          children: [
            Text(
              l10n.homeLoansSummary(
                value.length,
                value.isEmpty
                    ? DateTime.now()
                    : value
                          .map((loan) => loan.dueOn)
                          .reduce((a, b) => a.isBefore(b) ? a : b),
              ),
              style: MotifText.body.copyWith(color: colors.textPrimary),
            ),
            AppButton(
              label: l10n.homeSeeLoans,
              kind: AppButtonKind.secondary,
              onPressed: () => context.go('/loans'),
            ),
          ],
        ),
        AsyncError() => Text(
          l10n.loansError,
          style: MotifText.body.copyWith(color: colors.textPrimary),
        ),
        _ => const Skeleton(width: double.infinity, height: MotifSpace.s16),
      };
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(MotifRadius.lg),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MotifSpace.s4),
        child: content,
      ),
    );
  }
}

class _KidsCornerSwitch extends ConsumerWidget {
  const _KidsCornerSwitch();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MotifRadius.lg),
        side: BorderSide(color: colors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: SwitchListTile.adaptive(
        value: ref.watch(kidsCornerProvider),
        onChanged: (on) => ref.read(kidsCornerProvider.notifier).set(on),
        secondary: Icon(Icons.palette_outlined, color: colors.textSecondary),
        title: Text(
          l10n.homeKidsCorner,
          style: MotifText.body.copyWith(color: colors.textPrimary),
        ),
        subtitle: Text(
          l10n.homeKidsCornerHelp,
          style: MotifText.caption.copyWith(color: colors.textSecondary),
        ),
      ),
    );
  }
}
