import 'package:flutter/material.dart';

import '../design/motif_theme.dart';
import '../l10n/app_localizations.dart';
import 'app_button.dart';

/// Something failed: what went wrong in plain words, and a way to try again.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(MotifSpace.s6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: MotifSpace.s4,
          children: [
            ExcludeSemantics(
              child: Icon(
                Icons.cloud_off_outlined,
                size: MotifSpace.s12,
                color: colors.danger,
              ),
            ),
            Text(
              message,
              textAlign: TextAlign.center,
              style: MotifText.body.copyWith(color: colors.textPrimary),
            ),
            AppButton(
              label: AppLocalizations.of(context).tryAgain,
              icon: Icons.refresh,
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}
