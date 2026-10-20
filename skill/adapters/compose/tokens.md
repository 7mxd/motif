# Theme code

What `motif tokens` writes for a Compose app, how to wire it in, how composables read it, how the theme's fonts load and how to switch between design variants.

## What `motif tokens` writes

One Kotlin file: `MotifTheme.kt` in `ui/motif/` under the app's package (`app/src/main/java/com/example/myapp/ui/motif/`, package `com.example.myapp.ui.motif`), or in the folder `themeDir` names in `design/motif.json` (see the [README](README.md)). Never edit it; change `design/tokens.json` and run `motif tokens` again. `motif check` reports a hand edit as `generated-edited`. It holds:

| Name | What it is | Use it as |
|---|---|---|
| `MotifTheme { … }` | The composable that applies the guide's Material theme, light or dark | Around the app's content |
| `MotifTheme.colors` | Every colour role of the nearest `MotifTheme` (a `MotifColors`) | `MotifTheme.colors.textSecondary` |
| `MotifSpace` | The spacing scale, in `Dp` | `MotifSpace.s4` (16.dp) |
| `MotifRadius` | Corner sizes, in `Dp` | `RoundedCornerShape(MotifRadius.md)` |
| `MotifShadows` | Shadows, as lists of `Shadow` | `Modifier.motifShadow(MotifShadows.md, shape)` |
| `MotifType` | The type roles as `TextStyle`s, with the theme's fonts | `MotifType.body` |
| `MotifFonts` | The theme's font families | Used by `MotifType`; rarely needed |
| `MotifDurations`, `MotifEasing`, `MotifSprings` | The motion roles ([motion](motion.md)) | `MotifDurations.base` |
| `MotifMotion` | Remove animations helpers | `MotifMotion.duration(MotifDurations.base)` |
| `MotifVariant` | The design variants, when the guide has them | `MotifVariant.Contrast` |

Names are the guide's roles in lowerCamelCase (`text-secondary` is `textSecondary`). A spacing step starts with `s` (`4` is `s4`, `0-5` is `s0p5`). The file lists exactly the roles the guide has: read it when unsure which exist; don't guess one.

It may also write two kinds of resources into the app module, never anything else:

- `src/main/res/values/motif_font_certs.xml`: Google Play services' certificates, which downloadable fonts need ([fonts](#fonts)).
- The guide's own font files, copied into `src/main/res/font/`.

## Wiring it in

Wrap the content once, in the activity's `setContent`, in place of the template's own theme (`MyAppTheme`):

```kotlin
package com.example.myapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.example.myapp.ui.motif.MotifTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MotifTheme {
                App()
            }
        }
    }
}
```

Wrap each `@Preview` in `MotifTheme { … }` too, so previews and Motif's screenshots of them show the guide's look. `MotifTheme` follows the phone's light or dark setting (`darkTheme` is `isSystemInDarkTheme()` unless you pass it), and never uses Android's dynamic colour: the guide decides the colours.

Once `MainActivity` and every preview use `MotifTheme`, nothing uses the template's `ui/theme/` folder (`Color.kt`, `Theme.kt`, `Type.kt`), and it can be deleted. Until then `motif check` reports its colours, with a line saying the file is the app's own palette. Keep `res/values/themes.xml`: it is the window's theme the manifest names, not Compose's.

Material composables (buttons, fields, cards, app bars, dialogs) then take their colours, type and corners from the theme. `MotifTheme` fills Material's colour scheme from the guide's roles:

| Material's colour | The guide's role |
|---|---|
| `primary`, `onPrimary` | `actionPrimary`, `onActionPrimary` |
| `secondary`, `onSecondary` | `actionSecondary`, `onActionSecondary` |
| `error`, `onError` | `danger`, `onDanger` |
| `background`, `surface`, `onSurface`, `onSurfaceVariant` | `background`, `surface`, `textPrimary`, `textSecondary` |
| `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest` | `surface`, `surfaceRaised`, `surfaceRaised` |
| `outline`, `outlineVariant` | `border` |

