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
import java.util.Arrays;
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
        byte[] pixels = gray(image);
        byte[] original = pixels.clone();
        ScanGeometry.Candidate candidate = ScanGeometry.detectCandidate(
                pixels, image.getWidth(), image.getHeight());
        require(Arrays.equals(pixels, original), "detectCandidate modified input pixels");
        if (candidate == null) {
            System.out.println("DETECT none");
        } else {
            System.out.printf(java.util.Locale.ROOT, "DETECT candidate x=%.5f y=%.5f size=%.5f%n",
                    candidate.x, candidate.y, candidate.size);
        }
    }

    private static void testLighting() {
        byte[] flat = new byte[96 * 96]; Arrays.fill(flat, (byte) 42);
        require(ScanGeometry.lightLevel(flat, 96, 96) == 42, "dark-frame brightness incorrect");
        Arrays.fill(flat, (byte) 255);
        for (int y = 24; y < 72; y++) for (int x = 24; x < 72; x++) flat[y * 96 + x] = 30;
        require(ScanGeometry.lightLevel(flat, 96, 96) == 30, "frame border biased guide brightness");
        require(ScanGeometry.lightLevel(null, 96, 96) == -1, "invalid frame brightness accepted");
        ScanGeometry.ExposureControl control = new ScanGeometry.ExposureControl(); control.reset(0);
        require(Float.isNaN(control.next(30, 100)), "single dark frame changed exposure");
        require(Float.isNaN(control.next(30, 500)), "two dark frames changed exposure");
        require(Float.isNaN(control.next(30, 1000)), "startup cooldown ignored");
        require(Float.isNaN(control.next(30, 2000)), "startup cooldown ignored");
        require(control.next(30, 3000) == 0.5f, "stable darkness did not request half-stop correction");
        require(Float.isNaN(control.next(30, 3400)), "exposure kept accumulating in darkness");
        require(Float.isNaN(control.next(80, 3800)), "hysteresis did not hold correction");
        require(Float.isNaN(control.next(130, 4100)), "single bright frame reset exposure");
        require(Float.isNaN(control.next(130, 4500)), "two bright frames reset exposure");
        require(Float.isNaN(control.next(130, 5000)), "correction cooldown ignored");
        require(control.next(130, 6000) == 0f, "stable normal light did not restore baseline");
        control.reset(7000);
        control.next(30, 10000); control.next(30, 10400);
        require(Float.isNaN(control.next(-1, 10800)), "invalid brightness changed exposure");
        require(Float.isNaN(control.next(30, 11000)), "invalid brightness failed to break evidence");
        require(Float.isNaN(control.next(30, 14000)), "stale dark observation was reused");
        require(ScanGeometry.exposureIndex(0, -4, 4, 0.333333f, 0.5f) == 1, "half-stop rounded up beyond cap");
        require(ScanGeometry.exposureIndex(0, -4, 4, 1f, 0.5f) == 0, "coarse device step exceeded half-stop");
        require(ScanGeometry.exposureIndex(2, -4, 2, 0.1f, 0.5f) == 2, "exposure exceeded driver maximum");
        require(ScanGeometry.exposureIndex(-1, -4, 4, 0.1f, 0f) == -1, "baseline was not restored");
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

    private static int[] focus(int x, int y, int width, int height, int rotation) {
        return ScanGeometry.focusArea(x, y, width, height, rotation);
    }

    private static void assertFocusRect(int[] rect, int expectedCenterX, int expectedCenterY, String label) {
        require(rect != null && rect.length == 4, label + " did not return a rectangle");
        require(rect[0] >= -1000 && rect[1] >= -1000 && rect[2] <= 1000 && rect[3] <= 1000,
                label + " exceeded Camera1 coordinate bounds");
        require(rect[2] - rect[0] == 240 && rect[3] - rect[1] == 240,
                label + " did not preserve the fixed 240x240 focus area");
        int centerX = (rect[0] + rect[2]) / 2;
        int centerY = (rect[1] + rect[3]) / 2;
        require(Math.abs(centerX - expectedCenterX) <= 3 && Math.abs(centerY - expectedCenterY) <= 3,
                label + " center mismatch: " + centerX + "," + centerY);
    }

    private static void testFocusArea() {
        final int width = 400, height = 800;
        for (int rotation : new int[]{0, 90, 180, 270}) {
            assertFocusRect(focus(width / 2, height / 2, width, height, rotation), 0, 0,
                    "center tap rotation=" + rotation);
        }

        assertFocusRect(focus(0, 0, width, height, 0), -880, -880, "top-left edge clamp");
        assertFocusRect(focus(width - 1, 0, width, height, 0), 880, -880, "top-right edge clamp");
        assertFocusRect(focus(0, height - 1, width, height, 0), -880, 880, "bottom-left edge clamp");
        assertFocusRect(focus(width - 1, height - 1, width, height, 0), 880, 880,
                "bottom-right edge clamp");

        assertFocusRect(focus(width / 2, height / 4, width, height, 90), -500, 0,
                "rotation 90 top-to-left mapping");
        assertFocusRect(focus(width / 2, height / 4, width, height, 270), 500, 0,
                "rotation 270 top-to-right mapping");
        assertFocusRect(focus(width * 3 / 4, height / 2, width, height, 90), 0, -500,
                "rotation 90 right-to-top mapping");
        assertFocusRect(focus(width * 3 / 4, height / 2, width, height, 270), 0, 500,
                "rotation 270 right-to-bottom mapping");
        assertFocusRect(focus(0, 0, width, height, 180), 880, 880,
                "rotation 180 corner mapping");

        boolean badViewport = false;
        try { focus(0, 0, 0, height, 0); } catch (IllegalArgumentException expected) { badViewport = true; }
        require(badViewport, "non-positive viewport should throw IllegalArgumentException");
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
        ScanGeometry.Candidate medium = candidate(0.50f, 0.50f, 0.20f);
        ScanGeometry.Candidate tiny = candidate(0.50f, 0.50f, 0.03f);

        // No candidate or one instantaneous false positive may start zoom.
        zoom.reset(0L);
        require(Float.isNaN(next(zoom, 599L, 3f, 1f, medium, false)), "auto zoom started before 600ms");
        require(Float.isNaN(next(zoom, 600L, 3f, 1f, null, false)), "missing candidate advanced zoom");
        require(Float.isNaN(next(zoom, 700L, 3f, 1f, medium, false)), "first observation advanced zoom");
        require(Float.isNaN(next(zoom, 900L, 3f, 1f, null, false)), "one-frame false positive triggered zoom");

        // Two observations spanning at least 180ms can quickly drive a small code toward 40%.
        zoom.reset(0L);
        require(Float.isNaN(next(zoom, 600L, 3f, 1f, medium, false)), "one candidate was enough to zoom");
        require(Float.isNaN(next(zoom, 779L, 3f, 1f, medium, false)), "observations under 180ms apart triggered zoom");
        float first = next(zoom, 780L, 3f, 1f, medium, false);
        require(first > 1f && first <= 1.8f, "medium-code step exceeded the 1.8x bound");
        require(first * medium.size >= 0.35f && first * medium.size <= 0.40f,
                "first medium-code step did not move close to the 40% target");

        // A following step is rate-limited to 650ms and remains bounded.
        require(Float.isNaN(next(zoom, 1429L, 3f, first, medium, false)), "zoom changed before 650ms");
        float second = next(zoom, 1430L, 3f, first, medium, false);
        if (!Float.isNaN(second)) {
            require(second > first && second <= first * 1.8f && second <= 3f,
                    "subsequent medium-code step exceeded its bounds");
        }

        // Very small codes can take one 2x step, while the normal 1.8x bound still applies above 12%.
        zoom.reset(0L);
        require(Float.isNaN(next(zoom, 600L, 3f, 1f, tiny, false)), "tiny candidate zoomed after one observation");
        float tinyZoom = next(zoom, 780L, 3f, 1f, tiny, false);
        require(tinyZoom > 1f && tinyZoom <= 2f && tinyZoom * tiny.size <= 0.06f,
                "tiny-code step exceeded its 2x bound");
        zoom.reset(0L);
        float twelvePercent = next(zoom, 780L, 3f, 1f, candidate(0.50f, 0.50f, 0.12f), false);
        require(Float.isNaN(twelvePercent), "one 12% observation advanced zoom");
        twelvePercent = next(zoom, 960L, 3f, 1f, candidate(0.50f, 0.50f, 0.12f), false);
        require(twelvePercent > 1f && twelvePercent <= 1.8f, "12% code exceeded the normal step bound");

        // Candidate size is gated to [2.5%, 36%); edge positions remain inside the centered guide.
        for (float invalidSize : new float[]{0.024f, 0.36f, 0.40f}) {
            zoom.reset(0L);
            next(zoom, 600L, 3f, 1f, candidate(0.50f, 0.50f, invalidSize), false);
            require(Float.isNaN(next(zoom, 780L, 3f, 1f, candidate(0.50f, 0.50f, invalidSize), false)),
                    "candidate outside size gate triggered zoom: " + invalidSize);
        }
        for (float centerX : new float[]{0.35f, 0.65f}) {
            zoom.reset(0L);
            require(Float.isNaN(next(zoom, 600L, 3f, 1f, candidate(centerX, 0.50f, 0.20f), false)),
                    "one boundary candidate advanced zoom");
            require(!Float.isNaN(next(zoom, 780L, 3f, 1f, candidate(centerX, 0.50f, 0.20f), false)),
                    "candidate near centered-guide boundary was rejected");
        }
        for (float centerX : new float[]{0.22f, 0.78f}) {
            zoom.reset(0L);
            next(zoom, 600L, 3f, 1f, candidate(centerX, 0.50f, 0.20f), false);
            require(Float.isNaN(next(zoom, 780L, 3f, 1f, candidate(centerX, 0.50f, 0.20f), false)),
                    "off-center candidate triggered zoom");
        }

        // A near-edge tiny code may use a bounded first step, but every later step
        // must preserve the full projected code inside the visible image.
        zoom.reset(0L);
        ScanGeometry.Candidate edgeTiny = candidate(0.65f, 0.50f, 0.10f);
        next(zoom, 600L, 3f, 1f, edgeTiny, false);
        float edgeFirst = next(zoom, 780L, 3f, 1f, edgeTiny, false);
        require(edgeFirst > 1f && edgeFirst <= 2f, "edge tiny-code step exceeded the 2x bound");
        ScanGeometry.Candidate edgeAfterFirst = ScanGeometry.reprojectCandidate(
                edgeTiny, 1f, edgeFirst, 0.5f, 0.5f);
        require(edgeAfterFirst != null
                && edgeAfterFirst.x - edgeAfterFirst.size / 2f >= 0f
                && edgeAfterFirst.x + edgeAfterFirst.size / 2f <= 1f,
                "first edge zoom clipped the candidate code");
        next(zoom, 1430L, edgeFirst, edgeFirst, edgeAfterFirst, false);
        float edgeSecond = next(zoom, 1610L, edgeFirst, edgeFirst, edgeAfterFirst, false);
        if (!Float.isNaN(edgeSecond)) {
            ScanGeometry.Candidate edgeAfterSecond = ScanGeometry.reprojectCandidate(
                    edgeAfterFirst, edgeFirst, edgeSecond, 0.5f, 0.5f);
            require(edgeAfterSecond != null
                    && edgeAfterSecond.x - edgeAfterSecond.size / 2f >= 0f
                    && edgeAfterSecond.x + edgeAfterSecond.size / 2f <= 1f,
                    "edge zoom step cropped the projected candidate");
            require(edgeSecond <= edgeFirst * 1.8f,
                    "edge zoom step exceeded the normal per-step bound");
        }

        // A location jump breaks the pair; two fresh observations at the new location are needed.
        zoom.reset(0L);
        next(zoom, 600L, 3f, 1f, candidate(0.50f, 0.50f, 0.20f), false);
        require(Float.isNaN(next(zoom, 780L, 3f, 1f, candidate(0.57f, 0.50f, 0.20f), false)),
                "a shifted candidate inherited old stability");
        require(!Float.isNaN(next(zoom, 960L, 3f, 1f, candidate(0.57f, 0.50f, 0.20f), false)),
                "two stable observations after a shift did not restore zoom eligibility");

        // Decode and manual mode still win; reset restores the startup delay and automatic mode.
        zoom.reset(0L);
        next(zoom, 600L, 3f, 1f, medium, false);
        require(Float.isNaN(next(zoom, 780L, 3f, 1f, medium, true)), "decoded candidate was not deferred");
        zoom.manual();
        require(zoom.isManual(), "manual mode was not recorded");
        zoom.defer(1000L);
        for (long now = 2000L; now <= 4000L; now += 650L) {
            require(Float.isNaN(next(zoom, now, 3f, 1f, medium, false)), "manual mode was overridden");
        }
        zoom.reset(5000L);
        require(!zoom.isManual(), "reset did not clear manual mode");
        require(Float.isNaN(next(zoom, 5599L, 3f, 1f, medium, false)), "reset did not restore startup delay");
        next(zoom, 5600L, 3f, 1f, medium, false);
        float afterReset = next(zoom, 5780L, 3f, 1f, medium, false);
        require(afterReset > 1f && afterReset <= 1.8f, "reset did not restore bounded automatic zoom");

        // Respect the hardware maximum and disable invalid zoom ranges.
        zoom.reset(0L);
        next(zoom, 600L, 2.6f, 2.5f, medium, false);
        float bounded = next(zoom, 780L, 2.6f, 2.5f, medium, false);
        require(bounded > 2.5f && bounded <= 2.6f && bounded <= 3f,
                "automatic zoom exceeded hardware or 3x bound");
        zoom.reset(0L);
        for (float invalid : new float[]{1.05f, Float.NaN, Float.POSITIVE_INFINITY, 0f}) {
            require(Float.isNaN(next(zoom, 780L, invalid, 1f, medium, false)),
                    "invalid or low hardware maximum should disable auto zoom");
        }
    }

    private static void testPreviewPoint() {
        final float x = 0.2f, y = 0.7f;
        assertPoint(ScanGeometry.previewPoint(x, y, 0), x, y, "rotation 0");
        assertPoint(ScanGeometry.previewPoint(x, y, 90), y, 1f - x, "rotation 90");
        assertPoint(ScanGeometry.previewPoint(x, y, 180), 1f - x, 1f - y, "rotation 180");
        assertPoint(ScanGeometry.previewPoint(x, y, 270), 1f - y, x, "rotation 270");
    }

    private static void testPreviewSelection() {
        int[][] sizes = {
            {1920, 1080}, {2560, 1440}, {1280, 720}, {1920, 1200},
            {4096, 1080}, {3840, 2160}, {1920, 2161}, {0, 720}, {-1, 480}, null
        };
        int[] selected = ScanGeometry.selectPreview(sizes, 2_500_000);
        require(selected != null && selected.length == 2, "selectPreview returned no size");
        require(selected[0] == 1920 && selected[1] == 1200,
                "selectPreview did not choose the largest valid size under the pixel budget");
        require(ScanGeometry.selectPreview(sizes, 1_000) == null,
                "selectPreview selected an over-budget fallback");
        require(ScanGeometry.selectPreview(null, 2_500_000) == null,
                "selectPreview accepted a missing size list");
        int[][] hdModes = {{1920, 1080}, {2560, 1440}, {3840, 2160}, {4096, 1080}, {4000, 2000}};
        int[] hd = ScanGeometry.selectPreview(hdModes, 8_294_400);
        require(hd != null && hd[0] == 3840 && hd[1] == 2160,
                "selectPreview rejected supported 4K within its exact pixel budget");
        int[] fallback = ScanGeometry.selectPreview(hdModes, 2_073_600);
        require(fallback != null && fallback[0] == 1920 && fallback[1] == 1080,
                "selectPreview did not fall back to 1080p under the lower budget");
    }

    private static void testSampleZoom() {
        final int width = 12, height = 12, ySize = width * height;
        byte[] source = new byte[ySize + ySize / 2];
        for (int i = 0; i < ySize; i++) source[i] = (byte) i;
        java.util.Arrays.fill(source, ySize, source.length, (byte) 250);
        byte[] before = source.clone();
        ScanGeometry.Frame crop = ScanGeometry.sampleZoom(source, width, height, 1.5f, 0f, 1f, 8);
        assertFramePattern(crop, source, width, 8, 8, 0, 4, "sampleZoom bottom-left visible crop");
        require(crop.gray != source, "sampleZoom must own an independent output");
        require(java.util.Arrays.equals(source, before), "sampleZoom mutated its source");

        byte[] flat = new byte[320 * 240];
        java.util.Arrays.fill(flat, (byte) 90);
        byte[] flatBefore = flat.clone();
        ScanGeometry.Frame reduced = ScanGeometry.sampleZoom(flat, 320, 240, 1f, 0.5f, 0.5f, 80);
        require(reduced.width > 0 && reduced.height > 0 && reduced.width <= 80 && reduced.height <= 80,
                "sampleZoom exceeded the output edge bound");
        for (byte pixel : reduced.gray) require((pixel & 255) == 90, "sampleZoom changed uniform downsampled pixels");
        require(java.util.Arrays.equals(flat, flatBefore), "sampleZoom mutated downsampled source pixels");
    }

    private static void testCandidateRegion() {
        final int width = 100, height = 80, span = 26;
        byte[] source = new byte[width * height];
        java.util.Arrays.fill(source, (byte) 255);
        for (int y = 32; y < 48; y++) for (int x = 42; x < 58; x++) source[y * width + x] = 0;
        byte[] before = source.clone();
        ScanGeometry.Frame region = ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f,
                candidate(0.5f, 0.5f, 0.2f), 32);
        require(region != null && region.width == span && region.height == span,
                "candidateRegion did not include the requested symmetric padding");
        assertFramePattern(region, source, width, span, span, 37, 27, "candidateRegion preserved source pixels");
        require(java.util.Arrays.equals(source, before), "candidateRegion mutated its source");

        byte[] edge = new byte[width * height];
        java.util.Arrays.fill(edge, (byte) 255); edge[0] = 0;
        ScanGeometry.Frame corner = ScanGeometry.candidateRegion(edge, width, height, 1f, 0.5f, 0.5f,
                candidate(0f, 0f, 0.2f), 32);
        require(corner != null && corner.width > 0 && corner.height > 0
                && corner.width <= width && corner.height <= height,
                "candidateRegion produced an invalid top-left clipped ROI");
        require((corner.gray[0] & 255) == 0, "candidateRegion clipped the visible corner pixel");

        ScanGeometry.Frame reduced = ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f,
                candidate(0.5f, 0.5f, 0.2f), 12);
        require(reduced.width > 0 && reduced.height > 0 && reduced.width <= 12 && reduced.height <= 12,
                "candidateRegion exceeded the downsample edge bound");
        require(ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f, null, 32) == null,
                "candidateRegion accepted a missing candidate");
        require(ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f,
                candidate(Float.NaN, 0.5f, 0.2f), 32) == null,
                "candidateRegion accepted an invalid candidate");

        ScanGeometry.Frame hdDetail = centeredDetailCandidate(3840, 2160, 2048);
        ScanGeometry.Frame fullHdDetail = centeredDetailCandidate(1920, 1080, 2048);
        require(hdDetail.width == 346 && hdDetail.height == 346
                && fullHdDetail.width == 173 && fullHdDetail.height == 173,
                "native candidate ROI dimensions did not scale with source resolution");
        require(hdDetail.width * 2 == fullHdDetail.width * 4,
                "4K candidate ROI should retain about twice the linear detail and four times the pixels");
        for (int y = 0; y < hdDetail.height; y++) for (int x = 0; x < hdDetail.width - 1; x++) {
            require((hdDetail.gray[y * hdDetail.width + x] & 255)
                    != (hdDetail.gray[y * hdDetail.width + x + 1] & 255),
                    "4K native ROI lost original one-pixel detail");
        }
    }

    private static void testCandidateBoundsAndSelection() {
        int width = 100, height = 80;
        ScanGeometry.Candidate candidate = candidate(0.5f, 0.5f, 0.2f);
        int[] bounds = ScanGeometry.candidateBounds(width, height, 1f, 0.5f, 0.5f, candidate);
        require(java.util.Arrays.equals(bounds, new int[]{37, 27, 26, 26}),
                "candidateBounds did not match candidateRegion sensor ROI");
        byte[] source = new byte[width * height];
        java.util.Arrays.fill(source, (byte) 255);
        ScanGeometry.Frame region = ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f,
                candidate, 32);
        require(region != null && region.width == bounds[2] && region.height == bounds[3],
                "candidateBounds disagreed with candidateRegion dimensions");

        require(ScanGeometry.sameSelectionRegion(null, null), "null/null selection regions should match");
        int[] original = {100, 200, 100, 100};
        require(!ScanGeometry.sameSelectionRegion(null, original)
                && !ScanGeometry.sameSelectionRegion(original, null), "null/non-null selection regions matched");
        require(ScanGeometry.sameSelectionRegion(original, new int[]{104, 196, 100, 100}),
                "selection regions within the max(2, side*4%) offset should match");
        require(!ScanGeometry.sameSelectionRegion(original, new int[]{105, 200, 100, 100}),
                "selection regions beyond the left offset tolerance matched");
        require(!ScanGeometry.sameSelectionRegion(original, new int[]{100, 205, 100, 100}),
                "selection regions beyond the top offset tolerance matched");
        require(!ScanGeometry.sameSelectionRegion(original, new int[]{100, 200, 101, 100}),
                "selection regions with different widths matched");
        require(!ScanGeometry.sameSelectionRegion(original, new int[]{100, 200, 100, 99}),
                "selection regions with different heights matched");

        require(ScanGeometry.freshSelection(100L, 100L), "same-tick selection should be fresh");
        require(ScanGeometry.freshSelection(100L, 450L), "350ms selection boundary should be fresh");
        require(!ScanGeometry.freshSelection(100L, 451L), "351ms selection should be stale");
        require(!ScanGeometry.freshSelection(101L, 100L), "future selection timestamp should be stale");
        require(!ScanGeometry.freshSelection(-1L, 100L), "negative capture time should be stale");
    }

    private static void testReprojectCandidate() {
        ScanGeometry.Candidate original = candidate(0.55f, 0.45f, 0.10f);
        ScanGeometry.Candidate zoomed = ScanGeometry.reprojectCandidate(original, 1f, 2f, 0.35f, 0.65f);
        require(zoomed != null, "reprojectCandidate rejected a valid non-center pivot");
        assertNear(zoomed.x, 0.75f, 0.0001f, "reprojected x");
        assertNear(zoomed.y, 0.25f, 0.0001f, "reprojected y");
        assertNear(zoomed.size, 0.20f, 0.0001f, "reprojected size");
        ScanGeometry.Candidate restored = ScanGeometry.reprojectCandidate(zoomed, 2f, 1f, 0.35f, 0.65f);
        require(restored != null, "reprojectCandidate rejected the reverse mapping");
        assertNear(restored.x, original.x, 0.0001f, "round-trip x");
        assertNear(restored.y, original.y, 0.0001f, "round-trip y");
        assertNear(restored.size, original.size, 0.0001f, "round-trip size");

        for (ScanGeometry.Candidate invalid : new ScanGeometry.Candidate[]{null,
                candidate(Float.NaN, 0.5f, 0.1f), candidate(0.5f, Float.POSITIVE_INFINITY, 0.1f),
                candidate(-0.01f, 0.5f, 0.1f), candidate(1.01f, 0.5f, 0.1f),
                candidate(0.5f, 0.5f, 0f)}) {
            require(ScanGeometry.reprojectCandidate(invalid, 1f, 2f, 0.5f, 0.5f) == null,
                    "reprojectCandidate accepted an invalid candidate");
        }
        for (float[] values : new float[][]{
                {0f, 2f, 0.5f, 0.5f}, {1f, 0f, 0.5f, 0.5f}, {1f, 3.01f, 0.5f, 0.5f},
                {Float.NaN, 2f, 0.5f, 0.5f}, {1f, 2f, Float.NaN, 0.5f}, {1f, 2f, 0.5f, 1.01f}}) {
            require(ScanGeometry.reprojectCandidate(original, values[0], values[1], values[2], values[3]) == null,
                    "reprojectCandidate accepted an invalid zoom or pivot");
        }

        // The same native pixels remain under the candidate ROI after zooming around an off-center pivot.
        final int width = 120, height = 120, ySize = width * height;
        byte[] nv21 = new byte[ySize + ySize / 2];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            nv21[y * width + x] = (byte) ((x * 7 + y * 11) & 255);
        }
        java.util.Arrays.fill(nv21, ySize, nv21.length, (byte) 128);
        byte[] originalGray = java.util.Arrays.copyOf(nv21, ySize);
        ScanGeometry.Frame beforeRegion = ScanGeometry.candidateRegion(originalGray, width, height, 1f, 0.35f, 0.65f,
                original, 100);
        ScanGeometry.Frame cropped = ScanGeometry.sampleZoom(nv21, width, height, 2f, 0.35f, 0.65f, 100);
        require(cropped != null && cropped.width == 60 && cropped.height == 60,
                "sampleZoom returned unexpected physical dimensions");
        ScanGeometry.Frame afterRegion = ScanGeometry.candidateRegion(cropped.gray, cropped.width, cropped.height,
                1f, 0.5f, 0.5f, zoomed, 100);
        require(beforeRegion != null && afterRegion != null
                && Math.abs(beforeRegion.width - afterRegion.width) <= 1
                && Math.abs(beforeRegion.height - afterRegion.height) <= 1,
                "reprojected native ROI changed physical dimensions");
        require(samePixelsWithinOnePixel(beforeRegion, afterRegion),
                "reprojected native ROI moved more than one source pixel");
    }

    private static boolean samePixelsWithinOnePixel(ScanGeometry.Frame first, ScanGeometry.Frame second) {
        int minimum = Math.min(first.gray.length, second.gray.length);
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
            boolean same = true;
            int compared = 0;
            for (int y = 0; y < first.height && same; y++) for (int x = 0; x < first.width; x++) {
                int otherX = x + dx, otherY = y + dy;
                if (otherX < 0 || otherY < 0 || otherX >= second.width || otherY >= second.height) continue;
                compared++;
                if (first.gray[y * first.width + x] != second.gray[otherY * second.width + otherX]) {
                    same = false;
                    break;
                }
            }
            if (same && compared >= minimum * 0.90) return true;
        }
        return false;
    }

    private static void assertNear(float actual, float expected, float tolerance, String label) {
        require(Math.abs(actual - expected) <= tolerance, label + " mismatch: " + actual + " != " + expected);
    }

    private static ScanGeometry.Frame centeredDetailCandidate(int width, int height, int maxEdge) {
        byte[] source = new byte[width * height];
        for (int i = 0; i < source.length; i++) source[i] = (byte) ((i % width) % 2 == 0 ? 0 : 255);
        return ScanGeometry.candidateRegion(source, width, height, 1f, 0.5f, 0.5f,
                candidate(0.5f, 0.5f, 0.1f), maxEdge);
    }

    private static byte[] blurBox(byte[] source, int width, int height) {
        byte[] blurred = new byte[source.length];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int sum = 0, count = 0;
            for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
                int sx = x + dx, sy = y + dy;
                if (sx >= 0 && sx < width && sy >= 0 && sy < height) { sum += source[sy * width + sx] & 255; count++; }
            }
            blurred[y * width + x] = (byte) (sum / count);
        }
        return blurred;
    }

    private static void testClarity() {
        final int width = 80, height = 64;
        byte[] flat = new byte[width * height];
        java.util.Arrays.fill(flat, (byte) 100);
        ScanGeometry.Frame flatFrame = new ScanGeometry.Frame(flat, width, height);
        require(ScanGeometry.clarity(flatFrame) == 0d, "flat frame clarity must be zero");

        byte[] sharp = new byte[width * height];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            sharp[y * width + x] = (byte) ((x / 4) % 2 == 0 ? 0 : 255);
        }
        byte[] sharpBefore = sharp.clone();
        byte[] blurred = blurBox(sharp, width, height);
        double sharpScore = ScanGeometry.clarity(new ScanGeometry.Frame(sharp, width, height));
        double blurredScore = ScanGeometry.clarity(new ScanGeometry.Frame(blurred, width, height));
        require(sharpScore >= 0 && blurredScore >= 0, "clarity score must be nonnegative");
        require(sharpScore > blurredScore, "clarity score did not prefer the sharper pattern");
        require(java.util.Arrays.equals(sharp, sharpBefore), "clarity mutated its source frame");
    }

    private static void testSnapshotGate() {
        ScanGeometry.SnapshotGate gate = new ScanGeometry.SnapshotGate();
        require(!gate.busy(), "snapshot gate starts busy");
        require(gate.start(0L), "first snapshot request was not admitted");
        require(gate.busy(), "snapshot start did not set busy");
        require(!gate.start(1L), "snapshot gate admitted concurrent work");
        gate.finish();
        require(!gate.busy(), "snapshot finish did not clear busy");
        require(!gate.start(11999L), "snapshot cooldown ended before 12 seconds");
        require(gate.start(12000L), "snapshot gate did not reopen after cooldown");
        gate.finish();
        require(gate.start(24000L), "third snapshot request was not admitted");
        gate.finish();
        require(!gate.start(36000L), "snapshot gate exceeded its three-request limit");

        ScanGeometry.SnapshotGate cancelled = new ScanGeometry.SnapshotGate();
        require(cancelled.start(100L), "cancel test first request was not admitted");
        cancelled.cancel();
        require(!cancelled.busy(), "snapshot cancel did not clear busy");
        require(!cancelled.start(101L), "cancel bypassed the cooldown");
        require(cancelled.start(12100L), "cancel reset the cooldown timestamp unexpectedly");
        cancelled.finish();
        require(cancelled.start(24100L), "cancelled request was not counted toward the request cap");
        cancelled.cancel();
        require(!cancelled.start(36100L), "cancel reset the per-instance request count");
    }

    private static void assertPoint(float[] point, float expectedX, float expectedY, String label) {
        require(point != null && point.length == 2, label + " returned no normalized point");
        require(Math.abs(point[0] - expectedX) < 0.0001f && Math.abs(point[1] - expectedY) < 0.0001f,
                label + " mapping mismatch: " + point[0] + "," + point[1]);
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

    private static void testCenterDetail() {
        final int width = 800, height = 600;
        byte[] flat = new byte[width * height];
        java.util.Arrays.fill(flat, (byte) 127);
        byte[] flatBefore = flat.clone();
        for (boolean sharpen : new boolean[]{false, true}) {
            ScanGeometry.Frame frame = ScanGeometry.centerDetail(flat, width, height, sharpen);
            int expected = Math.min(1280, 2 * Math.min(640, (int) Math.floor(Math.min(width, height) * 0.65)));
            require(frame != null && frame.gray != null, "centerDetail returned no frame");
            require(frame.width == expected && frame.height == expected,
                    "centerDetail dimensions mismatch: " + frame.width + "x" + frame.height);
            require(frame.width <= 1280 && frame.height <= 1280, "centerDetail exceeded 1280px bound");
            for (byte pixel : frame.gray) require((pixel & 255) == 127,
                    "centerDetail changed a flat image with sharpen=" + sharpen);
        }
        require(java.util.Arrays.equals(flat, flatBefore), "centerDetail mutated flat source pixels");

        ScanGeometry.Frame maximum = ScanGeometry.centerDetail(new byte[1920 * 1080], 1920, 1080, false);
        require(maximum.width == 1280 && maximum.height == 1280,
                "centerDetail did not cap double-size output at 1280px");

        byte[] patterned = flat.clone();
        patterned[(height / 2) * width + width / 2] = 0;
        byte[] sourceBefore = patterned.clone();
        ScanGeometry.Frame bounded = ScanGeometry.centerDetail(patterned, width, height, false);
        require((bounded.gray[bounded.height / 2 * bounded.width + bounded.width / 2] & 255) == 0,
                "centerDetail did not preserve the centered source detail");
        require(java.util.Arrays.equals(patterned, sourceBefore), "centerDetail mutated source pixels");

        byte[] offCenter = flat.clone();
        offCenter[150 * width + 600] = 0;
        byte[] offCenterBefore = offCenter.clone();
        ScanGeometry.Frame shifted = ScanGeometry.centerDetail(offCenter, width, height, false, 0.75f, 0.25f);
        require(shifted.width == 780 && shifted.height == 780, "off-center detail dimensions changed");
        require((shifted.gray[300 * shifted.width + 390] & 255) == 0,
                "centerDetail did not center on the requested normalized point");
        require(java.util.Arrays.equals(offCenter, offCenterBefore), "off-center detail mutated source pixels");

        byte[] corner = flat.clone();
        corner[0] = 0;
        ScanGeometry.Frame clampedCorner = ScanGeometry.centerDetail(corner, width, height, false, 0f, 0f);
        require((clampedCorner.gray[0] & 255) == 0, "centerDetail did not clamp the crop at the top-left bounds");
        corner[height * width - 1] = 0;
        ScanGeometry.Frame clampedBottomRight = ScanGeometry.centerDetail(corner, width, height, false, 1f, 1f);
        require((clampedBottomRight.gray[(clampedBottomRight.height - 1) * clampedBottomRight.width
                + clampedBottomRight.width - 1] & 255) == 0,
                "centerDetail did not clamp the crop at the bottom-right bounds");

        boolean nullRejected = false;
        try { ScanGeometry.centerDetail(null, width, height, false); }
        catch (IllegalArgumentException expected) { nullRejected = true; }
        require(nullRejected, "centerDetail accepted a null image");
        boolean shortBufferRejected = false;
        try { ScanGeometry.centerDetail(new byte[width * height - 1], width, height, false); }
        catch (IllegalArgumentException expected) { shortBufferRejected = true; }
        require(shortBufferRejected, "centerDetail accepted a short image buffer");
        boolean badDimensionsRejected = false;
        try { ScanGeometry.centerDetail(new byte[1], 0, 1, false); }
        catch (IllegalArgumentException expected) { badDimensionsRejected = true; }
        require(badDimensionsRejected, "centerDetail accepted non-positive dimensions");
    }

    private static void testCropZoom() {
        final int width = 12, height = 12, ySize = width * height;
        byte[] nv21 = new byte[ySize + ySize / 2];
        for (int i = 0; i < ySize; i++) nv21[i] = (byte) i;
        java.util.Arrays.fill(nv21, ySize, nv21.length, (byte) 250);

        ScanGeometry.Frame one = ScanGeometry.cropZoom(nv21, width, height, 1f);
        require(one.width == width && one.height == height, "1x crop dimensions changed");
        require(one.gray != nv21, "1x crop must own an independent copy");
        for (int i = 0; i < ySize; i++) require(one.gray[i] == nv21[i], "1x crop pixel mismatch at " + i);
        byte originalFirst = nv21[0];
        one.gray[0] = (byte) 99;
        require(nv21[0] == originalFirst, "crop mutation changed source buffer");

        assertCropPattern(nv21, width, height, 1.5f, 8, 8, 2, 2);
        assertCropPattern(nv21, width, height, 3f, 4, 4, 4, 4);

        byte[] differentChroma = nv21.clone();
        java.util.Arrays.fill(differentChroma, ySize, differentChroma.length, (byte) 17);
        ScanGeometry.Frame chromaA = ScanGeometry.cropZoom(nv21, width, height, 1.5f);
        ScanGeometry.Frame chromaB = ScanGeometry.cropZoom(differentChroma, width, height, 1.5f);
        require(java.util.Arrays.equals(chromaA.gray, chromaB.gray), "NV21 chroma bytes affected luminance crop");

        ScanGeometry.Frame topLeft = ScanGeometry.cropZoom(nv21, width, height, 1.5f, 0f, 0f);
        assertFramePattern(topLeft, nv21, width, 8, 8, 0, 0, "top-left pivot");
        ScanGeometry.Frame bottomRight = ScanGeometry.cropZoom(nv21, width, height, 1.5f, 1f, 1f);
        assertFramePattern(bottomRight, nv21, width, 8, 8, 4, 4, "bottom-right pivot");
        ScanGeometry.Frame centered = ScanGeometry.cropZoom(nv21, width, height, 1.5f, 0.5f, 0.5f);
        require(java.util.Arrays.equals(centered.gray, chromaA.gray), "explicit center pivot changed default crop");

        final int oddWidth = 13, oddHeight = 11;
        byte[] odd = new byte[oddWidth * oddHeight];
        for (int i = 0; i < odd.length; i++) odd[i] = (byte) i;
        ScanGeometry.Frame oddPivot = ScanGeometry.cropZoom(odd, oddWidth, oddHeight, 2f, 0.5f, 0.5f);
        assertFramePattern(oddPivot, odd, oddWidth, 6, 5, 3, 3, "floor odd-size center pivot");

        for (float invalid : new float[]{Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY, 0.99f, 3.01f}) {
            boolean rejected = false;
            try { ScanGeometry.cropZoom(nv21, width, height, invalid); }
            catch (IllegalArgumentException expected) { rejected = true; }
            require(rejected, "invalid zoom was accepted: " + invalid);
        }
        boolean shortBuffer = false;
        try { ScanGeometry.cropZoom(java.util.Arrays.copyOf(nv21, ySize - 1), width, height, 1.5f); }
        catch (IllegalArgumentException expected) { shortBuffer = true; }
        require(shortBuffer, "short luminance buffer was accepted");

        for (float[] invalidPivot : new float[][]{
                {Float.NaN, 0.5f}, {0.5f, Float.POSITIVE_INFINITY},
                {-0.01f, 0.5f}, {0.5f, 1.01f}}) {
            boolean rejected = false;
            try { ScanGeometry.cropZoom(nv21, width, height, 1.5f, invalidPivot[0], invalidPivot[1]); }
            catch (IllegalArgumentException expected) { rejected = true; }
            require(rejected, "invalid crop pivot was accepted: " + invalidPivot[0] + "," + invalidPivot[1]);
        }
    }

    private static void assertFramePattern(ScanGeometry.Frame frame, byte[] source, int sourceWidth,
                                           int width, int height, int left, int top, String label) {
        require(frame.width == width && frame.height == height, label + " dimensions mismatch");
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            int expected = (top + y) * sourceWidth + left + x;
            require((frame.gray[y * width + x] & 255) == (source[expected] & 255),
                    label + " pixel mismatch at " + x + "," + y);
        }
    }

    private static void assertCropPattern(byte[] source, int width, int height, float zoom,
                                          int cropWidth, int cropHeight, int left, int top) {
        ScanGeometry.Frame frame = ScanGeometry.cropZoom(source, width, height, zoom);
        require(frame.width == cropWidth && frame.height == cropHeight,
                "crop dimensions mismatch at " + zoom + "x: " + frame.width + "x" + frame.height);
        require(frame.gray.length == cropWidth * cropHeight, "crop buffer length mismatch at " + zoom + "x");
        for (int y = 0; y < cropHeight; y++) for (int x = 0; x < cropWidth; x++) {
            int expected = (top + y) * width + left + x;
            require((frame.gray[y * cropWidth + x] & 255) == expected,
                    "center crop pixel mismatch at " + zoom + "x, x=" + x + " y=" + y);
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
        testLighting();
        testCameraScore();
        testPreviewFit();
        testPreviewPoint();
        testPreviewSelection();
        testFocusArea();
        testAutoZoom();
        testCropZoom();
        testSampleZoom();
        testCandidateRegion();
        testCandidateBoundsAndSelection();
        testReprojectCandidate();
        testClarity();
        testSnapshotGate();
        testRetryAndWarps();
        testCenterDetail();
        System.out.println("GEOMETRY_OK cameraScore fitPreview previewPoint selectPreview focusArea AutoZoom cropZoom sampleZoom candidateRegion candidateBounds sameSelectionRegion freshSelection reprojectCandidate clarity SnapshotGate centerDetail RETRY_COUNT=12 warpCandidates=12");
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
    if "GEOMETRY_OK cameraScore fitPreview previewPoint selectPreview focusArea AutoZoom cropZoom sampleZoom candidateRegion candidateBounds sameSelectionRegion freshSelection reprojectCandidate clarity SnapshotGate centerDetail RETRY_COUNT=12 warpCandidates=12" not in output:
        raise GeometryError("geometry harness did not report success")
    print("PASS Java geometry: preview selection/sampling, candidate ROI/bounds, selection freshness, clarity, SnapshotGate, cameraScore, AutoZoom and 12 bounded warps")
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

    # Camera-sized, genuinely small codes should still yield candidates inside AutoZoom's size gate.
    small_qr = qr_image("autozoom-probe", 48)
    for name, edge, blur in (("camera-qr-48", 48, 0), ("camera-qr-60", 60, 0),
                             ("camera-qr-60-blur07", 60, 0.7)):
        camera = np.full((1080, 1920), 255, dtype=np.uint8)
        left, top = (1920 - edge) // 2, (1080 - edge) // 2
        code = small_qr if edge == 48 else qr_image("autozoom-probe", edge)
        camera[top:top + edge, left:left + edge] = code
        if blur:
            camera = cv2.GaussianBlur(camera, (3, 3), blur)
        candidate = detect_candidate(java, save(name, camera))
        if candidate is None:
            raise GeometryError(f"{name} did not produce an AutoZoom candidate")
        x, y, size = candidate
        if not (0.45 <= x <= 0.55 and 0.45 <= y <= 0.55 and 0.025 <= size < 0.04):
            raise GeometryError(f"{name} outside the small-code AutoZoom gate: x={x:.3f} y={y:.3f} size={size:.3f}")
        print(f"PASS {name} AutoZoom candidate x={x:.3f} y={y:.3f} size={size:.3f}")

    if not SAMPLE.is_file():
        raise GeometryError("existing round-code sample is missing")
    round_image = cv2.imdecode(np.frombuffer(SAMPLE.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if round_image is None:
        raise GeometryError("could not read existing round-code sample")

    def camera_round(edge: int, center_x: float = 0.5, blur: float = 0,
                     angle: float = 0, perspective: bool = False, low_contrast: bool = False):
        frame_width, frame_height = 1920, 1080
        source_height, source_width = round_image.shape[:2]
        scale = edge / max(source_width, source_height)
        code = cv2.resize(round_image, (max(1, round(source_width * scale)),
                                       max(1, round(source_height * scale))), interpolation=cv2.INTER_AREA)
        code_height, code_width = code.shape[:2]
        if angle:
            radians = math.radians(angle)
            rotated_width = math.ceil(abs(code_width * math.cos(radians)) + abs(code_height * math.sin(radians)))
            rotated_height = math.ceil(abs(code_height * math.cos(radians)) + abs(code_width * math.sin(radians)))
            matrix = cv2.getRotationMatrix2D((code_width / 2, code_height / 2), angle, 1)
            matrix[0, 2] += (rotated_width - code_width) / 2
            matrix[1, 2] += (rotated_height - code_height) / 2
            code = cv2.warpAffine(code, matrix, (rotated_width, rotated_height), flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
        if perspective:
            source = np.float32([[0, 0], [code_width - 1, 0], [code_width - 1, code_height - 1], [0, code_height - 1]])
            target = np.float32([[0.05 * code_width, 0.02 * code_height],
                                 [0.96 * code_width, 0.07 * code_height],
                                 [0.98 * code_width, 0.96 * code_height],
                                 [0.02 * code_width, 0.92 * code_height]])
            code = cv2.warpPerspective(code, cv2.getPerspectiveTransform(source, target),
                                       (code_width, code_height), flags=cv2.INTER_LINEAR,
                                       borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))
        code_height, code_width = code.shape[:2]
        left = round(center_x * frame_width - code_width / 2)
        top = round(frame_height / 2 - code_height / 2)
        frame = np.full((frame_height, frame_width, 3), 255, dtype=np.uint8)
        frame[top:top + code_height, left:left + code_width] = code
        if blur:
            frame = cv2.GaussianBlur(frame, (3, 3), blur)
        return cv2.convertScaleAbs(frame, alpha=0.55, beta=100) if low_contrast else frame

    # Recover real round-code crops that are offset or mildly blurred, then confirm
    # their mapped full-frame centers and sizes remain AutoZoom eligible.
    for name, edge, center_x, blur in (
            ("camera-round-240-x40", 240, 0.40, 0),
            ("camera-round-240-x60", 240, 0.60, 0),
            ("camera-round-180-blur07", 180, 0.50, 0.7),
            ("camera-round-160-blur07", 160, 0.50, 0.7),
            ("camera-round-160-x35-blur07", 160, 0.35, 0.7),
            ("camera-round-160-x65-blur07", 160, 0.65, 0.7),
            ("camera-round-120-blur07", 120, 0.50, 0.7)):
        candidate = detect_candidate(java, save(name, camera_round(edge, center_x, blur)))
        if candidate is None:
            raise GeometryError(f"{name} did not produce an AutoZoom candidate")
        x, y, size = candidate
        if not (abs(x - center_x) <= 0.03 and abs(y - 0.5) <= 0.03 and 0.025 <= size < 0.28):
            raise GeometryError(f"{name} mapped outside the AutoZoom gate: x={x:.3f} y={y:.3f} size={size:.3f}")
        print(f"PASS {name} AutoZoom candidate x={x:.3f} y={y:.3f} size={size:.3f}")

    for name, options in (
            ("camera-round-120-rot15", {"edge": 120, "angle": 15}),
            ("camera-round-120-low-contrast", {"edge": 120, "low_contrast": True}),
            ("camera-round-160-rot15", {"edge": 160, "angle": 15}),
            ("camera-round-160-perspective", {"edge": 160, "perspective": True})):
        candidate = detect_candidate(java, save(name, camera_round(**options)))
        if candidate is None:
            raise GeometryError(f"{name} did not produce an AutoZoom candidate")
        x, y, size = candidate
        if not (0.46 <= x <= 0.54 and 0.46 <= y <= 0.54 and 0.025 <= size < 0.36):
            raise GeometryError(f"{name} outside the AutoZoom gate: x={x:.3f} y={y:.3f} size={size:.3f}")
        print(f"PASS {name} AutoZoom candidate x={x:.3f} y={y:.3f} size={size:.3f}")

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

    def round_code_frame(width: int, height: int, ratio: float, copies: int = 1):
        edge = round(min(width, height) * ratio)
        scale = edge / max(h, w)
        code = cv2.resize(round_image, (max(1, round(w * scale)), max(1, round(h * scale))),
                          interpolation=cv2.INTER_AREA)
        frame = np.full((height, width, 3), 128, dtype=np.uint8)
        centers = [width // 2] if copies == 1 else [width // 2 - round(edge * 0.65),
                                                     width // 2 + round(edge * 0.65)]
        for center_x in centers:
            left, top = center_x - code.shape[1] // 2, height // 2 - code.shape[0] // 2
            frame[top:top + code.shape[0], left:left + code.shape[1]] = code
        return frame

    rotation_hits = 0
    rotation_misses = 0
    for edge in (120, 160, 240):
        for angle in (-75, -45, -30, -15, 15, 30, 45, 75):
            blur = (0.5 if edge == 120 and abs(angle) == 15 else
                    0.7 if edge == 160 and abs(angle) == 30 else
                    0.5 if edge == 240 and abs(angle) == 45 else 0)
            center_x = (0.40 if edge == 160 and angle == 30 else
                        0.60 if edge == 240 and angle == -45 else 0.50)
            name = f"camera-round-{edge}-rot{angle:+d}"
            candidate = detect_candidate(java, save(name, camera_round(edge, center_x, blur, angle)))
            projected_edge = edge * (abs(math.cos(math.radians(angle))) + abs(math.sin(math.radians(angle))))
            plausible = candidate is not None and abs(candidate[0] - center_x) <= 0.05 \
                and abs(candidate[1] - 0.5) <= 0.05 \
                and edge / 1080 * 0.4 <= candidate[2] <= projected_edge / 1080 * 1.7
            if plausible:
                rotation_hits += 1
                print(f"ROTATION {name} HIT x={candidate[0]:.3f} y={candidate[1]:.3f} size={candidate[2]:.3f}")
            else:
                rotation_misses += 1
                detail = "none" if candidate is None else f"candidate x={candidate[0]:.3f} y={candidate[1]:.3f} size={candidate[2]:.3f}"
                print(f"ROTATION {name} MISS {detail}")
    print(f"ROTATION_SUMMARY hit={rotation_hits} miss={rotation_misses} total={rotation_hits + rotation_misses}")

    for width, height in ((1280, 720), (1920, 1080)):
        for ratio in (0.16, 0.24):
            frame = round_code_frame(width, height, ratio)
            candidate = detect_candidate(java, save(f"roundcode-{width}x{height}-{int(ratio * 100)}pct", frame))
            if candidate is None:
                raise GeometryError(f"round-code candidate missed at {width}x{height}, ratio={ratio:.2f}")
            x, y, size = candidate
            if not (0.46 <= x <= 0.54 and 0.46 <= y <= 0.54):
                raise GeometryError(f"round-code center mapping out of range at {width}x{height}, ratio={ratio:.2f}: x={x:.3f} y={y:.3f}")
            if not (ratio * 0.55 <= size <= min(0.36, ratio * 1.45)):
                raise GeometryError(f"round-code size mapping out of range at {width}x{height}, ratio={ratio:.2f}: size={size:.3f}")

        blank_frame = np.full((height, width, 3), 128, dtype=np.uint8)
        if detect_candidate(java, save(f"roundcode-blank-{width}x{height}", blank_frame)) is not None:
            raise GeometryError(f"high-resolution blank frame produced a candidate at {width}x{height}")
        pair = round_code_frame(width, height, 0.16, copies=2)
        if detect_candidate(java, save(f"roundcode-pair-{width}x{height}", pair)) is not None:
            raise GeometryError(f"high-resolution centered double-code frame was auto-selected at {width}x{height}")
    print("PASS round-code candidate geometry at 16%/24% in 1280x720 and 1920x1080; high-resolution blank and double-code frames rejected")

    pair = round_code_frame(1920, 1080, 0.16, copies=2)
    for angle in (15, 45):
        matrix = cv2.getRotationMatrix2D((960, 540), angle, 1)
        rotated_pair = cv2.warpAffine(pair, matrix, (1920, 1080), flags=cv2.INTER_LINEAR,
                                      borderMode=cv2.BORDER_CONSTANT, borderValue=(128, 128, 128))
        if detect_candidate(java, save(f"roundcode-pair-1920-rot{angle}", rotated_pair)) is not None:
            raise GeometryError(f"rotated double round-code frame was auto-selected at angle={angle}")
        print(f"PASS rotated double round-code rejected angle={angle}")

    different_rings = np.full((1080, 1920, 3), 255, dtype=np.uint8)
    for (cx, cy), diameter in zip(((700, 300), (900, 300), (700, 500)), (24, 42, 64)):
        radius = diameter // 2
        outer = max(2, round(diameter * 0.15))
        white = max(3, round(diameter * 0.21))
        cv2.circle(different_rings, (cx, cy), radius, (0, 0, 0), -1, cv2.LINE_AA)
        cv2.circle(different_rings, (cx, cy), max(1, radius - outer), (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(different_rings, (cx, cy), max(1, radius - outer - white), (0, 0, 0), -1, cv2.LINE_AA)
    if detect_candidate(java, save("negative-different-size-rings", different_rings)) is not None:
        raise GeometryError("different-size concentric ring markers produced a candidate")
    print("PASS different-size concentric ring markers rejected")

    random_noise = np.random.default_rng(20261029).integers(0, 256, (720, 1280), dtype=np.uint8)
    if detect_candidate(java, save("negative-random-noise", random_noise)) is not None:
        raise GeometryError("random noise produced a candidate")
    print("PASS random noise rejected")

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
