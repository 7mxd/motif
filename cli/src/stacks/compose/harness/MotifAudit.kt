// Motif's audit of a Compose screen as it was drawn (motif shot --audit, plan 2F Task 10, decision 0008): Google's
// Accessibility Test Framework (ATF) on the accessibility tree Compose gives Android, read in the app's own process, with
// the screenshot's pixels for contrast; and Compose's semantics tree, for what ATF can't say about a Compose screen. Motif
// writes this file next to MotifShotTest.kt, the same in every run, and deletes it when the run ends.
//
// Each problem is a JSON object like audit.json's RawIssue: { rule, selector, label, kind, ratio?, expected?, fg?, bg?,
// width?, height? }. The selector is the node's role (Text for plain text, TextField for a field, Clickable for something
// tappable with no role), its test tag after #, and its text or name: Button("Sign in"), Button#close, Text("Prices
// include tax").
package dev.motif.shot

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.ui.node.RootForTest
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getAllSemanticsNodes
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.text.TextLayoutResult
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityCheckResult.AccessibilityCheckResultType
import com.google.android.apps.common.testing.accessibility.framework.AccessibilityHierarchyCheckResult
import com.google.android.apps.common.testing.accessibility.framework.Parameters
import com.google.android.apps.common.testing.accessibility.framework.checks.SpeakableTextPresentCheck
import com.google.android.apps.common.testing.accessibility.framework.checks.TextContrastCheck
import com.google.android.apps.common.testing.accessibility.framework.checks.TouchTargetSizeCheck
import com.google.android.apps.common.testing.accessibility.framework.uielement.AccessibilityHierarchyAndroid
import com.google.android.apps.common.testing.accessibility.framework.uielement.ViewHierarchyElement
import com.google.android.apps.common.testing.accessibility.framework.utils.contrast.BitmapImage
import com.google.common.collect.HashBiMap
import org.json.JSONObject
import kotlin.math.floor
import kotlin.math.roundToInt

/** The audit's checks on one screenshot: contrast, names and targets, as asked (checks), on the screen as it is now. */
internal class MotifAudit(private val activity: Activity, private val pixels: Bitmap) {
    companion object {
        /** The smallest tap target, in dp, on phones and tablets (as on the other stacks). */
        const val MIN_TARGET = 44

        /** Compose's stand-in nodes for a node's role or description (its id plus these) are the node itself. */
        private const val FAKE_NODE_IDS = 1_000_000_000

        private val letterOrDigit = Regex("[\\p{L}\\p{N}]")
    }

    /** Texts the contrast check failed but left out, as ATF found something may be drawn over them: the screen's note counts them. */
    val covered = linkedSetOf<String>()

    private val density = activity.resources.displayMetrics.density
    private val fontScale = activity.resources.configuration.fontScale

    /** The semantics tree, unmerged (every text on its own) and merged (as a screen reader reads it), by node id. */
    private val unmerged: Map<Int, SemanticsNode> by lazy { nodes(useUnmergedTree = true) }
    private val merged: Map<Int, SemanticsNode> by lazy { nodes(useUnmergedTree = false) }

    /**
     * The window's Compose roots' nodes, read from each root as it is: the test rule's own way (onAllNodes) waits for the
     * screen to be idle first, which a screen that keeps moving never is.
     */
    private fun nodes(useUnmergedTree: Boolean): Map<Int, SemanticsNode> {
        val out = linkedMapOf<Int, SemanticsNode>()
        fun visit(view: View) {
            if (view is RootForTest) {
                for (node in view.semanticsOwner.getAllSemanticsNodes(mergingEnabled = !useUnmergedTree)) out[node.id] = node
            }
            if (view is ViewGroup) for (i in 0 until view.childCount) visit(view.getChildAt(i))
        }
        visit(activity.window.decorView)
        return out
    }

