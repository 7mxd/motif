import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'theme/shop_colors.dart';

class Home extends StatelessWidget {
  const Home({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).extension<ShopColors>()!;
    return AnimatedContainer(
      duration: Duration(milliseconds: 250),
      curve: Curves.easeOut,
      padding: EdgeInsets.all(13),
      decoration: BoxDecoration(color: palette.bg, borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        Text('Shop', style: GoogleFonts.onest(fontSize: 22)),
        Text('Hi', style: TextStyle(color: palette.text, fontSize: 16)),
      ]),
    );
  }
}
