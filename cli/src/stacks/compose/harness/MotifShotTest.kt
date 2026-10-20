// Motif's screenshot harness for Compose apps (decision 0008). Motif writes this file, unchanged from run to run, to
// <module>/.motif/shot/src/dev/motif/shot/MotifShotTest.kt with init.gradle next to the src folder, runs
// `gradlew :<module>:testDebugUnitTest --tests dev.motif.shot.MotifShotTest -I <module>/.motif/shot/init.gradle` from the
// project's root, and deletes both when the run ends.
//
// The run's options come from the JSON file named by the system property motif.shot.config (set by init.gradle):
//   { "outDir": "<abs>", "resultPath": "<abs>",
//     "fonts": [{ "family": "Onest", "files": [{ "path": "<abs>.ttf", "weight": 400, "italic": false }] }],
//     "variantClass": "<package>.MotifTheme", "variantEnum": "<package>.MotifVariant", "fontsClass": "<package>.MotifFonts",
//     "shots": [{ "file": "home.mobile.dark.png", "target": "/", "route": "/", "preview": null,
//                 "width": 390, "height": 844, "density": "xhdpi", "dark": true, "locale": "en", "rtl": false,
//                 "variant": "Partner", "reduceMotion": true }] }
// Each shot sets the device (Robolectric qualifiers), Remove animations and the variant, then either starts the app's
// launcher activity (for /, and for any other route by telling the app's own NavController to open it) or draws a
// preview ("<package>.<File>Kt.<function>") in a blank activity, and copies the window to a PNG. The run keeps going
// when a shot fails. It writes resultPath in the shape of Flutter's harness:
//   { "screens": [{ "route", "shots": [file], "errors": [text] }], "shots": [{ "file", "error"? }], "issues": [],
//     "notes": [text], "timings": [{ "file", "ms" }] }
package dev.motif.shot

