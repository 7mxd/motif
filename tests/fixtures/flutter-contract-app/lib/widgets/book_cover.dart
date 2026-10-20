import 'package:flutter/material.dart';

import '../design/motif_theme.dart';

/// A plain cover: the title's first letter on the secondary colour. The
/// catalogue has no pictures yet, and the title is read out beside it.
class BookCover extends StatelessWidget {
  const BookCover({super.key, required this.title, this.large = false});

  final String title;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    return ExcludeSemantics(
      child: Container(
        width: large ? MotifSpace.s16 * 1.5 : MotifSpace.s12,
        height: large ? MotifSpace.s16 * 2 : MotifSpace.s16,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.actionSecondary,
          borderRadius: BorderRadius.circular(MotifRadius.sm),
          border: Border.all(color: colors.border),
        ),
        child: Text(
          title.characters.first,
          style: (large ? MotifText.title : MotifText.heading).copyWith(
            color: colors.onActionSecondary,
          ),
        ),
      ),
    );
  }
}
