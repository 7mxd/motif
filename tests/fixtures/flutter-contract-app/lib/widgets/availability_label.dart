import 'package:flutter/material.dart';

import '../data/catalogue.dart';
import '../design/motif_theme.dart';
import '../l10n/app_localizations.dart';

/// Whether a book is on the shelf, or where a loan stands: an icon and words
/// in the status colour, never the colour alone.
class AvailabilityLabel extends StatelessWidget {
  const AvailabilityLabel.book(Book this.book, {super.key}) : loan = null;
  const AvailabilityLabel.loan(Loan this.loan, {super.key}) : book = null;

  final Book? book;
  final Loan? loan;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    final l10n = AppLocalizations.of(context);
    final (IconData icon, Color color, String text) = switch ((book, loan)) {
      (final Book b, _) when b.onShelf > 0 => (
        Icons.check_circle_outline,
        colors.success,
        l10n.onShelf(b.onShelf),
      ),
      (Book(), _) => (Icons.schedule, colors.textSecondary, l10n.allOnLoan),
      (_, final Loan l) => switch (l.status) {
        LoanStatus.onLoan => (
          Icons.event_outlined,
          colors.textSecondary,
          l10n.dueOn(l.dueOn),
        ),
        LoanStatus.dueSoon => (
          Icons.schedule,
          colors.warning,
          l10n.dueSoon(l.dueOn),
        ),
        LoanStatus.overdue => (
          Icons.error_outline,
          colors.danger,
          l10n.overdue(l.dueOn),
        ),
      },
      _ => throw StateError('An AvailabilityLabel needs a book or a loan.'),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: MotifSpace.s1,
      children: [
        ExcludeSemantics(
          child: Icon(icon, size: MotifSpace.s4, color: color),
        ),
        Flexible(
          child: Text(text, style: MotifText.label.copyWith(color: color)),
        ),
      ],
    );
  }
}
