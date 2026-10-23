# Components

How to build widgets in a Flutter app the Motif way: where they live, how to write one, every state it needs, and the starter set. Every example uses only theme values ([theme code](tokens.md)).

## Where widgets live

- `lib/widgets/`: components used by more than one feature. One public widget per file, named after it in snake case (`app_button.dart` holds `AppButton`).
- `lib/features/<feature>/widgets/`: widgets that belong to one feature (`lib/features/orders/widgets/order_row.dart`). Move one to `lib/widgets/` the moment a second feature needs it.
- `lib/features/<feature>/`: the feature's screens and state.
- In a monorepo, shared components live in the shared package's `lib/` ([README](README.md#monorepos)).

**The rule: private `_Widget` classes are parts of a screen, not components.** A `_Header` or `_OrderList` that one file uses to keep its `build` readable can stay private and doesn't count as part of the design system. When a second place wants it, make it public, give it a file in `widgets/`, and give it every state below. This is also how the component list is found: the `feature` mode lists the public widgets in these folders and the shared packages, and compares them with section 5 of `DESIGN.md`. Reuse before you build, and extend a widget with a new option before you create another.

## Building a widget

1. Start from the Material widget that does the job (the table below), so focus, semantics, text scaling and platform behaviour come built in. The theme already gives it Motif's colours, corners and text.
2. Add what the design needs by wrapping it, or by styling it with `ButtonStyle`, `InputDecoration` and the like, with values from `MotifColors.of(context)`, `MotifSpace`, `MotifRadius` and `MotifText`.
3. Build with `const` constructors where you can, `super.key`, and the options the design uses (a `loading` flag, an `errorText`), not a parameter per style.
4. Give it every state, a name a screen reader can say, and a tap area of at least 44 by 44 logical pixels.

## Every state

A component handles all of these that apply, with `WidgetState` so Flutter tells it which one it is in:

| State | `WidgetState` | Notes |
|---|---|---|
| Default | none | |
| Hovered | `WidgetState.hovered` | Mouse and trackpad: tablets, desktop, web. Never the only way to see something. |
| Pressed | `WidgetState.pressed` | Show it in the first frame of the touch. |
| Focused | `WidgetState.focused` | Keyboards and switch control. A visible ring in the `focus` role. |
| Disabled | `WidgetState.disabled` | Still readable; say why in nearby text when it isn't obvious. |
| Loading | (your own flag) | Keep the size and the name; ignore taps. |
| Error | `WidgetState.error` or `errorText` | Text and an icon, not colour alone. |

Here is a button with them, built on `FilledButton`. The default overlay Material draws for hovered and focused is kept; the focus ring, disabled colours, loading (same size, same name) and the 48 pixel height are added:

```dart
import 'package:flutter/material.dart';

import '../design/motif_theme.dart';

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    // A spinner never stops, so with reduce motion on the label stays as it is.
    final spinner = loading && !MotifMotion.reduced(context);
    return FilledButton(
      onPressed: loading ? null : onPressed,
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(64, 48)),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: MotifSpace.s6),
        ),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(MotifRadius.md),
          ),
        ),
        textStyle: WidgetStatePropertyAll(MotifText.label),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled) && !loading) {
            return colors.actionSecondary;
          }
          return colors.actionPrimary;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled) && !loading) {
            return colors.textSecondary;
          }
          return colors.onActionPrimary;
        }),
        overlayColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.pressed)) {
            return colors.onActionPrimary.withValues(alpha: 0.10);
          }
          if (states.contains(WidgetState.hovered)) {
            return colors.onActionPrimary.withValues(alpha: 0.08);
          }
          return null;
        }),
        side: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.focused)) {
            return BorderSide(color: colors.focus, width: 2);
          }
          return null;
        }),
      ),
      // The label stays in the layout (and is read aloud) while the spinner
      // shows, so the button keeps its size and its name.
      child: Stack(
        alignment: Alignment.center,
        children: [
          Opacity(
            opacity: spinner ? 0 : 1,
            alwaysIncludeSemantics: true,
            child: Text(label),
          ),
          if (spinner)
            SizedBox(
              width: MotifSpace.s5,
              height: MotifSpace.s5,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colors.onActionPrimary,
              ),
            ),
        ],
      ),
    );
  }
}
```

The 8 and 10 percent layers are Material 3's state-layer strengths. A typed opacity is fine here, because it tints a theme colour rather than introducing one.

## Names and tap areas

Every control has a name a screen reader can say. Text inside a control is its name. A control with only an icon needs `tooltip:` (an `IconButton` takes one, and shows it on long press and hover), or `Semantics(label: …)`:

```dart
IconButton(
  tooltip: 'Close',
  onPressed: () => Navigator.of(context).pop(),
  icon: const Icon(Icons.close),
)
```

Material gives an `IconButton` a 48 by 48 tap area. If you use `InkWell` or `GestureDetector` on a small icon, wrap it in a `SizedBox` of 44 by 44 or more. For a custom control whose children are not text, say what it is:

