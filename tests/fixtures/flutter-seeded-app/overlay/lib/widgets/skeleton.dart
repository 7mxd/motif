import 'package:flutter/material.dart';

import '../design/motif_theme.dart';

/// A loading placeholder in the shape of the content to come. It pulses, and
/// holds still when the phone asks for less motion.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, required this.width, required this.height});

  final double width;
  final double height;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: MotifDurations.slow,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MotifMotion.reduced(context)) {
      _pulse
        ..stop()
        ..value = 1;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return FadeTransition(
      opacity: Tween<double>(
        begin: 0.5,
        end: 1,
      ).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeIn)),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: colors.border,
          borderRadius: BorderRadius.circular(MotifRadius.sm),
        ),
      ),
    );
  }
}
