# Jetpack Compose

How Motif works with an Android app built with Jetpack Compose: what it expects, how to start one, where things live, and how to build and run it. Motif's theme code for Compose is one Kotlin file in the app module, beside your composables; Motif never edits the app's Gradle files or its manifest.

## What Motif expects

- An Android app in Kotlin, with Jetpack Compose and Material 3 (`androidx.compose.material3`). Motif's generated `MotifTheme` wraps the app's content in place of the template's own theme.
- These versions or newer:
  - **Kotlin 2.0**, with the Compose compiler Gradle plugin (`org.jetbrains.kotlin.plugin.compose`).
  - **Compose UI 1.9** and **Material 3 1.3**: a Compose BOM of `2025.08.00` or later brings both. The theme's shadows use `Modifier.dropShadow`, which Compose UI 1.9 added.
  - **Android Gradle Plugin 8.6**, with **Gradle 8.7**. Compose UI 1.9 refuses to build with an older plugin.
  - **JDK 17** to run Gradle, and `compileSdk` 35.
- One design guide for the whole project. Compose apps run on Android only; [platform rules](platform.md) says what to get right there.

## How Motif recognises it

A folder is a Compose app when its Gradle build file (`build.gradle.kts` or `build.gradle`) applies the Android application plugin (`com.android.application`, or the template's `alias(libs.plugins.android.application)`) and switches Compose on (`buildFeatures { compose = true }`, or the Compose compiler plugin). In a Gradle project with a `settings.gradle.kts`, the app is the **module** it includes (usually `app`), not the project's folder. A library module (`com.android.library`) isn't an app. `motif doctor --json` lists the apps with the stack `compose` and the module's path (`app`).

`motif doctor` also checks the toolchain, and tells the developer what it finds in two lines:

- `JDK`, ok: "JDK 17.0.12." Motif looks at `JAVA_HOME`, then the `java` on the PATH, then the JDK Android Studio brings. Without one: "No JDK found. Theme code, checks and drafts work without it; screenshots need JDK 17 or newer: install Android Studio (it brings one) or a JDK from https://adoptium.net." An older one: "JDK 11.0.2 is older than 17, which Android's build needs."
- `Android SDK`, ok: "Android SDK at C:\Users\you\AppData\Local\Android\Sdk (platforms 35, 36)." Motif looks at `ANDROID_HOME`, `ANDROID_SDK_ROOT`, the app's `local.properties` (`sdk.dir`) and the usual folder. Without one: "No Android SDK found. Screenshots need it: install Android Studio, or set ANDROID_HOME to an SDK folder."

Theme code, checks and drafts work without either; screenshots need both. `motif doctor` doesn't read the Android Gradle Plugin's version: check that `agp` in `gradle/libs.versions.toml` is 8.6 or newer. When it's older, tell the developer to raise it with Android Studio's AGP Upgrade Assistant (**Tools › AGP Upgrade Assistant**): Compose UI 1.9, and so the theme and the screenshots, won't build below 8.6.

## Starting a new project

Compose has no command-line starter. Ask the developer to create the project in Android Studio:

1. **File › New › New Project**, then **Phone and Tablet › Empty Activity**.
2. Name the app, and set the package name to their own reverse-domain name (`com.example.myapp` only for a test). Save it in a new folder named after the app. Keep the minimum SDK it suggests and **Kotlin DSL** as the build language.
3. Let Android Studio finish its first sync, which downloads Gradle and writes `local.properties`.

The new folder is the project: move the `design/` folder into it (the `motif` commands run from there), then run `motif tokens`.

If the developer prefers that you write the template's files yourself, write these, named after the app (here `MyApp`, package `com.example.myapp`):

- `settings.gradle.kts`: `pluginManagement` with `google()`, `mavenCentral()` and `gradlePluginPortal()`; `dependencyResolutionManagement` with `google()` and `mavenCentral()`; `rootProject.name = "MyApp"` and `include(":app")`.
- `build.gradle.kts`: the three plugins below with `apply false`.
- `gradle.properties`: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8`, `android.useAndroidX=true` and `android.nonTransitiveRClass=true`.
- `gradle/libs.versions.toml`:

```toml
[versions]
agp = "8.13.1"
kotlin = "2.2.20"
coreKtx = "1.16.0"
lifecycleRuntimeKtx = "2.9.2"
activityCompose = "1.10.1"
composeBom = "2025.08.00"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycleRuntimeKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
```

- `app/build.gradle.kts`: the three plugins with `alias(…)`; `android { namespace = "com.example.myapp"; compileSdk = 36 }` with `defaultConfig` (`applicationId`, `minSdk = 24`, `targetSdk = 36`, `versionCode`, `versionName`), `compileOptions` on Java 11 and `buildFeatures { compose = true }`; a top-level `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_11 } }` block after `android { }`, with `import org.jetbrains.kotlin.gradle.dsl.JvmTarget` at the top of the file; then the BOM as `implementation(platform(libs.androidx.compose.bom))`, the others but `ui-tooling` as `implementation(…)`, and `debugImplementation(libs.androidx.compose.ui.tooling)`.
- `app/src/main/AndroidManifest.xml`: the `application` with `android:supportsRtl="true"`, a label from `@string/app_name` and the theme `@style/Theme.MyApp`, and `.MainActivity`, exported, with the `MAIN` and `LAUNCHER` intent filter.
- `app/src/main/res/values/themes.xml` (`<style name="Theme.MyApp" parent="android:Theme.Material.Light.NoActionBar" />`) and `strings.xml` (`app_name`).
- `app/src/main/java/com/example/myapp/MainActivity.kt`: a `ComponentActivity` whose `onCreate` calls `enableEdgeToEdge()` and `setContent { … }` ([theme code](tokens.md#wiring-it-in) shows it with `MotifTheme`).
- `.gitignore`: `.gradle/`, `build/`, `local.properties`, `.kotlin/`, `.idea/`.

The Gradle wrapper (`gradlew`, `gradlew.bat` and `gradle/wrapper/gradle-wrapper.jar`) isn't text you can write. With Gradle installed, make it first: in the new folder, write only an empty `settings.gradle.kts`, run `gradle wrapper --gradle-version 8.14.3`, and then write the build files above (with them in place, the installed Gradle would apply the Android plugin first, and an older one fails). Otherwise ask the developer to open the folder in Android Studio and accept if it offers to create the wrapper, or to copy the wrapper from another Android project. `motif shot` runs the project's own wrapper and stops without it. Without Android Studio, set `ANDROID_HOME` or write `sdk.dir` in `local.properties` so the developer's own builds find the SDK.

## Folders

The template's code lives in `app/src/main/java/<package folders>/` (`app/src/main/kotlin/…` when only that exists):

- **Theme code:** `ui/motif/MotifTheme.kt` in the app's package, written by `motif tokens`. Never edit it by hand ([theme code](tokens.md)). The template's own `ui/theme/` goes once the app uses `MotifTheme`.
- **Reusable composables:** `ui/components/`; a feature's own screens and composables go in `ui/<feature>/` ([components](components.md)).
- **Fonts the theme brings:** `app/src/main/res/font/`, copied there by `motif tokens`.
- **Text:** `app/src/main/res/values/strings.xml`, and `values-ar/` for Arabic ([platform rules](platform.md#languages)).
- **The design guide:** `DESIGN.md` and `design/` in the project folder. Screenshot helpers live in `design/states/` ([checks](checks.md#screens-behind-a-form-or-a-click)).

`design/motif.json` can name a different theme folder: `themeDir` is a folder inside one of the module's Kotlin source folders, written from the project's top. The theme's package comes from the folder.

```json
{ "motifContract": 1, "apps": [{ "path": "app", "stack": "compose", "themeDir": "app/src/main/java/com/example/myapp/design" }] }
```

## Monorepos

Real projects often hold several apps. Say a pnpm workspace has a web dashboard in `dashboard/`, and `mobile/android/` holds the Android project: its `settings.gradle.kts`, the `app` module and a `core-ui` library module. `motif doctor` finds `dashboard` and `mobile/android/app`; the library isn't an app. Keep **one guide for the web dashboard and the Android app**: one `DESIGN.md` and one `design/tokens.json` at the project's top. `DESIGN.md`'s platform notes say, per app, what differs on purpose (the Android app uses a bottom navigation bar, the dashboard a sidebar), as section 8 of the template asks.

`motif tokens` writes each app's theme code: the Android app's goes to `mobile/android/app/src/main/java/<package folders>/ui/motif/MotifTheme.kt`. Keep it in the app module, not in a shared library: it uses the app's resources (its fonts and the font certificates), and `motif check` and `motif extract` read the app module's Kotlin only, so composables in a library module aren't checked. Run a command for one app with `--app`:

```bash
motif shot --app mobile/android/app --audit
```

Each app can have its own screenshot setup: `mobile/android/app/design/states/Setup.kt` is used when it exists, and the project's `design/states/Setup.kt` otherwise ([checks](checks.md#the-setup-file)).

## Build, type-check and run

Run Gradle from the project's folder (where `settings.gradle.kts` is), through its wrapper: `./gradlew` in a POSIX shell and PowerShell, `gradlew` in Command Prompt.

- `./gradlew :app:compileDebugKotlin`: the compiler, as a type check. Run it after every change; it must finish without errors.
- `./gradlew :app:assembleDebug`: builds the app. `./gradlew :app:installDebug` installs it on a connected phone or a running emulator; Android Studio's **Run** does the same.
- `motif shot` needs no phone and no emulator. It runs the app's screens on the JVM with Robolectric, as one of the module's unit tests that it adds for the run only, at every size, light and dark, with the app's real fonts. The first run downloads what it needs (about 1.5 GB with Gradle's own downloads) and takes minutes; later runs work offline ([checks](checks.md#reading-the-results)).
- Each Navigation Compose destination is a screen: Motif reads `composable("…")` routes, nested `navigation(…)` graphs and type-safe `composable<Profile>` destinations (when `Profile` is an `object`, or a class whose values all have defaults). A route named by a `const val` in the app is read from the constant. The start destination of the app's only `NavHost` is `/`, the launcher's first screen. A route with values (`detail/{id}`) is left out of a default run; name it with a value: `--routes /detail/5`. Navigation Compose isn't in the template: an app with more than one screen needs `androidx.navigation:navigation-compose`. Don't edit the build files yourself: show the developer the exact lines (for `gradle/libs.versions.toml` and the module's `dependencies`) and wait for their go-ahead, or ask them to add them and sync in Android Studio.
- `@Preview` functions are screens too, by their names ([checks](checks.md#screens-that-arent-routes)). Without `--routes` or `--screen`, a run takes 12 screens: sign-in pages (`/sign-in`, `/login`, `/auth/…`, `/welcome`, `/onboarding`) and `/` first, then the other routes, then the previews, and the note names the ones left out.

## The rest of this guide

- [Theme code](tokens.md): what `motif tokens` writes, wiring it in, fonts, the Arabic companion and switching variants.
- [Components](components.md): building composables the Compose way, every state, and the starter set.
- [Motion](motion.md): the motion roles in Compose's animation API, springs and Remove animations.
- [Platform rules](platform.md): Android conventions, edge to edge, right to left, text and accessibility.
- [Checks and screenshots](checks.md): fixing what `motif check` and `motif shot --audit` report, and the screenshot helper files.
