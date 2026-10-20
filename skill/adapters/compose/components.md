# Components

How to build composables in a Compose app the Motif way: where they live, how to write one, every state it needs, and the starter set. Every example uses only theme values ([theme code](tokens.md)).

## Where composables live

Under the app's package (`app/src/main/java/com/example/myapp/`):

- `ui/components/`: components used by more than one feature. One public composable per file, named after it (`AppButton.kt` holds `AppButton`).
- `ui/<feature>/`: a feature's screens, the composables only it uses, and its `ViewModel` (`ui/orders/OrdersScreen.kt`, `ui/orders/OrderRow.kt`). Move a composable to `ui/components/` the moment a second feature needs it.

**The rule: `private` composables are parts of a screen, not components.** A `private fun Header()` that one file uses to keep its screen readable can stay private and doesn't count as part of the design system. When a second place wants it, make it public, give it a file in `ui/components/`, and give it every state below. This is also how the component list is found: the `feature` mode lists the public composables in `ui/components/` and the feature folders, and compares them with section 5 of `DESIGN.md`. Reuse before you build, and extend a composable with a new option before you create another.

## Building a composable

1. Start from the Material 3 composable that does the job (the table below), so focus, semantics, text scaling and touch targets come built in. The theme already gives it Motif's colours, corners and text.
2. Make it **stateless**, with its state hoisted to the caller: values come in as parameters, and events go out as lambdas (`checked: Boolean, onCheckedChange: (Boolean) -> Unit`). The screen or its `ViewModel` owns the state; the component only shows it. This keeps every state reachable from a preview and from Motif's screenshots.
3. Take a `modifier: Modifier = Modifier` as the first optional parameter and apply it to the outermost element, so callers can place it.
4. Add what the design needs with the component's own options (`ButtonDefaults.buttonColors(…)`, `OutlinedTextFieldDefaults.colors(…)`), with values from `MotifTheme.colors`, `MotifSpace`, `MotifRadius` and the type roles. Add options the design uses (`loading`, `isError`), not a parameter per style.
5. Give it every state, a name a screen reader can say, and a touch target of at least 48 by 48 dp.

## Every state

A component handles all of these that apply. Material's ripple already shows hovered, focused and pressed through the component's `interactionSource`; read the same source to add what the design asks for:

| State | How Compose says it | Notes |
|---|---|---|
| Default | | |
| Hovered | `collectIsHoveredAsState()` | Mouse and trackpad: tablets, Chromebooks. Never the only way to see something. |
| Pressed | `collectIsPressedAsState()` | Show it in the first frame of the touch. |
| Focused | `collectIsFocusedAsState()` | Keyboards and switch access. A visible ring in the `focus` role. |
| Disabled | `enabled = false` | Still readable; say why in nearby text when it isn't obvious. |
| Loading | (your own flag) | Keep the size and the name; ignore taps. |
| Error | `isError = true` with `supportingText` | Text and an icon, not colour alone. |

Here is a button with them, built on `Button`. The ripple is kept; the focus ring, disabled colours, loading (same size, same name) and the 48 dp height are added:

```kotlin
package com.example.myapp.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.example.myapp.ui.motif.MotifMotion
import com.example.myapp.ui.motif.MotifRadius
import com.example.myapp.ui.motif.MotifSpace
import com.example.myapp.ui.motif.MotifTheme

@Composable
fun AppButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val colors = MotifTheme.colors
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    // A spinner never stops, so with Remove animations on the button shows its label instead.
    val spinner = loading && !MotifMotion.reduced()
    Button(
        onClick = onClick,
        // Loading ignores taps but keeps the button's colours, size and name.
        enabled = enabled && !loading,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(MotifRadius.md),
        colors = ButtonDefaults.buttonColors(
            containerColor = colors.actionPrimary,
            contentColor = colors.onActionPrimary,
            disabledContainerColor = if (loading) colors.actionPrimary else colors.actionSecondary,
            disabledContentColor = if (loading) colors.onActionPrimary else colors.textSecondary,
        ),
        border = if (focused) BorderStroke(2.dp, colors.focus) else null,
        contentPadding = PaddingValues(horizontal = MotifSpace.s6),
        interactionSource = interactionSource,
    ) {
        // The label stays in the layout (and is read aloud) while the spinner shows,
        // so the button keeps its size and its name.
        Box(contentAlignment = Alignment.Center) {
            Text(label, modifier = Modifier.alpha(if (spinner) 0f else 1f))
            if (spinner) {
                CircularProgressIndicator(
                    modifier = Modifier.size(MotifSpace.s5),
                    color = colors.onActionPrimary,
                    strokeWidth = 2.dp,
                )
            }
        }
    }
}
```

