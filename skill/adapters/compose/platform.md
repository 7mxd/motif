# Platform rules

What to get right on every Compose app: Android's conventions, edge to edge, right-to-left languages, text size, phone and tablet layouts, and accessibility. Where the app differs between platforms or apps on purpose, write it in `DESIGN.md` section 8, the platform notes.

## Android

The app should feel at home on Android: **Material 3 on Android**, with the guide's look. Material 3's composables already follow the platform: ripples, the system back gesture, scrolling and text selection. Keep that, and add:

- **Navigation**: the system back (button or gesture) always works. Don't swallow it; a `BackHandler` is only for closing something inside a screen (a search, a selection). A bottom `NavigationBar` for three to five top-level places, and a `TopAppBar` with a back `IconButton` on the screens below them.
- **Sheets, dialogs and menus**: `ModalBottomSheet`, `AlertDialog`, `DropdownMenu`, as Material draws them.
- **Touch targets**: at least 48 by 48 dp, Material's size. Material's own controls have it; Motif's audit reports anything below 44 by 44.
- **Type**: the guide's fonts, not Roboto on top of them. Text sizes are in `sp`, so they grow with the phone's font size.
- **Haptics**: `LocalHapticFeedback.current` on a toggle or a long press; never on every tap.

Compose Multiplatform apps that also run on iOS aren't covered here: Motif checks and draws the Android app.

`motif shot` draws screens as Android 15 does, with Roboto where the guide has no font, on the JVM. Check on a phone or an emulator when something depends on the device (the camera, Google Play services' fonts).

## Edge to edge

The template calls `enableEdgeToEdge()` in `onCreate`, and from `targetSdk` 35 Android 15 draws every app edge to edge anyway: the app draws behind the status bar and the navigation bar, and keeps its own content out from under them with `WindowInsets`.

- `Scaffold` passes the bars' space to its content as `innerPadding`: apply it to the content (`Modifier.padding(innerPadding)`, or a list's `contentPadding`) so the first and last rows aren't hidden.
- Outside a `Scaffold` (a full-screen image, a custom bottom bar), pad what must stay clear with `Modifier.windowInsetsPadding(WindowInsets.safeDrawing)`, or only the side you need (`WindowInsets.navigationBars`).
- A form: `Modifier.imePadding()` keeps the field being typed in above the keyboard, and the form scrolls (`Modifier.verticalScroll(rememberScrollState())`).

```kotlin
@OptIn(ExperimentalMaterial3Api::class) // TopAppBar is still marked experimental in Material 3 1.3.
@Composable
fun SettingsScaffold(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(Modifier.padding(innerPadding).padding(horizontal = MotifSpace.s4)) { content() }
    }
}
```

`motif shot` gives phone screenshots a 47 dp status bar and a 34 dp navigation bar, so content that ignores the insets shows under them.

## Right to left

Arabic and Hebrew read right to left. With `android:supportsRtl="true"` in the manifest (the template has it), Compose mirrors a screen by itself when the locale is one of them, if the layout is written in terms of *start* and *end* rather than left and right: `LocalLayoutDirection.current` is then `LayoutDirection.Rtl`, and every `Row`, padding and alignment below reads it.

| Instead of | Use |
|---|---|
| `Modifier.absolutePadding(left = …)` | `Modifier.padding(start = …)` |
| `Modifier.absoluteOffset(x = …)` | `Modifier.offset(x = …)` |
| `AbsoluteAlignment.Left` | `Alignment.Start` |
| `TextAlign.Left` | `TextAlign.Start` |
| `Arrangement.Absolute.Left` | `Arrangement.Start` |
| `AbsoluteRoundedCornerShape(topLeft = …)` | `RoundedCornerShape(topStart = …)` |
| `Icons.Filled.ArrowBack` | `Icons.AutoMirrored.Filled.ArrowBack` |

```kotlin
@Composable
fun TotalRow(amount: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = MotifSpace.s4, end = MotifSpace.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Total", style = MotifType.label, textAlign = TextAlign.Start, modifier = Modifier.weight(1f))
        Text(amount, style = MotifType.body)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
    }
}
```

