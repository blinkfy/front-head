package ftx.qbar;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapRegionDecoder;
import android.graphics.Rect;
import android.graphics.Color;
import android.os.Build;
import android.system.Os;
import android.system.OsConstants;
import android.util.Base64;
import com.tencent.qbar.QbarNative;
import java.nio.charset.Charset;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONObject;

/** One scanner, one native handle, serial calls. Native results are never logged. */
public final class ScanEngine implements AutoCloseable {
    private int id = -1;
    private int geometryCursor, preferredGeometry = -1;
    private int detailCursor, preferredDetail = -1, detailMisses;
    public ScanEngine() throws Exception {
        if (Build.VERSION.SDK_INT < 23) throw new UnsupportedOperationException("ANDROID_VERSION_UNSUPPORTED");
        if (!android.os.Process.is64Bit()) throw new UnsupportedOperationException("ARM64_REQUIRED");
        // This pinned older native library has 4 KB ELF segments. Do not crash a 16 KB device.
        if (Os.sysconf(OsConstants._SC_PAGESIZE) != 4096) throw new UnsupportedOperationException("PAGE_SIZE_UNSUPPORTED");
        boolean arm = false;
        for (String abi : Build.SUPPORTED_ABIS) if (abi.equals("arm64-v8a")) arm = true;
        if (!arm) throw new UnsupportedOperationException("ARM64_REQUIRED");
        System.loadLibrary("wechatQrMod");
        QbarNative.QbarAiModelParam model = new QbarNative.QbarAiModelParam();
        model.detectModelVersion = model.superResolutionModelVersion = "V1.0.0.26";
        model.detect_model_bin_path_ = model.detect_model_param_path_ = "";
        model.superresolution_model_bin_path_ = model.superresolution_model_param_path_ = "";
        model.qbar_segmentation_model_path_ = "";
        id = QbarNative.Init(1, false, false, true, false, 1, 0, "ANY", "UTF-8", model);
        if (id < 0) throw new IllegalStateException("QBAR_INIT_FAILED");
        if (QbarNative.SetReaders(new int[]{1, 2, 3, 4, 5}, 5, id) != 0) {
            close();
            throw new IllegalStateException("QBAR_READERS_FAILED");
        }
    }
    public synchronized JSONObject scan(byte[] gray, int width, int height) throws Exception {
        if (id < 0 || width < 1 || height < 1 || gray.length < (long) width * height) return null;
        if (QbarNative.ScanImage(gray, width, height, id) != 0) return null;
        QbarNative.QBarResultJNI[] results = new QbarNative.QBarResultJNI[3];
        for (int i = 0; i < results.length; i++) {
            results[i] = new QbarNative.QBarResultJNI();
            results[i].charset = results[i].typeName = "";
            results[i].data = new byte[1024];
        }
        if (QbarNative.GetResults(results, id) < 0) return null;
        Map<String, JSONObject> unique = new LinkedHashMap<>();
        for (QbarNative.QBarResultJNI item : results) {
            if (!("WX_CODE".equals(item.typeName) || "QR_CODE".equals(item.typeName)) || item.data == null || item.data.length == 0) continue;
            String raw = Base64.encodeToString(item.data, Base64.NO_WRAP);
            JSONObject result = new JSONObject().put("scanType", item.typeName).put("rawBase64", raw);
            if ("QR_CODE".equals(item.typeName)) {
                String charset = item.charset == null || item.charset.equals("ANY") ? "UTF-8" : item.charset;
                Charset encoding;
                try { encoding = Charset.forName(charset); }
                catch (IllegalArgumentException unsupported) { encoding = java.nio.charset.StandardCharsets.UTF_8; }
                result.put("result", new String(item.data, encoding));
            }
            unique.put(item.typeName + ":" + raw, result);
        }
        if (unique.size() > 1) return new JSONObject().put("error", "MULTIPLE_CODES");
        return unique.isEmpty() ? null : unique.values().iterator().next();
    }
    public JSONObject scanBitmap(Bitmap input) throws Exception {
        // Bounded retries preserve the whole image; no guessed finder positions or payloads.
        int[] sizes = {1280, 800, 1800};
        for (int attempt = 0; attempt < sizes.length; attempt++) {
            int max = Math.max(input.getWidth(), input.getHeight());
            double scale = Math.min(attempt == 2 ? 1.5 : 1.0, (double) sizes[attempt] / max);
            int width = Math.max(1, (int) Math.round(input.getWidth() * scale));
            int height = Math.max(1, (int) Math.round(input.getHeight() * scale));
            Bitmap image = Bitmap.createScaledBitmap(input, width, height, true);
            try {
                int[] pixels = new int[width * height];
                image.getPixels(pixels, 0, width, 0, 0, width, height);
                byte[] gray = new byte[pixels.length];
                for (int i = 0; i < pixels.length; i++) {
                    int pixel = pixels[i], alpha = Color.alpha(pixel);
                    int value = (299 * Color.red(pixel) + 587 * Color.green(pixel) + 114 * Color.blue(pixel) + 500) / 1000;
                    gray[i] = (byte) ((value * alpha + 255 * (255 - alpha)) / 255);
                }
                if (attempt == 2) stretch(gray);
                JSONObject result = scan(gray, width, height);
                if (result != null) return result;
            } finally { if (image != input) image.recycle(); }
        }
        // Native detection first; expensive geometric retries only after all normal attempts fail.
        return scanGeometry(bitmapGray(input), input.getWidth(), input.getHeight(), ScanGeometry.RETRY_COUNT, 1500);
    }
    private byte[] bitmapGray(Bitmap input) {
        return bitmapGray(input, true);
    }
    private byte[] bitmapGray(Bitmap input, boolean enhance) {
        // scanBitmap inputs are already sampled to <=2400 by the activity.
        int[] pixels = new int[input.getWidth() * input.getHeight()];
        input.getPixels(pixels, 0, input.getWidth(), 0, 0, input.getWidth(), input.getHeight());
        byte[] gray = new byte[pixels.length];
        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i], alpha = Color.alpha(pixel);
            int value = (299 * Color.red(pixel) + 587 * Color.green(pixel) + 114 * Color.blue(pixel) + 500) / 1000;
            gray[i] = (byte) ((value * alpha + 255 * (255 - alpha)) / 255);
        }
        if (enhance) stretch(gray);
        return gray;
    }
    private JSONObject scanGeometry(byte[] gray, int width, int height, int attempts, long budgetMs) throws Exception {
        long deadline = System.nanoTime() + budgetMs * 1_000_000;
        for (int attempt = 0; attempt < attempts && System.nanoTime() < deadline; attempt++) {
            // Reuse a successful correction for the second confirming frame, otherwise rotate
            // through a bounded bank over time instead of running every warp on every frame.
            int candidate = attempt == 0 && preferredGeometry >= 0 ? preferredGeometry : geometryCursor++ % ScanGeometry.RETRY_COUNT;
            ScanGeometry.Frame frame = ScanGeometry.warp(gray, width, height, candidate, 960);
            JSONObject result = scan(frame.gray, frame.width, frame.height);
            if (result != null) {
                if (!result.has("error")) preferredGeometry = candidate;
                return result;
            }
            if (candidate == preferredGeometry) preferredGeometry = -1;
        }
        return null;
    }
    public JSONObject scanFrame(byte[] gray, int width, int height, boolean enhance) throws Exception {
        return scanFrame(gray, width, height, enhance, 0.5f, 0.5f);
    }
    public JSONObject scanFrame(byte[] gray, int width, int height, boolean enhance, float centerX, float centerY) throws Exception {
        return scanFrame(gray, width, height, enhance, centerX, centerY, null);
    }
    public JSONObject scanFrame(byte[] gray, int width, int height, boolean enhance, float centerX, float centerY, ScanGeometry.Frame candidate) throws Exception {
        // Preserve full-field/multiple-code handling before trying a native-pixel ROI.
        JSONObject result = scan(gray, width, height);
        if (result == null && candidate != null) {
            result = scan(candidate.gray, candidate.width, candidate.height);
            if (result == null && enhance) {
                stretch(candidate.gray);
                result = scan(candidate.gray, candidate.width, candidate.height);
                if (result == null) result = scanGeometry(candidate.gray, candidate.width, candidate.height, 1, 160);
            }
        }
        // One bounded center retry, throttled on misses. Reuse a successful mode
        // immediately on the next frame so the two-frame confirmation can complete.
        if (result == null && (enhance || preferredDetail >= 0) && width >= 4 && height >= 4) {
            int mode = preferredDetail >= 0 ? preferredDetail : detailCursor++ % 2;
            ScanGeometry.Frame detail = ScanGeometry.centerDetail(gray, width, height, mode == 1, centerX, centerY);
            result = scan(detail.gray, detail.width, detail.height);
            if (result != null && !result.has("error")) { preferredDetail = mode; detailMisses = 0; }
            else if (++detailMisses >= 3) { preferredDetail = -1; detailMisses = 0; }
        }
        if (result == null && enhance) {
            stretch(gray);
            result = scan(gray, width, height);
            if (result == null) result = scanGeometry(gray, width, height, 2, 220);
        }
        return result;
    }
    /** Decode a bounded in-memory still. Never saves images or uploads them. */
    public JSONObject scanJpeg(byte[] jpeg, ScanGeometry.Candidate expected, float previewAspect) throws Exception {
        if (jpeg == null || jpeg.length == 0 || jpeg.length > 16 * 1024 * 1024) return null;
        BitmapRegionDecoder reader = null; Bitmap image = null;
        try {
            reader = BitmapRegionDecoder.newInstance(jpeg, 0, jpeg.length, false);
            if (reader == null) return null;
            int w = reader.getWidth(), h = reader.getHeight();
            if (w < 2 || h < 2 || (long) w * h > 16000000) return null;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inPreferredConfig = Bitmap.Config.ARGB_8888; options.inSampleSize = 1;
            while (Math.max(w, h) / options.inSampleSize > 1600) options.inSampleSize *= 2;
            image = reader.decodeRegion(new Rect(0, 0, w, h), options);
            if (image == null) return null;
            byte[] overview = bitmapGray(image, false);
            JSONObject result = scan(overview, image.getWidth(), image.getHeight());
            if (result != null) return result;
            ScanGeometry.Candidate candidate = ScanGeometry.detectCandidate(overview, image.getWidth(), image.getHeight());
            // Prefer localization in the actual photo. Preview coordinates are only
            // a padded fallback when both streams have a matching sensor aspect.
            if (candidate == null && Math.abs((float) w / h - previewAspect) < 0.03f) candidate = expected;
            image.recycle(); image = null;
            if (candidate == null) return null;
            int span = Math.max(16, Math.min(Math.min(w, h), (int) Math.ceil(candidate.size * Math.min(w, h) * 1.8)));
            int left = Math.max(0, Math.min(w - span, (int) (candidate.x * w - span / 2f)));
            int top = Math.max(0, Math.min(h - span, (int) (candidate.y * h - span / 2f)));
            options.inSampleSize = 1;
            while (span / options.inSampleSize > 2400) options.inSampleSize *= 2;
            image = reader.decodeRegion(new Rect(left, top, left + span, top + span), options);
            if (image == null) return null;
            byte[] detail = bitmapGray(image, false);
            result = scan(detail, image.getWidth(), image.getHeight());
            if (result == null) { stretch(detail); result = scan(detail, image.getWidth(), image.getHeight()); }
            if (result == null) result = scanGeometry(detail, image.getWidth(), image.getHeight(), 2, 240);
            return result;
        } finally {
            if (image != null) image.recycle();
            if (reader != null) reader.recycle();
        }
    }
    private static void stretch(byte[] gray) {
        int[] histogram = new int[256];
        for (byte value : gray) histogram[value & 255]++;
        int low = 0, high = 255, count = 0, cutoff = gray.length / 100;
        while (low < 255 && count + histogram[low] < cutoff) count += histogram[low++];
        count = 0;
        while (high > low && count + histogram[high] < cutoff) count += histogram[high--];
        if (high - low < 32) return;
        for (int i = 0; i < gray.length; i++) gray[i] = (byte) Math.max(0, Math.min(255, ((gray[i] & 255) - low) * 255 / (high - low)));
    }
    @Override public synchronized void close() {
        if (id >= 0) { QbarNative.Release(id); id = -1; }
    }
}