    /**
     * ATF's view of the screen: the window's tree of AccessibilityNodeInfo, read in this process
     * (setQueryFromAppProcessEnabled, Android 14's way for an app to read its own tree) so Compose's virtual nodes are in
     * it. Built from the root View instead, ATF sees only the AndroidComposeView, with nothing inside.
     */
    private val origins = HashBiMap.create<Long, AccessibilityNodeInfo>()
    private val hierarchy: AccessibilityHierarchyAndroid by lazy {
        val root = activity.window.decorView
        val info = root.createAccessibilityNodeInfo()
        info.setQueryFromAppProcessEnabled(root, true)
        AccessibilityHierarchyAndroid.newBuilder(info, activity).setNodeInfoOriginMap(origins).build()
    }

    private val sourceNodeId by lazy {
        AccessibilityNodeInfo::class.java.getDeclaredMethod("getSourceNodeId").apply { isAccessible = true }
    }

    /** The semantics node's id an ATF element stands for (its virtual view id), or null for a View. */
    private fun nodeId(element: ViewHierarchyElement?): Int? {
        val info = origins[element?.condensedUniqueId ?: return null] ?: return null
        val virtual = ((sourceNodeId.invoke(info) as Long) ushr 32).toInt()
        if (virtual < 0) return null
        return if (virtual >= FAKE_NODE_IDS) virtual % FAKE_NODE_IDS else virtual
    }

    fun run(checks: Set<String>): List<JSONObject> {
        val out = mutableListOf<JSONObject>()
        if ("contrast" in checks) out.addAll(contrast())
        if ("names" in checks) out.addAll(names())
        if ("targets" in checks) out.addAll(targets())
        return out
    }

    private fun failed(results: List<AccessibilityHierarchyCheckResult>) =
        results.filter { it.type == AccessibilityCheckResultType.ERROR || it.type == AccessibilityCheckResultType.WARNING || it.type == AccessibilityCheckResultType.INFO }

    // -----------------------------------------------------------------------------------------------------------------
    // Contrast

    /**
     * ATF's text contrast check, with the screenshot: Compose's text has no colour in its accessibility node, so ATF
     * estimates the text's and the background's colours from the pixels in its bounds. It judges every text at 3:1 then
     * (it can't know the size), so Motif asks 4.5:1 of text below WCAG's large size, from the text's own style.
     */
    private fun contrast(): List<JSONObject> {
        val params = Parameters()
        params.putScreenCapture(BitmapImage(pixels))
        val out = mutableListOf<JSONObject>()
        for (result in failed(TextContrastCheck().runCheckOnHierarchy(hierarchy, null, params))) {
            val m = result.metadata ?: continue
            if (!m.containsKey(TextContrastCheck.KEY_CONTRAST_RATIO) || !m.containsKey(TextContrastCheck.KEY_FOREGROUND_COLOR) || !m.containsKey(TextContrastCheck.KEY_BACKGROUND_COLOR)) continue
            val ratio = floor(m.getDouble(TextContrastCheck.KEY_CONTRAST_RATIO) * 100) / 100
            val id = nodeId(result.element)
            val node = id?.let { unmerged[it] }
            val text = plain(node?.let { textOf(it) } ?: result.element?.text?.toString() ?: "")
            // Text of only symbols and punctuation (a "·" between two facts) isn't judged, as axe-core doesn't judge it.
            if (!letterOrDigit.containsMatchIn(text)) continue
            val expected = if (node != null && large(node)) 3.0 else 4.5
            if (ratio >= expected) continue
            // Text something else may be drawn over: what the screenshot shows there isn't the text on its background.
            if (m.getBoolean(TextContrastCheck.KEY_IS_POTENTIALLY_OBSCURED, false)) {
                covered.add(text)
                continue
            }
            val control = node?.let { controlOf(it, text) }
            val described = if (control != null) describe(control) else textElement(node, text)
            out.add(
                described.put("rule", "color-contrast").put("ratio", ratio).put("expected", expected)
                    .put("fg", hex(m.getInt(TextContrastCheck.KEY_FOREGROUND_COLOR))).put("bg", hex(m.getInt(TextContrastCheck.KEY_BACKGROUND_COLOR))),
            )
        }
        return out
    }

