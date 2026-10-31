"""Build the complete QBar Android library (never an APK)."""
from io import BytesIO
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

FRONT = Path(__file__).resolve().parents[1]
PLUGIN = FRONT / "src/uni_modules/ftx-qbar"
ARTIFACTS = FRONT / "experiments/wechat-roundcode/qbar-native/artifacts"
PLATFORM_URL = "https://dl.google.com/android/repository/platform-35-ext15_r01.zip"
PLATFORM_SHA1 = "ce757091f933b7ac646bf197ce8957cc73b95614"
PLATFORM_BYTES = 64492044


def android_jar(explicit=None):
    candidates = [explicit, os.environ.get("ANDROID_JAR")]
    for name in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        root = os.environ.get(name)
        if root:
            candidates.extend(sorted(Path(root).glob("platforms/*/android.jar"), reverse=True))
    candidates.append(ARTIFACTS / "android-sdk/android.jar")
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            path = Path(candidate).resolve()
            with zipfile.ZipFile(path) as source:
                if "android/app/Activity.class" not in source.namelist():
                    raise ValueError("Invalid Android framework JAR: " + str(path))
            return path
    if explicit or os.environ.get("ANDROID_JAR"):
        raise FileNotFoundError("Configured ANDROID_JAR does not exist")
    # Download/extract only the compile-time framework JAR, without installing an SDK.
    directory = ARTIFACTS / "android-sdk"
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / "platform-35-ext15_r01.zip"
    if not archive.exists():
        with urllib.request.urlopen(PLATFORM_URL, timeout=60) as response:
            data = response.read(PLATFORM_BYTES + 1)
        if len(data) != PLATFORM_BYTES or hashlib.sha1(data).hexdigest() != PLATFORM_SHA1:
            raise ValueError("Android platform checksum mismatch")
        archive.write_bytes(data)
    data = archive.read_bytes()
    if len(data) != PLATFORM_BYTES or hashlib.sha1(data).hexdigest() != PLATFORM_SHA1:
        raise ValueError("Android platform checksum mismatch")
    target = directory / "android.jar"
    with zipfile.ZipFile(archive) as source:
        matches = [name for name in source.namelist() if name.endswith("/android.jar")]
        if len(matches) != 1:
            raise ValueError("Ambiguous Android framework JAR")
        target.write_bytes(source.read(matches[0]))
    return target.resolve()


def build_android_aar(library, framework=None):
    sources = sorted((PLUGIN / "native-src/android").glob("*.java"))
    if len(sources) != 7:
        raise ValueError("Expected all seven canonical QBar Java sources")
    compiler = os.environ.get("QBAR_JAVAC")
    java_home = os.environ.get("JAVA_HOME")
    if not compiler and java_home:
        candidate = Path(java_home) / "bin" / ("javac.exe" if os.name == "nt" else "javac")
        if candidate.is_file():
            compiler = str(candidate)
    compiler = compiler or shutil.which("javac")
    if not compiler:
        raise RuntimeError("JDK javac required to build the native library classes")
    framework = android_jar(framework)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="android-aar-", dir=ARTIFACTS) as temporary:
        classes = Path(temporary) / "classes"
        classes.mkdir()
        subprocess.run([compiler, "-encoding", "UTF-8", "--release", "8", "-proc:none",
                        "-classpath", str(framework), "-d", str(classes), *map(str, sources)], check=True)
        bytecode = BytesIO()
        with zipfile.ZipFile(bytecode, "w", zipfile.ZIP_DEFLATED) as output:
            for path in sorted(classes.rglob("*.class")):
                output.write(path, path.relative_to(classes).as_posix())
        aar = PLUGIN / "utssdk/app-android/libs/qbar-native.aar"
        aar.parent.mkdir(parents=True, exist_ok=True)
        # Build then replace; a compiler failure must not overwrite the last complete AAR.
        pending = Path(temporary) / "qbar-native.aar"
        with zipfile.ZipFile(pending, "w", zipfile.ZIP_DEFLATED) as output:
            output.writestr("classes.jar", bytecode.getvalue())
            output.write(library, "jni/arm64-v8a/libwechatQrMod.so")
            output.write(PLUGIN / "utssdk/app-android/AndroidManifest.xml", "AndroidManifest.xml")
            output.writestr("proguard.txt", "-keep class com.tencent.qbar.** { *; }\n-keep class ftx.qbar.** { *; }\n")
        validate_android_aar(pending)
        staged = aar.with_suffix(".aar.tmp")
        shutil.copyfile(pending, staged)
        os.replace(staged, aar)
    return aar


def validate_android_aar(path):
    with zipfile.ZipFile(path) as archive:
        required_entries = {"classes.jar", "AndroidManifest.xml", "proguard.txt", "jni/arm64-v8a/libwechatQrMod.so"}
        if not required_entries <= set(archive.namelist()):
            raise ValueError("Incomplete QBar AAR: missing " + str(sorted(required_entries - set(archive.namelist()))))
        with zipfile.ZipFile(BytesIO(archive.read("classes.jar"))) as bytecode:
            names = set(bytecode.namelist())
            required = {"ftx/qbar/GeneratedCodeDecoder.class", "ftx/qbar/ScannerActivity.class", "ftx/qbar/ScanEngine.class", "ftx/qbar/ScanPreview.class", "ftx/qbar/ScanPreview$Guide.class",
                        "ftx/qbar/ScanGeometry.class", "ftx/qbar/ScanGeometry$Frame.class", "ftx/qbar/ScanGeometry$AutoZoom.class", "ftx/qbar/ScanGeometry$Candidate.class",
                        "com/tencent/qbar/QbarNative.class", "com/tencent/qbar/WxQbarNative.class",
                        "com/tencent/qbar/QbarNative$QBarResultJNI.class",
                        "com/tencent/qbar/QbarNative$QbarAiModelParam.class",
                        "com/tencent/qbar/QbarNative$QBarCodeDetectInfo.class",
                        "com/tencent/qbar/QbarNative$QBarPoint.class",
                        "com/tencent/qbar/QbarNative$QBarReportMsg.class",
                        "com/tencent/qbar/QbarNative$QBarZoomInfo.class",
                        "com/tencent/qbar/WxQbarNative$QBarReportMsg.class"}
            if not required <= names:
                raise ValueError("AAR missing scanner/JNI classes: " + str(sorted(required - names)))
            if any(not bytecode.read(name).startswith(b"\xca\xfe\xba\xbe") for name in names if name.endswith(".class")):
                raise ValueError("Invalid Java class in AAR")
        if archive.read("jni/arm64-v8a/libwechatQrMod.so")[:4] != b"\x7fELF":
            raise ValueError("AAR missing ELF native library")
        manifest = archive.read("AndroidManifest.xml")
        if b'ftx.qbar.ScannerActivity' not in manifest:
            raise ValueError("AAR missing scanner activity manifest")
        if b"-keep class com.tencent.qbar.**" not in archive.read("proguard.txt"):
            raise ValueError("AAR missing JNI keep rules")
    return names
