"""Focused offline regression tests for the pure-Java QBar geometry helper.

Run ordinary math/warp checks with:
    python scripts/test_qbar_geometry.py

Add slower native probes for three synthetic distortions with:
    python scripts/test_qbar_geometry.py --native

The optional mode emits only result type/length and a match status; it never
prints or stores decoded payloads.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
HELPER = ROOT / "src/uni_modules/ftx-qbar/native-src/android/ScanGeometry.java"
LAB = ROOT / "experiments/wechat-roundcode/qbar-native"
ARTIFACTS = LAB / "artifacts/geometry-tests"
CLASSES = ARTIFACTS / "classes"
HARNESS = ARTIFACTS / "GeometryHarness.java"
SAMPLE = PROJECT / "smartBin/device-simulator/qr.jpg"
LIBRARY = LAB / "artifacts/vendor/sollyu-wechat-scanner/library/src/main/jniLibs/arm64-v8a/libwechatQrMod.so"
MAX_EDGE = 960
NATIVE_CALL_TIMEOUT_SECONDS = 20
NATIVE_TOTAL_BUDGET_SECONDS = 180
CONTROL = "fentouxia-qbar-geometry:control-20261026"
CASE_NAMES = (
    "flatten-0.6x", "shear-0.25", "perspective-mild",
    "perspective-trapezoid-15", "perspective-diagonal-10",
    "distance-far-0.4x", "distance-near-1.4x",
)


HARNESS_SOURCE = r'''package ftx.qbar;

import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public final class GeometryHarness {
    private static void require(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
    }

    private static ScanGeometry.Frame warp(byte[] gray, int width, int height, int candidate, int maxEdge) {
        ScanGeometry.Frame frame = ScanGeometry.warp(gray, width, height, candidate, maxEdge);
        require(frame != null && frame.gray != null, "candidate " + candidate + " returned no frame");
        require(frame.width > 0 && frame.height > 0, "candidate " + candidate + " returned empty dimensions");
        require(frame.width <= maxEdge && frame.height <= maxEdge, "candidate " + candidate + " exceeded maxEdge");
        require(frame.gray.length == frame.width * frame.height, "candidate " + candidate + " frame size mismatch");
        return frame;
    }

    private static byte[] gray(BufferedImage image) {
        int width = image.getWidth(), height = image.getHeight();
        byte[] pixels = new byte[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >>> 16) & 255, g = (rgb >>> 8) & 255, b = rgb & 255;
                pixels[y * width + x] = (byte) Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }
        }
        return pixels;
    }

    private static void writeWarp(String input, String output, int candidate, int maxEdge) throws Exception {
        BufferedImage image = ImageIO.read(new File(input));
        require(image != null, "unsupported input image");
        int width = image.getWidth(), height = image.getHeight();
        ScanGeometry.Frame frame = warp(gray(image), width, height, candidate, maxEdge);
        BufferedImage result = new BufferedImage(frame.width, frame.height, BufferedImage.TYPE_BYTE_GRAY);
        for (int y = 0; y < frame.height; y++) {
            for (int x = 0; x < frame.width; x++) {
                int v = frame.gray[y * frame.width + x] & 255;
                result.setRGB(x, y, (v << 16) | (v << 8) | v);
            }
        }
        require(ImageIO.write(result, "png", new File(output)), "PNG writer unavailable");
        System.out.println("WARP_OK " + frame.width + "x" + frame.height);
    }

    private static void detectFile(String input) throws Exception {
        BufferedImage image = ImageIO.read(new File(input));
        require(image != null, "unsupported input image");
        ScanGeometry.Candidate candidate = ScanGeometry.detectCandidate(
                gray(image), image.getWidth(), image.getHeight());
        if (candidate == null) {
            System.out.println("DETECT none");
        } else {
            System.out.printf(java.util.Locale.ROOT, "DETECT candidate x=%.5f y=%.5f size=%.5f%n",
                    candidate.x, candidate.y, candidate.size);
        }
    }

    private static void testCameraScore() {
        double mainAf = ScanGeometry.cameraScore(72f, 55f, true);
        double ultraWideAf = ScanGeometry.cameraScore(112f, 92f, true);
        double teleAf = ScanGeometry.cameraScore(30f, 22f, true);
        double mainNoAf = ScanGeometry.cameraScore(72f, 55f, false);
        require(Double.isFinite(mainAf), "camera score must be finite");
        require(mainAf > ultraWideAf, "normal main camera should beat ultra-wide");
        require(mainAf > teleAf, "normal main camera should beat long telephoto");
        require(mainAf > mainNoAf, "autofocus should improve the camera score");
    }

    private static void testPreviewFit() {
        int[] fit = ScanGeometry.fitPreview(1920, 1080, 90, 360, 780);
        require(fit != null && fit.length >= 2, "fitPreview must return width and height");
        int width = fit[0], height = fit[1];
        require(width > 0 && height > 0, "fitPreview returned empty dimensions");
        require(width <= 360 && height <= 780, "portrait preview exceeds its container");
        double expectedAspect = 1080.0 / 1920.0;
        require(Math.abs(width / (double) height - expectedAspect) < 0.01,
                "portrait preview was not fitted with its rotated aspect ratio");
    }

    private static void expectZoom(float actual, float expected, String message) {
        require(!Float.isNaN(actual) && Math.abs(actual - expected) < 0.001f,
                message + " (expected " + expected + ", got " + actual + ")");
    }

    private static ScanGeometry.Candidate candidate(float x, float y, float size) {
        return new ScanGeometry.Candidate(x, y, size);
    }

    private static float next(ScanGeometry.AutoZoom zoom, long now, float maxZoom,
                              float actualZoom, ScanGeometry.Candidate candidate, boolean decoded) {
        return zoom.next(now, maxZoom, actualZoom, candidate, decoded);
    }

    private static void testAutoZoom() {
        ScanGeometry.AutoZoom zoom = new ScanGeometry.AutoZoom();
        ScanGeometry.Candidate small = candidate(0.50f, 0.50f, 0.20f);

        // Missing, large, off-center, or decoded candidates must never blind-zoom.
        zoom.reset(0L);
        for (long now = 2000L; now <= 12000L; now += 1500L) {
            require(Float.isNaN(next(zoom, now, 3f, 1f, null, false)),
                    "auto zoom advanced without a detected candidate");
        }
        zoom.reset(0L);
        ScanGeometry.Candidate large = candidate(0.50f, 0.50f, 0.32f);
        ScanGeometry.Candidate offCenter = candidate(0.22f, 0.50f, 0.18f);
        for (int i = 0; i < 3; i++) {
            long now = 2000L + i * 500L;
            require(Float.isNaN(next(zoom, now, 3f, 1f, large, false)), "large candidate triggered zoom");
            require(Float.isNaN(next(zoom, now, 3f, 1f, offCenter, false)), "off-center candidate triggered zoom");
            require(Float.isNaN(next(zoom, now, 3f, 1f, small, true)), "decoded candidate triggered zoom");
        }

        // Three consecutive small, centered, stable candidates are required.
        zoom.reset(0L);
        require(Float.isNaN(next(zoom, 2000L, 3f, 1f, small, false)), "one candidate was enough to zoom");
        require(Float.isNaN(next(zoom, 2500L, 3f, 1f, small, false)), "two candidates were enough to zoom");
        float first = next(zoom, 3000L, 3f, 1f, small, false);
        require(first > 1f && first <= 1.25f, "first zoom step exceeded the 1.25x step bound");
        require(Float.isNaN(next(zoom, 3500L, 3f, first, small, false)),
                "zoom changed before the 1300ms step interval");
        require(Float.isNaN(next(zoom, 4000L, 3f, first, small, false)),
                "zoom changed before the 1300ms step interval");
        require(Float.isNaN(next(zoom, 4299L, 3f, first, small, false)), "zoom changed before 1300ms");
        float second = next(zoom, 4300L, 3f, first, small, false);
        require(second > first && second <= first * 1.25f && second <= 3f,
                "subsequent zoom step exceeded its bounds");

        // A >0.06 center drift, >40% size swing, or >1200ms gap breaks stability.
        zoom.reset(0L);
        next(zoom, 2000L, 3f, 1f, small, false);
        next(zoom, 2500L, 3f, 1f, candidate(0.57f, 0.50f, 0.20f), false);
        require(Float.isNaN(next(zoom, 3000L, 3f, 1f, candidate(0.57f, 0.50f, 0.20f), false)),
                "center drift did not reset stable-candidate count");
        zoom.reset(0L);
        next(zoom, 2000L, 3f, 1f, candidate(0.50f, 0.50f, 0.15f), false);
        next(zoom, 2500L, 3f, 1f, candidate(0.50f, 0.50f, 0.23f), false);
        require(Float.isNaN(next(zoom, 3000L, 3f, 1f, candidate(0.50f, 0.50f, 0.23f), false)),
                "size swing did not reset stable-candidate count");
        zoom.reset(0L);
        next(zoom, 2000L, 3f, 1f, small, false);
        next(zoom, 3201L, 3f, 1f, small, false);
        require(Float.isNaN(next(zoom, 3300L, 3f, 1f, small, false)),
                "candidate gap over 1200ms did not reset stable count");

        // Detection defers zoom; manual mode wins through defer and reset restores automation.
        zoom.reset(0L);
        next(zoom, 2000L, 3f, 1f, small, false);
        next(zoom, 2500L, 3f, 1f, small, false);
        require(Float.isNaN(next(zoom, 3000L, 3f, 1f, small, true)), "decoded candidate was not deferred");
        require(Float.isNaN(next(zoom, 4799L, 3f, 1f, small, false)), "decoded pause ended before 1800ms");

        zoom.manual();
        require(zoom.isManual(), "manual mode was not recorded");
        zoom.defer(5000L);
        require(zoom.isManual(), "defer incorrectly cleared manual mode");
        for (long now = 6000L; now <= 10000L; now += 1300L) {
            require(Float.isNaN(next(zoom, now, 3f, 1f, small, false)), "manual mode was overridden");
        }
        zoom.reset(20000L);
        require(!zoom.isManual(), "reset did not clear manual mode");
        require(Float.isNaN(next(zoom, 21799L, 3f, 1f, null, false)), "reset did not restore initial delay");
        require(Float.isNaN(next(zoom, 21800L, 3f, 1f, small, false)), "reset allowed zoom with one candidate");
        next(zoom, 22300L, 3f, 1f, small, false);
        float afterReset = next(zoom, 22800L, 3f, 1f, small, false);
        require(afterReset > 1f && afterReset <= 1.25f, "reset did not restore automatic zoom");

        // Respect hardware maximum and never advance above 3x or currentZoom * 1.25.
        zoom.reset(0L);
        next(zoom, 2000L, 2.6f, 2.5f, small, false);
        next(zoom, 2500L, 2.6f, 2.5f, small, false);
        float bounded = next(zoom, 3000L, 2.6f, 2.5f, small, false);
        require(bounded > 2.5f && bounded <= 2.6f && bounded <= 3f && bounded <= 2.5f * 1.25f,
                "automatic zoom exceeded hardware or 3x bound");

        zoom.reset(0L);
        for (float invalid : new float[]{1.05f, Float.NaN, Float.POSITIVE_INFINITY, 0f}) {
            require(Float.isNaN(next(zoom, 5000L, invalid, 1f, small, false)),
                    "invalid or low hardware maximum should disable auto zoom");
        }
    }

    private static void testRetryAndWarps() {
        require(ScanGeometry.RETRY_COUNT == 12, "expected twelve bounded candidates");
        final int width = 128, height = 96, maxEdge = 256;
        byte[] white = new byte[width * height];
        java.util.Arrays.fill(white, (byte) 255);
        byte[] marked = white.clone();
        int[] markerValues = {0, 64, 128, 192};
        int block = 12;
        for (int y = 0; y < block; y++) for (int x = 0; x < block; x++) {
            marked[y * width + x] = (byte) markerValues[0];
            marked[y * width + (width - block + x)] = (byte) markerValues[1];
            marked[(height - block + y) * width + x] = (byte) markerValues[2];
            marked[(height - block + y) * width + (width - block + x)] = (byte) markerValues[3];
        }
        for (int candidate = 0; candidate < ScanGeometry.RETRY_COUNT; candidate++) {
            ScanGeometry.Frame blank = warp(white, width, height, candidate, maxEdge);
            for (byte pixel : blank.gray) require((pixel & 255) == 255,
                    "candidate " + candidate + " introduced dark pixels into a white frame");
            ScanGeometry.Frame frame = warp(marked, width, height, candidate, maxEdge);
            for (int value : markerValues) {
                int count = 0;
                for (byte pixel : frame.gray) if (Math.abs((pixel & 255) - value) <= 18) count++;
                require(count >= 8, "candidate " + candidate + " clipped a marked corner");
            }
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length > 0 && "detect".equals(args[0])) {
            if (args.length != 2) throw new IllegalArgumentException("detect input.png");
            detectFile(args[1]);
            return;
        }
        if (args.length > 0 && "warp".equals(args[0])) {
            if (args.length != 5) throw new IllegalArgumentException("warp input output candidate maxEdge");
            writeWarp(args[1], args[2], Integer.parseInt(args[3]), Integer.parseInt(args[4]));
            return;
        }
        testCameraScore();
        testPreviewFit();
        testAutoZoom();
        testRetryAndWarps();
        System.out.println("GEOMETRY_OK cameraScore fitPreview AutoZoom RETRY_COUNT=12 warpCandidates=12");
    }
}
'''


class GeometryError(RuntimeError):
    pass


def find_tool(name: str, executable: str) -> str:
    java_home = os.environ.get("JAVA_HOME")
    candidates = []
    if java_home:
        candidates.append(Path(java_home) / "bin" / executable)
    candidates.extend([Path("D:/Java_SE/bin") / executable])
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    found = shutil.which(name)
    if found:
        return found
    raise GeometryError(f"{name} not found; set JAVA_HOME or add it to PATH")


def run_checked(command: list[str], *, timeout: int, cwd: Path = ROOT) -> str:
    try:
        result = subprocess.run(command, cwd=cwd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise GeometryError(f"command timed out after {timeout}s: {Path(command[0]).name}") from error
    if result.returncode:
        tail = "\n".join(result.stdout.splitlines()[-20:])
        raise GeometryError(f"{Path(command[0]).name} failed ({result.returncode}):\n{tail}")
    return result.stdout


def compile_harness() -> tuple[str, str]:
    if not HELPER.is_file():
        raise GeometryError(f"ScanGeometry.java is not ready: {HELPER}")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    CLASSES.mkdir(parents=True, exist_ok=True)
    HARNESS.write_text(HARNESS_SOURCE, encoding="utf-8", newline="\n")
    javac = find_tool("javac", "javac.exe")
    java = find_tool("java", "java.exe")
    run_checked([javac, "-encoding", "UTF-8", "--release", "8", "-d", str(CLASSES),
                 str(HELPER), str(HARNESS)], timeout=60)
    return java, javac


def run_geometry(java: str) -> None:
    output = run_checked([java, "-cp", str(CLASSES), "ftx.qbar.GeometryHarness"], timeout=30)
    if "GEOMETRY_OK cameraScore fitPreview AutoZoom RETRY_COUNT=12 warpCandidates=12" not in output:
        raise GeometryError("geometry harness did not report success")
    print("PASS Java geometry: cameraScore, portrait fit, AutoZoom timing/manual policy, 12 bounded warp candidates")
    run_detection_tests(java)


def detect_candidate(java: str, image_path: Path) -> tuple[float, float, float] | None:
    output = run_checked([java, "-cp", str(CLASSES), "ftx.qbar.GeometryHarness", "detect",
                          str(image_path)], timeout=15)
    line = next((line for line in output.splitlines() if line.startswith("DETECT ")), None)
    if line == "DETECT none":
        return None
    if not line or not line.startswith("DETECT candidate "):
        raise GeometryError("candidate detector returned an unexpected result")
    try:
        values = dict(token.split("=", 1) for token in line.split()[2:])
        return float(values["x"]), float(values["y"]), float(values["size"])
    except (KeyError, ValueError) as error:
        raise GeometryError("candidate detector returned malformed coordinates") from error


def run_detection_tests(java: str) -> None:
    try:
        import cv2
        import numpy as np
    except ImportError as error:
        raise GeometryError("candidate detector checks require cv2 and numpy") from error

    out = ARTIFACTS / "detect-cases"
    out.mkdir(parents=True, exist_ok=True)

    def save(name: str, image) -> Path:
        path = out / f"{name}.png"
        if not cv2.imwrite(str(path), image):
            raise GeometryError(f"could not write {name} detector fixture")
        return path

    def qr_image(payload: str, edge: int):
        raw = cv2.QRCodeEncoder_create().encode(payload)
        raw = cv2.copyMakeBorder(raw, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
        return cv2.resize(raw, (edge, edge), interpolation=cv2.INTER_NEAREST)

    def centered(canvas_size: int, code):
        canvas = np.full((canvas_size, canvas_size), 255, dtype=np.uint8)
        height, width = code.shape[:2]
        x, y = (canvas_size - width) // 2, (canvas_size - height) // 2
        canvas[y:y + height, x:x + width] = code
        return canvas

    qr = centered(320, qr_image("geometry-candidate-control", 80))
    qr_candidate = detect_candidate(java, save("qr-small-centered", qr))
    if qr_candidate is None:
        raise GeometryError("three-locator candidate detector missed a small centered QR")
    x, y, size = qr_candidate
    if not (0.42 <= x <= 0.58 and 0.42 <= y <= 0.58 and 0.12 <= size <= 0.38):
        raise GeometryError(f"small QR candidate geometry out of range: x={x:.3f} y={y:.3f} size={size:.3f}")
    print(f"PASS candidate QR x={x:.3f} y={y:.3f} size={size:.3f}")

    if not SAMPLE.is_file():
        raise GeometryError("existing round-code sample is missing")
    round_image = cv2.imdecode(np.frombuffer(SAMPLE.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if round_image is None:
        raise GeometryError("could not read existing round-code sample")
    canvas_size = 512
    h, w = round_image.shape[:2]
    scale = 0.24 * canvas_size / max(h, w)
    reduced = cv2.resize(round_image, (max(1, round(w * scale)), max(1, round(h * scale))),
                         interpolation=cv2.INTER_AREA)
    round_canvas = np.full((canvas_size, canvas_size, 3), 255, dtype=np.uint8)
    rh, rw = reduced.shape[:2]
    rx, ry = (canvas_size - rw) // 2, (canvas_size - rh) // 2
    round_canvas[ry:ry + rh, rx:rx + rw] = reduced
    round_candidate = detect_candidate(java, save("roundcode-small-centered", round_canvas))
    if round_candidate is None:
        raise GeometryError("three-locator detector missed the small centered round-code sample")
    x, y, size = round_candidate
    if not (0.40 <= x <= 0.60 and 0.40 <= y <= 0.60 and 0.08 <= size <= 0.36):
        raise GeometryError(f"round-code candidate geometry out of range: x={x:.3f} y={y:.3f} size={size:.3f}")
    print(f"PASS candidate round-code x={x:.3f} y={y:.3f} size={size:.3f}")

    blank = np.full((320, 320), 255, dtype=np.uint8)
    stripes = np.full((320, 320), 255, dtype=np.uint8)
    for x0 in range(0, 320, 16):
        if (x0 // 16) % 2 == 0:
            stripes[:, x0:x0 + 8] = 0
    checker = np.full((320, 320), 255, dtype=np.uint8)
    cell = 16
    for y0 in range(0, 320, cell):
        for x0 in range(0, 320, cell):
            if ((x0 // cell) + (y0 // cell)) % 2 == 0:
                checker[y0:y0 + cell, x0:x0 + cell] = 0
    text = np.full((320, 320), 255, dtype=np.uint8)
    cv2.putText(text, "WECHAT PAY 12345", (24, 170), cv2.FONT_HERSHEY_SIMPLEX,
                0.9, 0, 2, cv2.LINE_AA)
    for name, image in (("blank", blank), ("stripes", stripes), ("checkerboard", checker), ("text", text)):
        if detect_candidate(java, save(f"negative-{name}", image)) is not None:
            raise GeometryError(f"three-locator detector produced a false candidate on {name}")

    left, right = qr_image("left-code", 58), qr_image("right-code", 58)
    pair = np.full((320, 320), 255, dtype=np.uint8)
    pair[131:189, 85:143] = left
    pair[131:189, 177:235] = right
    if detect_candidate(java, save("two-centered-codes", pair)) is not None:
        raise GeometryError("candidate detector auto-selected one of two nearby codes")
    print("PASS coarse candidate detection: centered small QR/round-code size estimates; blank, patterns, text, and double-code rejected")


def native_paths() -> tuple[str, str]:
    if not SAMPLE.is_file() or not LIBRARY.is_file():
        raise GeometryError("native sample or pinned libwechatQrMod.so is missing")
    classpath_file = LAB / "artifacts/classpath.txt"
    if not classpath_file.is_file() or not (LAB / "target/classes/lab/QbarProbe.class").is_file():
        raise GeometryError("native QbarProbe is not prepared; prepare the existing qbar-native lab first")
    java = os.environ.get("QBAR_JAVA") or shutil.which("java")
    if not java:
        java = find_tool("java", "java.exe")
    classpath = str(LAB / "target/classes") + os.pathsep + classpath_file.read_text(encoding="utf-8").strip()
    return java, classpath


def probe_native(java: str, classpath: str, image_path: Path, deadline: float) -> list[dict]:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise GeometryError("native mode reached its total time budget")
    timeout = min(NATIVE_CALL_TIMEOUT_SECONDS, max(1, math.ceil(remaining)))
    try:
        process = subprocess.run(
            [java, "-Dorg.slf4j.simpleLogger.defaultLogLevel=warn", "-cp", classpath,
             "lab.QbarProbe", str(LIBRARY), str(image_path), "modern"],
            cwd=LAB, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired as error:
        raise GeometryError(f"native probe timed out after {timeout}s") from error
    if process.returncode:
        raise GeometryError(f"native probe failed with exit code {process.returncode}")
    lines = [line for line in process.stdout.splitlines() if line.startswith("NATIVE_RESULT_JSON ")]
    if len(lines) != 1:
        raise GeometryError("native probe did not return one structured result")
    try:
        return json.loads(lines[0].removeprefix("NATIVE_RESULT_JSON ")).get("results", [])
    except (ValueError, AttributeError) as error:
        raise GeometryError("native probe result was not valid JSON") from error


def transform_inputs(cv2, np, image):
    height, width = image.shape[:2]

    flat = cv2.resize(image, (max(1, round(width * 0.6)), height), interpolation=cv2.INTER_AREA)
    flat = cv2.copyMakeBorder(flat, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=(255, 255, 255))

    shear = 0.25
    shift = round(shear * height)
    shear_matrix = np.float32([[1.0, shear, max(0, -shift)], [0.0, 1.0, 0.0]])
    skew = cv2.warpAffine(image, shear_matrix, (width + abs(shift), height),
                          flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
                          borderValue=(255, 255, 255))
    skew = cv2.copyMakeBorder(skew, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=(255, 255, 255))

    pad = max(12, round(min(width, height) * 0.08))
    padded = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    ph, pw = padded.shape[:2]
    source = np.float32([[0, 0], [pw - 1, 0], [pw - 1, ph - 1], [0, ph - 1]])
    target = np.float32([
        [0.04 * pw, 0.02 * ph], [0.96 * pw, 0.07 * ph],
        [0.98 * pw, 0.96 * ph], [0.02 * pw, 0.91 * ph],
    ])
    perspective = cv2.getPerspectiveTransform(source, target)
    warped = cv2.warpPerspective(padded, perspective, (pw, ph), flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))

    # Both projective transforms map every source corner into the output canvas;
    # the 12px white margin keeps the whole original image away from the edge.
    pad = max(16, round(min(width, height) * 0.08))
    padded = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    ph, pw = padded.shape[:2]
    source = np.float32([[0, 0], [pw - 1, 0], [pw - 1, ph - 1], [0, ph - 1]])
    trapezoid_target = np.float32([
        [0.15 * (pw - 1), 0], [0.85 * (pw - 1), 0],
        [pw - 1, ph - 1], [0, ph - 1],
    ])
    trapezoid = cv2.warpPerspective(
        padded, cv2.getPerspectiveTransform(source, trapezoid_target), (pw, ph),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )
    diagonal_target = np.float32([
        [0.10 * (pw - 1), 0.02 * (ph - 1)],
        [0.98 * (pw - 1), 0.10 * (ph - 1)],
        [0.90 * (pw - 1), 0.98 * (ph - 1)],
        [0.02 * (pw - 1), 0.90 * (ph - 1)],
    ])
    diagonal = cv2.warpPerspective(
        padded, cv2.getPerspectiveTransform(source, diagonal_target), (pw, ph),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255),
    )

    far_width, far_height = max(1, round(width * 0.4)), max(1, round(height * 0.4))
    far_small = cv2.resize(image, (far_width, far_height), interpolation=cv2.INTER_AREA)
    far = np.full_like(image, 255)
    far_x, far_y = (width - far_width) // 2, (height - far_height) // 2
    far[far_y:far_y + far_height, far_x:far_x + far_width] = far_small

    near_width, near_height = round(width * 1.4), round(height * 1.4)
    near_large = cv2.resize(image, (near_width, near_height), interpolation=cv2.INTER_CUBIC)
    near = np.full((near_height, near_width, image.shape[2]), 255, dtype=image.dtype)
    near_x, near_y = (near_width - near_large.shape[1]) // 2, (near_height - near_large.shape[0]) // 2
    near[near_y:near_y + near_large.shape[0], near_x:near_x + near_large.shape[1]] = near_large

    return {
        "flatten-0.6x": flat,
        "shear-0.25": skew,
        "perspective-mild": warped,
        "perspective-trapezoid-15": trapezoid,
        "perspective-diagonal-10": diagonal,
        "distance-far-0.4x": far,
        "distance-near-1.4x": near,
    }


def is_expected_decode(results: list[dict], baseline_hash: str) -> bool:
    return (len(results) == 1 and results[0].get("type") == "WX_CODE"
            and results[0].get("rawSha256") == baseline_hash)


def native_check(java: str, classpath: str, geometry_java: str, selected_cases: list[str] | None) -> None:
    try:
        import cv2
        import numpy as np
    except ImportError as error:
        raise GeometryError("native mode requires cv2 and numpy") from error

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    native_dir = ARTIFACTS / "native"
    native_dir.mkdir(parents=True, exist_ok=True)
    image = cv2.imdecode(np.frombuffer(SAMPLE.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise GeometryError("could not read the existing round-code sample")

    deadline = time.monotonic() + NATIVE_TOTAL_BUDGET_SECONDS
    baseline_path = native_dir / "baseline.png"
    if not cv2.imwrite(str(baseline_path), image):
        raise GeometryError("could not write native baseline image")
    baseline = probe_native(java, classpath, baseline_path, deadline)
    if len(baseline) != 1 or baseline[0].get("type") != "WX_CODE" or not baseline[0].get("rawSha256"):
        raise GeometryError("native baseline did not decode as one WX_CODE")
    reference_hash = baseline[0]["rawSha256"]
    print(f"PASS native baseline: WX_CODE length={baseline[0].get('rawLength')} reference fingerprint kept in memory")

    if not selected_cases:
        control = cv2.QRCodeEncoder_create().encode(CONTROL)
        control = cv2.copyMakeBorder(control, 4, 4, 4, 4, cv2.BORDER_CONSTANT, value=255)
        control = cv2.resize(control, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
        control_path = native_dir / "standard-qr-control.png"
        if not cv2.imwrite(str(control_path), control):
            raise GeometryError("could not write standard QR control")
        control_results = probe_native(java, classpath, control_path, deadline)
        if (len(control_results) != 1 or control_results[0].get("type") != "QR_CODE"
                or control_results[0].get("rawLength") != len(CONTROL.encode())
                or control_results[0].get("rawSha256") != hashlib.sha256(CONTROL.encode()).hexdigest()):
            raise GeometryError("standard QR control did not decode with the expected QR_CODE result")
        print(f"PASS native control: QR_CODE length={control_results[0].get('rawLength')}")

        blank_path = native_dir / "blank-control.png"
        blank = np.full((430, 430), 255, dtype=np.uint8)
        if not cv2.imwrite(str(blank_path), blank):
            raise GeometryError("could not write blank control")
        if probe_native(java, classpath, blank_path, deadline):
            raise GeometryError("blank control unexpectedly produced a result")
        print("PASS native control: blank returned no results")

    transforms = transform_inputs(cv2, np, image)
    if selected_cases:
        transforms = {name: transforms[name] for name in selected_cases}
    for name, distorted in transforms.items():
        input_path = native_dir / f"{name}.png"
        if not cv2.imwrite(str(input_path), distorted):
            raise GeometryError(f"could not write synthetic {name} image")
        direct = probe_native(java, classpath, input_path, deadline)
        if is_expected_decode(direct, reference_hash):
            print(f"PASS {name}: direct WX_CODE length={direct[0].get('rawLength')} payload-consistent")
            continue

        matched = False
        for candidate in range(12):
            corrected_path = native_dir / f"{name}-candidate-{candidate}.png"
            run_checked([geometry_java, "-cp", str(CLASSES), "ftx.qbar.GeometryHarness", "warp",
                         str(input_path), str(corrected_path), str(candidate), str(MAX_EDGE)], timeout=15)
            result = probe_native(java, classpath, corrected_path, deadline)
            if is_expected_decode(result, reference_hash):
                print(f"PASS {name}: candidate={candidate} WX_CODE length={result[0].get('rawLength')} payload-consistent")
                matched = True
                break
        if not matched:
            raise GeometryError(f"{name} did not recover the sample result in at most 12 candidates")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", action="store_true", help="also try bounded native geometry recoveries")
    parser.add_argument("--case", action="append", choices=CASE_NAMES,
                        help="limit --native to this transform; may be repeated")
    args = parser.parse_args()
    if args.case and not args.native:
        parser.error("--case requires --native")
    try:
        java, _ = compile_harness()
        run_geometry(java)
        if args.native:
            native_java, classpath = native_paths()
            native_check(native_java, classpath, java, args.case)
    except GeometryError as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
