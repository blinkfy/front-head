package ftx.qbar;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
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
import android.widget.TextView;
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
    private TextView hint, zoomStatus;
    private final ScanGeometry.AutoZoom autoZoom = new ScanGeometry.AutoZoom();
    private float maxZoom = 1f, actualZoom = 1f;
    private Camera camera;
    private volatile ScanEngine engine;
    private volatile boolean destroyed;
    private boolean surfaceReady, paused, gallery, delivered, zoomGesture;
    private float requestedZoom = 1.5f;
    private final boolean digitalZoom = android.os.Build.VERSION.SDK_INT >= 24;
    private long lastFrame, lastCoarseFrame, lastEnhancement, lastMatch;
    private String previousResult = "";
    private int matchingFrames;

    public static synchronized void open(Activity host, ValueCallback<String> callback) {
        if (pending != null) { callback.onReceiveValue("{\"error\":\"BUSY\"}"); return; }
        pending = callback;
        try { host.startActivity(new Intent(host, ScannerActivity.class)); }
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
        getWindow().setStatusBarColor(BACKGROUND); getWindow().setNavigationBarColor(BACKGROUND);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL); layout.setBackgroundColor(BACKGROUND);
        layout.setPadding(dp(20), dp(12), dp(20), dp(8));
        layout.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(20) + insets.getSystemWindowInsetLeft(), dp(12) + insets.getSystemWindowInsetTop(),
                    dp(20) + insets.getSystemWindowInsetRight(), dp(8) + insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = button("‹", view -> finishWith("{\"error\":\"CANCELLED\"}"));
        back.setTextSize(29); back.setContentDescription("返回");
        header.addView(back, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout brand = new LinearLayout(this); brand.setOrientation(LinearLayout.VERTICAL); brand.setPadding(dp(14), 0, 0, 0);
        TextView title = text("扫一扫", 23, Color.WHITE); title.setTypeface(null, Typeface.BOLD); brand.addView(title);
        TextView subtitle = text("分投侠 · 连接设备与确认登录", 11, MUTED); brand.addView(subtitle);
        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1)); layout.addView(header);
        TextView supported = text("普通二维码  /  微信小程序码", 12, MUTED);
        supported.setGravity(Gravity.CENTER); supported.setPadding(0, dp(14), 0, dp(10)); layout.addView(supported);
        previewContainer = new ScanPreview(this);
        layout.addView(previewContainer, new LinearLayout.LayoutParams(-1, 0, 1));
        preview = previewContainer.surface(); preview.getHolder().addCallback(this);
        hint = text("正在准备相机…", 14, Color.WHITE); hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(13), 0, dp(8)); layout.addView(hint);
        hint.setOnClickListener(view -> { if (camera == null && !gallery && engine != null) requestCameraAccess(true); });
        autoZoom.reset(SystemClock.elapsedRealtime());
        LinearLayout zoomRow = new LinearLayout(this); zoomRow.setGravity(Gravity.CENTER_VERTICAL);
        zoomOutButton = button("−", view -> manualZoom(1f / 1.2f));
        zoomOutButton.setContentDescription("缩小画面"); zoomOutButton.setTextSize(23);
        zoomInButton = button("＋", view -> manualZoom(1.2f));
        zoomInButton.setContentDescription("放大画面"); zoomInButton.setTextSize(23);
        zoomStatus = text("自动 1.5×", 14, ACCENT); zoomStatus.setGravity(Gravity.CENTER);
        zoomStatus.setBackground(background(PANEL, dp(14), false));
        zoomStatus.setContentDescription("点击恢复一倍画面和自动变焦");
        zoomStatus.setOnClickListener(view -> {
            autoZoom.reset(SystemClock.elapsedRealtime()); requestedZoom = 1f; applyZoom();
        });
        zoomRow.addView(zoomOutButton, new LinearLayout.LayoutParams(dp(46), dp(44)));
        LinearLayout.LayoutParams zoomParams = new LinearLayout.LayoutParams(0, dp(44), 1);
        zoomParams.setMargins(dp(10), 0, dp(10), 0); zoomRow.addView(zoomStatus, zoomParams);
        zoomRow.addView(zoomInButton, new LinearLayout.LayoutParams(dp(46), dp(44))); layout.addView(zoomRow);
        TextView gestures = text("小码居中可自动放大 · 双指缩放 · 点按对焦", 11, MUTED);
        gestures.setGravity(Gravity.CENTER); gestures.setPadding(0, dp(8), 0, dp(12)); layout.addView(gestures);
        LinearLayout actions = new LinearLayout(this);
        albumButton = button("相册选图", view -> chooseImage());
        torchButton = button("打开补光", view -> toggleTorch());
        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(0, dp(46), 1);
        actionParams.setMargins(0, 0, dp(10), 0); actions.addView(albumButton, actionParams);
        actions.addView(torchButton, new LinearLayout.LayoutParams(0, dp(46), 1)); layout.addView(actions);
        Button standard = button("改用系统扫码  ›", view -> finishWith("{\"error\":\"USE_STANDARD\"}"));
        standard.setTextColor(MUTED); standard.setBackgroundColor(Color.TRANSPARENT);
        layout.addView(standard, new LinearLayout.LayoutParams(-1, dp(40)));
        setContentView(layout); updateControls();
        preview.setOnClickListener(view -> focusAt(touchX, touchY));
        ScaleGestureDetector zoomDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera == null) return false;
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
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_pressed}, background(0xFF245440, dp(14), true));
        states.addState(new int[]{}, background(PANEL, dp(14), true)); button.setBackground(states);
        button.setOnClickListener(listener); return button;
    }
    private void enabled(View view, boolean value) { if (view != null) { view.setEnabled(value); view.setAlpha(value ? 1f : 0.42f); } }
    private void updateControls() {
        enabled(albumButton, engine != null && !gallery && !delivered);
        enabled(torchButton, camera != null && torchSupported && !gallery);
        if (torchButton != null) {
            torchButton.setText(torchOn ? "关闭补光" : camera != null && !torchSupported ? "镜头无补光" : "打开补光");
            torchButton.setSelected(torchOn); torchButton.setTextColor(torchOn ? ACCENT : Color.WHITE);
        }
        enabled(zoomInButton, camera != null && !gallery && maxZoom > 1.05f && actualZoom < maxZoom - 0.04f);
        enabled(zoomOutButton, camera != null && !gallery && actualZoom > 1.04f);
        enabled(zoomStatus, camera != null && !gallery);
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
                stopCamera(); showHint("相机已中断 · 点此重试，或从相册选图", 0);
            }));
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.Parameters parameters = camera.getParameters();
            configurePreview(parameters, 1920, 1080);
            try { camera.setParameters(parameters); }
            catch (RuntimeException unsupported) {
                parameters = camera.getParameters(); configurePreview(parameters, 1280, 960); camera.setParameters(parameters);
            }
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
            if ((long) size.width * size.height > 4194304) throw new IllegalStateException("PREVIEW_TOO_LARGE");
            previewContainer.cameraSize(size.width, size.height, previewRotation);
            android.util.Log.i("FtxQbar", "scanner=0.1.7 camera=" + selectedCamera + " viewAngle=" + parameters.getHorizontalViewAngle()
                    + " preview=" + size.width + "x" + size.height);
            for (int i = 0; i < 3; i++) camera.addCallbackBuffer(new byte[size.width * size.height * 3 / 2]);
            camera.setPreviewCallbackWithBuffer((data, source) -> onFrame(data, source, size.width, size.height));
            camera.startPreview(); previewContainer.scanning(true);
            List<String> flashes = parameters.getSupportedFlashModes();
            torchSupported = flashes != null && flashes.contains(Camera.Parameters.FLASH_MODE_TORCH);
            torchOn = Camera.Parameters.FLASH_MODE_TORCH.equals(parameters.getFlashMode());
            decodeFailures = 0; applyZoom(); updateControls();
            showHint("将二维码完整放入框内，保持清晰", 0);
            if (Camera.Parameters.FOCUS_MODE_AUTO.equals(continuousFocusMode)) focusAt(preview.getWidth() / 2f, preview.getHeight() / 2f);
        } catch (Exception error) {
            stopCamera(); showHint("相机暂不可用 · 点此重试，或从相册选图", 0);
            android.util.Log.w("FtxQbar", "camera start failed: " + error.getClass().getSimpleName());
        }
    }
    private void configurePreview(Camera.Parameters parameters, int limitWidth, int limitHeight) {
        Camera.Size chosen = null, smallest = null;
        for (Camera.Size size : parameters.getSupportedPreviewSizes()) {
            if (smallest == null || size.width * size.height < smallest.width * smallest.height) smallest = size;
            if (Math.max(size.width, size.height) <= limitWidth && Math.min(size.width, size.height) <= limitHeight
                    && (chosen == null || size.width * size.height > chosen.width * chosen.height)) chosen = size;
        }
        if (chosen == null) chosen = smallest;
        if (chosen != null) parameters.setPreviewSize(chosen.width, chosen.height);
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
    private void focusAt(float x, float y) {
        final Camera target = camera;
        if (target == null || preview.getWidth() <= 0 || preview.getHeight() <= 0) return;
        final int epoch = cameraEpoch, sequence = ++focusSequence;
        try {
            if (restoreFocus != null) main.removeCallbacks(restoreFocus);
            Camera.Parameters parameters = target.getParameters();
            List<String> modes = parameters.getSupportedFocusModes();
            if (modes == null || !modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)) return;
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
    private void onFrame(byte[] data, Camera source, int width, int height) {
        long now = SystemClock.elapsedRealtime();
        if (destroyed || delivered || paused || gallery || source != camera || data == null || data.length < width * height) {
            recycleFrame(source, data); return;
        }
        final int epoch = cameraEpoch;
        boolean decode = now - lastFrame >= 280 && frameBusy.compareAndSet(false, true);
        boolean detect = maxZoom > 1.05f && !autoZoom.isManual()
                && now - lastCoarseFrame >= 280 && coarseBusy.compareAndSet(false, true);
        if (!decode && !detect) { recycleFrame(source, data); return; }
        // Native decoding may take seconds. Candidate observations must keep
        // arriving independently, using an immutable copy and a one-frame queue.
        final float frameZoom = digitalZoom ? actualZoom : 1f;
        ScanGeometry.Frame decodeFrame = decode ? ScanGeometry.cropZoom(data, width, height, frameZoom) : null;
        ScanGeometry.Frame coarseFrame = detect ? ScanGeometry.cropZoom(data, width, height, frameZoom) : null;
        recycleFrame(source, data);
        if (detect) {
            lastCoarseFrame = now;
            coarseWorker.execute(() -> {
                try {
                    ScanGeometry.Candidate candidate = ScanGeometry.detectCandidate(coarseFrame.gray, coarseFrame.width, coarseFrame.height);
                    main.post(() -> {
                        if (destroyed || delivered || paused || gallery || source != camera || epoch != cameraEpoch
                                || digitalZoom && Math.abs(frameZoom - actualZoom) > 0.01f) return;
                        long observedAt = SystemClock.elapsedRealtime();
                        if (observedAt - now > 1000) { autoZoom.next(observedAt, maxZoom, actualZoom, null, false); return; }
                        float nextZoom = autoZoom.next(observedAt, maxZoom, actualZoom, candidate,
                                matchingFrames > 0 && observedAt - lastMatch <= 3000);
                        if (!Float.isNaN(nextZoom)) {
                            requestedZoom = nextZoom; applyZoom();
                            showHint("检测到小码，正在放大，请保持稳定", 900);
                        }
                    });
                } catch (RuntimeException ignored) { /* Coarse detection cannot interrupt payload decoding. */ }
                finally { coarseBusy.set(false); }
            });
        }
        if (!decode) return;
        lastFrame = now;
        boolean enhance = now - lastEnhancement >= 700;
        if (enhance) lastEnhancement = now;
        worker.execute(() -> {
            try {
                JSONObject result = engine.scanFrame(decodeFrame.gray, decodeFrame.width, decodeFrame.height, enhance);
                main.post(() -> {
                    if (destroyed || delivered || paused || gallery || source != camera || epoch != cameraEpoch
                            || digitalZoom && Math.abs(frameZoom - actualZoom) > 0.01f) return;
                    decodeFailures = 0;
                    long decodedAt = SystemClock.elapsedRealtime();
                    if (result == null) {
                        if (decodedAt >= hintUntil) hint.setText("将二维码完整放入框内，保持清晰");
                        if (decodedAt - lastMatch > 3000) { previousResult = ""; matchingFrames = 0; }
                        return;
                    }
                    autoZoom.next(decodedAt, maxZoom, actualZoom, null, true);
                    if (result.has("error")) {
                        previousResult = ""; matchingFrames = 0;
                        showHint("检测到多个码，请只对准一个二维码", 2400); return;
                    }
                    String signature = result.toString();
                    matchingFrames = signature.equals(previousResult) && decodedAt - lastMatch <= 3000 ? matchingFrames + 1 : 1;
                    previousResult = signature; lastMatch = decodedAt;
                    if (matchingFrames >= 2) finishWith(signature);
                });
            } catch (Throwable error) {
                main.post(() -> {
                    if (destroyed || delivered || paused || gallery || source != camera || epoch != cameraEpoch) return;
                    if (++decodeFailures >= 3) finishWith("{\"error\":\"DECODE_FAILED\"}");
                    else showHint("画面暂不清晰，请稳住手机或轻点对焦", 2000);
                });
            } finally { frameBusy.set(false); }
        });
    }
    private void recycleFrame(Camera source, byte[] data) {
        try { if (source == camera && data != null) source.addCallbackBuffer(data); } catch (RuntimeException ignored) {}
    }
    private void stopCamera() {
        Camera previous = camera; camera = null; cameraEpoch++; focusSequence++;
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
        if (camera == null) return;
        if (digitalZoom) {
            maxZoom = 3f;
            actualZoom = requestedZoom = Math.max(1f, Math.min(maxZoom, requestedZoom));
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
            if (changed && Camera.Parameters.FOCUS_MODE_AUTO.equals(continuousFocusMode)) focusAt(preview.getWidth() / 2f, preview.getHeight() / 2f);
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
            torchOn = Camera.Parameters.FLASH_MODE_TORCH.equals(camera.getParameters().getFlashMode()); updateControls();
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
        if (answer != null && !answer.has("error")) finishWith(answer.toString());
        else {
            openCamera(); updateControls();
            showHint(answer == null ? "未识别到二维码，请换清晰原图或使用相机" : "图片中有多个码，请裁剪后重试", 3500);
        }
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
