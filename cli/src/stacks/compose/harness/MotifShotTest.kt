// Motif's screenshot harness for Compose apps (decision 0008). Motif writes this file, unchanged from run to run, to
// <module>/.motif/shot/src/dev/motif/shot/MotifShotTest.kt with init.gradle next to the src folder, runs
// `gradlew :<module>:motifShots -I <module>/.motif/shot/init.gradle` from the project's root (the default variant's
// unit tests, narrowed to this class), and deletes both when the run ends. Next to it, Motif may write MotifHooks.kt (the run's setup and
// states, found here by reflection), design/states/Setup.kt and the --state files.
//
// The run's options come from the JSON file named by the system property motif.shot.config (set by init.gradle):
//   { "outDir": "<abs>", "resultPath": "<abs>", "settleMs": 5000, "stateMs": 15000, "deepLinks": false,
//     "fonts": [{ "family": "Onest", "files": [{ "path": "<abs>.ttf", "weight": 400, "italic": false }] }],
//     "variantClass": "<package>.MotifTheme", "variantEnum": "<package>.MotifVariant", "fontsClass": "<package>.MotifFonts",
//     "shots": [{ "file": "index.mobile.dark.png", "target": "/", "route": "/", "preview": null,
//                 "width": 390, "height": 844, "density": "xhdpi", "insets": { "top": 47, "bottom": 34 },
//                 "dark": true, "locale": "en_US", "rtl": false, "variant": "Partner", "variantId": "partner",
//                 "reduceMotion": false, "state": null, "checks": ["contrast", "names", "targets", "motion"] }],
//     "defaultVariant": "default", "appFiles": ["MainActivity.kt"] }
// targets.txt, next to it, lists the screens (a shot's target), one a line: each screen is a test of its own, in an
// environment of its own, so one whose composition throws can't take the others down with it.
// Each shot sets the device (Robolectric qualifiers), Remove animations and the variant (the default's too), runs the
// setup, then either starts the app's launcher activity (for /, and for any other route by telling the app's own
// NavController to open it, or by a deep link when there is none) or draws a preview ("<package>.<File>Kt.<function>")
// in a blank activity; lets it settle (at most settleMs), runs the state, and copies the window to a PNG; with checks,
// it audits what it drew (MotifAudit.kt, and the reduced-motion check here). A screen stops at its first failure, which
// is recorded, and the run goes on. When the app's Application can't start in a test,
// b_plainApplication draws the screen again with a plain one. Each screen adds itself to resultPath, which has the shape
// of Flutter's harness:
//   { "screens": [{ "route", "shots": [file], "errors": [text], "auditError"?, "covered"? }], "shots": [{ "file", "error"? }],
//     "issues": [{ rule, selector, label, kind, …, "route", "file", "size", "scheme", "variant"?, "state"?, "rtl"? }],
//     "notes": [text], "timings": [{ "file", "ms" }], "plainApplication": false, "variant"?: { "name", "of": [name] } }
package dev.motif.shot

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.PixelCopy
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.currentComposer
import androidx.compose.runtime.reflect.getDeclaredComposableMethod
import androidx.compose.runtime.tooling.CompositionData
import androidx.compose.runtime.tooling.CompositionGroup
import androidx.compose.ui.layout.LayoutInfo
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.FixMethodOrder
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.Collections
import java.util.Locale
import java.util.WeakHashMap
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class MotifShotTest(private val index: Int) {
    companion object {
        /**
         * One test per screen (targets.txt, next to the options, lists them), each in an environment of its own: a
         * composition that throws takes the test rule's Recomposer down with it, so it mustn't take the other screens.
         */
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}")
        fun screens(): List<Array<Any>> = targets().indices.map { arrayOf<Any>(it) }

        private fun targets(): List<String> =
            File(System.getProperty("motif.shot.config")!!).resolveSibling("targets.txt").readLines().filter { it.isNotEmpty() }

        /**
         * The view tag Layout Inspector reads a composition's slot table from (Compose records it there when the tag is
         * set), or null when this Compose has none: screens are still drawn, routes open by deep link, and what moves
         * isn't named.
         */
        private val slotTableTag: Int? by lazy {
            runCatching { Class.forName("androidx.compose.ui.R\$id").getField("inspection_slot_table_set").getInt(null) }.getOrNull()
        }

        /** The audit's checks as findings and notes name them. */
        private val CHECK_NAMES = mapOf("contrast" to "contrast", "names" to "names", "targets" to "tap-target", "motion" to "reduced-motion")
    }

    @get:Rule
    val compose = createEmptyComposeRule()

    /** A shot that couldn't be taken, in words for the developer. */
    private class ShotError(message: String, cause: Throwable? = null) : Exception(message, cause)

    /** A shot that couldn't be taken, though the screen's other shots can be (a variant the theme doesn't have). */
    private class ShotSkipped(message: String) : Exception(message)

    private val config by lazy { JSONObject(File(System.getProperty("motif.shot.config")!!).readText()) }
    private val target by lazy { targets()[index] }
    private val resultFile by lazy { File(config.getString("resultPath")) }
    private val notes = linkedSetOf<String>()
    /** The notes of the shot being taken, kept only if it's taken. */
    private val shotNotes = linkedSetOf<String>()
    /** The problems the audit found on the screen's shots, and on the shot being taken (kept only if it's taken). */
    private val issues = mutableListOf<JSONObject>()
    private val shotIssues = mutableListOf<JSONObject>()
    /** Why the audit couldn't finish on this screen, the first time it couldn't. */
    private var auditError: String? = null
    /** Texts the contrast check left out on this screen, as something may be drawn over them. */
    private val covered = linkedSetOf<String>()

    /** The slot-table tag, unless the run is told to do without it (slotTables: false, for Motif's own tests). */
    private val slotTag: Int? by lazy {
        val tag = if (config.optBoolean("slotTables", true)) slotTableTag else null
        if (tag == null) {
            notes.add("Motif couldn't find Layout Inspector's slot-table tag in this version of Compose, so routes were opened by deep link and moving composables weren't named. Tell Motif's maintainers which Compose version the app uses.")
        }
        tag
    }

    /** The screen's shots, with the app's own Application. */
    @Test
    fun a_shots() = shots(plainApplication = false)

    /**
     * Robolectric starts the Application again for each screen, in the same JVM, so what it starts once for the whole
     * process stays started: Koin's global context is stopped here, when the app has Koin, so the next screen's
     * startKoin works. (WorkManager has no way to stop; an app that initialises it in onCreate must check first.)
     */
    @After
    fun stopContainers() {
        try {
            val koin = Class.forName("org.koin.core.context.GlobalContext")
            koin.getMethod("stopKoin").invoke(koin.getField("INSTANCE").get(null))
        } catch (e: ReflectiveOperationException) {
            // No Koin in this app.
        } catch (e: LinkageError) {
            // No Koin in this app.
        }
    }

    /**
     * The screen's shots with a plain Application, when the app's own couldn't start in a test (a_shots failed before
     * it wrote anything): previews still draw, and so do screens that don't need what it sets up.
     */
    @Test
    @Config(application = Application::class)
    fun b_plainApplication() {
        if (readResult().getJSONArray("screens").let { s -> (0 until s.length()).any { s.getJSONObject(it).getString("route") == target } }) return
        shots(plainApplication = true)
    }

    /** result.json as the screens before this one left it. */
    private fun readResult(): JSONObject =
        if (resultFile.exists()) {
            JSONObject(resultFile.readText())
        } else {
            JSONObject().put("screens", JSONArray()).put("shots", JSONArray()).put("issues", JSONArray())
                .put("notes", JSONArray()).put("timings", JSONArray()).put("plainApplication", false).also { fresh ->
                    // The variant the init script chose among several, when it did.
                    System.getProperty("motif.shot.variant")?.let { name ->
                        val of = JSONArray((System.getProperty("motif.shot.variants") ?: name).split(","))
                        fresh.put("variant", JSONObject().put("name", name).put("of", of))
                    }
                }
        }

    /**
     * Draws this screen's shots and adds them to result.json. A screen stops at its first failure: the same failure
     * would follow in each of its other sizes and schemes, and a composition that threw leaves nothing to draw with.
     */
    private fun shots(plainApplication: Boolean) {
        val outDir = File(config.getString("outDir"))
        val shots = JSONArray()
        val timings = JSONArray()
        val drawn = mutableListOf<String>()
        val errors = linkedSetOf<String>()
        settleWithin(config.optLong("settleMs", 5000))
        setFontOverride(config.optString("fontsClass", ""), loadFonts(config.optJSONArray("fonts")))

        var stopped: String? = null
        val list = config.getJSONArray("shots")
        for (i in 0 until list.length()) {
            val shot = list.getJSONObject(i)
            val file = shot.getString("file")
            if (targetOf(shot) != target) continue
            if (stopped != null) {
                shots.put(JSONObject().put("file", file).put("error", stopped))
                continue
            }
            val started = System.nanoTime()
            shotNotes.clear()
            shotIssues.clear()
            try {
                val soft = capture(shot, target, File(outDir, file))
                drawn.add(file)
                if (soft != null) errors.add(soft)
                notes.addAll(shotNotes)
                issues.addAll(shotIssues)
                shots.put(JSONObject().put("file", file))
            } catch (t: ShotSkipped) {
                errors.add(t.message!!)
                shots.put(JSONObject().put("file", file).put("error", t.message!!))
            } catch (t: Throwable) {
                val error = if (t is ShotError) t.message!! else "$target couldn't be drawn: ${describe(t)}"
                // The stack goes to Gradle's test report (build/test-results), for whoever debugs the harness.
                t.printStackTrace()
                errors.add(error)
                stopped = error
                shots.put(JSONObject().put("file", file).put("error", error))
            }
            timings.put(JSONObject().put("file", file).put("ms", (System.nanoTime() - started) / 1_000_000))
        }

        val result = readResult()
        val screen = JSONObject().put("route", target).put("shots", JSONArray(drawn)).put("errors", JSONArray(errors.toList()))
        if (auditError != null) screen.put("auditError", auditError)
        if (covered.isNotEmpty()) screen.put("covered", covered.size)
        if (config.optBoolean("debug")) screen.put("texts", JSONArray(texts.toList()))
        result.getJSONArray("screens").put(screen)
        for (issue in issues) result.getJSONArray("issues").put(issue)
        for (i in 0 until shots.length()) result.getJSONArray("shots").put(shots.get(i))
        for (i in 0 until timings.length()) result.getJSONArray("timings").put(timings.get(i))
        val all = result.getJSONArray("notes").let { n -> (0 until n.length()).map { n.getString(it) } }.toMutableSet()
        for (note in notes) if (all.add(note)) result.getJSONArray("notes").put(note)
        if (plainApplication) result.put("plainApplication", true) else result.put("applicationStarted", true)
        // Whole or not at all: Motif reads it once Gradle has finished, and a run stopped mid-write mustn't leave half.
        val partial = File(resultFile.path + ".part")
        partial.writeText(result.toString())
        try {
            Files.move(partial.toPath(), resultFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } catch (e: java.io.IOException) {
            Files.move(partial.toPath(), resultFile.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    /** The texts the screen's shots showed, for Motif's own tests (config.debug). */
    private val texts = linkedSetOf<String>()

    private fun collectTexts() {
        if (!config.optBoolean("debug")) return
        try {
            val withText = SemanticsMatcher("has text") { SemanticsProperties.Text in it.config }
            for (node in compose.onAllNodes(withText, useUnmergedTree = true).fetchSemanticsNodes(atLeastOneRootRequired = false)) {
                for (text in node.config[SemanticsProperties.Text]) texts.add(text.text)
            }
        } catch (t: Throwable) {
            texts.add("(texts unreadable: ${describe(t)})")
        }
    }

    /** The screen a shot belongs to: its target, else its route or its preview. */
    private fun targetOf(shot: JSONObject): String =
        shot.optString("target", "").ifEmpty { shot.optString("route", "").ifEmpty { shot.optString("preview", shot.getString("file")) } }

    /**
     * waitForIdle gives up after this long: Espresso's master idling policy, which Compose's Robolectric idling reads
     * (Espresso is only on the test's runtime classpath, so it's reached by reflection).
     */
    private fun settleWithin(ms: Long) {
        try {
            Class.forName("androidx.test.espresso.IdlingPolicies")
                .getMethod("setMasterPolicyTimeout", Long::class.javaPrimitiveType, TimeUnit::class.java)
                .invoke(null, ms, TimeUnit.MILLISECONDS)
        } catch (e: ReflectiveOperationException) {
            // Without it, Compose waits for its own default.
        }
    }

    /** The exception that started it all, as "IllegalStateException: Firebase isn't configured". */
    private fun describe(t: Throwable): String {
        val root = generateSequence(t) { it.cause }.last()
        return if (root.message.isNullOrBlank()) root.javaClass.simpleName else "${root.javaClass.simpleName}: ${root.message!!.lines().first()}"
    }

    private fun startError(route: String, t: Throwable) =
        ShotError("$route couldn't start in a test: ${describe(t)}. Draw its screens from previews (--screen), or set it up in design/states/Setup.kt.", t)

    /** Device settings as Robolectric qualifiers, in Android's own order: locale, direction, sizes, orientation, night, density. */
    private fun qualifiers(shot: JSONObject): String {
        val width = shot.getInt("width")
        val height = shot.getInt("height")
        val locale = shot.optString("locale", "en").replace("_", "-r")
        val direction = if (shot.optBoolean("rtl")) "-ldrtl" else ""
        val orientation = if (width > height) "land" else "port"
        val night = if (shot.optBoolean("dark")) "night" else "notnight"
        val density = shot.optString("density", "xhdpi")
        return "$locale$direction-w${width}dp-h${height}dp-$orientation-$night-$density"
    }

    /**
     * Lets the screen settle: the main looper's work, then Compose until idle, for at most settleMs. False when it didn't.
     * A composition that threw never settles; its exception is what's thrown then.
     */
    private fun settle(): Boolean {
        shadowOf(Looper.getMainLooper()).idle()
        return try {
            compose.waitForIdle()
            true
        } catch (t: Throwable) {
            if (generateSequence(t) { it.cause }.none { it.javaClass.simpleName.let { n -> n == "AppNotIdleException" || n == "ComposeNotIdleException" } }) throw t
            throwUncaught()
            false
        }
    }

    /**
     * What a composition threw, which the test rule keeps until its next wait for idle ends (one that timed out never
     * gets there): its environment's exception handler, reached by reflection.
     */
    private fun throwUncaught() {
        val missing: () -> Unit = {
            notes.add(
                "Motif couldn't reach the Compose test library's own record of a composition's exception, so a screen that throws may be reported one screenshot late. Tell Motif's maintainers which Compose version the app uses.",
            )
        }
        val environment = try {
            compose.javaClass.getDeclaredField("environment").apply { isAccessible = true }.get(compose)
        } catch (e: ReflectiveOperationException) {
            return missing()
        } ?: return missing()
        // The environment is an anonymous subclass: its fields and methods are its superclass's.
        val classes = generateSequence<Class<*>>(environment.javaClass) { it.superclass }.toList()
        fun method(name: String) = classes.firstNotNullOf { c -> c.declaredMethods.firstOrNull { it.name == name && it.parameterCount == 0 } }
        fun field(name: String) = classes.firstNotNullOf { c -> c.declaredFields.firstOrNull { it.name == name } }
        for (step in listOf<() -> Unit>(
            { method("throwPendingException").apply { isAccessible = true }.invoke(environment) },
            {
                val handler = field("coroutineExceptionHandler").apply { isAccessible = true }.get(environment)
                handler?.javaClass?.getMethod("throwUncaught")?.invoke(handler)
            },
        )) {
            try {
                step()
            } catch (e: java.lang.reflect.InvocationTargetException) {
                throw e.targetException
            } catch (e: ReflectiveOperationException) {
                missing()
            } catch (e: NoSuchElementException) {
                missing()
            }
        }
    }

    /** Settles, and notes a screen that never did. */
    private fun settleOrNote(target: String) {
        if (!settle()) {
            val seconds = config.optLong("settleMs", 5000) / 1000
            shotNotes.add("$target kept changing for $seconds s (an animation that doesn't end, or work that never finishes), so it was drawn as it was then.")
        }
    }

    /** Draws one shot to png. Returns a problem that didn't stop the screenshot (a state that threw), or null. */
    private fun capture(shot: JSONObject, target: String, png: File): String? {
        RuntimeEnvironment.setQualifiers(qualifiers(shot))
        val app = ApplicationProvider.getApplicationContext<Application>()
        val scale = if (shot.optBoolean("reduceMotion")) 0f else 1f
        Settings.Global.putFloat(app.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
        setVariant(shot.optString("variant", ""))
        runSetup(shot)

        val preview = shot.optString("preview", "")
        val route = shot.optString("route", "/")
        val soft = if (preview.isNotEmpty()) drawPreview(shot, target, preview, png) else drawRoute(shot, app, target, route, png)
        // A composition that threw while the shot was taken is reported by the test rule only afterwards. The PNG shows
        // the screen before it, so it goes.
        try {
            throwUncaught()
        } catch (t: Throwable) {
            png.delete()
            throw if (preview.isNotEmpty()) ShotError("$target couldn't be drawn: ${describe(t)}.", t) else startError(route, t)
        }
        return soft
    }

    /** A @Preview function, drawn in a blank activity as Android Studio shows it (without system bars). */
    private fun drawPreview(shot: JSONObject, target: String, preview: String, png: File): String? {
        run {
            val dot = preview.lastIndexOf('.')
            val owner = try {
                Class.forName(preview.substring(0, dot))
            } catch (e: ClassNotFoundException) {
                throw ShotError("$target isn't in the compiled app (there's no ${preview.substring(0, dot)}).")
            }
            val controller = Robolectric.buildActivity(ComponentActivity::class.java).setup()
            // A ComposeView of its own, tagged before its first composition, so the reduced-motion check can read its slot table.
            val tables = Collections.newSetFromMap(WeakHashMap<Any, Boolean>())
            try {
                try {
                    val view = ComposeView(controller.get())
                    slotTag?.let { view.setTag(it, tables) }
                    view.setContent { Invoke(owner, preview.substring(dot + 1)) }
                    controller.get().setContentView(view)
                    settleOrNote(target)
                } catch (t: Throwable) {
                    if (generateSequence(t) { it.cause }.any { it is NoSuchMethodException }) throw ShotError("$target isn't in the compiled app (${describe(t)}).")
                    throw ShotError("$target couldn't be drawn: ${describe(t)}.")
                }
                val soft = runState(shot, target)
                collectTexts()
                val bitmap = snapshot(controller.get())
                write(bitmap, png)
                audit(shot, target, controller.get(), bitmap, tables)
                return soft
            } finally {
                try {
                    controller.pause().stop().destroy()
                } catch (_: Throwable) {
                }
            }
        }
    }

    /** The launcher activity, at the route: / as it starts, any other through the app's NavController or a deep link. */
    private fun drawRoute(shot: JSONObject, app: Application, target: String, route: String, png: File): String? {
        var opened = launch(app, null, route)
        try {
            if (route != "/") {
                val controller = if (config.optBoolean("deepLinks")) null else navController(opened.tables, route)
                if (controller != null) {
                    navigate(controller, route)
                } else {
                    if (route.startsWith("@")) {
                        throw ShotError("$route couldn't be opened: Motif found no NavController in the app's composition, and a type-safe route has no deep link. Draw it from a preview (--screen).")
                    }
                    // The launcher's own first screen, to tell whether the deep link landed.
                    applyInsets(opened.activity, shot)
                    settleOrNote(route)
                    val first = snapshot(opened.activity)
                    opened.close()
                    opened = launch(app, route, route)
                    applyInsets(opened.activity, shot)
                    settleOrNote(route)
                    if (snapshot(opened.activity).sameAs(first)) {
                        throw ShotError("$route couldn't be opened: Motif found no NavController in the app's composition, and a deep link to $route showed the first screen instead. Draw it from a preview (--screen).")
                    }
                }
            }
            applyInsets(opened.activity, shot)
            settleOrNote(target)
            val soft = runState(shot, target)
            collectTexts()
            val bitmap = snapshot(opened.activity)
            write(bitmap, png)
            audit(shot, target, opened.activity, bitmap, opened.tables)
            return soft
        } finally {
            opened.close()
        }
    }

    /** A started launcher activity, and the slot tables of its compositions. */
    private class Opened(val scenario: ActivityScenario<Activity>, val activity: Activity, val tables: Set<Any>) {
        fun close() {
            try {
                scenario.close()
            } catch (_: Throwable) {
                // An activity that crashed can't always be closed cleanly; the next shot starts a new one.
            }
        }
    }

    /**
     * Starts the app's launcher activity, settled, with the route's deep link when deepLink is set. Compose records a
     * composition's slot table in a set tagged on its view, as Layout Inspector does; the tag must be there before the
     * first composition, which runs when the view is attached after onResume.
     */
    private fun launch(app: Application, deepLink: String?, route: String): Opened {
        val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)
            ?: throw ShotError("$route couldn't start in a test: the app has no launcher activity.")
        if (deepLink != null) {
            val key = try {
                Class.forName("androidx.navigation.NavController").getField("KEY_DEEP_LINK_IDS").get(null) as String
            } catch (e: ReflectiveOperationException) {
                "android-support-nav:controller:deepLinkIds"
            }
            // Navigation matches a route's destination by its id, the hash of its internal deep link, below the root
            // graph (0 for a NavHost without a route of its own). Without NEW_TASK, Navigation doesn't restart the task.
            launch.putExtra(key, intArrayOf(0, "android-app://androidx.navigation/${deepLink.removePrefix("/")}".hashCode()))
            launch.flags = launch.flags and (Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK).inv()
        }
        val tables = Collections.newSetFromMap(WeakHashMap<Any, Boolean>())
        val callbacks = SlotTables(slotTag, tables)
        app.registerActivityLifecycleCallbacks(callbacks)
        val scenario = try {
            ActivityScenario.launch<Activity>(launch)
        } catch (t: Throwable) {
            throw startError(route, t)
        } finally {
            app.unregisterActivityLifecycleCallbacks(callbacks)
        }
        lateinit var activity: Activity
        try {
            scenario.onActivity { activity = it }
            settleOrNote(route)
        } catch (t: Throwable) {
            try {
                scenario.close()
            } catch (_: Throwable) {
            }
            throw if (t is ShotError) t else startError(route, t)
        }
        return Opened(scenario, activity, tables)
    }

    /** Tags each composition root the activity's onCreate set up, so its slot table is recorded in tables. */
    private class SlotTables(private val tag: Int?, private val tables: MutableSet<Any>) : Application.ActivityLifecycleCallbacks {
        override fun onActivityPostCreated(activity: Activity, savedInstanceState: Bundle?) {
            val tag = tag ?: return
            val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
            for (i in 0 until content.childCount) content.getChildAt(i).setTag(tag, tables)
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
        override fun onActivityStarted(activity: Activity) {}
        override fun onActivityResumed(activity: Activity) {}
        override fun onActivityPaused(activity: Activity) {}
        override fun onActivityStopped(activity: Activity) {}
        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
        override fun onActivityDestroyed(activity: Activity) {}
    }

    private val navClass: Class<*>? by lazy {
        try {
            Class.forName("androidx.navigation.NavController")
        } catch (e: ClassNotFoundException) {
            null
        }
    }

    /** A destination's route as written (a type-safe one's is its class's serial name, with its arguments after ?). */
    private fun routeOf(destination: Any?): String? =
        destination?.let { it.javaClass.getMethod("getRoute").invoke(it) as String? }

    /** The destinations of a NavController's graph, nested graphs' included. */
    private fun destinations(controller: Any): List<Any> {
        val graph = try {
            controller.javaClass.getMethod("getGraph").invoke(controller)
        } catch (e: ReflectiveOperationException) {
            return emptyList()
        }
        val out = mutableListOf<Any>()
        fun walk(node: Any) {
            out.add(node)
            if (node is Iterable<*>) for (child in node) if (child != null) walk(child)
        }
        walk(graph)
        return out
    }

    /**
     * True when a destination's route is the one asked for: a string route by its pattern, each {argument} standing for
     * one segment (detail/{id} is /detail/5), a leading / and its query (?tab={tab}) left out on both sides; @Name by its class's
     * simple name. With exact, a pattern with arguments matches nothing (its values can't be told from it).
     */
    private fun matches(destination: Any, route: String, exact: Boolean = false): Boolean {
        val own = routeOf(destination) ?: return false
        if (!route.startsWith("@")) {
            val pattern = own.substringBefore('?').removePrefix("/")
            if (exact && pattern.contains('{')) return false
            val regex = Regex(pattern.split(Regex("\\{[^}/]*\\}")).joinToString("[^/]+") { Regex.escape(it) })
            return regex.matches(route.removePrefix("/").substringBefore('?'))
        }
        val head = own.substringBefore('?').substringBefore('/')
        val name = route.removePrefix("@")
        return head == name || head.endsWith(".$name") || head.endsWith("$$name")
    }

    /**
     * The app's NavController that has the route, found among the values its compositions remember: with several
     * NavHosts, the first (outermost) whose graph has it, else the outermost. Null when the app has none.
     */
    private fun navController(tables: Set<Any>, route: String): Any? {
        val navClass = navClass ?: return null
        val found = linkedSetOf<Any>()
        fun visit(groups: Iterable<CompositionGroup>) {
            for (group in groups) {
                for (value in group.data) if (value != null && navClass.isInstance(value)) found.add(value)
                visit(group.compositionGroups)
            }
        }
        for (table in tables) if (table is CompositionData) visit(table.compositionGroups)
        return found.firstOrNull { c -> destinations(c).any { matches(it, route) } } ?: found.firstOrNull()
    }

    /**
     * Tells the app's NavController to open the route, unless it already shows it (the start destination is /): a
     * string route by its text, a type-safe one by an instance of its class (an object, or a class whose parameters all
     * have defaults), and checks that it got there.
     */
    private fun navigate(controller: Any, route: String) {
        val current = { controller.javaClass.getMethod("getCurrentDestination").invoke(controller) }
        if (current()?.let { matches(it, route, exact = true) } == true) return
        val destination = destinations(controller).firstOrNull { matches(it, route) }
            ?: throw ShotError("$route couldn't be opened: it isn't a destination of the app's navigation graph.")
        val methods = controller.javaClass.methods.filter { it.name == "navigate" && it.parameterTypes.size == 3 }
        try {
            if (route.startsWith("@")) {
                val head = routeOf(destination)!!.substringBefore('?').substringBefore('/')
                val instance = try {
                    val cls = Class.forName(head)
                    try {
                        cls.getField("INSTANCE").get(null)
                    } catch (e: NoSuchFieldException) {
                        cls.getDeclaredConstructor().newInstance()
                    }
                } catch (e: ReflectiveOperationException) {
                    null
                }
                if (instance != null) {
                    methods.first { it.parameterTypes[0] == Any::class.java }.invoke(controller, instance, null, null)
                } else {
                    methods.first { it.parameterTypes[0] == String::class.java }.invoke(controller, head, null, null)
                }
            } else {
                // The route as the graph spells it: with its leading / when the app's routes have one ("/home").
                val text = route.removePrefix("/").let { if (routeOf(destination)!!.startsWith("/")) "/$it" else it }
                methods.first { it.parameterTypes[0] == String::class.java }.invoke(controller, text, null, null)
            }
            settle()
        } catch (t: Throwable) {
            throw startError(route, t)
        }
        if (current()?.let { matches(it, route) } != true) {
            throw ShotError("$route couldn't be opened: the app's NavController stayed on ${routeOf(current()) ?: "its first screen"}.")
        }
    }

    /** A phone's status bar and navigation bar, given to the window as its insets (Robolectric reports none). */
    private fun applyInsets(activity: Activity, shot: JSONObject) {
        val insets = shot.optJSONObject("insets") ?: return
        val density = activity.resources.displayMetrics.density
        val top = (insets.optInt("top") * density).roundToInt()
        val bottom = (insets.optInt("bottom") * density).roundToInt()
        val compat = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, top, 0, 0))
            .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, bottom))
            .build()
        ViewCompat.dispatchApplyWindowInsets(activity.window.decorView, compat)
    }

    /** The run's MotifHooks (the setup and the states), when Motif wrote one. */
    private val hooks: Any? by lazy {
        try {
            Class.forName("dev.motif.shot.MotifHooks").getField("INSTANCE").get(null)
        } catch (e: ReflectiveOperationException) {
            null
        }
    }

    /** design/states/Setup.kt's motifSetup, told the variant (as the guide names it), the locale and the scheme. */
    private fun runSetup(shot: JSONObject) {
        val hooks = hooks ?: return
        val locale = Locale.forLanguageTag(shot.optString("locale", "en").replace("_", "-"))
        try {
            hooks.javaClass.getMethod("setup", String::class.java, Locale::class.java, Boolean::class.javaPrimitiveType)
                .invoke(hooks, shot.optString("variantId", ""), locale, shot.optBoolean("dark"))
        } catch (t: Throwable) {
            throw ShotError("design/states/Setup.kt failed: ${describe(t)}.")
        }
    }

    /** The shot's --state, run on the settled screen with its own time limit; what went wrong, or null. */
    private fun runState(shot: JSONObject, target: String): String? {
        val name = shot.optString("state", "")
        if (name.isEmpty()) return null
        val hooks = hooks ?: return "State \"$name\": Motif didn't compile it into the run."
        settleWithin(config.optLong("stateMs", 15000))
        return try {
            hooks.javaClass.methods.first { it.name == "state" }.invoke(hooks, name, compose)
            settleOrNote(target)
            null
        } catch (t: Throwable) {
            t.printStackTrace()
            "State \"$name\": ${describe(t)}"
        } finally {
            settleWithin(config.optLong("settleMs", 5000))
        }
    }

    /**
     * The audit's checks on the shot just drawn (its "checks"), as issues with where they were seen. What goes wrong in
     * the audit is the screen's auditError: its screenshots are kept.
     */
    private fun audit(shot: JSONObject, target: String, activity: Activity, bitmap: Bitmap, tables: Set<Any>) {
        val list = shot.optJSONArray("checks") ?: return
        val checks = (0 until list.length()).map { list.getString(it) }.toSet()
        if (checks.isEmpty()) return
        val found = mutableListOf<JSONObject>()
        val faults = config.optJSONObject("faults")?.let { f -> f.keys().asSequence().associateWith { f.getString(it) } } ?: emptyMap()
        val audit = MotifAudit(activity, bitmap, tables, appFiles)
        val outcome = audit.run(checks, faults)
        found.addAll(outcome.issues)
        covered.addAll(audit.covered)
        // Last, as it lets the screen run on for two seconds; on its own, so the others' findings stand whatever it does.
        if ("motion" in checks) {
            try {
                when (faults["motion"]) {
                    "unreadable" -> throw NoSuchFieldException("planted by Motif's test")
                    "error" -> throw IllegalStateException("planted by Motif's test")
                }
                moving(activity, tables)?.let { found.add(it) }
            } catch (t: Throwable) {
                t.printStackTrace()
                val missing = unreadable(t)
                if (missing != null) outcome.unreadable["motion"] = missing else outcome.failed["motion"] = describeError(t)
            }
        }
        for ((check, what) in outcome.unreadable) {
            notes.add("Motif couldn't read $what from this version of Compose, so the ${CHECK_NAMES[check] ?: check} check wasn't run on $target. Tell Motif's maintainers which Compose version the app uses.")
        }
        for ((check, why) in outcome.failed) if (auditError == null) auditError = "the ${CHECK_NAMES[check] ?: check} check: $why"
        val variant = shot.optString("variantId", "")
        for (issue in found) {
            issue.put("route", target).put("file", shot.getString("file")).put("size", shot.optString("size", ""))
                .put("scheme", if (shot.optBoolean("dark")) "dark" else "light")
            if (variant.isNotEmpty() && variant != config.optString("defaultVariant", "")) issue.put("variant", variant)
            if (shot.optString("state", "").isNotEmpty()) issue.put("state", shot.getString("state"))
            if (shot.optBoolean("rtl")) issue.put("rtl", true)
            shotIssues.add(issue)
        }
    }

    /** The app module's Kotlin files, for naming composables after the app's own. */
    private val appFiles: Set<String> by lazy {
        config.optJSONArray("appFiles")?.let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } ?: emptySet()
    }

    /** True when the screen still asks for frames (the test clock's frame clock has awaiters); null when that can't be read. */
    private fun frameAwaiters(): Boolean? =
        try {
            val environment = compose.javaClass.getDeclaredField("environment").apply { isAccessible = true }.get(compose)
            val clock = generateSequence<Class<*>>(environment.javaClass) { it.superclass }
                .firstNotNullOfOrNull { c -> c.declaredFields.firstOrNull { it.name == "frameClock" } }
                ?.apply { isAccessible = true }?.get(environment)
            clock?.javaClass?.getMethod("getHasAwaiters")?.invoke(clock) as Boolean?
        } catch (e: ReflectiveOperationException) {
            null
        }

    /** A group's box on screen (its layout nodes' bounds, together), and the named groups it is in, outermost first. */
    private class SlotBox(val key: String, val group: SlotName?, val box: RectF?, val path: List<SlotName>)

    /** Every group of the compositions' slot tables, in order, with its box. */
    private fun boxes(tables: Set<Any>): List<SlotBox> {
        val out = mutableListOf<SlotBox>()
        var n = 0
        fun visit(group: CompositionGroup, path: List<SlotName>): RectF? {
            val i = n++
            val info = group.sourceInfo
            val named = slotName(info)
            val inside = if (named != null) path + named else path
            val index = out.size
            out.add(SlotBox("", null, null, path))
            var box: RectF? = null
            val node = group.node
            if (node is LayoutInfo && node.isAttached) {
                val b = node.coordinates.boundsInWindow()
                box = RectF(b.left, b.top, b.right, b.bottom)
            }
            for (child in group.compositionGroups) {
                val b = visit(child, inside) ?: continue
                if (box == null) box = RectF(b) else box.union(b)
            }
            out[index] = SlotBox("$i ${info ?: group.key}", named, box, path)
            return box
        }
        for (table in tables) if (table is CompositionData) for (group in table.compositionGroups) visit(group, emptyList())
        return out
    }

    /**
     * What keeps moving on a screen that has settled, with Remove animations on: if the screen still asks for frames
     * after two more seconds of the test's clock, the composable whose box moves in the next frames (the deepest of the
     * app's own, from appFiles). Null when the screen is still. Compose's own infinite transitions never run in a test
     * (the test library cancels them), and stop when Remove animations is on anyway; what's found here is animation that
     * doesn't ask Compose's duration scale (a loop of animateTo, withFrameNanos).
     */
    private fun moving(activity: Activity, tables: Set<Any>): JSONObject? {
        val clock = compose.mainClock
        clock.autoAdvance = false
        try {
            clock.advanceTimeBy(2000)
            if (frameAwaiters() == false) return null
            val before = boxes(tables)
            val first = snapshot(activity)
            var changed = emptyList<SlotBox>()
            var drawn = false
            for (frame in 0 until 6) {
                clock.advanceTimeByFrame()
                val after = boxes(tables).associateBy { it.key }
                changed = before.filter { b -> after[b.key]?.box != b.box }
                if (changed.isNotEmpty()) break
                if (!snapshot(activity).sameAs(first)) drawn = true
            }
            if (changed.isEmpty() && !drawn) return null
            val own = { n: SlotName -> n.file != null && n.file in appFiles }
            val subject = changed.lastOrNull { it.group != null && own(it.group) } ?: changed.lastOrNull { it.group != null }
            val issue = JSONObject().put("rule", "motion").put("kind", "element")
            if (subject == null) return issue.put("selector", "").put("label", "")
            val path = subject.path.filter(own).takeLast(2).map { it.name } + subject.group!!.name
            return issue.put("selector", path.joinToString(" > ")).put("label", subject.group.name)
        } finally {
            clock.autoAdvance = true
        }
    }

    /** The activity's whole window as Robolectric's PixelCopy draws it (with hardware rendering: shadows included). */
    private fun snapshot(activity: Activity): Bitmap {
        val looper = shadowOf(Looper.getMainLooper())
        looper.idle()
        val window = activity.window
        val view = window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        var status: Int? = null
        PixelCopy.request(window, bitmap, { status = it }, Handler(Looper.getMainLooper()))
        for (i in 0 until 100) {
            if (status != null) break
            looper.idle()
        }
        check(status == PixelCopy.SUCCESS) { "PixelCopy failed ($status)." }
        return bitmap
    }

    private fun write(bitmap: Bitmap, png: File) {
        png.parentFile?.mkdirs()
        png.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** A @Composable function found by reflection: compiled, it takes the Composer and a "changed" mask as well. */
    @Composable
    private fun Invoke(owner: Class<*>, name: String) {
        val method = owner.getDeclaredComposableMethod(name)
        method.asMethod().isAccessible = true
        method.invoke(currentComposer, null)
    }

    /** MotifTheme.debugVariantOverride on the generated theme, when the app has one: its object's setter. */
    private fun setVariant(variant: String) {
        val themeClass = config.optString("variantClass", "")
        val enumClass = config.optString("variantEnum", "")
        if (themeClass.isEmpty() || enumClass.isEmpty()) return
        try {
            val theme = Class.forName(themeClass)
            val instance = theme.getField("INSTANCE").get(null)
            val type = Class.forName(enumClass)
            val value = if (variant.isEmpty()) {
                null
            } else {
                type.enumConstants!!.firstOrNull { (it as Enum<*>).name == variant }
                    ?: throw ShotSkipped("The theme code has no $variant variant (MotifVariant), so its screenshots weren't taken. Run motif tokens again, then motif shot.")
            }
            theme.getMethod("setDebugVariantOverride", type).invoke(instance, value)
        } catch (e: ReflectiveOperationException) {
            notes.add("Couldn't set $themeClass.debugVariantOverride (${e.javaClass.simpleName}), so the variants may all look the same. Run motif tokens again.")
        }
    }

    /** The fonts Motif gathered (a Google family from its cache), as Compose families by name. */
    private fun loadFonts(list: JSONArray?): Map<String, FontFamily> {
        val families = linkedMapOf<String, FontFamily>()
        if (list == null) return families
        for (i in 0 until list.length()) {
            val entry = list.getJSONObject(i)
            val files = entry.getJSONArray("files")
            val faces = (0 until files.length()).map { j ->
                val face = files.getJSONObject(j)
                Font(
                    File(face.getString("path")),
                    FontWeight(face.optInt("weight", 400)),
                    if (face.optBoolean("italic")) FontStyle.Italic else FontStyle.Normal,
                )
            }
            if (faces.isNotEmpty()) families[entry.getString("family").lowercase()] = FontFamily(faces)
        }
        return families
    }

    /** MotifFonts.debugFontOverride: the generated families ask it first, by the guide's family name. */
    private fun setFontOverride(fontsClass: String, families: Map<String, FontFamily>) {
        if (fontsClass.isEmpty()) return
        try {
            val owner = Class.forName(fontsClass)
            val instance = owner.getField("INSTANCE").get(null)
            val override: (String) -> FontFamily? = { family -> families[family.lowercase()] }
            owner.getMethod("setDebugFontOverride", Function1::class.java).invoke(instance, override)
        } catch (e: ReflectiveOperationException) {
            notes.add("Couldn't set $fontsClass.debugFontOverride (${e.javaClass.simpleName}), so Google fonts are drawn in a fallback font.")
        }
    }
}
