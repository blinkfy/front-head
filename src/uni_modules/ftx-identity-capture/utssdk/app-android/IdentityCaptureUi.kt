package ftx.identity

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

// Kept independent of the camera so the real layout can also be rendered with a test preview.
internal class IdentityCaptureUi(context: Context, preview: View, actions: List<String>, onBack: () -> Unit, onLight: () -> Unit) : LinearLayout(context) {
    private val green = Color.rgb(0, 153, 118)
    private val ink = Color.rgb(27, 48, 51)
    private val muted = Color.rgb(112, 132, 135)
    private val heading: TextView
    private val detail: TextView
    private val position: TextView
    private val light: TextView
    private val frame: CaptureCameraFrame
    private val steps: CaptureSteps
    val guideWidth = .78f
    val guideHeight = .82f
    private fun dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()
    private fun label(value: String, size: Float, color: Int = ink, bold: Boolean = false) = TextView(context).apply {
        text = value; textSize = size; setTextColor(color); gravity = Gravity.CENTER
        includeFontPadding = false
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }
    private fun rounded(fill: Int, stroke: Int = Color.TRANSPARENT) = GradientDrawable().apply {
        setColor(fill); cornerRadius = dp(28).toFloat(); setStroke(dp(1), stroke)
    }
    init {
        orientation = VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(22), dp(8), dp(22), dp(18)); setBackgroundColor(Color.WHITE)
        val header = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        header.addView(label("‹", 36f, green).apply {
            contentDescription = "返回"; background = rounded(Color.rgb(235, 249, 242))
            setOnClickListener { onBack() }
        }, LayoutParams(dp(44), dp(44)))
        header.addView(label("实名认证", 18f, bold = true), LayoutParams(0, dp(48), 1f))
        header.addView(label("核验", 12f, green).apply {
            background = rounded(Color.rgb(228, 247, 239))
        }, LayoutParams(dp(44), dp(28)))
        addView(header, LayoutParams(-1, dp(52)))
        addView(label("身份核验  /  动作认证", 12f, muted), LayoutParams(-1, dp(32)))
        heading = label("正在准备认证…", 25f, bold = true).apply { maxLines = 2; minHeight = dp(60) }
        detail = label("请本人独自入镜", 14f, muted).apply { maxLines = 2; minHeight = dp(44); setLineSpacing(dp(3).toFloat(), 1f) }
        addView(heading, LayoutParams(-1, -2)); addView(detail, LayoutParams(-1, -2))
        // The visible target sits inside the accepted bounds. Matching the outline
        // must leave headroom for landmarks, hair and small positioning differences.
        frame = CaptureCameraFrame(context, preview, guideWidth * .84f, guideHeight * .84f)
        addView(frame, LayoutParams(-1, 0, 1f).apply { topMargin = dp(8); bottomMargin = dp(8) })
        position = label("将面部对准内侧轮廓", 12f, green)
        addView(position, LayoutParams(-1, dp(30)))
        steps = CaptureSteps(context, actions.map { if (it == "mouth") "张嘴" else "眨眼" } + "确认")
        addView(steps, LayoutParams(-1, dp(64)).apply { topMargin = dp(8); bottomMargin = dp(14) })
        light = label("补光已开启 · 点击关闭", 13f, green).apply {
            background = rounded(Color.rgb(235, 249, 242), Color.rgb(205, 234, 222))
            isClickable = true; setOnClickListener { onLight() }
        }
        addView(light, LayoutParams(dp(208), dp(44)))
        addView(label("保持手机平稳，完成动作后继续认证", 12f, muted).apply { maxLines = 2 }, LayoutParams(-1, dp(38)))
    }
    fun update(input: JSONObject) {
        if (input.has("fill")) setBackgroundColor(Color.parseColor(input.getString("fill")))
        if (input.has("title")) heading.text = input.getString("title")
        if (input.has("detail")) detail.text = input.getString("detail")
        if (input.has("ready")) {
            val ready = input.getBoolean("ready")
            frame.aligned = ready
            position.text = if (ready) "位置合适，请跟随上方提示" else "将面部对准内侧轮廓"
            steps.aligned = ready
        }
        if (input.has("progress")) steps.completed = input.getInt("progress").coerceIn(0, 2)
        if (input.has("light")) {
            val on = input.getBoolean("light")
            light.text = if (on) "补光已开启 · 点击关闭" else "补光已关闭 · 点击开启"
            light.contentDescription = light.text
        }
    }
}

