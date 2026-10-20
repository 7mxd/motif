# Checks and screenshots

What `motif check` and `motif shot --audit` report in a Compose app, how to fix each finding, and the files that let `motif shot` reach screens behind a tap or a sign-in.

`motif check` reads the Kotlin (`.kt`) of the app module. Comments and the insides of strings are not code, so a colour in a comment is fine; code inside `${…}` in a string is read. Every finding names the file, line and column. These aren't read: `build/`, `.gradle/`, `.motif/`, `src/test/`, `src/androidTest/`, the Gradle scripts (`*.kts`), other modules (a library module of the project), and Motif's own `MotifTheme.kt`.

A value that truly must stay as it is (a colour the user picks, a partner's brand colour) gets a `// motif-ok: <reason>` comment on its line or the line above. `motif check` lists these exceptions separately instead of as problems. Keep them rare, and always give the reason:

```kotlin
// motif-ok: the partner's brand colour, fixed by their licence
val PartnerBlue = Color(0xFF0057B8)
```

## `raw-color`

A colour typed into Kotlin.

- Example: `Color(0xFF8A8A8A)`, `Color(0x80000000)`, `Color(red = 0, green = 0, blue = 0)`, `Color.White`, `Color.Gray`, `Color.parseColor("#1A73E8")`. (`Color.Transparent` and `Color.Unspecified` are fine.)
- Fix: the colour role it stands for, `MotifTheme.colors.<role>`. Each finding names the nearest role.
- The app's own palette (the template's `ui/theme/Color.kt` of `val Purple80 = Color(0xFFD0BCFF)`, a `lightColorScheme(…)` of typed colours, an `object` of colour constants) is typed colours by nature, so its colours are flagged too, and `motif check` adds one line for the file: `<file> is your own theme's palette: once the app uses Motif's theme, remove it, or list its folder under "ignore" in design/motif.json.` Don't rewrite the palette with Motif's roles: move the composables to `MotifTheme.colors`, then delete it (the template's `ui/theme/` goes whole), or list its folder under `"ignore"` while both themes live side by side.

```kotlin
@Composable
fun TaxNote() {
    val colors = MotifTheme.colors
    Surface(color = colors.surface) {
        Text("Prices include tax", style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
    }
}
```

## `off-scale`

A spacing, corner or text size that isn't on the theme's scales. A number that is on a scale (`padding(16.dp)`) is seen but allowed, since the build stays correct; still prefer the role, so a change to the guide arrives everywhere.

- Example: `Modifier.padding(13.dp)`, `PaddingValues(horizontal = 18.dp)`, `Arrangement.spacedBy(6.dp)`, `Spacer(Modifier.height(18.dp))`, `RoundedCornerShape(10.dp)`, `fontSize = 15.sp`.
- Fix: the nearest step, `MotifSpace.s4`, `MotifRadius.md`, or a type role (`MaterialTheme.typography.bodyLarge`, `MotifType.body`). If the design truly needs a new step, propose a change to the design guide instead. Sizes that aren't spacing (`Modifier.size(40.dp)`, a border's width) aren't read.

```kotlin
@Composable
fun ShippedNote() {
    Column(
        modifier = Modifier.padding(MotifSpace.s4),
        verticalArrangement = Arrangement.spacedBy(MotifSpace.s2),
    ) {
        Box(Modifier.clip(RoundedCornerShape(MotifRadius.md))) {
            Text("Order shipped", style = MaterialTheme.typography.bodyLarge)
        }
        Spacer(Modifier.height(MotifSpace.s3))
    }
}
```

## `raw-font`

A font family typed into a composable.

