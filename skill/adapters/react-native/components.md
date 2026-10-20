# Components

How to build components in an Expo app the Motif way: where they live, how to write one, every state it needs, and the starter set. Every example uses only theme values ([theme code](tokens.md)).

## Where components live

- `components/`: components used by more than one feature. One exported component per file, named the way the app names its files (the current starter uses kebab-case: `app-button.tsx` holds `AppButton`; older ones PascalCase). Expo's starter already has this folder (under `src/` today), with `ThemedText` and `ThemedView` that the provider replaces ([theme code](tokens.md#wiring-it-in)).
- `features/<feature>/components/`: components that belong to one feature (`features/orders/components/order-row.tsx`). Move one to `components/` the moment a second feature needs it.
- `app/` (or `src/app/`): the routes. A route file holds the screen and imports components; it exports nothing else a second place needs.
- In a monorepo, shared components live in the shared package ([README](README.md)).

**The rule: a function component that one file uses to keep its render readable stays unexported and isn't part of the design system.** When a second place wants it, export it, give it a file in `components/`, and give it every state below. This is also how the component list is found: the `feature` mode lists the exported components in these folders and compares them with section 5 of `DESIGN.md`. Reuse before you build, and extend a component with a new prop before you create another.

## Building a component

1. Start from the core component that does the job (the table below), so focus, accessibility and text scaling come built in. `Pressable` is the base of anything tappable.
2. Style it with `StyleSheet.create` for the static parts and an inline style for colours, with values from `useMotifTheme()`, `space`, `radius` and `type`.
3. Give it the props the design uses (`loading`, `error`), not a prop per style, and a typed `Props` object.
4. Give it every state, a name a screen reader can say, and a tap area of at least 44 by 44 points.

## Every state

A component handles all of these that apply:

