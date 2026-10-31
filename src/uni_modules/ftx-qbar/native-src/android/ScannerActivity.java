package ftx.qbar;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.ColorFilter;
import android.graphics.drawable.Drawable;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.hardware.Camera;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.text.method.ScrollingMovementMethod;
import android.webkit.ValueCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

@SuppressWarnings("deprecation")
public final class ScannerActivity extends Activity implements SurfaceHolder.Callback {
    private static ValueCallback<String> pending;
    private static WeakReference<ScannerActivity> current = new WeakReference<>(null);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService coarseWorker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean coarseBusy = new AtomicBoolean();
    private final AtomicBoolean frameBusy = new AtomicBoolean();
    private SurfaceView preview;
    private ScanPreview previewContainer;
    private int previewRotation, selectedCamera = -1, preferredCamera = -1, cameraEpoch, decodeFailures, focusSequence;
    private static final int BACKGROUND = 0xFF071B17, PANEL = 0xFF12352C, ACCENT = 0xFF45DBAE, MUTED = 0xFF9DBDB2;
    private Button albumButton, torchButton, zoomInButton, zoomOutButton;
    private boolean torchOn, torchSupported, permissionRequested, imageResultReady;
    private JSONObject pendingImageResult;
    private String continuousFocusMode;
    private Runnable restoreFocus;
    private float touchX, touchY;
    private long touchDownAt, hintUntil;
    private TextView hint, zoomStatus, debugText;
    private Button debugUse;
    private boolean debugEnabled;
    private String debugResult = "";
    private final ScanGeometry.AutoZoom autoZoom = new ScanGeometry.AutoZoom();
    private final ScanGeometry.ExposureControl exposureControl = new ScanGeometry.ExposureControl();
    private boolean exposureEnabled;
    private int baselineExposure;
    private long lastExposureAt;
    private float maxZoom = 1f, actualZoom = 1f;
    private Camera camera;
    private volatile ScanEngine engine;
    private volatile boolean destroyed;
    private boolean surfaceReady, paused, gallery, delivered, zoomGesture;
    private float requestedZoom = 1.5f;
    private final boolean digitalZoom = android.os.Build.VERSION.SDK_INT >= 24;
    private long lastFrame, lastCoarseFrame, lastEnhancement, lastMatch, lastZoomAt;
    private String previousResult = "";
    private int matchingFrames;