import android.app.Activity
import android.app.Application
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
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.util.Collections
import java.util.WeakHashMap

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class MotifShotTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private class Screen(val route: String) {
        val shots = mutableListOf<String>()
        val errors = linkedSetOf<String>()

        fun toJson() = JSONObject().put("route", route).put("shots", JSONArray(shots)).put("errors", JSONArray(errors.toList()))
    }

    @Test
    fun shots() {
        val config = JSONObject(File(System.getProperty("motif.shot.config")!!).readText())
        val outDir = File(config.getString("outDir"))
        val screens = linkedMapOf<String, Screen>()
        val shots = JSONArray()
        val notes = linkedSetOf<String>()
        val timings = JSONArray()
        val fonts = loadFonts(config.optJSONArray("fonts"))
        setFontOverride(config.optString("fontsClass", ""), fonts, notes)

        val list = config.getJSONArray("shots")
        for (i in 0 until list.length()) {
            val shot = list.getJSONObject(i)
            val file = shot.getString("file")
            val target = shot.optString("target", "").ifEmpty { shot.optString("route", "").ifEmpty { shot.optString("preview", file) } }
            val screen = screens.getOrPut(target) { Screen(target) }
            val started = System.nanoTime()
            var error: String? = null
            try {
                capture(config, shot, File(outDir, file))
                screen.shots.add(file)
            } catch (t: Throwable) {
                error = "${t.javaClass.simpleName}: ${t.message}"
                // The stack goes to Gradle's test report (build/test-results), for whoever debugs the harness.
                t.printStackTrace()
                screen.errors.add(error)
            }
            timings.put(JSONObject().put("file", file).put("ms", (System.nanoTime() - started) / 1_000_000))
            shots.put(JSONObject().put("file", file).apply { if (error != null) put("error", error) })
        }

        val result = JSONObject()
            .put("screens", JSONArray(screens.values.map { it.toJson() }))
            .put("shots", shots)
            .put("issues", JSONArray())
            .put("notes", JSONArray(notes.toList()))
            .put("timings", timings)
        File(config.getString("resultPath")).writeText(result.toString())
    }

    /** Device settings as Robolectric qualifiers, in Android's own order: locale, sizes, orientation, night, density. */
    private fun qualifiers(shot: JSONObject): String {
        val width = shot.getInt("width")
        val height = shot.getInt("height")
        val locale = shot.optString("locale", "en").replace("_", "-r")
        val orientation = if (width > height) "land" else "port"
        val night = if (shot.optBoolean("dark")) "night" else "notnight"
        val density = shot.optString("density", "xhdpi")
        return "$locale-w${width}dp-h${height}dp-$orientation-$night-$density"
    }

    private fun capture(config: JSONObject, shot: JSONObject, png: File) {
        RuntimeEnvironment.setQualifiers(qualifiers(shot))
        val app = ApplicationProvider.getApplicationContext<Application>()
        val scale = if (shot.optBoolean("reduceMotion")) 0f else 1f
        Settings.Global.putFloat(app.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
        setVariant(config, shot.optString("variant", ""))

        val preview = shot.optString("preview", "")
        if (preview.isNotEmpty()) {
            val controller = Robolectric.buildActivity(ComponentActivity::class.java).setup()
            try {
                val dot = preview.lastIndexOf('.')
                val owner = Class.forName(preview.substring(0, dot))
                val method = preview.substring(dot + 1)
                controller.get().setContent { Invoke(owner, method) }
                draw(controller.get(), png)
            } finally {
                controller.pause().stop().destroy()
            }
        } else {
            val route = shot.optString("route", "/")
            val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)
                ?: error("The app has no launcher activity.")
            // Compose records a composition's slot table in a set tagged on its view, as Layout Inspector does; the
            // tag must be there before the first composition, which runs when the view is attached after onResume.
            val tables = Collections.newSetFromMap(WeakHashMap<Any, Boolean>())
            val callbacks = SlotTables(tables)
            app.registerActivityLifecycleCallbacks(callbacks)
            val scenario = try {
                ActivityScenario.launch<Activity>(launch)
            } finally {
                app.unregisterActivityLifecycleCallbacks(callbacks)
            }
            try {
                lateinit var activity: Activity
                scenario.onActivity { activity = it }
                if (route != "/") {
                    shadowOf(Looper.getMainLooper()).idle()
                    compose.waitForIdle()
                    navigate(tables, route.removePrefix("/"))
                }
                draw(activity, png)
            } finally {
                scenario.close()
            }
        }
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

    /** The app's NavController, found among the values its compositions remember, told to open the route. */
    private fun navigate(tables: Set<Any>, route: String) {
        val navClass = try {
            Class.forName("androidx.navigation.NavController")
        } catch (e: ClassNotFoundException) {
            error("The app doesn't use Navigation Compose, so /$route can't be opened.")
        }
        val found = linkedSetOf<Any>()
        fun visit(groups: Iterable<CompositionGroup>) {
            for (group in groups) {
                for (value in group.data) if (value != null && navClass.isInstance(value)) found.add(value)
                visit(group.compositionGroups)
            }
        }
        for (table in tables) if (table is CompositionData) visit(table.compositionGroups)
        val controller = found.firstOrNull() ?: error("No NavController found in the app's composition.")
        val navigate = navClass.methods.first {
            it.name == "navigate" && it.parameterTypes.size == 3 && it.parameterTypes[0] == String::class.java
        }
        navigate.invoke(controller, route, null, null)
    }

    /** The activity's whole window as Robolectric's PixelCopy draws it (with hardware rendering: shadows included). */
    private fun draw(activity: Activity, png: File) {
        val looper = shadowOf(Looper.getMainLooper())
        looper.idle()
        compose.waitForIdle()
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
    private fun setVariant(config: JSONObject, variant: String) {
        val themeClass = config.optString("variantClass", "")
        val enumClass = config.optString("variantEnum", "")
        if (themeClass.isEmpty() || enumClass.isEmpty()) return
        val theme = Class.forName(themeClass)
        val instance = theme.getField("INSTANCE").get(null)
        val type = Class.forName(enumClass)
        val value = if (variant.isEmpty()) null else type.enumConstants!!.first { (it as Enum<*>).name == variant }
        theme.getMethod("setDebugVariantOverride", type).invoke(instance, value)
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
    private fun setFontOverride(fontsClass: String, families: Map<String, FontFamily>, notes: MutableSet<String>) {
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
