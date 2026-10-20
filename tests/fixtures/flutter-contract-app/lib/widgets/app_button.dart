import 'package:flutter/material.dart';

import '../design/motif_theme.dart';

enum AppButtonKind { primary, secondary, quiet }

/// The app's button: one main action per screen is [AppButtonKind.primary].
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.kind = AppButtonKind.primary,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonKind kind;
  final IconData? icon;

  /// Keeps the button's size and name, and ignores taps, while work is going on.
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    // A spinner never stops, so with reduce motion on the label stays as it is.
    final spinner = loading && !MotifMotion.reduced(context);
    final (background, foreground) = switch (kind) {
      AppButtonKind.primary => (colors.actionPrimary, colors.onActionPrimary),
      AppButtonKind.secondary => (
        colors.actionSecondary,
        colors.onActionSecondary,
      ),
      AppButtonKind.quiet => (Colors.transparent, colors.actionPrimary),
    };
    final quiet = kind == AppButtonKind.quiet;
    final style = ButtonStyle(
      minimumSize: const WidgetStatePropertyAll(Size(64, 48)),
      padding: WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: quiet ? MotifSpace.s3 : MotifSpace.s6),
      ),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MotifRadius.md),
        ),
      ),
      textStyle: WidgetStatePropertyAll(MotifText.label),
      backgroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled) && !loading && !quiet) {
          return colors.actionSecondary;
        }
        return background;
      }),
      foregroundColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled) && !loading) {
          return colors.textSecondary;
        }
        return foreground;
      }),
      overlayColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.pressed)) {
          return foreground.withValues(alpha: 0.10);
        }
        if (states.contains(WidgetState.hovered)) {
          return foreground.withValues(alpha: 0.08);
        }
        return null;
      }),
      side: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.focused)) {
          return BorderSide(color: colors.focus, width: 2);
        }
        return null;
      }),
    );
    // The label stays in the layout (and is read aloud) while the spinner
    // shows, so the button keeps its size and its name.
    final content = Stack(
      alignment: Alignment.center,
      children: [
        Opacity(
          opacity: spinner ? 0 : 1,
          alwaysIncludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: MotifSpace.s2,
            children: [
              if (icon != null) Icon(icon, size: MotifSpace.s5),
              Flexible(child: Text(label)),
            ],
          ),
        ),
        if (spinner)
          SizedBox(
            width: MotifSpace.s5,
            height: MotifSpace.s5,
            child: CircularProgressIndicator(strokeWidth: 2, color: foreground),
          ),
      ],
    );
    return FilledButton(
      onPressed: loading ? null : onPressed,
      style: style,
      child: content,
    );
  }
}
