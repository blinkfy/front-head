package lab;

import com.alibaba.fastjson.JSON;
import com.github.unidbg.AndroidEmulator;
import com.github.unidbg.arm.backend.Unicorn2Factory;
import com.github.unidbg.linux.android.AndroidEmulatorBuilder;
import com.github.unidbg.linux.android.AndroidResolver;
import com.github.unidbg.linux.android.dvm.*;
import com.github.unidbg.linux.android.dvm.array.*;
import com.github.unidbg.virtualmodule.android.AndroidModule;
import com.github.unidbg.virtualmodule.android.JniGraphics;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Isolated JNI probe. Never loaded by the app, never contacts WeChat or the backend. */
public final class QbarProbe extends AbstractJni {
    private final Map<DvmObject<?>, Map<String, Object>> fields = new IdentityHashMap<>();
    private AndroidEmulator emulator;
    private VM vm;
    private DvmClass qbar;
    private DvmObject<?> version;
    private int id;

    private Map<String, Object> fields(DvmObject<?> object) {
        return fields.computeIfAbsent(object, unused -> new HashMap<>());
    }
    private String fieldName(String signature) {
        return signature.substring(signature.indexOf("->") + 2, signature.indexOf(':'));
    }
    private static String sha256(byte[] data) throws Exception {
        StringBuilder result = new StringBuilder();
        for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) result.append(String.format("%02x", b & 255));
        return result.toString();
    }
    @Override public DvmObject<?> getObjectField(BaseVM vm, DvmObject<?> object, String signature) {
        if (signature.startsWith("com/tencent/qbar/")) {
            return (DvmObject<?>) fields(object).get(fieldName(signature));
        }
        return super.getObjectField(vm, object, signature);
    }
    @Override public boolean getBooleanField(BaseVM vm, DvmObject<?> object, String signature) {
        if (signature.startsWith("com/tencent/qbar/")) return Boolean.TRUE.equals(fields(object).get(fieldName(signature)));
        return super.getBooleanField(vm, object, signature);
    }
    @Override public int getIntField(BaseVM vm, DvmObject<?> object, String signature) {
        if (signature.startsWith("com/tencent/qbar/")) {
            Object value = fields(object).get(fieldName(signature));
            return value instanceof Number ? ((Number) value).intValue() : 0;
        }
        return super.getIntField(vm, object, signature);
    }
    @Override public float getFloatField(BaseVM vm, DvmObject<?> object, String signature) {
        if (signature.startsWith("com/tencent/qbar/")) {
            Object value = fields(object).get(fieldName(signature));
            return value instanceof Number ? ((Number) value).floatValue() : 0;
        }
        return super.getFloatField(vm, object, signature);
    }
    @Override public void setObjectField(BaseVM vm, DvmObject<?> object, String signature, DvmObject<?> value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setObjectField(vm, object, signature, value);
    }
    @Override public void setIntField(BaseVM vm, DvmObject<?> object, String signature, int value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setIntField(vm, object, signature, value);
    }
    @Override public void setFloatField(BaseVM vm, DvmObject<?> object, String signature, float value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setFloatField(vm, object, signature, value);
    }
    @Override public void setBooleanField(BaseVM vm, DvmObject<?> object, String signature, boolean value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setBooleanField(vm, object, signature, value);
    }

    private void initialize(File library, boolean quiet) throws Exception {
        emulator = AndroidEmulatorBuilder.for64Bit()
                .setProcessName("local.fentouxia.qbarprobe")
                .setRootDir(new File("artifacts/rootfs"))
                .addBackendFactory(new Unicorn2Factory(true)).build();
            emulator.getMemory().setLibraryResolver(new AndroidResolver(23));
            emulator.getSyscallHandler().setEnableThreadDispatcher(true);
            vm = emulator.createDalvikVM();
            vm.setJni(this);
            vm.setVerbose(Boolean.getBoolean("qbar.verbose"));
            new AndroidModule(emulator, vm).register(emulator.getMemory());
            new JniGraphics(emulator, vm).register(emulator.getMemory());
            File cpp = new File(library.getParentFile(), "libc++_shared.so");
            if (cpp.exists()) vm.loadLibrary(cpp, true);
            if (!quiet) System.out.println("STAGE load " + library.getName());
            DalvikModule module = vm.loadLibrary(library, false);
            module.callJNI_OnLoad(emulator);
            if (!quiet) System.out.println("STAGE JNI_OnLoad completed");
            qbar = vm.resolveClass("com/tencent/qbar/QbarNative");
            version = qbar.callStaticJniMethodObject(emulator, "GetVersion()Ljava/lang/String;");
            if (!quiet) System.out.println("VERSION " + version);
            DvmObject<?> model = vm.resolveClass("com/tencent/qbar/QbarNative$QbarAiModelParam").newObject(null);
            for (String name : Arrays.asList("detectModelVersion", "superResolutionModelVersion", "detect_model_bin_path_", "detect_model_param_path_", "superresolution_model_bin_path_", "superresolution_model_param_path_", "qbar_segmentation_model_path_")) {
                fields(model).put(name, new StringObject(vm, name.endsWith("Version") ? "V1.0.0.26" : ""));
            }
            boolean enableDetect = Boolean.getBoolean("qbar.enableDet");
            id = qbar.callStaticJniMethodInt(emulator, "Init(IZZZZIILjava/lang/String;Ljava/lang/String;Lcom/tencent/qbar/QbarNative$QbarAiModelParam;)I", 1, false, enableDetect, true, false, 1, 1, "ANY", "UTF-8", model);
            if (!quiet) System.out.println("INIT " + id);
            if (id < 0) throw new IllegalStateException("Init failed " + id);
            IntArray readers = new IntArray(vm, new int[]{1, 2, 3, 4, 5});
            int set = qbar.callStaticJniMethodInt(emulator, "SetReaders([III)I", readers, 5, id);
            if (!quiet) System.out.println("READERS " + set);
            if (set != 0) throw new IllegalStateException("SetReaders failed " + set);
    }

    private Map<String, Object> scan(File file, boolean quiet) throws Exception {
            BufferedImage image = ImageIO.read(file);
            if (image == null) throw new IllegalArgumentException("Unsupported input image");
            int width = image.getWidth(), height = image.getHeight();
            byte[] gray = new byte[width * height];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                gray[y * width + x] = (byte) Math.round(0.299 * (rgb >> 16 & 255) + 0.587 * (rgb >> 8 & 255) + 0.114 * (rgb & 255));
            }
            long start = System.nanoTime();
            int scan = qbar.callStaticJniMethodInt(emulator, "ScanImage([BIII)I", new ByteArray(vm, gray), width, height, id);
            if (!quiet) System.out.println("SCAN " + scan + " elapsedMs=" + (System.nanoTime() - start) / 1_000_000);
            if (scan != 0) throw new IllegalStateException("ScanImage failed " + scan);
            DvmClass resultClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarResultJNI");
            DvmObject<?>[] results = new DvmObject<?>[3];
            for (int i = 0; i < results.length; i++) {
                results[i] = resultClass.newObject(null);
                fields(results[i]).put("charset", new StringObject(vm, ""));
                fields(results[i]).put("typeName", new StringObject(vm, ""));
                fields(results[i]).put("data", new ByteArray(vm, new byte[1024]));
            }
            ArrayObject array = new ArrayObject(results);
            String signature = "GetResults([Lcom/tencent/qbar/QbarNative$QBarResultJNI;I)I";
            int count = qbar.callStaticJniMethodInt(emulator, signature, array, id);
            if (!quiet) System.out.println("RESULT_COUNT " + count);
            if (count < 0) throw new IllegalStateException("GetResults failed " + count);
            List<Map<String, Object>> decoded = new ArrayList<>();
            for (int i = 0; i < results.length; i++) {
                Map<String, Object> values = fields(results[i]);
                String type = ((StringObject) values.get("typeName")).getValue();
                if (type.isEmpty()) continue;
                byte[] data = ((ByteArray) values.get("data")).getValue();
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("type", type);
                item.put("typeId", values.get("typeID"));
                item.put("charset", ((StringObject) values.get("charset")).getValue());
                item.put("rawLength", data.length);
                item.put("rawSha256", sha256(data));
                // Raw content may be a live credential. Keep it out of normal reports/logs.
                if (Boolean.getBoolean("qbar.includePayload")) item.put("rawBase64", Base64.getEncoder().encodeToString(data));
                decoded.add(item);
            }
            for (DvmObject<?> result : results) fields.remove(result);
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("width", width);
            report.put("height", height);
            report.put("version", version.getValue());
            report.put("nativeResultCount", count);
            report.put("results", decoded);
            report.put("sceneDecoded", false);
            report.put("scene", null);
            return report;
    }

    private Map<String, Object> diagnose(File file) throws Exception {
        Map<String, Object> report = new LinkedHashMap<>();
        Map<String, Object> decoded = scan(file, true);
        BufferedImage image = ImageIO.read(file);
        int width = image.getWidth(), height = image.getHeight();
        byte[] gray = new byte[width * height];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int rgb = image.getRGB(x, y);
            gray[y * width + x] = (byte) Math.round(0.299 * (rgb >> 16 & 255) + 0.587 * (rgb >> 8 & 255) + 0.114 * (rgb & 255));
        }
        // Refresh native frame state after GetResults so each diagnostic accessor
        // observes the same input image rather than a possibly consumed result.
        int scan = qbar.callStaticJniMethodInt(emulator, "ScanImage([BIII)I", new ByteArray(vm, gray), width, height, id);
        report.put("scanStatus", scan);
        DvmClass infoClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarCodeDetectInfo");
        DvmClass pointClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarPoint");
        DvmObject<?>[] infos = new DvmObject<?>[3], detectPoints = new DvmObject<?>[3];
        for (int i = 0; i < infos.length; i++) { infos[i] = infoClass.newObject(null); detectPoints[i] = pointClass.newObject(null); }
        DvmObject<?> infoArray = new ArrayObject(infos), detectPointArray = new ArrayObject(detectPoints);
        DvmObject<?> instance = qbar.newObject(null);
        int detectCount;
        try {
            detectCount = instance.callJniMethodInt(emulator,
                    "GetCodeDetectInfo([Lcom/tencent/qbar/QbarNative$QBarCodeDetectInfo;[Lcom/tencent/qbar/QbarNative$QBarPoint;I)I",
                    infoArray, detectPointArray, id);
            report.put("getCodeDetectInfo", detectCount);
            report.put("detections", readDetections(infos, detectPoints));
        } catch (Throwable error) { report.put("getCodeDetectInfoError", error.getClass().getSimpleName()); }

        DvmClass zoomClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarZoomInfo");
        DvmObject<?> zoom = zoomClass.newObject(null);
        try {
            int zoomStatus = instance.callJniMethodInt(emulator, "GetZoomInfo(Lcom/tencent/qbar/QbarNative$QBarZoomInfo;I)I", zoom, id);
            Map<String, Object> zoomValues = fields(zoom);
            report.put("getZoomInfo", zoomStatus);
            report.put("zoom", zoomValues.getOrDefault("zoomFactor", 0f));
            report.put("isZoom", zoomValues.getOrDefault("isZoom", false));
        } catch (Throwable error) { report.put("getZoomInfoError", error.getClass().getSimpleName()); }

        DvmClass resultClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarResultJNI");
        DvmClass msgClass = vm.resolveClass("com/tencent/qbar/QbarNative$QBarReportMsg");
        DvmObject<?>[] results = new DvmObject<?>[8], detailPoints = new DvmObject<?>[8], messages = new DvmObject<?>[8];
        for (int i = 0; i < results.length; i++) {
            results[i] = resultClass.newObject(null); detailPoints[i] = pointClass.newObject(null); messages[i] = msgClass.newObject(null);
            fields(results[i]).put("charset", new StringObject(vm, "")); fields(results[i]).put("typeName", new StringObject(vm, ""));
            fields(results[i]).put("data", new ByteArray(vm, new byte[1024]));
        }
        try {
            int detailCount = qbar.callStaticJniMethodInt(emulator,
                    "GetDetailResults([Lcom/tencent/qbar/QbarNative$QBarResultJNI;[Lcom/tencent/qbar/QbarNative$QBarPoint;[Lcom/tencent/qbar/QbarNative$QBarReportMsg;I)I",
                    new ArrayObject(results), new ArrayObject(detailPoints), new ArrayObject(messages), id);
            report.put("getDetailResults", detailCount);
            report.put("details", readDetails(results, detailPoints, detailCount));
        } catch (Throwable error) { report.put("getDetailResultsError", error.getClass().getSimpleName()); }
        report.put("width", width); report.put("height", height);
        report.put("decodedCount", decoded.get("nativeResultCount"));
        report.put("decoded", decoded.get("results"));
        return report;
    }

    private List<Map<String, Object>> readDetections(DvmObject<?>[] infos, DvmObject<?>[] points) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (int i = 0; i < infos.length; i++) {
            Map<String, Object> item = new LinkedHashMap<>();
            Object prob = fields(infos[i]).getOrDefault("prob", 0f), readerId = fields(infos[i]).getOrDefault("readerId", 0);
            Map<String, Object> geometry = pointValues(points[i]);
            if ((prob instanceof Number && ((Number) prob).floatValue() != 0)
                    || (readerId instanceof Number && ((Number) readerId).intValue() != 0)
                    || !geometry.isEmpty()) {
                item.put("prob", prob); item.put("readerId", readerId); item.put("points", geometry); values.add(item);
            }
        }
        return values;
    }
    private List<Map<String, Object>> readDetails(DvmObject<?>[] results, DvmObject<?>[] points, int count) {
        List<Map<String, Object>> values = new ArrayList<>();
        for (int i = 0; i < Math.min(results.length, Math.max(0, count)); i++) {
            Map<String, Object> item = new LinkedHashMap<>();
            Object type = fields(results[i]).get("typeName");
            item.put("type", type instanceof StringObject ? ((StringObject) type).getValue() : "");
            item.put("points", pointValues(points[i])); values.add(item);
        }
        return values;
    }
    private Map<String, Object> pointValues(DvmObject<?> point) {
        Map<String, Object> values = new LinkedHashMap<>();
        Map<String, Object> source = fields(point);
        for (String name : Arrays.asList("point_cnt", "x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3")) {
            Object value = source.get(name);
            if (value instanceof Number) values.put(name, value);
        }
        return values;
    }

    private void run(String[] args) throws Exception {
        if (args.length < 2 || (args.length > 2 && !args[2].equals("modern") && !args[2].equals("diagnostics")))
            throw new IllegalArgumentException("usage: QbarProbe libwechatQrMod.so image.png [modern|diagnostics]");
        try {
            initialize(new File(args[0]).getCanonicalFile(), false);
            boolean diagnostics = args.length > 2 && args[2].equals("diagnostics");
            Map<String, Object> report = diagnostics ? diagnose(new File(args[1])) : scan(new File(args[1]), false);
            System.out.println("RELEASE " + qbar.callStaticJniMethodInt(emulator, "Release(I)I", id));
            System.out.println((diagnostics ? "NATIVE_DIAGNOSTIC_JSON " : "NATIVE_RESULT_JSON ")
                    + JSON.toJSONString(report, com.alibaba.fastjson.serializer.SerializerFeature.WriteMapNullValue));
        } finally { if (emulator != null) emulator.close(); }
    }

    private void worker(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: QbarProbe libwechatQrMod.so --worker");
        PrintStream protocol = System.out;
        System.setOut(System.err);
        try {
            initialize(new File(args[0]).getCanonicalFile(), true);
            protocol.println("READY");
            protocol.flush();
            BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            String line;
            int processed = 0;
            while (processed++ < 64 && (line = input.readLine()) != null) {
                Map<String, Object> reply = new LinkedHashMap<>();
                boolean failed = false;
                try {
                    Map<String, Object> request = JSON.parseObject(line);
                    Object requestId = request.get("id");
                    if (!(requestId instanceof Number) || !(request.get("imagePath") instanceof String))
                        throw new IllegalArgumentException("Invalid worker request");
                    reply.put("id", requestId);
                    reply.put("report", scan(new File((String) request.get("imagePath")), true));
                } catch (Exception error) {
                    reply.put("error", "QBAR_DECODE_FAILED");
                    failed = true;
                }
                protocol.println("RESULT " + JSON.toJSONString(reply));
                protocol.flush();
                if (failed) break;
            }
        } finally {
            if (emulator != null) emulator.close();
            System.setOut(protocol);
        }
    }
    public static void main(String[] args) throws Exception {
        QbarProbe probe = new QbarProbe();
        if (args.length == 2 && args[1].equals("--worker")) probe.worker(args);
        else probe.run(args);
    }
}
