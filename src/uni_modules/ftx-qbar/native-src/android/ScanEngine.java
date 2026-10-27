package ftx.qbar;

import android.graphics.Bitmap;
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
        // scanBitmap inputs are already sampled to <=2400 by the activity.
        int[] pixels = new int[input.getWidth() * input.getHeight()];
        input.getPixels(pixels, 0, input.getWidth(), 0, 0, input.getWidth(), input.getHeight());
        byte[] gray = new byte[pixels.length];
        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i], alpha = Color.alpha(pixel);
            int value = (299 * Color.red(pixel) + 587 * Color.green(pixel) + 114 * Color.blue(pixel) + 500) / 1000;
            gray[i] = (byte) ((value * alpha + 255 * (255 - alpha)) / 255);
        }
        stretch(gray);
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
        JSONObject result = scan(gray, width, height);
        if (result == null && enhance) {
            stretch(gray);
            result = scan(gray, width, height);
            if (result == null) result = scanGeometry(gray, width, height, 2, 220);
        }
        return result;
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
