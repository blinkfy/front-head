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
import java.security.MessageDigest;
import java.util.*;

/** Isolated JNI probe. Never loaded by the app, never contacts WeChat or the backend. */
public final class QbarProbe extends AbstractJni {
    private final Map<DvmObject<?>, Map<String, Object>> fields = new IdentityHashMap<>();

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
    @Override public void setObjectField(BaseVM vm, DvmObject<?> object, String signature, DvmObject<?> value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setObjectField(vm, object, signature, value);
    }
    @Override public void setIntField(BaseVM vm, DvmObject<?> object, String signature, int value) {
        if (signature.startsWith("com/tencent/qbar/")) { fields(object).put(fieldName(signature), value); return; }
        super.setIntField(vm, object, signature, value);
    }

    private void run(String[] args) throws Exception {
        if (args.length < 2 || (args.length > 2 && !args[2].equals("modern")))
            throw new IllegalArgumentException("usage: QbarProbe libwechatQrMod.so image.png [modern]");
        File library = new File(args[0]).getCanonicalFile();
        BufferedImage image = ImageIO.read(new File(args[1]));
        if (image == null) throw new IllegalArgumentException("Unsupported input image");
        int width = image.getWidth(), height = image.getHeight();
        byte[] gray = new byte[width * height];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int rgb = image.getRGB(x, y);
            gray[y * width + x] = (byte) Math.round(0.299 * (rgb >> 16 & 255) + 0.587 * (rgb >> 8 & 255) + 0.114 * (rgb & 255));
        }
        AndroidEmulator emulator = AndroidEmulatorBuilder.for64Bit()
                .setProcessName("local.fentouxia.qbarprobe")
                .setRootDir(new File("artifacts/rootfs"))
                .addBackendFactory(new Unicorn2Factory(true)).build();
        try {
            emulator.getMemory().setLibraryResolver(new AndroidResolver(23));
            emulator.getSyscallHandler().setEnableThreadDispatcher(true);
            VM vm = emulator.createDalvikVM();
            vm.setJni(this);
            vm.setVerbose(Boolean.getBoolean("qbar.verbose"));
            new AndroidModule(emulator, vm).register(emulator.getMemory());
            new JniGraphics(emulator, vm).register(emulator.getMemory());
            File cpp = new File(library.getParentFile(), "libc++_shared.so");
            if (cpp.exists()) vm.loadLibrary(cpp, true);
            System.out.println("STAGE load " + library.getName());
            DalvikModule module = vm.loadLibrary(library, false);
            module.callJNI_OnLoad(emulator);
            System.out.println("STAGE JNI_OnLoad completed");
            DvmClass qbar = vm.resolveClass("com/tencent/qbar/QbarNative");
            DvmObject<?> version = qbar.callStaticJniMethodObject(emulator, "GetVersion()Ljava/lang/String;");
            System.out.println("VERSION " + version);
            DvmObject<?> model = vm.resolveClass("com/tencent/qbar/QbarNative$QbarAiModelParam").newObject(null);
            for (String name : Arrays.asList("detectModelVersion", "superResolutionModelVersion", "detect_model_bin_path_", "detect_model_param_path_", "superresolution_model_bin_path_", "superresolution_model_param_path_", "qbar_segmentation_model_path_")) {
                fields(model).put(name, new StringObject(vm, name.endsWith("Version") ? "V1.0.0.26" : ""));
            }
            int id = qbar.callStaticJniMethodInt(emulator, "Init(IZZZZIILjava/lang/String;Ljava/lang/String;Lcom/tencent/qbar/QbarNative$QbarAiModelParam;)I", 1, false, false, true, false, 1, 1, "ANY", "UTF-8", model);
            System.out.println("INIT " + id);
            if (id < 0) throw new IllegalStateException("Init failed " + id);
            IntArray readers = new IntArray(vm, new int[]{1, 2, 3, 4, 5});
            int set = qbar.callStaticJniMethodInt(emulator, "SetReaders([III)I", readers, 5, id);
            System.out.println("READERS " + set);
            if (set != 0) throw new IllegalStateException("SetReaders failed " + set);
            long start = System.nanoTime();
            int scan = qbar.callStaticJniMethodInt(emulator, "ScanImage([BIII)I", new ByteArray(vm, gray), width, height, id);
            System.out.println("SCAN " + scan + " elapsedMs=" + (System.nanoTime() - start) / 1_000_000);
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
            System.out.println("RESULT_COUNT " + count);
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
            System.out.println("RELEASE " + qbar.callStaticJniMethodInt(emulator, "Release(I)I", id));
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("width", width);
            report.put("height", height);
            report.put("version", version.getValue());
            report.put("nativeResultCount", count);
            report.put("results", decoded);
            report.put("sceneDecoded", false);
            report.put("scene", null);
            System.out.println("NATIVE_RESULT_JSON " + JSON.toJSONString(report, com.alibaba.fastjson.serializer.SerializerFeature.WriteMapNullValue));
        } finally { emulator.close(); }
    }
    public static void main(String[] args) throws Exception { new QbarProbe().run(args); }
}
