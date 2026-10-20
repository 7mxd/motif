import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/catalogue.dart';
import '../../design/motif_theme.dart';
import '../../l10n/app_localizations.dart';
import '../../state/settings.dart';
import '../../widgets/app_field.dart';

/// Sign in with a library card number and PIN; then on to the member's loans.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _card = TextEditingController();
  final _pin = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _card.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    if (_card.text.trim().isEmpty || _pin.text.isEmpty) {
      setState(() => _error = l10n.signInMissing);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(catalogueProvider)
          .signIn(card: _card.text.trim(), pin: _pin.text);
      await ref.read(signedInProvider.notifier).signIn();
      if (mounted) context.go('/loans');
    } on Exception {
      if (mounted) setState(() => _error = l10n.signInFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = MotifColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.signInTitle),
        leading: BackButton(onPressed: () => context.go('/')),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.all(MotifSpace.s4),
              children: [
                Text(
                  l10n.signInIntro,
                  style: MotifText.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: MotifSpace.s6),
                AppField(
                  label: l10n.signInCard,
                  controller: _card,
                  helperText: l10n.signInCardHelp,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  textInputAction: TextInputAction.next,
                  enabled: !_busy,
                ),
                const SizedBox(height: MotifSpace.s4),
                AppField(
                  label: l10n.signInPin,
                  controller: _pin,
                  secret: true,
                  showLabel: l10n.showPin,
                  hideLabel: l10n.hidePin,
                  errorText: _error,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  enabled: !_busy,
                ),
                const SizedBox(height: MotifSpace.s6),
                ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(l10n.signInButton),
                ),
                const SizedBox(height: MotifSpace.s4),
                Text(
                  l10n.signInLostCard,
                  style: MotifText.caption.copyWith(
                    color: colors.textSecondary.withValues(alpha: 0.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
