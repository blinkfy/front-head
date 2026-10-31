"""Prepare Android native dependencies only; no server Java runtime. Does not build or sign an APP/APK."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from qbar_android_aar import build_android_aar

FRONT = Path(__file__).resolve().parents[1]
LAB = FRONT / "experiments/wechat-roundcode/qbar-native"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--android-only", action="store_true", help="Compatibility option; preparation is always Android-only")
    parser.add_argument("--android-jar", help="Use an existing Android SDK android.jar")
    args = parser.parse_args()
    subprocess.run([sys.executable, str(LAB / "prepare.py"), "--android-only"], cwd=LAB, check=True)
    manifest = json.loads((LAB / "vendor-manifest.json").read_text(encoding="utf-8"))
    item = next(item for item in manifest["files"] if item["path"].endswith("/libwechatQrMod.so"))
    library = LAB / item["local_path"]
    if hashlib.sha256(library.read_bytes()).hexdigest() != item["sha256"]:
        raise RuntimeError("QBar checksum mismatch")
    build_android_aar(library, args.android_jar)
    print("Prepared complete Android AAR (classes.jar, native library, manifest, keep rules); no APP/APK built.")


if __name__ == "__main__":
    main()