```dart
class AppCard extends StatefulWidget {
  const AppCard({super.key, required this.child, this.onTap, this.label});

  final Widget child;
  final VoidCallback? onTap;

  /// What a screen reader says for a card made of pictures and numbers.
  final String? label;

  @override
  State<AppCard> createState() => _AppCardState();
}

class _AppCardState extends State<AppCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(MotifRadius.lg),
      // The focus ring: a 2 px border in the focus role.
      side: BorderSide(
        color: _focused ? colors.focus : colors.border,
        width: _focused ? 2 : 1,
      ),
    );
    return Semantics(
      button: widget.onTap != null,
      label: widget.label,
      child: Material(
        color: colors.surfaceRaised,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: widget.onTap,
          onFocusChange: (focused) => setState(() => _focused = focused),
          overlayColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.pressed)) {
              return colors.textPrimary.withValues(alpha: 0.10);
            }
            return null;
          }),
          child: Padding(
            padding: const EdgeInsets.all(MotifSpace.s4),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
```

An image that only decorates is hidden from screen readers with `ExcludeSemantics`; an avatar or a photo that carries meaning gets `Semantics(label: 'Maya', image: true, …)`.

## A field with its states

Text goes through `InputDecoration`, so the label, helper and error text stay attached to the field and are read with it. Never use a hint as the only label: it disappears when typing starts.

```dart
class AppField extends StatelessWidget {
  const AppField({
    super.key,
    required this.label,
    this.controller,
    this.helperText,
    this.errorText,
    this.enabled = true,
  });

  final String label;
  final TextEditingController? controller;
  final String? helperText;
  final String? errorText;
  final bool enabled;

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
      controller: controller,
      enabled: enabled,
      style: MotifText.body.copyWith(color: colors.textPrimary),
      decoration: InputDecoration(
        labelText: label,
        helperText: helperText,
        errorText: errorText,
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
      ),
    );
  }
}
```

## The starter set

For a new app, build these, each with the states above and the options its screens use. Start from the Material widget in the middle column:

| Component | Starts from | Notes |
|---|---|---|
| `Button` | `FilledButton`, `OutlinedButton`, `TextButton` | One widget with `kind` (primary, secondary, quiet) and `loading`. |
| `IconButton` | `IconButton` | A `tooltip:` is its name. |
| `Field` | `TextField` | Label, helper, error; a password field also shows a toggle with a tooltip. |
| `Checkbox` | `CheckboxListTile` | The row is the tap area, not the box. |
| `Switch` | `SwitchListTile` | Same, with the label on the left (right in right to left). |
| `Card` | `Material` and `InkWell` | Above; `surfaceRaised` with a border or a shadow, not both. |
| `ListItem` | `ListTile` | Title, subtitle, leading and trailing; the whole row taps. |
| `TopBar` | `AppBar` | A back button comes with the route; titles are `MotifText.heading`. |
| `TabBar` | `NavigationBar` | Three to five destinations, each with an icon and a label. |
| `Sidebar` | `NavigationRail` | For tablets; a phone uses the tab bar. |
| `Sheet` | `showModalBottomSheet` | Drag handle, safe-area padding, a close action. |
| `Dialog` | `showDialog` with `AlertDialog` | Buttons named by what they do ("Delete order"), not "OK". |
| `Toast` | `SnackBar` | Short, with an action when there is one to take; the time it stays up is not motion. |
| `Skeleton` | A box in `surfaceRaised` | Fades in and out ([motion](motion.md#skeletons)). |
| `EmptyState` | `Column` | An icon, one line of why, one action. |
| `ErrorState` | `Column` | What went wrong in plain words, and a retry. |
| `Avatar` | `CircleAvatar` | Initials when there is no picture; a `Semantics(label:)` with the name. |
| `Badge` | `Badge` | A count or a dot; its number is part of its owner's name. |

## A screen's states

A screen that shows data has a branch for loading, empty and error, besides the data itself. Mock data loads at once and is never empty, so write the branches anyway. Loading shows skeleton rows in the final layout (`Skeleton` is in [motion](motion.md#skeletons)), as [the empty, loading and error pattern](../../knowledge/ux-patterns/empty-loading-error.md) asks; a spinner is only for a small wait inside a control:

```dart
class OrdersBody extends StatelessWidget {
  const OrdersBody({super.key, required this.orders, required this.onRetry});

  final AsyncSnapshot<List<String>> orders;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = MotifColors.of(context);
    if (orders.hasError) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(MotifSpace.s6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline, color: colors.danger),
              const SizedBox(height: MotifSpace.s3),
              Text('We couldn\'t load your orders.', style: MotifText.body),
              const SizedBox(height: MotifSpace.s4),
              AppButton(label: 'Try again', onPressed: onRetry),
            ],
          ),
        ),
      );
    }
    final data = orders.data;
    if (data == null) {
      // Skeleton rows in the final layout; they stop pulsing under reduce motion.
      return Semantics(
        label: 'Loading orders',
        child: Padding(
          padding: const EdgeInsets.all(MotifSpace.s4),
          child: Column(
            children: [
              for (var i = 0; i < 4; i++) ...[
                const Skeleton(width: double.infinity, height: MotifSpace.s12),
                const SizedBox(height: MotifSpace.s3),
              ],
            ],
          ),
        ),
      );
    }
    if (data.isEmpty) {
      return Center(child: Text('No orders yet.', style: MotifText.body));
    }
    return ListView(
      padding: const EdgeInsets.all(MotifSpace.s4),
      children: [for (final title in data) ListTile(title: Text(title))],
    );
  }
}
```

Use mock data from one clearly named file (`lib/mock_data.dart`), never a back end.

## Mockups

`motif preview` works the same on every stack: write the mockup in HTML with [the preview kit](../../preview-kit/README.md) in a phone frame (`mk-phone`, `mk-ios` or `mk-android`), and build the Flutter screen to match it. `motif shot --against` puts them side by side.