    /** WCAG's large text, as on the other stacks: 24 dp, or 18.66 dp in bold (sp at the font scale). */
    private fun large(node: SemanticsNode): Boolean {
        val layouts = mutableListOf<TextLayoutResult>()
        try {
            node.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action?.invoke(layouts)
        } catch (e: RuntimeException) {
            return false
        }
        val style = layouts.firstOrNull()?.layoutInput?.style ?: return false
        val size = style.fontSize
        if (!size.isSp) return false
        val dp = size.value * fontScale
        val weight = style.fontWeight?.weight ?: 400
        return dp >= 24f || (dp >= 18.66f && weight >= 700)
    }

    /**
     * The control a text is the whole name of (a button's label, a field's text): the node it's merged into, when that one
     * can be tapped or typed in and says nothing else. Other text is text, even inside a tappable card.
     */
    private fun controlOf(node: SemanticsNode, text: String): SemanticsNode? {
        var p: SemanticsNode? = node
        while (p != null && !p.config.isMergingSemanticsOfDescendants) p = p.parent
        val control = p?.let { merged[it.id] } ?: return null
        val kind = kindOf(control)
        return if (kind != "element" && plain(nameOf(control)) == text) control else null
    }

    private fun textElement(node: SemanticsNode?, text: String): JSONObject {
        val tag = node?.config?.getOrNull(SemanticsProperties.TestTag)
        return JSONObject().put("selector", selector("Text", tag, text)).put("label", short(text)).put("kind", "element")
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Names and targets

    /**
     * Tappable nodes a screen reader has nothing to say for. ATF's speakable-text check finds some, but not a Compose
     * button: Compose gives a node with a role a stand-in child that carries the role, and ATF then takes the tappable
     * node for one a screen reader wouldn't focus. So the merged semantics tree is read too, as TalkBack reads it.
     */
    private fun names(): List<JSONObject> {
        val ids = linkedSetOf<Int>()
        for (result in failed(SpeakableTextPresentCheck().runCheckOnHierarchy(hierarchy))) {
            if (result.resultId == SpeakableTextPresentCheck.RESULT_ID_MISSING_SPEAKABLE_TEXT) nodeId(result.element)?.let { ids.add(it) }
        }
        val screen = RectF(0f, 0f, activity.window.decorView.width.toFloat(), activity.window.decorView.height.toFloat())
        for (node in merged.values) {
            val c = node.config
            if (SemanticsActions.OnClick !in c && SemanticsActions.OnLongClick !in c) continue
            if (SemanticsProperties.Disabled in c || SemanticsProperties.HideFromAccessibility in c) continue
            if (nameOf(node).isNotBlank()) continue
            val b = node.boundsInWindow
            val shown = RectF(b.left, b.top, b.right, b.bottom)
            if (!shown.intersect(screen) || shown.width() <= 0 || shown.height() <= 0) continue
            // A tap area over (nearly) the whole screen that isn't a control (tapping out of a field) needs no name.
            if (shown.width() * shown.height() >= 0.9f * screen.width() * screen.height() && c.getOrNull(SemanticsProperties.Role) == null && SemanticsProperties.EditableText !in c) continue
            ids.add(node.id)
        }
        return ids.mapNotNull { id -> merged[id]?.let { describe(it).put("rule", "name") } }
    }

    /** ATF's touch-target check (48 dp is its own): Motif reports targets under 44×44 dp, as on the other stacks. */
    private fun targets(): List<JSONObject> {
        val out = mutableListOf<JSONObject>()
        val seen = mutableSetOf<Int>()
        for (result in failed(TouchTargetSizeCheck().runCheckOnHierarchy(hierarchy))) {
            val m = result.metadata ?: continue
            val bounds = result.element?.boundsInScreen
            val width = if (m.containsKey(TouchTargetSizeCheck.KEY_WIDTH)) m.getInt(TouchTargetSizeCheck.KEY_WIDTH) else bounds?.let { (it.width / density).roundToInt() } ?: continue
            val height = if (m.containsKey(TouchTargetSizeCheck.KEY_HEIGHT)) m.getInt(TouchTargetSizeCheck.KEY_HEIGHT) else bounds?.let { (it.height / density).roundToInt() } ?: continue
            if (width >= MIN_TARGET && height >= MIN_TARGET) continue
            val id = nodeId(result.element)
            if (id != null && !seen.add(id)) continue
            val node = id?.let { merged[it] ?: unmerged[it] }
            val described = if (node != null) describe(node) else viewElement(result.element)
            // A link inside a sentence is exempt, as in WCAG 2.5.8.
            if (described.optString("kind") == "link") continue
            out.add(described.put("rule", "target-mobile").put("width", width).put("height", height))
        }
        return out
    }

    // -----------------------------------------------------------------------------------------------------------------
    // Describing a node

    /** What a screen reader says for a node: its description, else its text, else what's typed in it. */
    private fun nameOf(node: SemanticsNode): String {
        val c = node.config
        val description = c.getOrNull(SemanticsProperties.ContentDescription)?.joinToString(" ").orEmpty()
        if (description.isNotBlank()) return description
        val text = c.getOrNull(SemanticsProperties.Text)?.joinToString(" ") { it.text }.orEmpty()
        if (text.isNotBlank()) return text
        return c.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
    }

    private fun textOf(node: SemanticsNode): String? =
        node.config.getOrNull(SemanticsProperties.Text)?.joinToString(" ") { it.text }
            ?: node.config.getOrNull(SemanticsProperties.EditableText)?.text

    private fun kindOf(node: SemanticsNode): String {
        val c = node.config
        if (SemanticsProperties.EditableText in c || SemanticsProperties.IsEditable in c) return "field"
        val role = c.getOrNull(SemanticsProperties.Role)
        if (role == Role.Button || role == Role.DropdownList) return "button"
        if (role == null && SemanticsActions.OnClick in c) return "button"
        return "element"
    }

    private fun typeOf(node: SemanticsNode): String {
        val c = node.config
        if (SemanticsProperties.EditableText in c || SemanticsProperties.IsEditable in c) return "TextField"
        val role = c.getOrNull(SemanticsProperties.Role)
        if (role != null) return role.toString()
        if (SemanticsActions.OnClick in c || SemanticsActions.OnLongClick in c) return "Clickable"
        if (SemanticsProperties.Text in c) return "Text"
        return "Node"
    }

    private fun describe(node: SemanticsNode): JSONObject {
        val name = plain(nameOf(node))
        val tag = node.config.getOrNull(SemanticsProperties.TestTag)
        return JSONObject().put("selector", selector(typeOf(node), tag, name)).put("label", short(name)).put("kind", kindOf(node))
    }

    /** An element ATF found outside Compose (a View): its class and its text. */
    private fun viewElement(element: ViewHierarchyElement?): JSONObject {
        val type = element?.className?.toString()?.substringAfterLast('.') ?: "View"
        val text = plain(element?.text?.toString() ?: element?.contentDescription?.toString() ?: "")
        val kind = if (type.endsWith("Button")) "button" else if (type == "EditText") "field" else "element"
        return JSONObject().put("selector", selector(type, element?.resourceName?.substringAfterLast('/'), text)).put("label", short(text)).put("kind", kind)
    }

    private fun selector(type: String, tag: String?, text: String): String {
        val shown = if (text.isBlank()) "" else "(\"${short(text).replace("\"", "\\\"")}\")"
        return "$type${if (tag.isNullOrBlank()) "" else "#$tag"}$shown"
    }

    private fun plain(text: String) = text.replace(Regex("\\s+"), " ").trim()

    private fun short(text: String): String {
        val p = plain(text)
        return if (p.length <= 40) p else p.substring(0, 40)
    }

    private fun hex(argb: Int) = "#%06x".format(argb and 0xFFFFFF)
}
