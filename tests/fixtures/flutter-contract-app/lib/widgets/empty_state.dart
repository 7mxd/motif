import 'package:flutter/material.dart';

import '../design/motif_theme.dart';
import 'app_button.dart';

/// Nothing here yet: an icon, one line of why, and one thing to do.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

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
                icon,
                size: MotifSpace.s12,
                color: colors.textSecondary,
              ),
            ),
            Text(
              message,
              textAlign: TextAlign.center,
              style: MotifText.body.copyWith(color: colors.textPrimary),
            ),
            AppButton(
              label: actionLabel,
              kind: AppButtonKind.secondary,
              onPressed: onAction,
            ),
          ],
        ),
      ),
    );
  }
}
