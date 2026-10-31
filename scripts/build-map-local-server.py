"""Build the Android local map service AAR without downloading or installing an SDK."""
from io import BytesIO
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

FRONT = Path(__file__).resolve().parents[1]
PLUGIN = FRONT / "src/uni_modules/ftx-map-local-server"
ANDROID_JAR = FRONT / "experiments/wechat-roundcode/qbar-native/artifacts/android-sdk/android.jar"
SOURCES = [
    PLUGIN / "native-src/android/LoopbackMapServer.java",
    PLUGIN / "native-src/android/AndroidMapAssetService.java",
]


def compiler_path():
    compiler = os.environ.get("MAP_SERVER_JAVAC")
    java_home = os.environ.get("JAVA_HOME")
    if not compiler and java_home:
        candidate = Path(java_home) / "bin" / ("javac.exe" if os.name == "nt" else "javac")
        if candidate.is_file():
            compiler = str(candidate)
    compiler = compiler or shutil.which("javac")
    if not compiler:
        raise RuntimeError("JDK javac required to build the map service AAR")
    return compiler


def build():
    missing = [str(path) for path in [*SOURCES, ANDROID_JAR] if not path.is_file()]
    if missing:
        raise FileNotFoundError("Required build inputs are missing: " + ", ".join(missing))
    aar = PLUGIN / "utssdk/app-android/libs/ftx-map-local-server.aar"
    with tempfile.TemporaryDirectory(prefix="map-server-aar-") as temporary:
        temporary = Path(temporary)
        classes = temporary / "classes"
        classes.mkdir()
        subprocess.run([
            compiler_path(), "-encoding", "UTF-8", "-source", "8", "-target", "8",
            "-proc:none", "-classpath", str(ANDROID_JAR), "-d", str(classes),
            *map(str, SOURCES),
        ], check=True)
        classes_jar = BytesIO()
        with zipfile.ZipFile(classes_jar, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(classes.rglob("*.class")):
                archive.write(path, path.relative_to(classes).as_posix())

        staged = temporary / aar.name
        with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("classes.jar", classes_jar.getvalue())
            archive.write(PLUGIN / "utssdk/app-android/AndroidManifest.xml", "AndroidManifest.xml")
            archive.write(PLUGIN / "utssdk/app-android/res/xml/ftx_map_network_security.xml",
                          "res/xml/ftx_map_network_security.xml")
            archive.writestr("proguard.txt", "-keep class ftx.map.** { *; }\n")
        validate(staged)
        aar.parent.mkdir(parents=True, exist_ok=True)
        pending = aar.with_suffix(".aar.tmp")
        shutil.copyfile(staged, pending)
        os.replace(pending, aar)
    return aar


def validate(path):
    with zipfile.ZipFile(path) as archive:
        required = {
            "classes.jar", "AndroidManifest.xml", "proguard.txt",
            "res/xml/ftx_map_network_security.xml",
        }
        if not required.issubset(archive.namelist()):
            raise ValueError("Incomplete map service AAR")
        with zipfile.ZipFile(BytesIO(archive.read("classes.jar"))) as classes:
            names = set(classes.namelist())
            expected = {
                "ftx/map/LoopbackMapServer.class",
                "ftx/map/LoopbackMapServer$Resources.class",
                "ftx/map/AndroidMapAssetService.class",
            }
            if not expected.issubset(names):
                raise ValueError("AAR is missing required map service classes")
            if any(not classes.read(name).startswith(b"\xca\xfe\xba\xbe")
                   for name in names if name.endswith(".class")):
                raise ValueError("Invalid Java class in map service AAR")
        manifest = archive.read("AndroidManifest.xml")
        if b"android.permission.INTERNET" not in manifest:
            raise ValueError("Map service AAR must declare INTERNET")
        if b"android.permission.CAMERA" in manifest:
            raise ValueError("Unexpected runtime permission in map service AAR")
        if b'android:networkSecurityConfig="@xml/ftx_map_network_security"' not in manifest:
            raise ValueError("AAR manifest must reference its loopback network security config")
        if b"usesCleartextTraffic" in manifest:
            raise ValueError("AAR must not enable cleartext traffic globally")
        security = archive.read("res/xml/ftx_map_network_security.xml")
        if (b"<base-config" in security or b"127.0.0.1" not in security
                or b'cleartextTrafficPermitted="true"' not in security):
            raise ValueError("Network security config must allow cleartext only for 127.0.0.1")
    return True


if __name__ == "__main__":
    output = build()
    print(f"Built {output} ({output.stat().st_size} bytes)")