The disabled look is `actionSecondary` with `textSecondary`, as the guide pairs them, so a disabled button stays readable.

## Names and touch targets

Every control has a name a screen reader can say. Text inside a control is its name. An icon on its own needs a `contentDescription`; an icon next to text that says the same gets `contentDescription = null`, so it isn't read twice:

```kotlin
IconButton(onClick = onClose) {
    Icon(Icons.Filled.Close, contentDescription = "Close")
}
```

Material gives an `IconButton` a 48 by 48 dp touch target. A control you make yourself from `Modifier.clickable` or `Modifier.toggleable` gets the same with `Modifier.minimumInteractiveComponentSize()`, and says what it is with `role`. Something drawn from several pieces (icons, numbers) gets one name with `Modifier.semantics {`:

```kotlin
@Composable
fun Rating(stars: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    Row(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics { contentDescription = "Rated $stars out of 5" },
        horizontalArrangement = Arrangement.spacedBy(MotifSpace.s1),
    ) {
        repeat(5) { index ->
            Icon(
                Icons.Filled.Star,
                contentDescription = null,
                tint = if (index < stars) colors.actionPrimary else colors.border,
            )
        }
    }
}
```

`clearAndSetSemantics` replaces the pieces' own semantics with the one name; `Modifier.semantics(mergeDescendants = true) { }` instead keeps them and reads them as one stop. A picture that only decorates gets `contentDescription = null`; one that carries meaning (an avatar, a product photo) gets a description.

A card that opens something reads its press and focus from its own `interactionSource`:

```kotlin
@Composable
fun AppCard(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val colors = MotifTheme.colors
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val focused by interactionSource.collectIsFocusedAsState()
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(MotifRadius.lg),
        colors = CardDefaults.cardColors(containerColor = colors.surfaceRaised, contentColor = colors.textPrimary),
        // The focus ring: a 2 dp border in the focus role. Pressed darkens the border.
        border = when {
            focused -> BorderStroke(2.dp, colors.focus)
            pressed -> BorderStroke(1.dp, colors.textSecondary)
            else -> BorderStroke(1.dp, colors.border)
        },
        interactionSource = interactionSource,
    ) {
        Box(Modifier.padding(MotifSpace.s4)) { content() }
    }
}
```

## A field with its states

Use `OutlinedTextField` (or `TextField`) with a `label`, so the name stays attached to the field and is read with it. Never use a placeholder as the only label: it disappears when typing starts. Errors are text in `supportingText` with `isError = true`, plus an icon:

```kotlin
@Composable
fun AppField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    helper: String? = null,
    error: String? = null,
    enabled: Boolean = true,
) {
    val colors = MotifTheme.colors
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text(label) },
        supportingText = (error ?: helper)?.let { text -> { Text(text) } },
        isError = error != null,
        trailingIcon = if (error != null) {
            { Icon(Icons.Filled.Warning, contentDescription = null) }
        } else {
            null
        },
        singleLine = true,
        shape = RoundedCornerShape(MotifRadius.md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = colors.focus,
            unfocusedBorderColor = colors.border,
            errorBorderColor = colors.danger,
            focusedLabelColor = colors.focus,
            unfocusedLabelColor = colors.textSecondary,
            errorLabelColor = colors.danger,
            errorSupportingTextColor = colors.danger,
            errorTrailingIconColor = colors.danger,
            focusedContainerColor = colors.surface,
            unfocusedContainerColor = colors.surface,
        ),
    )
}
```

## The starter set

For a new app, build these, each with the states above and the options its screens use. Start from the Material 3 composable in the middle column:

