import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/catalogue.dart';
import '../../design/motif_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../state/settings.dart';
import '../../widgets/app_button.dart';
import '../../widgets/availability_label.dart';
import '../../widgets/book_cover.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_state.dart';
import '../../widgets/skeleton.dart';

/// The signed-in member's loans, soonest due first, each with Renew.
class LoansScreen extends ConsumerWidget {
  const LoansScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final loans = ref
        .watch(loansProvider)
        .whenData(
          (list) => [...list]..sort((a, b) => a.dueOn.compareTo(b.dueOn)),
        );
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.loansTitle),
        actions: [
          IconButton(
            tooltip: l10n.signOut,
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(signedInProvider.notifier).signOut();
              if (context.mounted) context.go('/');
            },
          ),
        ],
      ),
      body: switch (loans) {
        AsyncData(:final value) when value.isEmpty => EmptyState(
          icon: Icons.bookmarks_outlined,
          message: l10n.loansEmpty,
          actionLabel: l10n.homeSeeAll,
          onAction: () => context.go('/books'),
        ),
        AsyncData(:final value) => ListView.separated(
          padding: const EdgeInsets.all(MotifSpace.s4),
          itemCount: value.length,
          separatorBuilder: (context, index) =>
              const SizedBox(height: MotifSpace.s3),
          itemBuilder: (context, index) => _LoanCard(loan: value[index]),
        ),
        AsyncError() => ErrorState(
          message: l10n.loansError,
          onRetry: () => ref.invalidate(loansProvider),
        ),
        _ => Semantics(
          label: l10n.loansLoading,
          child: ListView(
            padding: const EdgeInsets.all(MotifSpace.s4),
            children: [
              for (var i = 0; i < 3; i++) ...[
                const Skeleton(
                  width: double.infinity,
                  height: MotifSpace.s16 + MotifSpace.s12,
                ),
                const SizedBox(height: MotifSpace.s3),
              ],
            ],
          ),
        ),
      },
    );
  }
}

class _LoanCard extends ConsumerStatefulWidget {
  const _LoanCard({required this.loan});

  final Loan loan;

  @override
  ConsumerState<_LoanCard> createState() => _LoanCardState();
}

class _LoanCardState extends ConsumerState<_LoanCard> {
  bool _renewing = false;

  Future<void> _renew() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _renewing = true);
    try {
      await ref.read(catalogueProvider).renew(widget.loan.id);
      messenger.showSnackBar(SnackBar(content: Text(l10n.renewed)));
      ref.invalidate(loansProvider);
    } on Exception {
      messenger.showSnackBar(SnackBar(content: Text(l10n.renewFailed)));
    } finally {
      if (mounted) setState(() => _renewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    final loan = widget.loan;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(MotifRadius.lg),
        border: Border.all(color: colors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MotifSpace.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: MotifSpace.s3,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: MotifSpace.s3,
              children: [
                BookCover(title: loan.book.title),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: MotifSpace.s1,
                    children: [
                      Text(
                        loan.book.title,
                        style: MotifText.body.copyWith(
                          color: colors.textPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        loan.book.author,
                        style: MotifText.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                      AvailabilityLabel.loan(loan),
                    ],
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.renewalsLeft(loan.renewalsLeft),
                    style: MotifText.caption.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
                AppButton(
                  label: l10n.renew,
                  kind: AppButtonKind.secondary,
                  icon: Icons.autorenew,
                  loading: _renewing,
                  onPressed: loan.renewalsLeft > 0 ? _renew : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
