"""Offline JNI smoke tests; no credentials, backend requests or app changes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

import cv2
import numpy as np

LAB = Path(__file__).resolve().parent
PROJECT = LAB.parents[3]
CONTROL = "fentouxia-qbar-lab:control-20261026"
LIBRARY = LAB / "artifacts/vendor/sollyu-wechat-scanner/library/src/main/jniLibs/arm64-v8a/libwechatQrMod.so"
SAMPLE = PROJECT / "smartBin/device-simulator/qr.jpg"


class NativeProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = []
        cls.output = LAB / "artifacts/native-tests"
        cls.output.mkdir(parents=True, exist_ok=True)
        java = os.environ.get("QBAR_JAVA") or shutil.which("java")
        if not java:
            raise RuntimeError("Java not found; set QBAR_JAVA")
        cls.java = java
        cls.classpath = str(LAB / "target/classes") + os.pathsep + (LAB / "artifacts/classpath.txt").read_text().strip()

    @classmethod
    def tearDownClass(cls):
        (cls.output / "report.json").write_text(json.dumps({
            "testCases": cls.records,
            "scope": "Desktop ARM64/JNI emulation, not APP camera or scene resolution",
            "sampleSha256": hashlib.sha256(SAMPLE.read_bytes()).hexdigest(),
            "sceneDecoded": False,
            "appIntegrated": False,
        }, indent=2) + "\n", encoding="utf-8")

    def probe(self, name, image):
        path = self.output / (name + ".png")
        self.assertTrue(cv2.imwrite(str(path), image))
        process = subprocess.run([
            self.java, "-Dorg.slf4j.simpleLogger.defaultLogLevel=warn", "-cp", self.classpath,
            "lab.QbarProbe", str(LIBRARY), str(path), "modern",
        ], cwd=LAB, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
        output = process.stdout.decode("utf-8", errors="replace")
        (self.output / (name + ".log")).write_text(output, encoding="utf-8")
        self.assertEqual(process.returncode, 0, output[-2500:])
        lines = [line for line in output.splitlines() if line.startswith("NATIVE_RESULT_JSON ")]
        self.assertEqual(len(lines), 1, output[-2500:])
        report = json.loads(lines[0].removeprefix("NATIVE_RESULT_JSON "))
        report["case"] = name
        self.records.append(report)
        return report["results"]

    def test_standard_qr_control(self):
        image = cv2.QRCodeEncoder_create().encode(CONTROL)
        image = cv2.copyMakeBorder(image, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
        image = cv2.resize(image, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
        results = self.probe("standard-qr", image)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["type"], "QR_CODE")
        self.assertEqual(results[0]["rawLength"], len(CONTROL.encode()))
        self.assertEqual(results[0]["rawSha256"], hashlib.sha256(CONTROL.encode()).hexdigest())

    def test_roundcode_and_variants(self):
        image = cv2.imdecode(np.frombuffer(SAMPLE.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        self.assertIsNotNone(image)
        variants = {
            "round-original": image,
            "round-rotate90": cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE),
            "round-blur": cv2.GaussianBlur(image, (3, 3), 0.7),
            "round-scale70": cv2.resize(image, None, fx=0.7, fy=0.7, interpolation=cv2.INTER_AREA),
        }
        baseline = None
        for name, variant in variants.items():
            with self.subTest(case=name):
                results = self.probe(name, variant)
                self.assertEqual(len(results), 1)
                self.assertEqual(results[0]["type"], "WX_CODE")
                if baseline is None:
                    baseline = results[0]["rawSha256"]
                self.assertEqual(results[0]["rawSha256"], baseline)
                self.assertGreater(results[0]["rawLength"], 0)

    def test_blank_negative(self):
        self.assertEqual(self.probe("blank", np.full((430, 430), 255, dtype=np.uint8)), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