| Component | Starts from | Notes |
|---|---|---|
| `Button` | `Button`, `OutlinedButton`, `TextButton` | One composable with `kind` (primary, secondary, quiet) and `loading`. |
| `IconButton` | `IconButton` | The icon's `contentDescription` is its name. |
| `Field` | `OutlinedTextField` | Label, helper, error; a password field also has a show/hide `IconButton` with a description. |
| `Checkbox` | `Checkbox` in a `Row` with `Modifier.toggleable(role = Role.Checkbox)` | The row is the touch target, not the box: pass `onCheckedChange = null` to the box. |
| `Switch` | `Switch` in a `Row` with `Modifier.toggleable(role = Role.Switch)` | Same, with the label at the start. |
| `Card` | `Card(onClick = …)` | Above; `surfaceRaised` with a border or a shadow, not both. |
| `ListItem` | `ListItem` | Headline, supporting text, leading and trailing; the whole row taps. |
| `TopBar` | `TopAppBar` | A back `IconButton` with `Icons.AutoMirrored.Filled.ArrowBack` ([platform](platform.md#right-to-left)); titles in `MotifType.heading`. |
| `TabBar` | `NavigationBar` | Three to five destinations, each with an icon and a label. The indicator is `actionSecondary`. |
| `Sidebar` | `NavigationRail` | For tablets; a phone uses the tab bar. |
| `Sheet` | `ModalBottomSheet` | Drag handle, insets, a close action. |
| `Dialog` | `AlertDialog` | Buttons named by what they do ("Delete order"), not "OK". |
| `Toast` | `Snackbar` in a `SnackbarHost` | Short, with an action when there is one to take; how long it stays up is not motion. |
| `Skeleton` | A `Box` in `border` | Pulses, and stops under Remove animations ([motion](motion.md#skeletons)). |
| `EmptyState` | `Column` | An icon, one line of why, one action. |
| `ErrorState` | `Column` | What went wrong in plain words, and a retry. |
| `Avatar` | A `Box` clipped to `CircleShape` | Initials when there is no picture; the person's name as its description. |
| `Badge` | `BadgedBox` and `Badge` | A count or a dot; its number is part of its owner's name. |

Every Material colour comes from one of the guide's roles ([theme code](tokens.md#wiring-it-in)), so these need no colours of their own: the tab bar's and rail's indicator, a `FilledTonalButton` and a selected `FilterChip` are `actionSecondary` with `onActionSecondary` on them, and a `FloatingActionButton` is `actionPrimary` with `onActionPrimary`. Pass colours only where the design guide asks for something else, and then from `MotifTheme.colors`.

## A screen's states

A screen that shows data has a branch for loading, empty and error, besides the data itself. Mock data loads at once and is never empty, so write the branches anyway. Loading shows skeleton rows in the final layout (`Skeleton` is in [motion](motion.md#skeletons)), as [the empty, loading and error pattern](../../knowledge/ux-patterns/empty-loading-error.md) asks; a spinner is only for a small wait inside a control:

```kotlin
sealed interface OrdersState {
    data object Loading : OrdersState
    data class Loaded(val orders: List<String>) : OrdersState
    data object Failed : OrdersState
}

@Composable
fun OrdersBody(state: OrdersState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    when (state) {
        OrdersState.Failed -> Column(
            modifier = modifier.fillMaxSize().padding(MotifSpace.s6),
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s3, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = colors.danger)
            Text("We couldn't load your orders.", style = MotifType.body)
            AppButton(label = "Try again", onClick = onRetry)
        }
        OrdersState.Loading -> Column(
            // Skeleton rows in the final layout; they stop pulsing under Remove animations.
            modifier = modifier
                .padding(MotifSpace.s4)
                .semantics { contentDescription = "Loading orders" },
            verticalArrangement = Arrangement.spacedBy(MotifSpace.s3),
        ) {
            repeat(4) { Skeleton(Modifier.fillMaxWidth().height(MotifSpace.s12)) }
        }
        is OrdersState.Loaded -> if (state.orders.isEmpty()) {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No orders yet.", style = MotifType.body)
            }
        } else {
            LazyColumn(modifier, contentPadding = PaddingValues(MotifSpace.s4)) {
                items(state.orders) { title -> ListItem(headlineContent = { Text(title) }) }
            }
        }
    }
}
```

Use mock data from one clearly named file (`data/MockData.kt`), never a back end.

## Mockups

`motif preview` works the same on every stack: write the mockup in HTML with [the preview kit](../../preview-kit/README.md) in a phone frame (`mk-phone` or `mk-android`), and build the Compose screen to match it. `motif shot --against` puts them side by side.