- Icons that point a direction (back, next, a chevron) come from `Icons.AutoMirrored`, which flips them in right to left. Icons that don't point (search, a clock) stay. Your own vector: `autoMirror = true` on the `ImageVector`, or `android:autoMirrored="true"` in the drawable. From Material 3 1.4 the icons are no longer part of `material3`: add `androidx.compose.material:material-icons-core` (the Compose BOM sets its version) when `Icons` isn't found.
- What you draw yourself on a `Canvas` isn't mirrored: check `LocalLayoutDirection.current == LayoutDirection.Rtl` and draw it the other way.
- Numbers, phone numbers and Latin names inside Arabic text keep their own direction; Android handles it, so don't reverse strings by hand.
- The Arabic font comes from the theme's fonts, chosen by locale ([theme code](tokens.md#text-and-the-arabic-companion)).
- Check it with `motif shot --rtl` ([checks](checks.md#right-to-left)).

## Languages

Text goes in string resources, never in composables: `res/values/strings.xml` for the default language and `res/values-ar/strings.xml` for Arabic, read with `stringResource(R.string.total)`. Android picks the folder from the phone's language; without `values-ar`, an Arabic phone gets the default strings (still laid out right to left), and `motif shot --rtl` says so. To let people choose the app's language apart from the phone's, follow Android's [per-app language preferences](https://developer.android.com/guide/topics/resources/app-languages), which change between releases.

## Text size

Text grows when people raise the phone's font size, up to 200 percent. Keep sizes in `sp` (the type roles are), don't give text a fixed height, and check the screens at the largest size: nothing is cut off, overlaps or becomes untappable. Long labels wrap, or end with `maxLines` and `overflow = TextOverflow.Ellipsis`, rather than overflow.

## Phones and tablets

`motif shot` draws three phone widths (360, 390 and 430 dp) and a tablet (768). Lay out from the space the screen gets, not the device, with `BoxWithConstraints` (or Material's window size classes, see Android's [adaptive layouts guide](https://developer.android.com/develop/ui/compose/layouts/adaptive)):

```kotlin
@Composable
fun AppShell(selected: Int, onSelected: (Int) -> Unit, content: @Composable () -> Unit) {
    val places = listOf("Home" to Icons.Filled.Home, "Settings" to Icons.Filled.Settings)
    BoxWithConstraints {
        if (maxWidth >= 600.dp) {
            Row {
                NavigationRail {
                    places.forEachIndexed { index, (label, icon) ->
                        NavigationRailItem(
                            selected = index == selected,
                            onClick = { onSelected(index) },
                            icon = { Icon(icon, contentDescription = null) },
                            label = { Text(label) },
                        )
                    }
                }
                Box(Modifier.weight(1f)) { content() }
            }
        } else {
            Scaffold(
                bottomBar = {
                    NavigationBar {
                        places.forEachIndexed { index, (label, icon) ->
                            NavigationBarItem(
                                selected = index == selected,
                                onClick = { onSelected(index) },
                                icon = { Icon(icon, contentDescription = null) },
                                label = { Text(label) },
                            )
                        }
                    }
                },
            ) { innerPadding ->
                Box(Modifier.padding(innerPadding)) { content() }
            }
        }
    }
}
```

The phone's tab bar becomes a side rail on the tablet. A single column of content that stretches across a tablet gets a maximum width (`Modifier.widthIn(max = …)`), not wider lines.

## Accessibility

- Names: [components](components.md#names-and-touch-targets). Every control has one, and `motif shot --audit` reports ones without ([checks](checks.md#names)).
- `Modifier.semantics(mergeDescendants = true) { }` makes a row of an icon and its text one stop; `contentDescription = null` hides decoration; `Modifier.semantics { heading() }` marks a section's title, so screen reader users can jump between them.
- Colour is never the only signal: an error has text, a selected tab has a shape or weight change too.
- Contrast is the guide's job and the audit's ([checks](checks.md#contrast)); use the text role the guide pairs with the surface.
- Remove animations: [motion](motion.md#reduced-motion).
- Dark mode follows the phone (`MotifTheme` reads `isSystemInDarkTheme()`). Never force a theme.
