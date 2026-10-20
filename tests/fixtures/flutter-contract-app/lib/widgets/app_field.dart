import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/motif_theme.dart';

/// One line of text with its label, help and error. A secret field (a PIN)
/// has a button to show what was typed.
class AppField extends StatefulWidget {
  const AppField({
    super.key,
    required this.label,
    this.controller,
    this.helperText,
    this.errorText,
    this.enabled = true,
    this.secret = false,
    this.showLabel,
    this.hideLabel,
    this.keyboardType,
    this.inputFormatters,
    this.textInputAction,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController? controller;
  final String? helperText;
  final String? errorText;
  final bool enabled;
  final bool secret;

  /// The show and hide button's names, for a secret field.
  final String? showLabel;
  final String? hideLabel;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  State<AppField> createState() => _AppFieldState();
}

class _AppFieldState extends State<AppField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    OutlineInputBorder border(Color color, [double width = 1]) {
      return OutlineInputBorder(
        borderRadius: BorderRadius.circular(MotifRadius.md),
        borderSide: BorderSide(color: color, width: width),
      );
    }

    return TextField(
      controller: widget.controller,
      enabled: widget.enabled,
      obscureText: widget.secret && !_shown,
      keyboardType: widget.keyboardType,
      inputFormatters: widget.inputFormatters,
      textInputAction: widget.textInputAction,
      onSubmitted: widget.onSubmitted,
      style: MotifText.body.copyWith(color: colors.textPrimary),
      decoration: InputDecoration(
        labelText: widget.label,
        helperText: widget.helperText,
        errorText: widget.errorText,
        labelStyle: MotifText.label.copyWith(color: colors.textSecondary),
        helperStyle: MotifText.caption.copyWith(color: colors.textSecondary),
        errorStyle: MotifText.caption.copyWith(color: colors.danger),
        filled: true,
        fillColor: colors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: MotifSpace.s4,
          vertical: MotifSpace.s3,
        ),
        border: border(colors.border),
        enabledBorder: border(colors.border),
        disabledBorder: border(colors.border),
        focusedBorder: border(colors.focus, 2),
        errorBorder: border(colors.danger),
        focusedErrorBorder: border(colors.danger, 2),
        suffixIcon: widget.secret
            ? IconButton(
                tooltip: _shown ? widget.hideLabel : widget.showLabel,
                onPressed: () => setState(() => _shown = !_shown),
                icon: Icon(
                  _shown
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
              )
            : null,
      ),
    );
  }
}