| State | In React Native | Notes |
|---|---|---|
| Default | | |
| Hovered | `onHoverIn` and `onHoverOut` with state (web and desktop only; the style callback's type has only `pressed`) | Never the only way to see something. |
| Pressed | `pressed` in `Pressable`'s style callback, `android_ripple` on Android | Show it in the first frame of the touch. |
| Focused | `onFocus` and `onBlur` | Keyboards on the web and Android. A visible ring in the `focus` role; iOS reports focus less reliably, so never depend on it. |
| Disabled | `disabled`, and `accessibilityState={{ disabled }}` | Still readable; say why in nearby text when it isn't obvious. |
| Loading | (your own flag) | Keep the size and the name; ignore taps; `accessibilityState={{ busy }}`. |
| Error | `accessibilityState` and text | Text and an icon, not colour alone. |

Here is a button with them, built on `Pressable`. Pressed shows in the first frame (a dimmed fill, and Android's ripple), the focus ring is a 2 point border in the `focus` role, disabled changes both fill and text, and loading keeps the label in the layout while a spinner shows, so the button keeps its size and its name:

```tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, space, useMotifTheme } from "@/design/motif-theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function AppButton({ label, onPress, disabled = false, loading = false }: Props) {
  const { colors, type, reducedMotion } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  const inactive = disabled || loading;
  // A spinner never stops, so with reduce motion on the label stays as it is.
  const spinner = loading && !reducedMotion;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      android_ripple={{ color: colors.onActionPrimary, foreground: true }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.actionSecondary : colors.actionPrimary,
          borderColor: focused ? colors.focus : disabled ? colors.actionSecondary : colors.actionPrimary,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <Text
        style={[
          type.label,
          { color: disabled ? colors.textSecondary : colors.onActionPrimary },
          spinner && styles.hidden,
        ]}
      >
        {label}
      </Text>
      {spinner ? (
        <View style={StyleSheet.absoluteFill}>
          <ActivityIndicator style={styles.spinner} color={colors.onActionPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 64,
    overflow: "hidden",
    paddingHorizontal: space.s6,
  },
  hidden: { opacity: 0 },
  spinner: { flex: 1 },
});
```

The pressed look is a typed opacity, which is fine here: it dims a theme colour instead of introducing one. When the guide has a pressed role for the action, use that.

## Names and tap areas

Every control has a name a screen reader can say. Text inside a `Pressable` is its name once `accessibilityRole` is set. A control with only an icon needs an `accessibilityLabel`, and a role so the reader says what it is. React Native has no minimum size, so make the box 44 by 44 points: a minimum width and height, or padding. `hitSlop` widens the area that counts as a tap on a phone without changing the box, which is what `motif shot --audit` measures, so use it on top of the size, not instead of it:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";

import { space, useMotifTheme } from "@/design/motif-theme";

export function CloseButton({ onPress }: { onPress: () => void }) {
  const { colors } = useMotifTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={space.s3}
      onPress={onPress}
      style={styles.close}
    >
      <Ionicons name="close" size={24} color={colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
});
```

An icon is read as a character by assistive tools on the web, so a bare glyph never counts as a name; the label does. For a card made of pictures and numbers, set `accessibilityLabel` on the card to the sentence a screen reader should say, and `accessible` groups its children into one stop. A picture that only decorates gets `accessible={false}`; one that carries meaning gets `accessibilityRole="image"` and a label.

## A field with its states

A field keeps its label, helper and error text together. Never use the placeholder as the only label: it disappears when typing starts.

```tsx
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { radius, space, useMotifTheme } from "@/design/motif-theme";

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  helper?: string;
  error?: string;
  editable?: boolean;
};

export function AppField({ label, value, onChangeText, helper, error, editable = true }: Props) {
  const { colors, type } = useMotifTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.focus : colors.border;

  return (
    <View style={styles.field}>
      <Text style={[type.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? helper}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          type.body,
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: border,
            color: editable ? colors.textPrimary : colors.textSecondary,
          },
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[type.caption, { color: colors.textSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.s1 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
  },
});
```

The error has text, not only a red border. For a password field, a toggle button next to it has an `accessibilityLabel` of "Show password". A text field's `accessibilityLabel` (or a `placeholder`) is its name in the audit.

## The starter set

For a new app, build these, each with the states above and the props its screens use. Start from the core component or Expo library in the middle column:

| Component | Starts from | Notes |
|---|---|---|
| `Button` | `Pressable` | One component with `kind` (primary, secondary, quiet) and `loading`; the example above. |
| `IconButton` | `Pressable` with an icon | An `accessibilityLabel` is its name; a 44 point box; `hitSlop` adds to it. |
| `Field` | `TextInput` | Label, helper, error; a password field also shows a toggle with a label. |
| `Checkbox` | `Pressable` with `accessibilityRole="checkbox"` | The row is the tap area, not the box; `accessibilityState={{ checked }}`. |
| `Switch` | `Switch` in a `Pressable` row | Same, with the label at the start (right in right to left); `trackColor` from roles. |
| `Card` | `View`, or `Pressable` when it taps | `surfaceRaised` with a border or a shadow, not both. |
| `ListItem` | `Pressable` row | Title, subtitle, leading and trailing; the whole row taps. |
| `TopBar` | Expo Router's `Stack` header, or `View` | A back button comes with the route; titles are `type.heading`. |
| `TabBar` | Expo Router's `Tabs` | Three to five destinations, each with an icon and a label. |
| `Sheet` | `Modal`, or a bottom-sheet library | Drag handle, safe-area padding, a close action. |
| `Dialog` | `Modal` | Buttons named by what they do ("Delete order"), not "OK". |
| `Toast` | An absolutely placed `View` | Short, with an action when there is one to take; announced with `accessibilityLiveRegion`. |
| `Skeleton` | A `View` in `border` | Fades in and out ([motion](motion.md#skeletons)). |
| `EmptyState` | `View` | An icon, one line of why, one action. |
| `ErrorState` | `View` | What went wrong in plain words, and a retry. |
| `Avatar` | `View` with `Image` | Initials when there is no picture; an `accessibilityLabel` with the name. |
| `Badge` | `View` with `Text` | A count or a dot; its number is part of its owner's name. |

## A screen's states

A screen that shows data has a branch for loading, empty and error, besides the data itself. Mock data loads at once and is never empty, so write the branches anyway. Loading shows skeleton rows in the final layout (`Skeleton` is in [motion](motion.md#skeletons)), as [the empty, loading and error pattern](../../knowledge/ux-patterns/empty-loading-error.md) asks; a spinner is only for a small wait inside a control:

```tsx
import { FlatList, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { Skeleton } from "@/components/Skeleton";
import { space, useMotifTheme } from "@/design/motif-theme";

type Props = { orders: string[] | undefined; failed: boolean; onRetry: () => void };

export function OrdersBody({ orders, failed, onRetry }: Props) {
  const { type } = useMotifTheme();
  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={type.body}>We couldn't load your orders.</Text>
        <AppButton label="Try again" onPress={onRetry} />
      </View>
    );
  }
  if (orders === undefined) {
    return (
      <View accessibilityLabel="Loading orders" style={styles.list}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={space.s12} />
        ))}
      </View>
    );
  }
  if (orders.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={type.body}>No orders yet.</Text>
      </View>
    );
  }
  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={orders}
      keyExtractor={(title) => title}
      renderItem={({ item }) => <Text style={type.body}>{item}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, gap: space.s4, justifyContent: "center", padding: space.s6 },
  list: { gap: space.s3, padding: space.s4 },
});
```

Use mock data from one clearly named file (`mock-data.ts`), never a back end.

## Mockups

`motif preview` works the same on every stack: write the mockup in HTML with [the preview kit](../../preview-kit/README.md) in a phone frame (`mk-phone`, `mk-ios` or `mk-android`), and build the screen to match it. `motif shot --against` puts them side by side.
