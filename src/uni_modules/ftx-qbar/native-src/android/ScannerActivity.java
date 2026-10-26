package ftx.qbar;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.hardware.Camera;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
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
    private final AtomicBoolean frameBusy = new AtomicBoolean();
    private SurfaceView preview;
    private FrameLayout previewContainer;
    private int previewWidth, previewHeight, previewRotation, selectedCamera = -1, preferredCamera = -1;
    private TextView hint, zoomStatus;
    private final ScanGeometry.AutoZoom autoZoom = new ScanGeometry.AutoZoom();
    private float maxZoom = 1f, actualZoom = 1f;
    private Camera camera;
    private volatile ScanEngine engine;
    private volatile boolean destroyed;
    private boolean surfaceReady, paused, gallery, delivered, zoomGesture;
    private float requestedZoom = 1f;
    private long lastFrame, lastEnhancement, lastMatch;
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
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(20, 28, 20, 24);
        layout.setBackgroundColor(Color.rgb(10, 27, 25));
        TextView title = new TextView(this);
        title.setText("扫描分投侠二维码"); title.setTextColor(Color.WHITE); title.setTextSize(21);
        title.setGravity(Gravity.CENTER); layout.addView(title);
        hint = new TextView(this);
        hint.setText("小码居中可自动放大，支持双指缩放");
        hint.setTextColor(Color.rgb(170, 225, 209)); hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, 20, 0, 12); layout.addView(hint);
        autoZoom.reset(SystemClock.elapsedRealtime());
        zoomStatus = new TextView(this);
        zoomStatus.setText("自动变焦 · 初始化…"); zoomStatus.setTextSize(13);
        zoomStatus.setTextColor(Color.rgb(170, 225, 209)); zoomStatus.setGravity(Gravity.CENTER);
        zoomStatus.setPadding(0, 0, 0, 12); layout.addView(zoomStatus);
        zoomStatus.setOnClickListener(view -> {
            autoZoom.reset(SystemClock.elapsedRealtime()); requestedZoom = 1f; applyZoom();
        });
        previewContainer = new FrameLayout(this);
        layout.addView(previewContainer, new LinearLayout.LayoutParams(-1, 0, 1));
        preview = new SurfaceView(this);
        previewContainer.addView(preview, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        previewContainer.addOnLayoutChangeListener((view, l, t, r, b, oldL, oldT, oldR, oldB) -> fitPreview());
        preview.getHolder().addCallback(this);
        LinearLayout buttons = new LinearLayout(this);
        addButton(buttons, "相册", view -> chooseImage());
        addButton(buttons, "补光", view -> toggleTorch());
        addButton(buttons, "普通扫码", view -> finishWith("{\"error\":\"USE_STANDARD\"}"));
        addButton(buttons, "取消", view -> finishWith("{\"error\":\"CANCELLED\"}"));
        layout.addView(buttons); setContentView(layout);
        preview.setOnClickListener(view -> { try { if (camera != null) camera.autoFocus(null); } catch (RuntimeException ignored) {} });
        ScaleGestureDetector zoomDetector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                if (camera == null) return false;
                zoomGesture = true; autoZoom.manual();
                requestedZoom = Math.max(1f, Math.min(3f, requestedZoom * detector.getScaleFactor()));
                applyZoom(); return true;
            }
        });
        preview.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) zoomGesture = false;
            if (event.getPointerCount() > 1) {
                zoomGesture = true; autoZoom.manual(); updateZoomStatus();
            }
            zoomDetector.onTouchEvent(event);
            if (event.getActionMasked() == MotionEvent.ACTION_UP && !zoomGesture) view.performClick();
            return true;
        });
        worker.execute(() -> {
            try {
                engine = new ScanEngine();
                main.post(() -> {
                    if (destroyed) return;
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera();
                    else requestPermissions(new String[]{Manifest.permission.CAMERA}, 20);
                });
            } catch (Throwable error) { main.post(() -> finishWith("{\"error\":\"UNAVAILABLE\"}")); }
        });
    }
    private void addButton(LinearLayout row, String text, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(text); button.setOnClickListener(listener);
        row.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == 20) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) openCamera();
            else hint.setText("未开启相机权限，仍可从相册识别二维码");
        }
    }
    private void openCamera() {
        if (destroyed || paused || gallery || !surfaceReady || engine == null || camera != null || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return;
        try {
            camera = openPreferredCamera();
            Camera.CameraInfo info = new Camera.CameraInfo();
            Camera.Parameters parameters = camera.getParameters();
            Camera.Size chosen = null;
            for (Camera.Size size : parameters.getSupportedPreviewSizes()) {
                if (size.width <= 1920 && size.height <= 1080 && (chosen == null || size.width * size.height > chosen.width * chosen.height)) chosen = size;
            }
            if (chosen != null) parameters.setPreviewSize(chosen.width, chosen.height);
            parameters.setPreviewFormat(android.graphics.ImageFormat.NV21);
            List<String> focus = parameters.getSupportedFocusModes();
            if (focus != null) {
                if (focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
                else if (focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_VIDEO);
                else if (focus.contains(Camera.Parameters.FOCUS_MODE_AUTO)) parameters.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
            }
            camera.setParameters(parameters);
            Camera.getCameraInfo(selectedCamera, info);
            int degrees = getWindowManager().getDefaultDisplay().getRotation() * 90;
            previewRotation = (info.orientation - degrees + 360) % 360;
            camera.setDisplayOrientation(previewRotation);
            camera.setPreviewDisplay(preview.getHolder());
            Camera.Size size = camera.getParameters().getPreviewSize();
            previewWidth = size.width; previewHeight = size.height; fitPreview();
            android.util.Log.i("FtxQbar", "scanner=0.1.4 camera=" + selectedCamera + " viewAngle=" + parameters.getHorizontalViewAngle()
                    + " preview=" + size.width + "x" + size.height);
            // Three buffers are recycled; no unbounded camera-frame queue.
            for (int i = 0; i < 3; i++) camera.addCallbackBuffer(new byte[size.width * size.height * 3 / 2]);
            camera.setPreviewCallbackWithBuffer((data, source) -> onFrame(data, source, size.width, size.height));
            camera.startPreview();
            applyZoom();
            if (Camera.Parameters.FOCUS_MODE_AUTO.equals(parameters.getFocusMode())) {
                try { camera.autoFocus(null); } catch (RuntimeException ignored) {}
            }
        } catch (Exception error) { stopCamera(); hint.setText("相机暂不可用，请使用相册或普通扫码"); }
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
            finally { if (probe != null) probe.release(); }
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
    private void fitPreview() {
        if (previewWidth <= 0 || previewContainer.getWidth() <= 0 || previewContainer.getHeight() <= 0) return;
        int[] fit = ScanGeometry.fitPreview(previewWidth, previewHeight, previewRotation, previewContainer.getWidth(), previewContainer.getHeight());
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) preview.getLayoutParams();
        if (params.width != fit[0] || params.height != fit[1]) {
            params.width = fit[0]; params.height = fit[1]; params.gravity = Gravity.CENTER;
            preview.setLayoutParams(params);
        }
    }
    private void onFrame(byte[] data, Camera source, int width, int height) {
        long now = SystemClock.elapsedRealtime();
        if (destroyed || delivered || gallery || frameBusy.get() || now - lastFrame < 280) { recycleFrame(source, data); return; }
        frameBusy.set(true); lastFrame = now;
        boolean enhance = now - lastEnhancement >= 700;
        if (enhance) lastEnhancement = now;
        byte[] gray = Arrays.copyOf(data, width * height);
        recycleFrame(source, data);
        worker.execute(() -> {
            try {
                JSONObject result = engine.scanFrame(gray, width, height, enhance);
                ScanGeometry.Candidate candidate = result == null ? ScanGeometry.detectCandidate(gray, width, height) : null;
                main.post(() -> {
                    if (destroyed || paused || gallery) return;
                    long decodedAt = SystemClock.elapsedRealtime();
                    if (result == null) {
                        if (decodedAt - lastMatch > 3000) { previousResult = ""; matchingFrames = 0; }
                        float nextZoom = autoZoom.next(decodedAt, maxZoom, actualZoom, candidate, matchingFrames > 0);
                        if (!Float.isNaN(nextZoom)) { requestedZoom = nextZoom; applyZoom(); }
                        return;
                    }
                    autoZoom.next(decodedAt, maxZoom, actualZoom, null, true);
                    if (result.has("error")) {
                        previousResult = ""; matchingFrames = 0;
                        hint.setText("检测到多个码，请只对准一个二维码"); return;
                    }
                    String signature = result.toString();
                    matchingFrames = signature.equals(previousResult) && decodedAt - lastMatch <= 3000 ? matchingFrames + 1 : 1;
                    previousResult = signature; lastMatch = decodedAt;
                    if (matchingFrames >= 2) finishWith(signature);
                });
            } catch (Throwable error) { main.post(() -> finishWith("{\"error\":\"DECODE_FAILED\"}")); }
            finally { frameBusy.set(false); }
        });
    }
    private void recycleFrame(Camera source, byte[] data) {
        try { if (source == camera) source.addCallbackBuffer(data); } catch (RuntimeException ignored) {}
    }
    private void stopCamera() {
        if (camera == null) return;
        try { camera.setPreviewCallbackWithBuffer(null); camera.stopPreview(); } catch (RuntimeException ignored) {}
        camera.release(); camera = null;
        previousResult = ""; matchingFrames = 0;
    }
    private void applyZoom() {
        if (camera == null) return;
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
            if (parameters.getZoom() != nearest) { parameters.setZoom(nearest); camera.setParameters(parameters); }
            int accepted = camera.getParameters().getZoom();
            actualZoom = ratios.get(Math.max(0, Math.min(lastIndex, accepted))) / 100f;
        } catch (RuntimeException ignored) {
            // Disable automatic retries if a vendor rejects zoom; normal decoding stays usable.
            maxZoom = 1f;
        } finally { updateZoomStatus(); }
    }
    private void updateZoomStatus() {
        if (zoomStatus == null || camera == null) return;
        String ratio = String.format(java.util.Locale.ROOT, "%.1f×", actualZoom);
        zoomStatus.setText(maxZoom <= 1.05f ? ratio + " · 此镜头不支持变焦"
                : autoZoom.isManual() ? "手动 " + ratio + " · 点此恢复自动"
                : "自动 " + ratio + " · 双指可调");
    }
    private void toggleTorch() {
        if (camera == null) return;
        try {
            Camera.Parameters parameters = camera.getParameters();
            List<String> modes = parameters.getSupportedFlashModes();
            if (modes == null || !modes.contains(Camera.Parameters.FLASH_MODE_TORCH)) return;
            parameters.setFlashMode(Camera.Parameters.FLASH_MODE_TORCH.equals(parameters.getFlashMode()) ? Camera.Parameters.FLASH_MODE_OFF : Camera.Parameters.FLASH_MODE_TORCH);
            camera.setParameters(parameters);
        } catch (RuntimeException ignored) {}
    }
    private void chooseImage() {
        gallery = true; stopCamera();
        try { startActivityForResult(new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE), 21); }
        catch (Exception error) { gallery = false; openCamera(); hint.setText("无法打开相册，请使用相机扫码"); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 21) return;
        if (result != RESULT_OK || data == null || data.getData() == null) { gallery = false; openCamera(); return; }
        Uri uri = data.getData(); hint.setText("正在识别相册图片…");
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
                gallery = false;
                if (destroyed) return;
                if (answer != null && !answer.has("error")) finishWith(answer.toString());
                else { hint.setText(answer == null ? "未识别到二维码，请用清晰原图或普通二维码" : "图片中有多个码，请裁剪后重试"); openCamera(); }
            });
        });
    }
    private void finishWith(String result) {
        if (delivered || destroyed) return;
        delivered = true;
        ValueCallback<String> callback;
        synchronized (ScannerActivity.class) { callback = pending; pending = null; }
        finish();
        if (callback != null) callback.onReceiveValue(result);
    }
    @Override public void onBackPressed() { finishWith("{\"error\":\"CANCELLED\"}"); }
    @Override protected void onResume() {
        super.onResume(); paused = false; autoZoom.defer(SystemClock.elapsedRealtime()); openCamera();
    }
    @Override protected void onPause() { paused = true; stopCamera(); super.onPause(); }
    @Override protected void onDestroy() {
        if (!delivered) finishWith("{\"error\":\"CANCELLED\"}");
        destroyed = true; stopCamera(); main.removeCallbacksAndMessages(null);
        worker.execute(() -> { if (engine != null) engine.close(); }); worker.shutdown();
        if (current.get() == this) current.clear();
        super.onDestroy();
    }
    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; openCamera(); }
    @Override public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; stopCamera(); }
}
