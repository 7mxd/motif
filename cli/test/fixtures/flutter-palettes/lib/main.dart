import 'package:flutter/material.dart';

import 'home.dart';
import 'theme/shop_theme.dart';

void main() => runApp(MaterialApp(theme: ShopTheme.light(), darkTheme: ShopTheme.dark(), home: const Home()));