    private boolean hdDisabled, photosDisabled, photoAvailable;
    private byte[][] previewBuffers;
    private long fpsWindow, cameraOpenedAt, candidateAt, candidateSince, lastDecodedAt, lastFocusAt, lastCandidateFocus;
    private int fpsFrames, slowWindows, candidateHits;
    private float candidateZoom;
    private float[] candidatePivot;
    private ScanGeometry.Candidate latestCandidate;
    private final AtomicBoolean photoBusy = new AtomicBoolean();
    private final ScanGeometry.SnapshotGate snapshotGate = new ScanGeometry.SnapshotGate();
    private Runnable snapshotTimeout;
    private LiveFrame selectedFrame;
    private long lastSelectionSample;
    private int selectionSamples;
    private final Runnable dispatchSelection = () -> dispatchSelectedFrame();
    private static final class LiveFrame {
        final Camera source;
        final int epoch;
        final float zoom;
        final float[] pivot;
        final ScanGeometry.Frame full, region;
        final int[] regionBounds;
        final long capturedAt;
        final double quality;
        LiveFrame(Camera source, int epoch, float zoom, float[] pivot, ScanGeometry.Frame full, ScanGeometry.Frame region, int[] regionBounds, long capturedAt) {
            this.source = source; this.epoch = epoch; this.zoom = zoom; this.pivot = pivot;
            this.full = full; this.region = region; this.regionBounds = regionBounds; this.capturedAt = capturedAt;
            quality = ScanGeometry.clarity(region == null ? full : region);
        }
    }
    public static synchronized void open(Activity host, ValueCallback<String> callback) {
        openScanner(host, callback, false);
    }
    public static synchronized void openDebug(Activity host, ValueCallback<String> callback) {
        openScanner(host, callback, true);
    }
    public static synchronized boolean isScanActive() { return pending != null || current.get() != null; }
    private static void openScanner(Activity host, ValueCallback<String> callback, boolean debug) {
        if (pending != null || GeneratedCodeDecoder.isBusy()) { callback.onReceiveValue("{\"error\":\"BUSY\"}"); return; }
        pending = callback;
        try { host.startActivity(new Intent(host, ScannerActivity.class).putExtra("scanDebug", debug)); }
        catch (Exception error) { pending = null; callback.onReceiveValue("{\"error\":\"UNAVAILABLE\"}"); }
    }
    public static void cancelCurrent() {
        ScannerActivity activity = current.get();
        if (activity != null) activity.runOnUiThread(() -> activity.finishWith("{\"error\":\"CANCELLED\"}"));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        if (pending == null) { finish(); return; }
        debugEnabled = getIntent().getBooleanExtra("scanDebug", false);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(BACKGROUND);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        FrameLayout layout = new FrameLayout(this); layout.setBackgroundColor(BACKGROUND);
        previewContainer = new ScanPreview(this);
        layout.addView(previewContainer, new FrameLayout.LayoutParams(-1, -1));
        preview = previewContainer.surface(); preview.getHolder().addCallback(this);
        boolean compact = getResources().getDisplayMetrics().heightPixels
                / getResources().getDisplayMetrics().density < 720;
        int gap = compact ? 8 : 14;
        LinearLayout header = new LinearLayout(this); header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(18), dp(12), dp(18), dp(18));
        header.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xF0071B17, 0xDA071B17, 0x00071B17}));
        FrameLayout heading = new FrameLayout(this);
        TextView title = text("扫一扫", 27, Color.WHITE); title.setGravity(Gravity.CENTER);
        title.setTypeface(null, Typeface.BOLD); title.setPadding(dp(54), dp(5), dp(54), dp(5));
        heading.addView(title, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));
        Button back = button("", view -> finishWith("{\"error\":\"CANCELLED\"}"));
        back.setBackground(buttonBackground(0xCC123F32, dp(26)));
        back.setPadding(dp(12), 0, dp(12), 0); back.setCompoundDrawables(new ControlIcon("back", dp(24)), null, null, null);
        back.setContentDescription("返回");
        heading.addView(back, new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.START | Gravity.CENTER_VERTICAL));
        header.addView(heading, new LinearLayout.LayoutParams(-1,
                dp(Math.max(52, 40 * getResources().getConfiguration().fontScale))));
        TextView subtitle = text("连接设备 / 登录确认 / 扫描小程序码", 15, 0xFFD1DDD8);
        subtitle.setGravity(Gravity.CENTER); subtitle.setPadding(0, dp(8), 0, dp(4)); header.addView(subtitle);
        layout.addView(header, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        LinearLayout controls = new LinearLayout(this); controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(20), 0, dp(20), dp(8));
        controls.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0x00071B17, 0xB8071B17, 0xF2071B17}));
        hint = text("正在准备相机…", 20, Color.WHITE); hint.setGravity(Gravity.CENTER);
        hint.setTypeface(null, Typeface.BOLD); hint.setPadding(0, dp(gap), 0, dp(4)); controls.addView(hint);
        hint.setOnClickListener(view -> { if (camera == null && !gallery && engine != null) requestCameraAccess(true); });
        TextView supported = text("支持普通二维码与微信小程序码", 15, 0xFFD1DDD8);
        supported.setGravity(Gravity.CENTER); supported.setPadding(0, dp(2), 0, dp(gap)); controls.addView(supported);
        autoZoom.reset(SystemClock.elapsedRealtime());
        LinearLayout zoomRow = new LinearLayout(this); zoomRow.setGravity(Gravity.CENTER);
        zoomOutButton = button("−", view -> manualZoom(1f / 1.2f));
        zoomOutButton.setContentDescription("缩小画面"); zoomOutButton.setTextSize(29);
        zoomInButton = button("+", view -> manualZoom(1.2f));
        zoomInButton.setContentDescription("放大画面"); zoomInButton.setTextSize(29);
        zoomOutButton.setBackground(buttonBackground(0xCC124A39, dp(26)));
        zoomInButton.setBackground(buttonBackground(0xCC124A39, dp(26)));
        zoomStatus = text("自动 1.5×", 19, ACCENT); zoomStatus.setGravity(Gravity.CENTER);
        zoomStatus.setTypeface(null, Typeface.BOLD); zoomStatus.setBackground(background(0xD20B3E30, dp(26), false));
        zoomStatus.setContentDescription("点击恢复一倍画面和自动变焦");
        zoomStatus.setOnClickListener(view -> {
            autoZoom.reset(SystemClock.elapsedRealtime()); requestedZoom = 1f; applyZoom();
        });
        zoomRow.addView(zoomOutButton, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout.LayoutParams zoomParams = new LinearLayout.LayoutParams(0, dp(48), 1);
        zoomStatus.setSingleLine(true);
        if (android.os.Build.VERSION.SDK_INT >= 26) zoomStatus.setAutoSizeTextTypeUniformWithConfiguration(14, 19, 1, android.util.TypedValue.COMPLEX_UNIT_SP);
        zoomParams.setMargins(dp(10), 0, dp(10), 0); zoomRow.addView(zoomStatus, zoomParams);
        zoomRow.addView(zoomInButton, new LinearLayout.LayoutParams(dp(48), dp(48)));
        controls.addView(zoomRow, new LinearLayout.LayoutParams(-1, -2));
        TextView gestures = text("小码居中自动放大 · 双指缩放 · 轻点对焦", 13, MUTED);
        gestures.setGravity(Gravity.CENTER); gestures.setPadding(0, dp(6), 0, dp(gap)); controls.addView(gestures);
        if (debugEnabled) {
            LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
            panel.setPadding(dp(10), dp(8), dp(10), dp(8)); panel.setBackground(background(0xEB0B3028, dp(14), true));
            TextView label = text("实时解析 · 仅管理员可见", 14, ACCENT); label.setTypeface(null, Typeface.BOLD); LinearLayout debugHeading = new LinearLayout(this); debugHeading.setGravity(Gravity.CENTER_VERTICAL);
            debugHeading.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
            debugText = text("等待识别二维码…", 14, Color.WHITE); debugText.setTypeface(Typeface.MONOSPACE);
            debugText.setPadding(0, dp(4), 0, 0); debugText.setTextIsSelectable(true);
            debugText.setMaxHeight(dp(48)); debugText.setMovementMethod(new ScrollingMovementMethod()); panel.addView(debugText);
            debugUse = button("使用此结果", view -> { if (!debugResult.isEmpty()) finishWith(debugResult); });
            debugUse.setEnabled(false); debugHeading.addView(debugUse, new LinearLayout.LayoutParams(dp(96), dp(40)));
            panel.addView(debugHeading, 0);
            LinearLayout.LayoutParams debugParams = new LinearLayout.LayoutParams(-1, -2); debugParams.bottomMargin = dp(8);
            controls.addView(panel, debugParams);
        }
        LinearLayout actions = new LinearLayout(this); actions.setBaselineAligned(false);
        int actionHeight = dp(Math.max(compact ? 56 : 64, 52 * getResources().getConfiguration().fontScale));
        albumButton = button("相册选图", view -> chooseImage());
        torchButton = button("打开补光", view -> toggleTorch());
        decorateAction(albumButton, "album"); decorateAction(torchButton, "torch");
        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(0, actionHeight, 1);
        actionParams.setMargins(0, 0, dp(12), 0); actions.addView(albumButton, actionParams);
        actions.addView(torchButton, new LinearLayout.LayoutParams(0, actionHeight, 1)); controls.addView(actions);
        Button standard = button("改用系统扫码  ›", view -> finishWith("{\"error\":\"USE_STANDARD\"}"));
        standard.setTextSize(16); standard.setTextColor(0xFFCEDCD6); standard.setBackgroundColor(Color.TRANSPARENT);
        LinearLayout.LayoutParams standardParams = new LinearLayout.LayoutParams(-1, dp(48));
        standardParams.topMargin = dp(compact ? 4 : 10); controls.addView(standard, standardParams);
        ControlsPanel controlsPanel = new ControlsPanel(this);
        controlsPanel.setVerticalScrollBarEnabled(false); controlsPanel.setClipToPadding(false);
        controlsPanel.addView(controls, new ScrollView.LayoutParams(-1, -2));
        layout.addView(controlsPanel, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        // Apply system insets to controls only; the camera stays edge-to-edge and keeps its aspect ratio.
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            int safeLeft = insets.getSystemWindowInsetLeft(), safeRight = insets.getSystemWindowInsetRight();
            int safeTop = insets.getSystemWindowInsetTop(), safeBottom = insets.getSystemWindowInsetBottom();
            if (android.os.Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                safeLeft = Math.max(safeLeft, insets.getDisplayCutout().getSafeInsetLeft());
                safeRight = Math.max(safeRight, insets.getDisplayCutout().getSafeInsetRight());
                safeTop = Math.max(safeTop, insets.getDisplayCutout().getSafeInsetTop());
                safeBottom = Math.max(safeBottom, insets.getDisplayCutout().getSafeInsetBottom());
            }
            header.setPadding(dp(18) + safeLeft, dp(12) + safeTop, dp(18) + safeRight, dp(18));
            controls.setPadding(dp(20) + safeLeft, 0, dp(20) + safeRight, dp(8) + safeBottom);
            return insets.consumeSystemWindowInsets();
        });
        View.OnLayoutChangeListener guideLayout = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
                previewContainer.guideArea(header.getBottom(), controlsPanel.getTop());
        header.addOnLayoutChangeListener(guideLayout); controlsPanel.addOnLayoutChangeListener(guideLayout);
        setContentView(layout); layout.requestApplyInsets(); updateControls();
        preview.setOnClickListener(view -> focusAt(touchX, touchY));
        ScaleGestureDetector zoomDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera == null || snapshotGate.busy()) return false;
                zoomGesture = true; autoZoom.manual();
                requestedZoom = Math.max(1f, Math.min(3f, requestedZoom * detector.getScaleFactor()));
                applyZoom(); return true;
            }
        });
        preview.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                zoomGesture = false; touchX = event.getX(); touchY = event.getY(); touchDownAt = SystemClock.elapsedRealtime();
            }
            if (event.getPointerCount() > 1) {
                zoomGesture = true; autoZoom.manual(); updateZoomStatus(); view.getParent().requestDisallowInterceptTouchEvent(true);
            }
            zoomDetector.onTouchEvent(event);
            if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                if (!zoomGesture && SystemClock.elapsedRealtime() - touchDownAt < 500
                        && Math.hypot(event.getX() - touchX, event.getY() - touchY) < dp(12)) view.performClick();
                view.getParent().requestDisallowInterceptTouchEvent(false);
            } else if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) view.getParent().requestDisallowInterceptTouchEvent(false);
            return true;
        });
        worker.execute(() -> {
            try {
                engine = new ScanEngine();
                main.post(() -> {
                    if (destroyed || delivered) return;
                    updateControls();
                    if (!paused && !gallery) requestCameraAccess(false);
                });
            } catch (Throwable error) { main.post(() -> finishWith("{\"error\":\"UNAVAILABLE\"}")); }
        });
    }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) {
        TextView text = new TextView(this); text.setText(value); text.setTextSize(size); text.setTextColor(color); return text;
    }
    private GradientDrawable background(int color, int radius, boolean border) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(radius);
        if (border) drawable.setStroke(dp(1), 0xFF285D4B); return drawable;
    }
    private Button button(String label, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(label); button.setTextSize(14); button.setTextColor(Color.WHITE);
        button.setAllCaps(false); button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(0); button.setMinimumHeight(0);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackground(buttonBackground(PANEL, dp(18)));
        button.setOnClickListener(listener); return button;
    }
    private StateListDrawable buttonBackground(int color, int radius) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, background(0xEB23644E, radius, true));
        states.addState(new int[]{}, background(color, radius, true)); return states;
    }
    private void decorateAction(Button button, String icon) {
        button.setTextSize(18); button.setTypeface(null, Typeface.BOLD);
        button.setPadding(dp(12), 0, dp(12), 0); button.setCompoundDrawablePadding(dp(8));
        button.setCompoundDrawables(new ControlIcon(icon, dp(24)), null, null, null);
        button.setBackground(buttonBackground(0xDA104535, dp(18)));
    }
    /** Keep every control reachable on short displays and with large accessibility fonts. */
    private static final class ControlsPanel extends ScrollView {
        ControlsPanel(android.content.Context context) { super(context); }
        @Override protected void onMeasure(int width, int height) {
            int available = MeasureSpec.getSize(height);
            if (MeasureSpec.getMode(height) != MeasureSpec.UNSPECIFIED && available > 0) {
                height = MeasureSpec.makeMeasureSpec(Math.round(available * 0.56f), MeasureSpec.AT_MOST);
            }
            super.onMeasure(width, height);
        }
    }
    /** Small vector icons remain crisp at every density without font/emoji dependencies. */
    private static final class ControlIcon extends Drawable {
        private final String kind;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        ControlIcon(String kind, int size) { this.kind = kind; setBounds(0, 0, size, size); }
        @Override public void draw(Canvas canvas) {
            int save = canvas.save(); canvas.translate(getBounds().left, getBounds().top);
            canvas.scale(getBounds().width() / 24f, getBounds().height() / 24f);
            paint.setColor(Color.WHITE); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(2);
            paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND);
            Path path = new Path();
            if ("back".equals(kind)) {
                path.moveTo(15, 5); path.lineTo(8, 12); path.lineTo(15, 19); canvas.drawPath(path, paint);
            } else if ("album".equals(kind)) {
                canvas.drawRoundRect(2, 3, 22, 21, 3, 3, paint);
                paint.setStyle(Paint.Style.FILL); canvas.drawCircle(8, 8, 2, paint);
                path.moveTo(3, 18); path.lineTo(9, 12); path.lineTo(13, 16); path.lineTo(17, 11);
                path.lineTo(22, 17); path.lineTo(22, 20); path.lineTo(3, 20); path.close(); canvas.drawPath(path, paint);
            } else {
                path.moveTo(7, 2); path.lineTo(17, 2); path.lineTo(17, 7); path.lineTo(14, 11);
                path.lineTo(14, 22); path.lineTo(10, 22); path.lineTo(10, 11); path.lineTo(7, 7); path.close();
                canvas.drawPath(path, paint); canvas.drawLine(7, 6, 17, 6, paint); canvas.drawLine(12, 14, 12, 17, paint);
            }
            canvas.restoreToCount(save);
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
    private void enabled(View view, boolean value) { if (view != null) { view.setEnabled(value); view.setAlpha(value ? 1f : 0.42f); } }
    private void updateControls() {
        enabled(albumButton, engine != null && !gallery && !delivered && !snapshotGate.busy());
        enabled(torchButton, camera != null && torchSupported && !gallery && !snapshotGate.busy());
        if (torchButton != null) {
            torchButton.setText(torchOn ? "关闭补光" : camera != null && !torchSupported ? "镜头无补光" : "打开补光");
            torchButton.setSelected(torchOn); torchButton.setTextColor(torchOn ? ACCENT : Color.WHITE);
        }
        enabled(zoomInButton, camera != null && !gallery && !snapshotGate.busy() && maxZoom > 1.05f && actualZoom < maxZoom - 0.04f);
        enabled(zoomOutButton, camera != null && !gallery && !snapshotGate.busy() && actualZoom > 1.04f);
        enabled(zoomStatus, camera != null && !gallery && !snapshotGate.busy());
    }
    private void showHint(String value, long hold) { hint.setText(value); hintUntil = SystemClock.elapsedRealtime() + hold; }
    private void requestCameraAccess(boolean explicit) {
        if (destroyed || delivered || paused || gallery || engine == null) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { openCamera(); return; }
        showHint("未开启相机权限 · 点此开启，或从相册选图", 0);
        if (!permissionRequested || explicit) {
            if (permissionRequested && !shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)) {
                try { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
                catch (RuntimeException ignored) { showHint("请在系统设置中开启相机权限", 0); }
            } else { permissionRequested = true; requestPermissions(new String[]{Manifest.permission.CAMERA}, 20); }
        }
    }
    private void manualZoom(float factor) {
        if (camera == null) return;
        autoZoom.manual(); requestedZoom = Math.max(1f, Math.min(maxZoom, actualZoom * factor)); applyZoom();
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 20) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) openCamera();
            else showHint("未开启相机权限 · 点此开启，或从相册选图", 0);
        }
    }
    private void openCamera() {
        if (destroyed || delivered || paused || gallery || !surfaceReady || engine == null || camera != null
                || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return;
        try {
            camera = openPreferredCamera();
            camera.setErrorCallback((error, source) -> main.post(() -> {
                if (source != camera || destroyed || delivered) return;
                boolean high = false;
                try { Camera.Size size = source.getParameters().getPreviewSize(); high = (long) size.width * size.height > 2073600; }
                catch (RuntimeException ignored) {}
                if (high && !hdDisabled) { hdDisabled = true; stopCamera(); main.post(() -> openCamera()); }
                else { stopCamera(); showHint("相机已中断 · 点此重试，或从相册选图", 0); }
            }));
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.Parameters parameters = camera.getParameters();
            int budget = previewBudget();
            boolean configured = false;
            for (int cap : new int[]{budget, 2073600, 1228800}) {
                try {
                    parameters = camera.getParameters(); configurePreview(parameters, cap); camera.setParameters(parameters);
                    configured = true; break;
                } catch (RuntimeException unsupported) { /* Try the next supported lower mode. */ }
            }
            if (!configured) throw new IllegalStateException("PREVIEW_CONFIG_REJECTED");
            configurePhoto();
            parameters = camera.getParameters(); continuousFocusMode = parameters.getFocusMode();
            if (digitalZoom && parameters.isZoomSupported() && parameters.getZoom() != 0) {
                parameters.setZoom(0); camera.setParameters(parameters);
            }
            Camera.getCameraInfo(selectedCamera, info);
            int degrees = getWindowManager().getDefaultDisplay().getRotation() * 90;
            previewRotation = (info.orientation - degrees + 360) % 360;
            camera.setDisplayOrientation(previewRotation);
            camera.setPreviewDisplay(preview.getHolder());
            Camera.Size size = parameters.getPreviewSize();
            if ((long) size.width * size.height > 8294400) throw new IllegalStateException("PREVIEW_TOO_LARGE");
            previewContainer.cameraSize(size.width, size.height, previewRotation);
            android.util.Log.i("FtxQbar", "scanner=0.1.17 camera=" + selectedCamera + " viewAngle=" + parameters.getHorizontalViewAngle()
                    + " preview=" + size.width + "x" + size.height);
            previewBuffers = new byte[(long) size.width * size.height > 4000000 ? 2 : 3][size.width * size.height * 3 / 2];
            attachPreviewBuffers(camera);
            camera.startPreview(); previewContainer.scanning(true);
            cameraOpenedAt = fpsWindow = SystemClock.elapsedRealtime(); fpsFrames = slowWindows = 0;
            baselineExposure = parameters.getExposureCompensation();
            exposureEnabled = parameters.getMaxExposureCompensation() > parameters.getMinExposureCompensation()
                    && Float.isFinite(parameters.getExposureCompensationStep()) && parameters.getExposureCompensationStep() > 0;
            exposureControl.reset(cameraOpenedAt); lastExposureAt = cameraOpenedAt;
            List<String> flashes = parameters.getSupportedFlashModes();
            torchSupported = flashes != null && flashes.contains(Camera.Parameters.FLASH_MODE_TORCH);
            torchOn = Camera.Parameters.FLASH_MODE_TORCH.equals(parameters.getFlashMode());
            decodeFailures = 0; applyZoom(); updateControls();
            showHint("将二维码完整放入框内", 0);
            if (Camera.Parameters.FOCUS_MODE_AUTO.equals(continuousFocusMode)) focusGuide();
        } catch (Exception | OutOfMemoryError error) {
            if (!hdDisabled && camera != null) {
                try {
                    Camera.Size size = camera.getParameters().getPreviewSize();
                    if ((long) size.width * size.height > 2073600) {
                        hdDisabled = true; stopCamera(); main.post(() -> openCamera()); return;
                    }
                } catch (RuntimeException ignored) {}
            }
            stopCamera(); showHint("相机暂不可用 · 点此重试，或从相册选图", 0);
            android.util.Log.w("FtxQbar", "camera start failed: " + error.getClass().getSimpleName());
        }
    }
    private int previewBudget() {
        if (hdDisabled) return 2073600;
        ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
        Runtime runtime = Runtime.getRuntime();
        long available = runtime.maxMemory() - runtime.totalMemory() + runtime.freeMemory();
        if (manager == null || manager.isLowRamDevice() || available < 48L * 1024 * 1024) return 2073600;
        return runtime.maxMemory() >= 256L * 1024 * 1024 && available >= 96L * 1024 * 1024 ? 8294400 : 3686400;
    }
    private void configurePhoto() {
        photoAvailable = false;
        if (photosDisabled) return;
        try {
            Camera.Parameters parameters = camera.getParameters(); Camera.Size previewSize = parameters.getPreviewSize();
            List<Camera.Size> sizes = parameters.getSupportedPictureSizes();
            if (sizes == null) return;
            Camera.Size chosen = null;
            for (Camera.Size size : sizes) {
                long area = (long) size.width * size.height;
                if (area > 12000000 || area < (long) previewSize.width * previewSize.height * 1.4
                        || Math.abs((float) size.width / size.height - (float) previewSize.width / previewSize.height) > 0.03f) continue;
                if (chosen == null || area > (long) chosen.width * chosen.height) chosen = size;
            }
            if (chosen == null) return;
            parameters.setPictureSize(chosen.width, chosen.height); parameters.setPictureFormat(android.graphics.ImageFormat.JPEG);
            parameters.setJpegQuality(92); parameters.setRotation(0); camera.setParameters(parameters); photoAvailable = true;
        } catch (RuntimeException unsupported) { /* Live HD scanning remains available. */ }
    }
    private void attachPreviewBuffers(Camera target) {
        Camera.Size size = target.getParameters().getPreviewSize();
        target.setPreviewCallbackWithBuffer(null);
        if (previewBuffers == null) return;
        for (byte[] buffer : previewBuffers) target.addCallbackBuffer(buffer);
        target.setPreviewCallbackWithBuffer((data, source) -> onFrame(data, source, size.width, size.height));
    }
    private void configurePreview(Camera.Parameters parameters, int maxPixels) {
        List<Camera.Size> sizes = parameters.getSupportedPreviewSizes();
        int[][] supported = new int[sizes.size()][2];
        for (int i = 0; i < sizes.size(); i++) supported[i] = new int[]{sizes.get(i).width, sizes.get(i).height};
        int[] chosen = ScanGeometry.selectPreview(supported, maxPixels);
        if (chosen == null) throw new IllegalStateException("NO_BOUNDED_PREVIEW");
        parameters.setPreviewSize(chosen[0], chosen[1]);
        parameters.setPreviewFormat(android.graphics.ImageFormat.NV21);
        List<String> focus = parameters.getSupportedFocusModes();
        if (focus != null) {
            if (focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            else if (focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO);
            else if (focus.contains(Camera.Parameters.FOCUS_MODE_AUTO)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
        }
    }
    private Camera openPreferredCamera() {
        if (preferredCamera >= 0) {
            try { Camera chosen = Camera.open(preferredCamera); selectedCamera = preferredCamera; return chosen; }
            catch (RuntimeException ignored) { preferredCamera = -1; }
        }
        ArrayList<Integer> backs = new ArrayList<>();
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
            Camera.getCameraInfo(i, info);
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) backs.add(i);
        }
        ArrayList<double[]> ranked = new ArrayList<>();
        for (int id : backs) {
            if (backs.size() == 1) { ranked.add(new double[]{id, 0}); break; }
            Camera probe = null;
            try {
                probe = Camera.open(id);
                Camera.Parameters parameters = probe.getParameters();
                List<String> modes = parameters.getSupportedFocusModes();
                boolean autofocus = modes != null && (modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)
                        || modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)
                        || modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO));
                ranked.add(new double[]{id, ScanGeometry.cameraScore(parameters.getHorizontalViewAngle(), parameters.getVerticalViewAngle(), autofocus)});
            } catch (RuntimeException ignored) { ranked.add(new double[]{id, -1000}); }
            finally { if (probe != null) { try { probe.release(); } catch (RuntimeException ignored) {} } }
        }
        java.util.Collections.sort(ranked, (left, right) -> Double.compare(right[1], left[1]));
        for (double[] candidate : ranked) {
            try {
                int id = (int) candidate[0];
                Camera chosen = Camera.open(id); selectedCamera = preferredCamera = id; return chosen;
            } catch (RuntimeException ignored) { /* Try another exposed rear camera. */ }
        }
        throw new IllegalStateException("NO_CAMERA");
    }
    private void focusGuide() {
        if (previewContainer == null) return;
        float[] anchor = previewContainer.zoomAnchor();
        focusAt(preview.getWidth() * anchor[0], preview.getHeight() * anchor[1]);
    }
    private boolean sameGuide(float[] sensorPivot) {
        float[] anchor = previewContainer.zoomAnchor();
        float[] current = ScanGeometry.previewPoint(anchor[0], anchor[1], previewRotation);
        return Math.abs(sensorPivot[0] - current[0]) < 0.01f && Math.abs(sensorPivot[1] - current[1]) < 0.01f;
    }
    private void focusAt(float x, float y) {
        final Camera target = camera;
        if (target == null || snapshotGate.busy() || photoBusy.get() || preview.getWidth() <= 0 || preview.getHeight() <= 0) return;
        final int epoch = cameraEpoch, sequence = ++focusSequence;
        try {
            if (restoreFocus != null) main.removeCallbacks(restoreFocus);
            Camera.Parameters parameters = target.getParameters();
            List<String> modes = parameters.getSupportedFocusModes();
            if (modes == null || !modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)) return;
            lastFocusAt = SystemClock.elapsedRealtime();
            target.cancelAutoFocus(); parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
            int[] bounds = ScanGeometry.focusArea(x, y, preview.getWidth(), preview.getHeight(), previewRotation);
            List<Camera.Area> area = java.util.Collections.singletonList(new Camera.Area(new Rect(bounds[0], bounds[1], bounds[2], bounds[3]), 900));
            if (parameters.getMaxNumFocusAreas() > 0) parameters.setFocusAreas(area);
            if (parameters.getMaxNumMeteringAreas() > 0) parameters.setMeteringAreas(area);
            target.setParameters(parameters); previewContainer.focusAt(x, y);
            final Runnable restore = () -> {
                if (camera != target || cameraEpoch != epoch || focusSequence != sequence || paused || destroyed) return;
                if (restoreFocus != null) main.removeCallbacks(restoreFocus);
                try {
                    Camera.Parameters restored = target.getParameters();
                    if (restored.getMaxNumFocusAreas() > 0) restored.setFocusAreas(null);
                    if (restored.getMaxNumMeteringAreas() > 0) restored.setMeteringAreas(null);
                    if (continuousFocusMode != null) restored.setFocusMode(continuousFocusMode);
                    target.setParameters(restored);
                } catch (RuntimeException ignored) {}
            };
            restoreFocus = restore;
            main.postDelayed(restore, 1600);
            target.autoFocus((success, source) -> {
                if (source == camera && cameraEpoch == epoch && focusSequence == sequence) main.postDelayed(restore, 650);
            });
        } catch (RuntimeException ignored) { /* A fixed-focus or busy camera remains usable. */ }
    }
    private boolean currentFrame(LiveFrame frame) {
        return frame != null && !destroyed && !delivered && !paused && !gallery && frame.source == camera
                && frame.epoch == cameraEpoch && (!digitalZoom || Math.abs(frame.zoom - actualZoom) <= 0.01f) && sameGuide(frame.pivot);
    }
    private void clearCandidate() {
        latestCandidate = null; candidatePivot = null; candidateAt = candidateSince = 0; candidateHits = 0;
    }
    private void trackCandidate(ScanGeometry.Candidate candidate, long now, float zoom, float[] pivot) {
        if (candidate == null) { if (now - candidateAt > 1200) clearCandidate(); return; }
        boolean same = latestCandidate != null && now - candidateAt <= 1200 && Math.abs(candidateZoom - zoom) <= 0.01f
                && candidatePivot != null && Math.abs(candidatePivot[0] - pivot[0]) < 0.01f && Math.abs(candidatePivot[1] - pivot[1]) < 0.01f
                && Math.hypot(candidate.x - latestCandidate.x, candidate.y - latestCandidate.y) <= 0.06
                && Math.abs(candidate.size - latestCandidate.size) <= latestCandidate.size * 0.4;
        if (!same) { candidateSince = now; candidateHits = 0; }
        candidateHits++; latestCandidate = candidate; candidateAt = now; candidateZoom = zoom; candidatePivot = pivot;
    }
    private boolean observePreviewRate(long now, int width, int height) {
        fpsFrames++;
        if (now - fpsWindow < 4000) return true;
        double fps = fpsFrames * 1000.0 / Math.max(1, now - fpsWindow);
        fpsWindow = now; fpsFrames = 0;
        slowWindows = fps < 9 ? slowWindows + 1 : 0;
        if (!hdDisabled && (long) width * height > 2073600 && slowWindows >= 2) {
            hdDisabled = true; stopCamera(); main.post(() -> openCamera()); return false;
        }
        return true;
    }
    private void onFrame(byte[] data, Camera source, int width, int height) {
        long now = SystemClock.elapsedRealtime();
        if (destroyed || delivered || paused || gallery || source != camera || data == null || data.length < (long) width * height
                || snapshotGate.busy() || photoBusy.get()) { recycleFrame(source, data); return; }
        if (!observePreviewRate(now, width, height)) return;
        final int epoch = cameraEpoch;
        boolean decode = !frameBusy.get() && (selectedFrame == null ? now - lastFrame >= 220
                : selectionSamples < 2 && now - lastSelectionSample >= 70);
        // Manual zoom pauses auto zoom, but localization is still needed for native-pixel ROIs.
        boolean detect = now - lastCoarseFrame >= 250 && coarseBusy.compareAndSet(false, true);
        if (!decode && !detect) { recycleFrame(source, data); return; }
        final float frameZoom = digitalZoom ? actualZoom : 1f;
        final float[] anchor = previewContainer.zoomAnchor();
        final float[] sensorPivot = ScanGeometry.previewPoint(anchor[0], anchor[1], previewRotation);
        ScanGeometry.Frame coarseFrame = null;
        try {
            if (detect) coarseFrame = ScanGeometry.sampleZoom(data, width, height, frameZoom, sensorPivot[0], sensorPivot[1], 1920);
            if (decode) {
                ScanGeometry.Frame full = ScanGeometry.sampleZoom(data, width, height, frameZoom, sensorPivot[0], sensorPivot[1], 1920);
                boolean fresh = latestCandidate != null && now - candidateAt <= 1200 && Math.abs(candidateZoom - frameZoom) < 0.01f
                        && candidatePivot != null && Math.abs(candidatePivot[0] - sensorPivot[0]) < 0.01f && Math.abs(candidatePivot[1] - sensorPivot[1]) < 0.01f;
                ScanGeometry.Frame region = fresh ? ScanGeometry.candidateRegion(data, width, height, frameZoom, sensorPivot[0], sensorPivot[1], latestCandidate, 2048) : null;
                int[] regionBounds = region == null ? null : ScanGeometry.candidateBounds(width, height, frameZoom, sensorPivot[0], sensorPivot[1], latestCandidate);
                LiveFrame next = new LiveFrame(source, epoch, frameZoom, sensorPivot, full, region, regionBounds, now);
                if (selectedFrame == null || !currentFrame(selectedFrame) || !ScanGeometry.freshSelection(selectedFrame.capturedAt, now)) {
                    selectedFrame = next; selectionSamples = 0; lastFrame = now;
                    main.removeCallbacks(dispatchSelection); main.postDelayed(dispatchSelection, 100);
                // Quality scores are comparable only for the same sensor-pixel ROI.
                // A moved candidate replaces the sample without extending the 100ms window.
                } else if (!ScanGeometry.sameSelectionRegion(selectedFrame.regionBounds, regionBounds)
                        || next.quality > selectedFrame.quality) selectedFrame = next;
                selectionSamples++; lastSelectionSample = now;
            }
        } catch (OutOfMemoryError | RuntimeException unavailable) {
            if (detect) coarseBusy.set(false);
            recycleFrame(source, data);
            selectedFrame = null; main.removeCallbacks(dispatchSelection);
            if (!hdDisabled && (long) width * height > 2073600) { hdDisabled = true; stopCamera(); main.post(() -> openCamera()); }
            return;
        }
        recycleFrame(source, data);
        if (!detect) return;
        lastCoarseFrame = now;
        final ScanGeometry.Frame observation = coarseFrame;
        coarseWorker.execute(() -> {
            try {
                ScanGeometry.Candidate candidate = ScanGeometry.detectCandidate(observation.gray, observation.width, observation.height);
                int lightLevel = ScanGeometry.lightLevel(observation.gray, observation.width, observation.height);
                main.post(() -> {
                    if (destroyed || delivered || paused || gallery || snapshotGate.busy() || source != camera || epoch != cameraEpoch
                            || digitalZoom && Math.abs(frameZoom - actualZoom) > 0.01f || !sameGuide(sensorPivot)) return;
                    long observedAt = SystemClock.elapsedRealtime();
                    if (observedAt - now > 1000) { autoZoom.next(observedAt, maxZoom, actualZoom, null, false); return; }
                    adjustExposure(lightLevel, observedAt);
                    trackCandidate(candidate, observedAt, frameZoom, sensorPivot);
                    ScanGeometry.Candidate relative = candidate == null ? null : new ScanGeometry.Candidate(
                            candidate.x - sensorPivot[0] + 0.5f, candidate.y - sensorPivot[1] + 0.5f, candidate.size);
                    float nextZoom = autoZoom.next(observedAt, maxZoom, actualZoom, relative, matchingFrames > 0 && observedAt - lastMatch <= 3000);
                    if (!Float.isNaN(nextZoom)) {
                        requestedZoom = nextZoom; applyZoom();
                        // Focus at the code, rather than repeatedly hunting at the guide center.
                        if (observedAt - lastFocusAt >= 900) focusCandidate();
                        showHint("检测到小码，正在放大，请保持稳定", 900);
                    } else if (candidateHits >= 3 && observedAt - candidateSince >= 700
                            && observedAt - lastCandidateFocus >= 4000 && observedAt - lastDecodedAt >= 2000) {
                        lastCandidateFocus = observedAt; focusCandidate();
                    }
                });
            } catch (RuntimeException ignored) { /* Localization never invents a payload. */ }
            finally { coarseBusy.set(false); }
        });
    }
    private void adjustExposure(int lightLevel, long now) {
        // Leave normal AE alone. Small, stable dark-scene corrections only; no
        // automatic torch (screen codes may reflect it), no HDR or ISO overrides.
        if (!exposureEnabled || torchOn || camera == null || snapshotGate.busy() || photoBusy.get()
                || now - lastFocusAt < 1800 || now - lastZoomAt < 700 || now - lastDecodedAt < 1500) return;
        float ev = exposureControl.next(lightLevel, now);
        if (!Float.isNaN(ev)) applyExposure(ev, now);
    }
    private void applyExposure(float ev, long now) {
        if (!exposureEnabled || camera == null) return;
        try {
            Camera.Parameters parameters = camera.getParameters();
            float step = parameters.getExposureCompensationStep();
            if (!Float.isFinite(step) || step <= 0) { exposureEnabled = false; return; }
            // Round down so coarse device steps can never exceed the half-stop cap.
            int desired = ScanGeometry.exposureIndex(baselineExposure, parameters.getMinExposureCompensation(),
                    parameters.getMaxExposureCompensation(), step, ev);
            if (desired == parameters.getExposureCompensation()) return;
            parameters.setExposureCompensation(desired); camera.setParameters(parameters);
            lastExposureAt = now;
            selectedFrame = null; main.removeCallbacks(dispatchSelection);
        } catch (RuntimeException unsupported) {
            exposureEnabled = false; // Driver rejection must not interrupt scanning.
        }
    }
    private void dispatchSelectedFrame() {
        final LiveFrame frame = selectedFrame; selectedFrame = null;
        long now = SystemClock.elapsedRealtime();
        if (!currentFrame(frame) || !ScanGeometry.freshSelection(frame.capturedAt, now)
                || snapshotGate.busy() || photoBusy.get() || !frameBusy.compareAndSet(false, true)) return;
        final boolean enhance = now - lastEnhancement >= 700;
        if (enhance) lastEnhancement = now;
        worker.execute(() -> {
            try {
                if (!ScanGeometry.freshSelection(frame.capturedAt, SystemClock.elapsedRealtime())) return;
                JSONObject result = engine.scanFrame(frame.full.gray, frame.full.width, frame.full.height, enhance,
                        frame.pivot[0], frame.pivot[1], frame.region);
                main.post(() -> {
                    if (!currentFrame(frame) || snapshotGate.busy()) return;
                    decodeFailures = 0;
                    if (result == null) {
                        long decodedAt = SystemClock.elapsedRealtime();
                        if (decodedAt >= hintUntil) hint.setText("将二维码完整放入框内");
                        if (decodedAt - lastMatch > 3000) { previousResult = ""; matchingFrames = 0; }
                        maybeSnapshot(); return;
                    }
                    handleDecoded(result, false);
                });
            } catch (Throwable error) {
                main.post(() -> {
                    if (!currentFrame(frame)) return;
                    if (++decodeFailures >= 3) finishWith("{\"error\":\"DECODE_FAILED\"}");
                    else showHint("画面暂不清晰，请稳住手机或轻点对焦", 2000);
                });
            } finally { frameBusy.set(false); }
        });
    }
    private void handleDecoded(JSONObject result, boolean still) {
        long now = SystemClock.elapsedRealtime();
        autoZoom.next(now, maxZoom, actualZoom, null, true);
        if (result.has("error")) {
            previousResult = ""; matchingFrames = 0; clearCandidate();
            showHint("检测到多个码，请只对准一个二维码", 2400); return;
        }
        lastDecodedAt = now;
        String signature = result.toString();
        matchingFrames = still ? 2 : signature.equals(previousResult) && now - lastMatch <= 3000 ? matchingFrames + 1 : 1;
        previousResult = signature; lastMatch = now;
        if (!showDecoded(result, matchingFrames >= 2) && matchingFrames >= 2) finishWith(signature);
    }
    private void focusCandidate() {
        if (latestCandidate == null || candidatePivot == null || camera == null) return;
        float z = candidateZoom;
        float x = (1 - 1 / z) * candidatePivot[0] + latestCandidate.x / z;
        float y = (1 - 1 / z) * candidatePivot[1] + latestCandidate.y / z;
        float[] display = ScanGeometry.previewPoint(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), (360 - previewRotation) % 360);
        focusAt(display[0] * preview.getWidth(), display[1] * preview.getHeight());
    }
    private void maybeSnapshot() {
        long now = SystemClock.elapsedRealtime();
        if (!photoAvailable || photosDisabled || camera == null || latestCandidate == null || candidateHits < 3
                || now - candidateAt > 1200 || now - candidateSince < 1200 || now - cameraOpenedAt < 2400
                || now - lastZoomAt < 650 || now - lastExposureAt < 700
                || now - lastDecodedAt < 3000 || now - lastFocusAt < 700 || latestCandidate.size > 0.4f || !snapshotGate.start(now)) return;
        final Camera target = camera;
        final float zoom = digitalZoom ? actualZoom : 1f;
        final float[] pivot = candidatePivot;
        if (pivot == null || Math.abs(candidateZoom - zoom) > 0.01f || !sameGuide(pivot)) { snapshotGate.finish(); return; }
        final Camera.Size size;
        try { size = target.getParameters().getPreviewSize(); }
        catch (RuntimeException unavailable) { snapshotGate.finish(); photosDisabled = true; return; }
        int cropWidth = Math.max(2, (int) (size.width / zoom)), cropHeight = Math.max(2, (int) (size.height / zoom));
        final ScanGeometry.Candidate expected = new ScanGeometry.Candidate(
                ((size.width - cropWidth) * pivot[0] + latestCandidate.x * cropWidth) / size.width,
                ((size.height - cropHeight) * pivot[1] + latestCandidate.y * cropHeight) / size.height,
                latestCandidate.size * Math.min(cropWidth, cropHeight) / Math.min(size.width, size.height));
        final int epoch = ++cameraEpoch;
        selectedFrame = null; main.removeCallbacks(dispatchSelection); updateControls();
        showHint("正在尝试高清识别，请保持稳定", 2500);
        snapshotTimeout = () -> {
            if (camera != target || cameraEpoch != epoch || !snapshotGate.busy()) return;
            photosDisabled = true; stopCamera(); if (!paused && !destroyed && !delivered) openCamera();
        };
        main.postDelayed(snapshotTimeout, 6000);
        try {
            target.setPreviewCallbackWithBuffer(null);
            target.takePicture(null, null, (jpeg, source) -> {
                if (destroyed || delivered || paused || gallery || source != camera || epoch != cameraEpoch) return;
                if (snapshotTimeout != null) { main.removeCallbacks(snapshotTimeout); snapshotTimeout = null; }
                try { attachPreviewBuffers(source); source.startPreview(); fpsWindow = SystemClock.elapsedRealtime(); fpsFrames = 0; }
                catch (RuntimeException failure) { photosDisabled = true; stopCamera(); openCamera(); return; }
                photoBusy.set(true);
                worker.execute(() -> {
                    JSONObject answer = null;
                    try { answer = engine.scanJpeg(jpeg, expected, (float) size.width / size.height); }
                    catch (Exception | OutOfMemoryError ignored) { /* Resume live scanning on an unusable still. */ }
                    finally { photoBusy.set(false); }
                    final JSONObject result = answer;
                    main.post(() -> {
                        if (destroyed || delivered || paused || gallery || source != camera || epoch != cameraEpoch) return;
                        snapshotGate.finish(); clearCandidate(); updateControls();
                        fpsWindow = SystemClock.elapsedRealtime(); fpsFrames = slowWindows = 0;
                        if (result != null && sameGuide(pivot) && Math.abs(zoom - (digitalZoom ? actualZoom : 1f)) < 0.01f) handleDecoded(result, true);
                        else showHint("请继续对准二维码，或轻点对焦", 1800);
                    });
                });
            });
        } catch (RuntimeException failure) {
            photosDisabled = true;
            if (snapshotTimeout != null) { main.removeCallbacks(snapshotTimeout); snapshotTimeout = null; }
            snapshotGate.finish();
            try { attachPreviewBuffers(target); target.startPreview(); updateControls(); }
            catch (RuntimeException ignored) { stopCamera(); openCamera(); }
        }
    }
    private void recycleFrame(Camera source, byte[] data) {
        try { if (source == camera && data != null) source.addCallbackBuffer(data); } catch (RuntimeException ignored) {}
    }
    private void stopCamera() {
        Camera previous = camera; camera = null; cameraEpoch++; focusSequence++;
        exposureEnabled = false; exposureControl.reset(SystemClock.elapsedRealtime());
        selectedFrame = null; main.removeCallbacks(dispatchSelection); clearCandidate(); snapshotGate.cancel(); photoAvailable = false; previewBuffers = null;
        if (snapshotTimeout != null) { main.removeCallbacks(snapshotTimeout); snapshotTimeout = null; }
        if (restoreFocus != null) { main.removeCallbacks(restoreFocus); restoreFocus = null; }
        if (previewContainer != null) previewContainer.scanning(false);
        if (previous != null) {
            try { previous.setPreviewCallbackWithBuffer(null); } catch (RuntimeException ignored) {}
            try { previous.stopPreview(); } catch (RuntimeException ignored) {}
            try { previous.release(); } catch (RuntimeException ignored) {}
        }
        torchOn = torchSupported = false; previousResult = ""; matchingFrames = 0;
        updateControls();
    }
    private void applyZoom() {
        if (camera == null || snapshotGate.busy()) return;
        if (digitalZoom) {
            maxZoom = 3f;
            float before = actualZoom;
            actualZoom = requestedZoom = Math.max(1f, Math.min(maxZoom, requestedZoom));
            if (Math.abs(before - actualZoom) > 0.01f) {
                lastZoomAt = SystemClock.elapsedRealtime();
                selectedFrame = null; main.removeCallbacks(dispatchSelection); lastFrame = 0; lastCoarseFrame = 0;
                previousResult = ""; matchingFrames = 0;
                // Keep the original-sensor location; do not wait for another coarse
                // pass before decoding a native-pixel ROI at the new visible zoom.
                if (latestCandidate != null && candidatePivot != null && lastZoomAt - candidateAt <= 1200) {
                    latestCandidate = ScanGeometry.reprojectCandidate(latestCandidate, candidateZoom, actualZoom, candidatePivot[0], candidatePivot[1]);
                    candidateZoom = actualZoom;
                    if (latestCandidate == null) clearCandidate();
                } else clearCandidate();
            }
            previewContainer.zoom(actualZoom);
            updateZoomStatus(); updateControls();
            return;
        }
        try {
            Camera.Parameters parameters = camera.getParameters();
            if (!parameters.isZoomSupported()) { maxZoom = actualZoom = requestedZoom = 1f; return; }
            List<Integer> ratios = parameters.getZoomRatios();
            if (ratios == null || ratios.isEmpty()) { maxZoom = actualZoom = requestedZoom = 1f; return; }
            int lastIndex = Math.min(parameters.getMaxZoom(), ratios.size() - 1);
            maxZoom = Math.min(3f, ratios.get(lastIndex) / 100f);
            requestedZoom = Math.max(1f, Math.min(requestedZoom, maxZoom));
            int nearest = 0;
            for (int i = 1; i <= lastIndex; i++) {
                if (Math.abs(ratios.get(i) - requestedZoom * 100) < Math.abs(ratios.get(nearest) - requestedZoom * 100)) nearest = i;
            }
            boolean changed = parameters.getZoom() != nearest;
            if (changed) { parameters.setZoom(nearest); camera.setParameters(parameters); }
            int accepted = camera.getParameters().getZoom();
            actualZoom = ratios.get(Math.max(0, Math.min(lastIndex, accepted))) / 100f;
            if (changed && Camera.Parameters.FOCUS_MODE_AUTO.equals(continuousFocusMode)) focusGuide();
        } catch (RuntimeException ignored) {
            // Disable automatic retries if a vendor rejects zoom; normal decoding stays usable.
            maxZoom = 1f;
        } finally { updateZoomStatus(); updateControls(); }
    }
    private void updateZoomStatus() {
        if (zoomStatus == null || camera == null) return;
        String ratio = String.format(java.util.Locale.ROOT, "%.1f×", actualZoom);
        zoomStatus.setText(maxZoom <= 1.05f ? ratio + " · 此镜头不支持变焦"
                : autoZoom.isManual() ? "手动 " + ratio + " · 恢复自动"
                : "自动 " + ratio);
        zoomStatus.setContentDescription(autoZoom.isManual() ? "当前手动倍率" + ratio + "，点击恢复一倍和自动模式" : "当前自动倍率" + ratio + "，点击回到一倍");
    }
    private void toggleTorch() {
        if (camera == null) return;
        try {
            Camera.Parameters parameters = camera.getParameters();
            List<String> modes = parameters.getSupportedFlashModes();
            if (modes == null || !modes.contains(Camera.Parameters.FLASH_MODE_TORCH)) { torchSupported = false; updateControls(); return; }
            parameters.setFlashMode(Camera.Parameters.FLASH_MODE_TORCH.equals(parameters.getFlashMode()) ? Camera.Parameters.FLASH_MODE_OFF : Camera.Parameters.FLASH_MODE_TORCH);
            camera.setParameters(parameters);
            torchOn = Camera.Parameters.FLASH_MODE_TORCH.equals(camera.getParameters().getFlashMode());
            long now = SystemClock.elapsedRealtime();
            applyExposure(0f, now); exposureControl.reset(now); updateControls();
        } catch (RuntimeException ignored) { showHint("补光暂不可用，可尝试调整环境光线", 2200); }
    }
    private void chooseImage() {
        if (destroyed || delivered || gallery || engine == null) return;
        gallery = true; stopCamera(); updateControls();
        try { startActivityForResult(new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE), 21); }
        catch (Exception error) { gallery = false; openCamera(); showHint("无法打开相册，请使用相机扫码", 2200); updateControls(); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 21 || destroyed || delivered || !gallery) return;
        if (result != RESULT_OK || data == null || data.getData() == null) { gallery = false; openCamera(); updateControls(); return; }
        Uri uri = data.getData(); showHint("正在识别相册图片…", 0);
        worker.execute(() -> {
            JSONObject decoded = null;
            File temporary = null;
            Bitmap bitmap = null;
            try {
                temporary = File.createTempFile("qbar-", ".img", getCacheDir());
                try (InputStream input = getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(temporary)) {
                    if (input == null) throw new IllegalArgumentException("EMPTY_IMAGE");
                    byte[] buffer = new byte[16384]; int total = 0, count;
                    while ((count = input.read(buffer)) != -1) {
                        total += count; if (total > 16 * 1024 * 1024) throw new IllegalArgumentException("IMAGE_TOO_LARGE");
                        output.write(buffer, 0, count);
                    }
                }
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(temporary.getPath(), options);
                if (options.outWidth <= 0 || options.outHeight <= 0) throw new IllegalArgumentException("INVALID_IMAGE");
                while (options.outWidth / Math.max(1, options.inSampleSize) > 2400 || options.outHeight / Math.max(1, options.inSampleSize) > 2400) options.inSampleSize = Math.max(2, options.inSampleSize * 2);
                options.inJustDecodeBounds = false; options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                bitmap = BitmapFactory.decodeFile(temporary.getPath(), options);
                if (bitmap == null) throw new IllegalArgumentException("EMPTY_IMAGE");
                int orientation = ExifInterface.ORIENTATION_NORMAL;
                try { orientation = new ExifInterface(temporary.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, orientation); }
                catch (Exception ignored) { /* Non-JPEG/EXIF-less images are still valid inputs. */ }
                Matrix transform = new Matrix();
                switch (orientation) {
                    case 2: transform.postScale(-1, 1); break;
                    case 3: transform.postRotate(180); break;
                    case 4: transform.postScale(1, -1); break;
                    case 5: transform.postRotate(90); transform.postScale(-1, 1); break;
                    case 6: transform.postRotate(90); break;
                    case 7: transform.postRotate(270); transform.postScale(-1, 1); break;
                    case 8: transform.postRotate(270); break;
                    default: break;
                }
                if (!transform.isIdentity()) {
                    Bitmap oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), transform, true);
                    if (oriented != bitmap) bitmap.recycle();
                    bitmap = oriented;
                }
                decoded = engine.scanBitmap(bitmap);
            } catch (Throwable ignored) { /* Keep the scanner usable after a bad/large image. */ }
            finally { if (bitmap != null) bitmap.recycle(); if (temporary != null) temporary.delete(); }
            JSONObject answer = decoded;
            main.post(() -> {
                if (destroyed || delivered || !gallery) return;
                pendingImageResult = answer; imageResultReady = true;
                if (!paused) completeImage();
            });
        });
    }
    private void completeImage() {
        if (!imageResultReady || paused || destroyed || delivered || !gallery) return;
        JSONObject answer = pendingImageResult; pendingImageResult = null; imageResultReady = false; gallery = false;
        if (answer != null && !answer.has("error")) {
            if (showDecoded(answer, true)) { openCamera(); updateControls(); }
            else finishWith(answer.toString());
        }
        else {
            openCamera(); updateControls();
            showHint(answer == null ? "未识别到二维码，请换清晰原图或使用相机" : "图片中有多个码，请裁剪后重试", 3500);
        }
    }
    private boolean showDecoded(JSONObject answer, boolean ready) {
        if (!debugEnabled || debugText == null || debugUse == null) return false;
        // Keep the last confirmed result actionable until a new result is stable.
        if (!ready && !debugResult.isEmpty()) return true;
        String text = answer.optString("result", "");
        if (text.isEmpty() && "WX_CODE".equals(answer.optString("scanType"))) {
            text = "微信圆码 · 原始载荷 Base64\n" + answer.optString("rawBase64", "");
        }
        if (text.isEmpty()) text = answer.toString();
        if (text.length() > 4096) text = text.substring(0, 4096);
        if (!text.contentEquals(debugText.getText())) debugText.setText(text);
        debugResult = answer.toString(); debugUse.setEnabled(true);
        return true;
    }
    private void deliver(String result) {
        if (delivered) return;
        delivered = true;
        ValueCallback<String> callback;
        synchronized (ScannerActivity.class) { callback = pending; pending = null; }
        if (callback != null) {
            try { callback.onReceiveValue(result); }
            catch (RuntimeException error) { android.util.Log.w("FtxQbar", "scan callback unavailable"); }
        }
    }
    private void finishWith(String result) {
        if (delivered || destroyed) return;
        stopCamera(); deliver(result); finish();
    }
    @Override public void onBackPressed() { finishWith("{\"error\":\"CANCELLED\"}"); }
    @Override protected void onResume() {
        super.onResume(); paused = false; getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        autoZoom.defer(SystemClock.elapsedRealtime());
        if (imageResultReady) completeImage();
        else if (engine != null && !gallery) requestCameraAccess(false);
    }
    @Override protected void onPause() {
        paused = true; stopCamera(); getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true; stopCamera(); main.removeCallbacksAndMessages(null); pendingImageResult = null;
        if (!delivered) deliver("{\"error\":\"CANCELLED\"}");
        worker.execute(() -> { if (engine != null) engine.close(); }); worker.shutdown();
        coarseWorker.shutdownNow();
        if (current.get() == this) current.clear();
        super.onDestroy();
    }
    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; openCamera(); }
    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; stopCamera(); }
}