private class CaptureCameraFrame(context: Context, private val preview: View, private val guideWidth: Float, private val guideHeight: Float) : ViewGroup(context) {
    private val oval = Path()
    private val shade = Path()
    private val guide = RectF()
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val density = resources.displayMetrics.density
    var aligned = false
        set(value) { if (field != value) { field = value; invalidate() } }
    init { addView(preview) }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = MeasureSpec.getSize(heightMeasureSpec)
        val cameraWidth = minOf(width - (8 * density).toInt(), (height * .78f).toInt(), (344 * density).toInt()).coerceAtLeast(0)
        val cameraHeight = minOf(height, (cameraWidth / .78f).toInt()).coerceAtLeast(0)
        preview.measure(MeasureSpec.makeMeasureSpec(cameraWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(cameraHeight, MeasureSpec.EXACTLY))
        setMeasuredDimension(width, height)
    }
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val x = (width - preview.measuredWidth) / 2
        val y = (height - preview.measuredHeight) / 2
        preview.layout(x, y, x + preview.measuredWidth, y + preview.measuredHeight)
        val bounds = RectF(x.toFloat(), y.toFloat(), preview.right.toFloat(), preview.bottom.toFloat())
        oval.reset(); oval.addOval(bounds, Path.Direction.CW)
        guide.set(bounds); guide.inset(bounds.width() * (1 - guideWidth) / 2, bounds.height() * (1 - guideHeight) / 2)
        shade.reset(); shade.fillType = Path.FillType.EVEN_ODD
        shade.addOval(bounds, Path.Direction.CW); shade.addOval(guide, Path.Direction.CW)
    }
    override fun dispatchDraw(canvas: Canvas) {
        // Canvas clipping works for the compatible TextureView, unlike non-circular Outline clipping.
        val saved = canvas.save(); canvas.clipPath(oval); super.dispatchDraw(canvas)
        paint.style = Paint.Style.FILL; paint.color = Color.argb(158, 241, 250, 246)
        canvas.drawPath(shade, paint); canvas.restoreToCount(saved)
        paint.style = Paint.Style.STROKE; paint.strokeWidth = density * 1.5f
        paint.color = if (aligned) Color.rgb(0, 164, 122) else Color.rgb(112, 174, 153)
        canvas.drawOval(guide, paint)
        if (aligned) {
            paint.strokeWidth = density * 3; paint.strokeCap = Paint.Cap.ROUND
            canvas.drawArc(guide, -115f, 50f, false, paint); canvas.drawArc(guide, 65f, 50f, false, paint)
        }
    }
}

private class CaptureSteps(context: Context, private val labels: List<String>) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val density = resources.displayMetrics.density
    var aligned = false
        set(value) { if (field != value) { field = value; invalidate() } }
    var completed = 0
        set(value) { if (field != value) { field = value; invalidate() } }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val cy = 16 * density; val radius = 11 * density
        for (i in 0..2) {
            val cx = width * (i + .5f) / 3
            val done = i < completed
            val current = i == completed && aligned
            if (i < 2) {
                paint.color = Color.rgb(221, 234, 228); paint.strokeWidth = density
                canvas.drawLine(cx + radius + 8 * density, cy, cx + width / 3f - radius - 8 * density, cy, paint)
            }
            paint.color = if (done || current) Color.rgb(0, 153, 118) else Color.rgb(234, 242, 238)
            canvas.drawCircle(cx, cy, radius, paint)
            paint.textAlign = Paint.Align.CENTER; paint.typeface = Typeface.DEFAULT_BOLD
            paint.textSize = 11 * resources.displayMetrics.scaledDensity
            paint.color = if (done || current) Color.WHITE else Color.rgb(134, 154, 147)
            canvas.drawText(if (done) "✓" else "${i + 1}", cx, cy - (paint.ascent() + paint.descent()) / 2, paint)
            paint.typeface = if (current) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            paint.textSize = 12 * resources.displayMetrics.scaledDensity
            paint.color = if (done || current) Color.rgb(0, 131, 101) else Color.rgb(134, 151, 147)
            canvas.drawText(labels[i], cx, cy + 30 * density, paint)
        }
    }
}
