"""Repeatable real-image acceptance for the local round-code decoders.

Run with the Python environment that has Pillow, psutil, and qrcode installed.
The script never prints decoded payload contents.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import psutil
import qrcode
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
EXPECTED_RAW_SHA256 = "d5e20e90cabd57722a973f268b2a86af49dfb7ce9dfb4b3e5ca62599b74eb183"
DEFAULT_HELPER = Path(__file__).with_name("roundcode_decoder.py")
SIMULATOR_HELPER = ROOT / "smartBin" / "device-simulator" / "roundcode_decoder.py"
SOURCE_IMAGE = ROOT / "smartBin" / "device-simulator" / "qr.jpg"


def save_image(image: Image.Image, image_format: str) -> bytes:
    output = io.BytesIO()
    image.save(output, format=image_format, quality=95)
    return output.getvalue()


def invoke(helper: Path, image: bytes, mime: str) -> tuple[int, dict, float, int, int]:
    request = json.dumps({
        "imageBase64": base64.b64encode(image).decode("ascii"),
        "mime": mime,
    }).encode("utf-8")
    started = time.perf_counter()
    process = subprocess.Popen(
        [sys.executable, str(helper), "--stdin-json"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    child = psutil.Process(process.pid)
    peak_rss = 0
    assert process.stdin is not None
    process.stdin.write(request)
    process.stdin.close()
    while process.poll() is None:
        try:
            peak_rss = max(peak_rss, child.memory_info().rss)
        except psutil.Error:
            pass
        time.sleep(0.01)
    try:
        peak_rss = max(peak_rss, child.memory_info().rss)
    except psutil.Error:
        pass
    assert process.stdout is not None and process.stderr is not None
    stdout = process.stdout.read()
    stderr = process.stderr.read()
    elapsed = time.perf_counter() - started
    result = json.loads(stdout.decode("utf-8"))
    if len(stdout.splitlines()) != 1:
        raise AssertionError(f"{helper.name} emitted non-JSON stdout")
    if stderr:
        raise AssertionError(f"{helper.name} wrote {len(stderr)} stderr bytes")
    return process.returncode, result, elapsed, peak_rss, len(stdout)


def raw_hash(result: dict) -> str | None:
    encoded = result.get("rawBase64")
    if not isinstance(encoded, str):
        return None
    return hashlib.sha256(base64.b64decode(encoded, validate=True)).hexdigest()


def check_case(name: str, helper: Path, image: bytes, mime: str, expect_round: bool) -> dict:
    code, result, elapsed, peak_rss, stdout_bytes = invoke(helper, image, mime)
    digest = raw_hash(result)
    passed = (
        code == 0
        and result.get("scanType") == "WX_CODE"
        and digest == EXPECTED_RAW_SHA256
        if expect_round
        else result.get("scanType") != "WX_CODE" and digest is None
    )
    report = {
        "case": name,
        "exit": code,
        "scanType": result.get("scanType"),
        "raw_sha256": digest,
        "expected_hash_match": digest == EXPECTED_RAW_SHA256,
        "elapsed_s": round(elapsed, 3),
        "peak_rss_mib": round(peak_rss / (1024 * 1024), 2),
        "stdout_bytes": stdout_bytes,
        "passed": passed,
    }
    print(json.dumps(report, ensure_ascii=False))
    if not passed:
        raise AssertionError(f"acceptance failed: {name}")
    return report


def check_registration(image: bytes) -> None:
    sys.path.insert(0, str(ROOT / "front-head"))
    from scripts import roundcode_client

    task = {
        "id": "rq_" + "1" * 24,
        "ticket": "2" * 64,
        "expiresAt": int(time.time() * 1000) + 600_000,
    }
    header = base64.urlsafe_b64encode(
        json.dumps(task, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")

    class GeneratedResponse:
        headers = {"X-Round-Code-Task": header, "Content-Type": "image/jpeg"}
        content = image

    class PostResponse:
        status_code = 200

        @staticmethod
        def json() -> dict:
            return {"code": 0, "data": {"registered": True}}

    posted: list[dict] = []

    def post(url: str, **kwargs) -> PostResponse:
        posted.append({"url": url, "body": kwargs.get("json")})
        return PostResponse()

    os.environ.pop("FTX_ROUNDCODE_DECODER", None)
    os.environ.pop("FTX_ROUNDCODE_ENABLED", None)
    started = time.perf_counter()
    registered = roundcode_client.register_generated(
        GeneratedResponse(), "http://localhost:3000", post
    )
    elapsed = time.perf_counter() - started
    body = posted[0]["body"] if len(posted) == 1 else {}
    digest = raw_hash({"rawBase64": body.get("rawBase64")})
    passed = (
        registered
        and roundcode_client.decoder_command() == [
            sys.executable, str(DEFAULT_HELPER), "--stdin-json"
        ]
        and len(posted) == 1
        and posted[0]["url"].endswith("/api/device/wechat-qr/register-generated")
        and set(body) == {"taskId", "ticket", "rawBase64"}
        and body.get("taskId") == task["id"]
        and body.get("ticket") == task["ticket"]
        and digest == EXPECTED_RAW_SHA256
    )
    print(json.dumps({
        "case": "mock_register_generated",
        "registered": registered,
        "default_decoder_selected": roundcode_client.decoder_command() is not None,
        "post_count": len(posted),
        "posted_keys": sorted(body),
        "raw_sha256": digest,
        "expected_hash_match": digest == EXPECTED_RAW_SHA256,
        "elapsed_s": round(elapsed, 3),
        "passed": passed,
    }, ensure_ascii=False))
    if not passed:
        raise AssertionError("acceptance failed: mock registration")


def main() -> None:
    source = SOURCE_IMAGE.read_bytes()
    if sys.argv[1:] == ["--registration-only"]:
        check_registration(source)
        return
    if sys.argv[1:]:
        raise SystemExit("Usage: verify_roundcode_decoder.py [--registration-only]")
    original = Image.open(io.BytesIO(source)).convert("RGB")
    cases = [
        ("original", source, "image/jpeg", True),
        ("rotate90", save_image(original.rotate(90, expand=True), "JPEG"), "image/jpeg", True),
        ("slight_blur", save_image(original.filter(ImageFilter.GaussianBlur(0.55)), "JPEG"), "image/jpeg", True),
        ("resize70", save_image(original.resize((round(original.width * .7), round(original.height * .7)), Image.Resampling.LANCZOS), "JPEG"), "image/jpeg", True),
        ("blank", save_image(Image.new("RGB", (480, 480), "white"), "JPEG"), "image/jpeg", False),
    ]
    qr = qrcode.make("https://example.invalid/ordinary-qr-test")
    qr_output = io.BytesIO()
    qr.save(qr_output, format="PNG")
    cases.append(("ordinary_qr", qr_output.getvalue(), "image/png", False))

    for name, image, mime, expect_round in cases:
        check_case(name, DEFAULT_HELPER, image, mime, expect_round)
    check_case("simulator_original", SIMULATOR_HELPER, source, "image/jpeg", True)
    check_registration(source)
    print(json.dumps({"summary": "all acceptance checks passed"}))


if __name__ == "__main__":
    main()
