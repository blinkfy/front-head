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
    private int guideTop, guideBottom;
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
    public void guideArea(int top, int bottom) {
        if (guideTop == top && guideBottom == bottom) return;
        guideTop = top; guideBottom = bottom; requestLayout();
    }
    public void scanning(boolean active) { guide.scanning(active); }
    public void zoom(float value) {
        zoom = value; applyZoomPivot();
    }
    public float[] zoomAnchor() {
        if (guide.getWidth() <= 0 || guide.getHeight() <= 0 || guide.frame.width() <= 0)
            return new float[]{0.5f, 0.5f};
        return new float[]{guide.frame.centerX() / guide.getWidth(), guide.frame.centerY() / guide.getHeight()};
    }
    private void applyZoomPivot() {
        float[] anchor = zoomAnchor();
        surface.setPivotX(anchor[0] * surface.getWidth()); surface.setPivotY(anchor[1] * surface.getHeight());
        surface.setScaleX(zoom); surface.setScaleY(zoom);
    }
    public void focusAt(float x, float y) {
        guide.focusAt((x - surface.getPivotX()) * zoom + surface.getPivotX(),
                (y - surface.getPivotY()) * zoom + surface.getPivotY());
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
        guide.area(Math.max(0, guideTop - y), guideBottom > 0
                ? Math.min(guide.getHeight(), guideBottom - y) : guide.getHeight());
        applyZoomPivot();
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
        private float areaTop, areaBottom;
        Guide(Context context) { super(context); density = getResources().getDisplayMetrics().density; }
        void scanning(boolean value) { active = value; if (!value) focusUntil = 0; invalidate(); }
        void focusAt(float x, float y) {
            focusX = x; focusY = y; focusUntil = SystemClock.elapsedRealtime() + 650;
            invalidate(); postInvalidateDelayed(650);
        }
        void area(float top, float bottom) {
            if (areaTop == top && areaBottom == bottom) return;
            areaTop = top; areaBottom = bottom; updateFrame(); invalidate();
        }
        @Override protected void onSizeChanged(int w, int h, int oldW, int oldH) { updateFrame(); }
        private void updateFrame() {
            float top = Math.max(0, areaTop), bottom = areaBottom > 0 ? Math.min(getHeight(), areaBottom) : getHeight();
            float edge = Math.max(0, Math.min(Math.min(getWidth() * 0.76f, (bottom - top) * 0.9f), 340 * density));
            float centerY = (top + bottom) / 2;
            frame.set((getWidth() - edge) / 2, centerY - edge / 2, (getWidth() + edge) / 2, centerY + edge / 2);
            glow = new LinearGradient(frame.left, 0, Math.max(frame.left + 1, frame.right), 0,
                    new int[]{0x002AE0AD, 0xB32AE0AD, 0x002AE0AD}, null, Shader.TileMode.CLAMP);
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (frame.width() < 24 * density) return;
            paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setColor(0x66000D09);
            canvas.drawRect(0, 0, getWidth(), frame.top, paint);
            canvas.drawRect(0, frame.bottom, getWidth(), getHeight(), paint);
            canvas.drawRect(0, frame.top, frame.left, frame.bottom, paint);
            canvas.drawRect(frame.right, frame.top, getWidth(), frame.bottom, paint);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(density); paint.setColor(0x2287E8CE);
            canvas.drawRoundRect(frame, 14 * density, 14 * density, paint);
            paint.setColor(0xFF57E8B9); paint.setStrokeWidth(3.5f * density); paint.setStrokeCap(Paint.Cap.ROUND);
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
