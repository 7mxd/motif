import 'package:flutter/material.dart';

import '../data/catalogue.dart';
import '../design/motif_theme.dart';
import 'availability_label.dart';
import 'book_cover.dart';

/// A book in a list: its cover, title, author and whether it's on the shelf.
/// The whole row opens the book.
class BookRow extends StatefulWidget {
  const BookRow({super.key, required this.book, required this.onTap});

  final Book book;
  final VoidCallback onTap;

  @override
  State<BookRow> createState() => _BookRowState();
}

class _BookRowState extends State<BookRow> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    final book = widget.book;
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MotifRadius.lg),
        side: BorderSide(
          color: _focused ? colors.focus : colors.border,
          width: _focused ? 2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap,
        onFocusChange: (focused) => setState(() => _focused = focused),
        overlayColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) {
            return colors.textPrimary.withValues(alpha: 0.10);
          }
          if (states.contains(WidgetState.hovered)) {
            return colors.textPrimary.withValues(alpha: 0.04);
          }
          return null;
        }),
        child: Padding(
          padding: const EdgeInsets.all(MotifSpace.s3),
          child: Row(
            spacing: MotifSpace.s3,
            children: [
              BookCover(title: book.title),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: MotifSpace.s1,
                  children: [
                    Text(
                      book.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: MotifText.body.copyWith(
                        color: colors.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      book.author,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: MotifText.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    AvailabilityLabel.book(book),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: colors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
