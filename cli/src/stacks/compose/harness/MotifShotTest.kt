// Motif's screenshot harness for Compose apps (decision 0008). Motif writes this file, unchanged from run to run, to
// <module>/.motif/shot/src/dev/motif/shot/MotifShotTest.kt with init.gradle next to the src folder, runs
// `gradlew :<module>:testDebugUnitTest --tests dev.motif.shot.MotifShotTest -I <module>/.motif/shot/init.gradle` from the
// project's root, and deletes both when the run ends. Next to it, Motif may write MotifHooks.kt (the run's setup and
// states, found here by reflection), design/states/Setup.kt and the --state files.
//
// The run's options come from the JSON file named by the system property motif.shot.config (set by init.gradle):
//   { "outDir": "<abs>", "resultPath": "<abs>", "settleMs": 5000, "stateMs": 15000, "deepLinks": false,
//     "fonts": [{ "family": "Onest", "files": [{ "path": "<abs>.ttf", "weight": 400, "italic": false }] }],
//     "variantClass": "<package>.MotifTheme", "variantEnum": "<package>.MotifVariant", "fontsClass": "<package>.MotifFonts",
//     "shots": [{ "file": "index.mobile.dark.png", "target": "/", "route": "/", "preview": null,
//                 "width": 390, "height": 844, "density": "xhdpi", "insets": { "top": 47, "bottom": 34 },
//                 "dark": true, "locale": "en_US", "rtl": false, "variant": "Partner", "variantId": "partner",
//                 "reduceMotion": false, "state": null }] }
// targets.txt, next to it, lists the screens (a shot's target), one a line: each screen is a test of its own, in an
// environment of its own, so one whose composition throws can't take the others down with it.
// Each shot sets the device (Robolectric qualifiers), Remove animations and the variant (the default's too), runs the
// setup, then either starts the app's launcher activity (for /, and for any other route by telling the app's own
// NavController to open it, or by a deep link when there is none) or draws a preview ("<package>.<File>Kt.<function>")
// in a blank activity; lets it settle (at most settleMs), runs the state, and copies the window to a PNG. A screen stops
// at its first failure, which is recorded, and the run goes on. When the app's Application can't start in a test,
// b_plainApplication draws the screen again with a plain one. Each screen adds itself to resultPath, which has the shape
// of Flutter's harness:
//   { "screens": [{ "route", "shots": [file], "errors": [text] }], "shots": [{ "file", "error"? }], "issues": [],
//     "notes": [text], "timings": [{ "file", "ms" }], "plainApplication": false }
package dev.motif.shot

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
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
    }

    @get:Rule
    val compose = createEmptyComposeRule()

    /** A shot that couldn't be taken, in words for the developer. */
    private class ShotError(message: String, cause: Throwable? = null) : Exception(message, cause)

    private val config by lazy { JSONObject(File(System.getProperty("motif.shot.config")!!).readText()) }
    private val target by lazy { targets()[index] }
    private val resultFile by lazy { File(config.getString("resultPath")) }
    private val notes = linkedSetOf<String>()
    /** The notes of the shot being taken, kept only if it's taken. */
    private val shotNotes = linkedSetOf<String>()

    /** The screen's shots, with the app's own Application. */
    @Test
    fun a_shots() = shots(plainApplication = false)

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
                .put("notes", JSONArray()).put("timings", JSONArray()).put("plainApplication", false)
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
            try {
                val soft = capture(shot, target, File(outDir, file))
                drawn.add(file)
                if (soft != null) errors.add(soft)
                notes.addAll(shotNotes)
                shots.put(JSONObject().put("file", file))
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
        result.getJSONArray("screens").put(JSONObject().put("route", target).put("shots", JSONArray(drawn)).put("errors", JSONArray(errors.toList())))
        for (i in 0 until shots.length()) result.getJSONArray("shots").put(shots.get(i))
        for (i in 0 until timings.length()) result.getJSONArray("timings").put(timings.get(i))
        val all = result.getJSONArray("notes").let { n -> (0 until n.length()).map { n.getString(it) } }.toMutableSet()
        for (note in notes) if (all.add(note)) result.getJSONArray("notes").put(note)
        if (plainApplication) result.put("plainApplication", true)
        resultFile.writeText(result.toString())
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
        val environment = try {
            compose.javaClass.getDeclaredField("environment").apply { isAccessible = true }.get(compose)
        } catch (e: ReflectiveOperationException) {
            return
        } ?: return
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
                // Not in this version of Compose's test library.
            } catch (e: NoSuchElementException) {
                // Not in this version of Compose's test library.
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
            try {
                try {
                    controller.get().setContent { Invoke(owner, preview.substring(dot + 1)) }
                    settleOrNote(target)
                } catch (t: Throwable) {
                    if (generateSequence(t) { it.cause }.any { it is NoSuchMethodException }) throw ShotError("$target isn't in the compiled app (${describe(t)}).")
                    throw ShotError("$target couldn't be drawn: ${describe(t)}.")
                }
                val soft = runState(shot, target)
                write(snapshot(controller.get()), png)
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
            write(snapshot(opened.activity), png)
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
        val callbacks = SlotTables(tables)
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
    private class SlotTables(private val tables: MutableSet<Any>) : Application.ActivityLifecycleCallbacks {
        private val tag = Class.forName("androidx.compose.ui.R\$id").getField("inspection_slot_table_set").getInt(null)

        override fun onActivityPostCreated(activity: Activity, savedInstanceState: Bundle?) {
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

    /** True when a destination's route is the one asked for: a string route as written, @Name by its class's simple name. */
    private fun matches(destination: Any, route: String): Boolean {
        val own = routeOf(destination) ?: return false
        if (!route.startsWith("@")) return own == route.removePrefix("/")
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
        if (current()?.let { matches(it, route) } == true) return
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
                methods.first { it.parameterTypes[0] == String::class.java }.invoke(controller, route.removePrefix("/"), null, null)
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
            val value = if (variant.isEmpty()) null else type.enumConstants!!.first { (it as Enum<*>).name == variant }
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
