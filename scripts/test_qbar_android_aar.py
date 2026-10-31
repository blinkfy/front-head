"""Regression for the native-only AAR that crashed the hot-loaded Kotlin bridge."""
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
import zipfile

from qbar_android_aar import ARTIFACTS, PLUGIN, validate_android_aar


class QbarAarTests(unittest.TestCase):
    def test_generated_aar_has_all_java_classes_native_library_manifest_and_keep_rules(self):
        aar = PLUGIN / "utssdk/app-android/libs/qbar-native.aar"
        names = validate_android_aar(aar)
        self.assertNotIn("ftx/qbar/ScannerActivity$ResultCallback.class", names)
        with zipfile.ZipFile(aar) as archive:
            with zipfile.ZipFile(BytesIO(archive.read("classes.jar"))) as classes:
                scanner = classes.read("ftx/qbar/ScannerActivity.class")
                self.assertIn(b"android/webkit/ValueCallback", scanner)
                self.assertIn(b"isScanActive", scanner)
                generated = classes.read("ftx/qbar/GeneratedCodeDecoder.class")
                self.assertIn(b"android/webkit/ValueCallback", generated)
                self.assertIn(b"INVALID_IMAGE", generated)
                self.assertIn(b"WRONG_CODE_TYPE", generated)

    def test_previous_native_only_aar_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="aar-regression-", dir=ARTIFACTS) as temporary:
            broken = Path(temporary) / "broken.aar"
            with zipfile.ZipFile(broken, "w") as archive:
                archive.writestr("jni/arm64-v8a/libwechatQrMod.so", b"\x7fELF")
                archive.writestr("AndroidManifest.xml", "<manifest/>")
                archive.writestr("proguard.txt", "-keep class com.tencent.qbar.** { *; }")
            with self.assertRaisesRegex(ValueError, "classes.jar"):
                validate_android_aar(broken)

    def test_incomplete_classes_jar_is_rejected(self):
        aar = PLUGIN / "utssdk/app-android/libs/qbar-native.aar"
        with tempfile.TemporaryDirectory(prefix="aar-regression-", dir=ARTIFACTS) as temporary:
            broken = Path(temporary) / "broken.aar"
            bytecode = BytesIO()
            with zipfile.ZipFile(bytecode, "w") as classes:
                classes.writestr("ftx/qbar/ScannerActivity.class", b"\xca\xfe\xba\xbe")
            with zipfile.ZipFile(aar) as source, zipfile.ZipFile(broken, "w") as target:
                for entry in source.namelist():
                    target.writestr(entry, bytecode.getvalue() if entry == "classes.jar" else source.read(entry))
            with self.assertRaisesRegex(ValueError, "missing scanner/JNI classes"):
                validate_android_aar(broken)

    def test_java_sources_do_not_shadow_the_aar(self):
        self.assertEqual(list((PLUGIN / "utssdk/app-android").glob("*.java")), [])
        self.assertEqual(len(list((PLUGIN / "native-src/android").glob("*.java"))), 7)


if __name__ == "__main__":
    unittest.main(verbosity=2)
