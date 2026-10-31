package ftx.qbar;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.ValueCallback;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Small generated images only. No camera, UI, file access, network or persistent worker. */
public final class GeneratedCodeDecoder {
    private static final AtomicBoolean busy = new AtomicBoolean();
    private static final int MAX_BYTES = 512 * 1024;
    public static boolean isBusy() { return busy.get(); }
    public static void decode(String encoded, ValueCallback<String> callback) {
        synchronized (ScannerActivity.class) {
            if (ScannerActivity.isScanActive() || !busy.compareAndSet(false, true)) {
                callback.onReceiveValue("{\"error\":\"BUSY\"}");
                return;
            }
        }
        try {
            new Thread(() -> {
                Bitmap bitmap = null;
                ScanEngine engine = null;
                String result;
                try {
                    if (encoded == null || encoded.length() > ((MAX_BYTES + 2) / 3) * 4
                        || !encoded.matches("[A-Za-z0-9+/]+={0,2}")) throw new IllegalArgumentException();
                    byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                    if (bytes.length == 0 || bytes.length > MAX_BYTES
                        || !Base64.encodeToString(bytes, Base64.NO_WRAP).equals(encoded)) throw new IllegalArgumentException();
                    boolean png = bytes.length >= 8 && bytes[0] == (byte)137 && bytes[1] == 80 && bytes[2] == 78
                        && bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10;
                    boolean jpeg = bytes.length >= 3 && bytes[0] == (byte)255 && bytes[1] == (byte)216 && bytes[2] == (byte)255;
                    if (!png && !jpeg) throw new IllegalArgumentException();
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                    if (options.outWidth < 1 || options.outHeight < 1 || options.outWidth > 1600 || options.outHeight > 1600
                        || (long)options.outWidth * options.outHeight > 4_000_000) throw new IllegalArgumentException();
                    options.inJustDecodeBounds = false;
                    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                    if (bitmap == null) throw new IllegalArgumentException();
                    engine = new ScanEngine();
                    JSONObject decoded = engine.scanBitmap(bitmap);
                    if (decoded == null) result = "{\"error\":\"NO_CODE\"}";
                    else if (decoded.has("error")) result = decoded.toString();
                    else if (!"WX_CODE".equals(decoded.optString("scanType"))) result = "{\"error\":\"WRONG_CODE_TYPE\"}";
                    else result = decoded.toString();
                } catch (IllegalArgumentException invalid) {
                    result = "{\"error\":\"INVALID_IMAGE\"}";
                } catch (UnsupportedOperationException unsupported) {
                    result = "{\"error\":\"UNSUPPORTED\"}";
                } catch (Throwable failure) {
                    result = "{\"error\":\"DECODE_FAILED\"}";
                } finally {
                    if (engine != null) { try { engine.close(); } catch (Throwable ignored) {} }
                    if (bitmap != null) bitmap.recycle();
                    busy.set(false);
                }
                final String value = result;
                new Handler(Looper.getMainLooper()).post(() -> callback.onReceiveValue(value));
            }, "ftx-generated-qr").start();
        } catch (Throwable failure) {
            busy.set(false);
            callback.onReceiveValue("{\"error\":\"UNAVAILABLE\"}");
        }
    }
}