- Example: `FontFamily(Font(R.font.lato_regular))` built inside a `@Composable`, `fontFamily = FontFamily.Serif` (or `Monospace`, `Cursive`), `GoogleFont("Inter")`.
- Fix: a type role, which already has the theme's fonts and their Arabic companion. For a code font the guide's `font.mono` role; if the theme has none, propose adding it as a design guide change. A family declared at the top of a file, outside composables (the app's own type setup), isn't reported.

```kotlin
@Composable
fun OrderNumber(number: String) {
    Text(number, style = MaterialTheme.typography.labelLarge)
}
```

## `raw-motion`

A duration, easing or spring typed into an animation.

- Example: `tween(300)`, `tween(durationMillis = 300)`, `snap(100)`, `keyframes { durationMillis = 500 }`, `FastOutSlowInEasing`, `EaseInOut`, `CubicBezierEasing(0.4f, 0f, 0.2f, 1f)`, `spring(dampingRatio = 0.8f, stiffness = 400f)`, `spring(stiffness = Spring.StiffnessLow)`.
- Fix: `MotifDurations.<role>` (through `MotifMotion.duration(…)`), `MotifEasing.<role>` and `MotifSprings.<role>()` ([motion](motion.md)).
- Not findings: `LinearEasing`, `spring()` with Compose's defaults, a `delay` or a timeout, and how long a `Snackbar` stays up. A duration that is one of the guide's is seen but allowed; still use the role.

```kotlin
@Composable
fun SavedLabel(visible: Boolean) {
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(MotifMotion.duration(MotifDurations.fast), easing = MotifEasing.standard),
        label = "saved",
    )
    Text("Saved", modifier = Modifier.graphicsLayer { this.alpha = alpha })
}
```

## `reduced-motion`

The app animates (`animate*AsState`, `AnimatedVisibility`, `AnimatedContent`, `Crossfade`, `rememberInfiniteTransition`, `updateTransition`, `Animatable`), but nothing in its own code respects Remove animations.

- Fix: build durations with `MotifMotion.duration(…)`, which is zero when the setting is on, or check `MotifMotion.reduced()` ([motion](motion.md#reduced-motion)). One use anywhere in the app's code satisfies the check; the audit below looks at each screen.

```kotlin
@Composable
fun PressScale(pressed: Boolean, content: @Composable () -> Unit) {
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = tween(MotifMotion.duration(MotifDurations.fast)),
        label = "scale",
    )
    Box(Modifier.scale(scale)) { content() }
}
```

## `generated-edited`

`MotifTheme.kt` or `motif_font_certs.xml` was edited by hand, or is out of date.

- Fix: move the change into `design/tokens.json` (as a design guide change, if it's new), then run `motif tokens` to write the files again.

## Contrast

From `motif shot --audit`: text measured as drawn below 4.5:1 (3:1 for large text: 24 sp, or 18.66 sp bold, at the phone's font scale). Android's Accessibility Test Framework reads each text's colours from the screenshot's pixels, and Motif asks the ratio above of them.

- Fix: use the text role the design guide pairs with that surface (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). If a pair itself fails, `motif validate` reports it too, and the role values need changing.
- Text of symbols only (a `·` between two facts) is left out. So is text the framework finds something drawn over, which a note counts for each screen: check those by eye. Text over a photo or a gradient has no single background; look at those screens by eye too.

```kotlin
@Composable
fun DeliveryNote() {
    Text(
        "Delivery times are estimates",
        style = MaterialTheme.typography.bodySmall,
        color = MotifTheme.colors.textSecondary,
    )
}
```

## Target size

From `motif shot --audit`: a tappable control smaller than 44×44 dp where people tap it, on the phone and tablet sizes. Compose widens a small control's touch area to 48 dp where nothing else is next to it, so two small icons side by side are reported while one on its own may not be.

- Fix: give it at least 44×44 dp where people tap it: `Modifier.minimumInteractiveComponentSize()`, padding, a larger size, or room around it. Material's `IconButton` is already 48 dp.

```kotlin
@Composable
fun RemoveButton(onRemove: () -> Unit) {
    IconButton(onClick = onRemove) {
        Icon(Icons.Filled.Close, contentDescription = "Remove")
    }
}
```

## Names

From `motif shot --audit`: a control that can be tapped or long-pressed, or a text field, with no name a screen reader can say. The finding is reported in the review format under the category `accessibility`. Its selector names the app's own composable around it, then the control: `LoginScreen > Button("Sign in")`, `TopBar > Button[2]` when alike controls are told apart by their order.

- Fix: a visible label, a `contentDescription` on the icon (`Icon` and `Image` take one), or `Modifier.semantics { contentDescription = … }`. A `Switch` or `Checkbox` is named by its row: put it in a `Row` with `Modifier.toggleable` and a `Text`.
- A tap area over (nearly) the whole screen that isn't a button or a field, such as a `Box` that closes the keyboard, isn't a control anyone aims at, so it needs no name.

```kotlin
@Composable
fun NotificationsRow(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = checked, onValueChange = onCheckedChange, role = Role.Switch)
            .padding(MotifSpace.s4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Notifications", modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}
```

## Reduced motion

From `motif shot --audit`: with Remove animations on, something on the screen keeps moving. Motif draws the 390 dp light screenshot with the setting on, waits 2 seconds, and compares the next frames; the finding names the composable that moves (`OrdersScreen > Skeleton`). Compose's own animations stop under the setting, a `rememberInfiniteTransition` and a spinner included, so what's reported is animation the app drives itself: a `while (true)` loop around `Animatable.animateTo`, or a `withFrameNanos` loop.

- Fix: don't start it, or show its still frame, when `MotifMotion.reduced()` is true ([motion](motion.md#reduced-motion)).

## Screens behind a form or a click

`motif shot` draws each screen as it first appears. A screen that only appears after someone fills in a form or taps a tab needs a **state** (a few lines of Kotlin that get the screen there), and may need the setup file below. Keep states in `design/states/`, named after the state (letters, digits and dashes), and add `--state design/states/<state>.kt` for each.

A state is in the package `dev.motif.states.<state>` (dashes become underscores) and defines `fun motifState(rule: ComposeContentTestRule)`. Motif runs it on each screen once the screen has settled, with the Compose test rule, and lets the screen settle again afterwards:

```kotlin
// design/states/sent.kt: the contact page after the form is sent.
package dev.motif.states.sent

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput

fun motifState(rule: ComposeContentTestRule) {
    val fields = rule.onAllNodes(hasSetTextAction())
    if (fields.fetchSemanticsNodes().isEmpty()) return // Only the contact page has a field.
    fields.onFirst().performTextInput("maya@example.com")
    rule.onNode(hasText("Send")).performClick()
}
```

```bash
motif shot --routes /contact --state design/states/sent.kt
```

- It runs on every screen `motif shot` draws: start with a guard that returns on the others, or capture only its screen with `--routes`.
- Screenshots are named after the screen and the state (`contact@sent.mobile.png`), each starting from a fresh launch. Use the same `--state` options for `--save` and `--against`.
- A state has 15 seconds. An error it throws is the screen's error, and the screenshot is still taken.
- Mock data only.

### The setup file

`design/states/Setup.kt` runs before each screenshot's activity starts (each size, scheme, variant and direction). It is how a screen is reached that depends on who is signed in, what is stored, or which palette a variant is. It is in the package `dev.motif.states` and defines `fun motifSetup(variant: String, locale: Locale, dark: Boolean)`:

```kotlin
// design/states/Setup.kt
package dev.motif.states

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.util.Locale

fun motifSetup(variant: String, locale: Locale, dark: Boolean) {
    val context = ApplicationProvider.getApplicationContext<Context>()
    context.getSharedPreferences("session", Context.MODE_PRIVATE).edit().putBoolean("signed_in", true).commit()
    // An app that switches its own palette sets it here: variant is the variant's id ("" with no variants).
}
```

Every screenshot in a run shares the app's global objects (an `object`, a singleton repository), so reset any of yours here. Motif doesn't answer network requests for a Compose app: point the app at its mock data here (a repository it reads, say), never at a back end.

Robolectric starts the app's `Application` again for each screen, in the same JVM. Motif stops Koin between screens; anything else it starts once for the whole app (`WorkManager.initialize`, say) needs a check that it hasn't started already. An `Application` that can't start in a test is replaced by a plain one, and the run's note says why.

In a project with several apps, give each app its own: `motif shot --app mobile/android/app` uses `mobile/android/app/design/states/Setup.kt` when it exists, and the project's `design/states/Setup.kt` otherwise, and says which it used. `--state` files are used from the path you give.

### Screens that aren't routes

`--routes` draws Navigation Compose's routes. A composable that is a screen without a route (a sheet's content, a screen of a feature that isn't wired up yet) is drawn from its `@Preview`:

```bash
motif shot --screen HomePreview
```

The preview has to be a top-level `@Preview` function without parameters (or the app's own multipreview annotation); one that takes a `@PreviewParameter` is left out. Name it by its function's name, or by its full name (`com.example.myapp.ui.home.HomeScreenKt.HomePreview`) when two share one. Previews are drawn without system bars, as Android Studio shows them, so wrap each in `MotifTheme { … }`.

## Right to left

`motif shot --rtl` takes every screenshot a second time in Arabic, right to left (`--rtl he` for Hebrew), named with `.rtl`, and the audit covers them too. Without a `res/values-ar` folder, the screenshots show the app's default strings laid out right to left, and `motif shot` says so ([platform](platform.md#languages)).

```bash
motif shot --audit --rtl
```

## Reading the results

Run both with `--json`. `motif check` lists `violations` (each with its file, line, rule and fix), `exceptions` and `warnings`. `motif shot --audit` writes its findings to `design/shots/audit.json` in the review format, with the screen, the composable and a screenshot. Fix what they report, then run them again until both are clean; `./gradlew :app:compileDebugKotlin` too.

How `motif shot` runs on a Compose app:

- It needs a JDK 17 or newer, the Android SDK and the project's Gradle wrapper; without them it stops and says what to install.
- It adds a test to the module for the run only, in `app/.motif/` (with its own `.gitignore`), and deletes it afterwards, whatever happens. It never edits the build files. The module's own unit tests are compiled too, so they have to compile.
- The first run says: "The first Compose screenshots download Robolectric's Android libraries (a few hundred MB); later runs reuse them." Offline, the run stops with "Gradle couldn't download what the screenshots need." A mirror or proxy set for Gradle in `gradle.properties` is passed on.
- A screen that doesn't settle within 5 seconds is drawn as it is, with a note. A run has 10 minutes, plus 5 seconds per screenshot.
