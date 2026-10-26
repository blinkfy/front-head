"""Prepare native dependencies/runtime only. Does not build or sign an APP/APK."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from qbar_android_aar import build_android_aar

FRONT = Path(__file__).resolve().parents[1]
LAB = FRONT / "experiments/wechat-roundcode/qbar-native"
DEST = FRONT.parent / "back-end/native/qbar"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--android-only", action="store_true", help="Rebuild only the Android dependency AAR")
    parser.add_argument("--android-jar", help="Use an existing Android SDK android.jar")
    args = parser.parse_args()
    subprocess.run([sys.executable, str(LAB / "prepare.py")], cwd=LAB, check=True)
    manifest = json.loads((LAB / "vendor-manifest.json").read_text(encoding="utf-8"))
    item = next(item for item in manifest["files"] if item["path"].endswith("/libwechatQrMod.so"))
    library = LAB / item["local_path"]
    if hashlib.sha256(library.read_bytes()).hexdigest() != item["sha256"]:
        raise RuntimeError("QBar checksum mismatch")
    if not args.android_only:
        tools = LAB / "artifacts/tools/apache-maven-3.9.9/bin"
        command = [str(tools / "mvn.cmd")] if os.name == "nt" else ["sh", str(tools / "mvn")]
        subprocess.run(command + ["-s", "maven-settings.xml", "-gs", "maven-settings.xml",
                                 "-Dmaven.repo.local=" + str(LAB / "artifacts/m2"), "-B", "-q",
                                 "compile", "dependency:build-classpath", "-Dmdep.outputFile=artifacts/classpath.txt"], cwd=LAB, check=True)
        DEST.mkdir(parents=True, exist_ok=True)
        shutil.copy2(library, DEST / "libwechatQrMod.so")
        shutil.copytree(LAB / "target/classes", DEST / "classes", dirs_exist_ok=True)
        (DEST / "jars").mkdir(exist_ok=True)
        for entry in (LAB / "artifacts/classpath.txt").read_text().strip().split(os.pathsep):
            path = Path(entry)
            shutil.copy2(path, DEST / "jars" / path.name)
    build_android_aar(library, args.android_jar)
    print("Prepared complete Android AAR (classes.jar, native library, manifest, keep rules); no APP/APK built.")


if __name__ == "__main__":
    main()
