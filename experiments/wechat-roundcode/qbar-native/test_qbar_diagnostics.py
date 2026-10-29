"""Isolated probes for optional QBar diagnostic JNI accessors.

Run after the cached Maven compile with: python test_qbar_diagnostics.py
Each image is run in its own unidbg process so a native fault is contained.
Only status, type/length/hash and detector geometry are emitted.
"""
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
LIBRARY = LAB / "artifacts/vendor/sollyu-wechat-scanner/library/src/main/jniLibs/arm64-v8a/libwechatQrMod.so"
INPUTS = LAB / "artifacts/native-tests"
JAVA = os.environ.get("QBAR_JAVA") or shutil.which("java")
CLASSPATH = str(LAB / "target/classes") + os.pathsep + (LAB / "artifacts/classpath.txt").read_text().strip()


def prepare_inputs():
    INPUTS.mkdir(parents=True, exist_ok=True)
    qr = cv2.imread(str(INPUTS / "standard-qr.png"), cv2.IMREAD_GRAYSCALE)
    if qr is None:
        raise RuntimeError("Run test_native.py once to create standard-qr.png")
    small = cv2.resize(qr, (48, 48), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (3, 3), 0.7)
    cv2.imwrite(str(INPUTS / "diagnostic-small-blur.png"), small)
    return [
        ("standard-qr", INPUTS / "standard-qr.png"),
        ("round-code", INPUTS / "round-original.png"),
        ("small-blurred-qr", INPUTS / "diagnostic-small-blur.png"),
        ("blank", INPUTS / "blank.png"),
    ]


class QbarDiagnosticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not JAVA:
            raise RuntimeError("Java not found; set QBAR_JAVA")
        cls.cases = prepare_inputs()
        cls.reports = []

    def test_diagnostic_apis_in_isolated_processes(self):
        for case, image in self.cases:
            with self.subTest(case=case):
                process = subprocess.run([
                    JAVA, "-Dorg.slf4j.simpleLogger.defaultLogLevel=warn", "-cp", CLASSPATH,
                    "lab.QbarProbe", str(LIBRARY), str(image), "diagnostics",
                ], cwd=LAB, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
                output = process.stdout.decode("utf-8", errors="replace")
                (INPUTS / ("diagnostic-" + case + ".log")).write_text(output, encoding="utf-8")
                self.assertEqual(process.returncode, 0, output[-3000:])
                lines = [line for line in output.splitlines() if line.startswith("NATIVE_DIAGNOSTIC_JSON ")]
                self.assertEqual(len(lines), 1, output[-3000:])
                report = json.loads(lines[0].removeprefix("NATIVE_DIAGNOSTIC_JSON "))
                if case == "small-blurred-qr":
                    self.assertEqual(report["decodedCount"], 0, "small blurred probe must exercise detection before successful decode")
                report["case"] = case
                self.reports.append(report)
                print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        # Exercise the optional detector flag without model files in another
        # isolated process; this cannot affect the production configuration.
        process = subprocess.run([
            JAVA, "-Dqbar.enableDet=true", "-Dorg.slf4j.simpleLogger.defaultLogLevel=warn", "-cp", CLASSPATH,
            "lab.QbarProbe", str(LIBRARY), str(INPUTS / "standard-qr.png"), "diagnostics",
        ], cwd=LAB, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
        output = process.stdout.decode("utf-8", errors="replace")
        (INPUTS / "diagnostic-det-enabled-no-model.log").write_text(output, encoding="utf-8")
        self.assertEqual(process.returncode, 0, output[-3000:])
        lines = [line for line in output.splitlines() if line.startswith("NATIVE_DIAGNOSTIC_JSON ")]
        self.assertEqual(len(lines), 1, output[-3000:])
        report = json.loads(lines[0].removeprefix("NATIVE_DIAGNOSTIC_JSON "))
        report["case"] = "standard-qr-det-enabled-no-model"
        print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    unittest.main(verbosity=2)
