package ftx.qbar;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;

/** The surface and its guide share one measured, un-stretched camera rectangle. */
public final class ScanPreview extends FrameLayout {
    private final SurfaceView surface;
    private final FrameLayout viewport;
    private final Guide guide;
    private int bufferWidth, bufferHeight, rotation;
    private float zoom = 1f;

    public ScanPreview(Context context) {
        super(context);
        setBackgroundColor(Color.rgb(6, 17, 16));
        surface = new SurfaceView(context);
        viewport = new FrameLayout(context);
        viewport.setClipChildren(true); viewport.setClipToPadding(true);
        guide = new Guide(context);
        guide.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        viewport.addView(surface, new FrameLayout.LayoutParams(-1, -1));
        addView(viewport, new FrameLayout.LayoutParams(-1, -1));
        addView(guide, new FrameLayout.LayoutParams(-1, -1));
    }
    public SurfaceView surface() { return surface; }
    public void cameraSize(int width, int height, int displayRotation) {
        bufferWidth = width; bufferHeight = height; rotation = displayRotation;
        requestLayout();
    }
    public void scanning(boolean active) { guide.scanning(active); }
    public void zoom(float value) {
        zoom = value; surface.setScaleX(value); surface.setScaleY(value);
    }
    public void focusAt(float x, float y) {
        guide.focusAt((x - surface.getWidth() / 2f) * zoom + surface.getWidth() / 2f,
                (y - surface.getHeight() / 2f) * zoom + surface.getHeight() / 2f);
    }
    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        super.onMeasure(widthSpec, heightSpec);
        int width = getMeasuredWidth(), height = getMeasuredHeight();
        if (width <= 0 || height <= 0) return;
        int[] fit = bufferWidth > 0 && bufferHeight > 0
                ? ScanGeometry.fitPreview(bufferWidth, bufferHeight, rotation, width, height)
                : new int[]{width, height};
        // Enforce after FrameLayout's MATCH_PARENT second measure, rather than relying
        // on a later LayoutParams update that can be replaced during a surface resize.
        int childWidth = MeasureSpec.makeMeasureSpec(fit[0], MeasureSpec.EXACTLY);
        int childHeight = MeasureSpec.makeMeasureSpec(fit[1], MeasureSpec.EXACTLY);
        viewport.measure(childWidth, childHeight); guide.measure(childWidth, childHeight);
    }
    @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        int x = (getMeasuredWidth() - viewport.getMeasuredWidth()) / 2;
        int y = (getMeasuredHeight() - viewport.getMeasuredHeight()) / 2;
        viewport.layout(x, y, x + viewport.getMeasuredWidth(), y + viewport.getMeasuredHeight());
        guide.layout(x, y, x + viewport.getMeasuredWidth(), y + viewport.getMeasuredHeight());
    }
    @Override protected void onDetachedFromWindow() {
        guide.scanning(false); super.onDetachedFromWindow();
    }

    private static final class Guide extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF frame = new RectF();
        private final float density;
        private boolean active;
        private float focusX, focusY;
        private long focusUntil;
        private LinearGradient glow;
        Guide(Context context) { super(context); density = getResources().getDisplayMetrics().density; }
        void scanning(boolean value) { active = value; if (!value) focusUntil = 0; invalidate(); }
        void focusAt(float x, float y) {
            focusX = x; focusY = y; focusUntil = SystemClock.elapsedRealtime() + 650;
            invalidate(); postInvalidateDelayed(650);
        }
        @Override protected void onSizeChanged(int w, int h, int oldW, int oldH) {
            float edge = Math.min(w, h) * 0.76f;
            frame.set((w - edge) / 2, (h - edge) / 2, (w + edge) / 2, (h + edge) / 2);
            glow = new LinearGradient(frame.left, 0, frame.right, 0,
                    new int[]{0x002AE0AD, 0xB32AE0AD, 0x002AE0AD}, null, Shader.TileMode.CLAMP);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (frame.width() < 24 * density) return;
            paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setColor(0x63000000);
            canvas.drawRect(0, 0, getWidth(), frame.top, paint);
            canvas.drawRect(0, frame.bottom, getWidth(), getHeight(), paint);
            canvas.drawRect(0, frame.top, frame.left, frame.bottom, paint);
            canvas.drawRect(frame.right, frame.top, getWidth(), frame.bottom, paint);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(density); paint.setColor(0x5587E8CE);
            canvas.drawRoundRect(frame, 14 * density, 14 * density, paint);
            paint.setColor(0xFF57E8B9); paint.setStrokeWidth(3 * density); paint.setStrokeCap(Paint.Cap.ROUND);
            float corner = Math.min(24 * density, frame.width() / 5);
            for (int i = 0; i < 4; i++) {
                float x = i % 2 == 0 ? frame.left : frame.right;
                float y = i < 2 ? frame.top : frame.bottom;
                canvas.drawLine(x, y, x + (i % 2 == 0 ? corner : -corner), y, paint);
                canvas.drawLine(x, y, x, y + (i < 2 ? corner : -corner), paint);
            }
            long now = SystemClock.elapsedRealtime();
            if (active && isShown()) {
                float y = frame.top + frame.height() * ((now % 2400) / 2400f);
                paint.setShader(glow); paint.setStrokeWidth(2 * density);
                canvas.drawLine(frame.left + corner / 2, y, frame.right - corner / 2, y, paint);
                paint.setShader(null); postInvalidateDelayed(70);
            }
            if (focusUntil > now) {
                float half = 22 * density;
                float x = Math.max(half, Math.min(getWidth() - half, focusX));
                float y = Math.max(half, Math.min(getHeight() - half, focusY));
                paint.setColor(0xFFF4D988); paint.setStrokeWidth(2 * density);
                canvas.drawRoundRect(x - half, y - half, x + half, y + half, 7 * density, 7 * density, paint);
            }
        }
    }
}
