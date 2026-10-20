# compose-agp9

The smallest Compose app on the Android Gradle Plugin 9 (9.3.1) and Gradle 9 (9.5.0), shaped like Google's JetNews:
no `org.jetbrains.kotlin.android` plugin, since AGP 9 compiles Kotlin itself (its built-in Kotlin), and only from the
source sets' `kotlin` folders. `compose-agp9.test.ts` draws its one screen through Motif's harness, so a harness that
adds its test only to the `java` folders fails here (plan 2F, Task 15). The Gradle wrapper (`gradlew`, `gradlew.bat`,
`gradle/wrapper/gradle-wrapper.jar`) is Gradle's own, Apache License 2.0.