Material's other colours (`primaryContainer`, `secondaryContainer`, `tertiary` and the like) keep Material's own purple defaults, since the guide has no role for them. A few components use them: `FloatingActionButton`, `FilledTonalButton`, a selected `FilterChip`, and the indicator of `NavigationBar` and `NavigationRail`. Give those their colours from `MotifTheme.colors` ([components](components.md#the-starter-set)). The guide's other roles (`focus`, `success`, `warning`, `info`, `textInverse`) are only in `MotifTheme.colors`. Corners: Material's `small` shapes use `MotifRadius.sm`, `medium` `MotifRadius.md`, `large` and `extraLarge` `MotifRadius.lg`.

## Reading theme values in composables

Composables you build yourself read the roles directly. `MotifTheme.colors` follows light, dark and the variant by itself, so a composable never asks which one it is in:

```kotlin
@Composable
fun PriceTag(label: String, modifier: Modifier = Modifier) {
    val colors = MotifTheme.colors
    val shape = RoundedCornerShape(MotifRadius.md)
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = colors.textPrimary,
        modifier = modifier
            .motifShadow(MotifShadows.sm, shape)
            .background(colors.surfaceRaised, shape)
            .border(1.dp, colors.border, shape)
            .padding(horizontal = MotifSpace.s3, vertical = MotifSpace.s1),
    )
}
```

- Colours: only roles, paired as the guide pairs them (`textPrimary` on `surface`, `onActionPrimary` on `actionPrimary`). No `Color(0x…)`, `Color.White` or `MaterialTheme.colorScheme.tertiary`.
- Sizes: `MotifSpace.sN` for padding, gaps and `Spacer`s; `MotifRadius` for corners. Sizes that aren't spacing (an avatar's 40.dp, a border's 1.dp) can stay numbers.
- Shadows: `Modifier.motifShadow(MotifShadows.<role>, shape)` before the background, with the same shape. A card has a border or a shadow, not both.
- Text: the role's Material slot, below, or `MotifType.<role>`. The roles carry no colour: pass `color =` when the default text colour isn't right, and never set `fontSize` or `fontFamily` yourself.

## Text and the Arabic companion

Each Material type slot takes its font, weight and line height from one of the guide's roles. On a typical scale, the slot that is the role at its own size is:

| Role | `MotifType.` | `MaterialTheme.typography.` |
|---|---|---|
| display | `display` | `displayLarge` |
| title | `title` | `headlineLarge` |
| heading | `heading` | `titleLarge` |
| body | `body` | `bodyLarge` (also `Text`'s default) |
| label | `label` | `labelLarge` (buttons' text) |
| caption | `caption` | `bodySmall` |

The smaller slots (`titleMedium`, `bodyMedium`, `labelSmall`…) keep their role's font and weight at the guide's smaller sizes.

When a role's font list has an **Arabic companion** (the second font), `motif tokens` also writes `MotifType.<role>Arabic` in it, and `MotifTheme` fills Material's slots with those whenever the app's locale is written in Arabic script (Arabic, Persian, Urdu and the like). So text styled through `MaterialTheme.typography`, and plain `Text` and Material components, switch fonts with the language by themselves. `MotifType.body` always uses the first font; Android then draws Arabic letters in a system font, not the companion. In an app that shows Arabic, style text through `MaterialTheme.typography`, or choose `MotifType.bodyArabic` yourself.

## Fonts

`MotifType` loads the theme's fonts for you:

- **Google Fonts** (the usual case): through Compose's downloadable fonts, which need the `androidx.compose.ui:ui-text-google-fonts` library. When the app module doesn't depend on it, `motif tokens` prints the exact lines to add (to `gradle/libs.versions.toml` when the app has a version catalogue, and to `app/build.gradle.kts`; the Compose BOM sets the version), and writes a file that compiles in the meantime, with the system font in their place. Add them, sync, and run `motif tokens` again. Google Play services downloads each font the first time the app shows it; until it arrives, and on a phone without Play services, the system font stands in.
- **The certificates:** downloadable fonts check Google Play services' certificates, so `motif tokens` writes them to `res/values/motif_font_certs.xml`. An app that already has its own (a `font_certs.xml` defining `com_google_android_gms_fonts_certs`) gets none from Motif. If the app adds its own later, `motif tokens` says to delete `motif_font_certs.xml`: Android won't build an app that defines them twice.
- **Project fonts** (files in the guide's font files): `motif tokens` copies `.ttf` and `.otf` files into the module's `res/font` under resource names (lower case, with underscores), and the theme loads them as `R.font.<name>`. Android can't use WOFF2; the guide needs a `.ttf` or `.otf` of the family.
- **An Arabic companion** loads the same way as the first font, and is used by locale as above.

## Switching variants

When the guide has design variants, `motif tokens` also writes `enum class MotifVariant` (the default first, each id in UpperCamelCase: `high-contrast` is `HighContrast`), a colour set per variant, and a `variant` argument on `MotifTheme`. The default is used when you pass nothing:

```kotlin
MotifTheme(variant = MotifVariant.Contrast) {
    App()
}
```

To let people change it, keep the choice in the app's state and pass it to `MotifTheme`. In a composable, `rememberSaveable` keeps it across rotation:

```kotlin
@Composable
fun MyApp() {
    var variant by rememberSaveable { mutableStateOf(MotifVariant.Default) }
    MotifTheme(variant = variant) {
        SettingsScreen(variant = variant, onVariantChange = { variant = it })
    }
}
```

When the choice lives in a `ViewModel`, expose it as a `StateFlow` and collect it where `MotifTheme` is called (`collectAsStateWithLifecycle()` from `lifecycle-runtime-compose` does the same as `collectAsState()` and stops while the app is in the background):

```kotlin
class AppViewModel : ViewModel() {
    private val chosen = MutableStateFlow(MotifVariant.Default)
    val variant: StateFlow<MotifVariant> = chosen.asStateFlow()

    fun choose(variant: MotifVariant) {
        chosen.value = variant
    }
}

@Composable
fun MyApp(viewModel: AppViewModel) {
    val variant by viewModel.variant.collectAsState()
    MotifTheme(variant = variant) {
        SettingsScreen(variant = variant, onVariantChange = viewModel::choose)
    }
}
```

Save the choice with the app's storage (DataStore or `SharedPreferences`) and read it before the first frame, so no one sees the default flash before their own variant appears. Offer the choice as [the variants guide](../../knowledge/variants.md) says: a neutral label for each variant, easy to change.

- **Variants change colours only on Compose.** The theme code gives each variant its own colours; fonts, corners, spacing and motion stay the default's. When a variant changes any of those, `motif tokens` says so in its output. Tell the developer once, and keep Compose variants to colours.
- `MotifTheme.debugVariantOverride` and `MotifFonts.debugFontOverride` are set by `motif shot` to draw each variant and the downloaded fonts. Leave them `null` in the app.
- `motif shot` draws every variant through `MotifTheme`, also for an app that passes its own `variant`. An app that switches its own palettes (not through `MotifTheme`) is shot through `design/states/Setup.kt`, which is told the variant ([checks](checks.md#the-setup-file)).
