package ftx.qbar;

import java.util.Arrays;

/** Bounded, whole-frame image retries. No detector guesses or payload reconstruction. */
public final class ScanGeometry {
    public static final int RETRY_COUNT = 12;
    private ScanGeometry() {}

    /** Coordinates are relative to the frame; size is the full code span / short edge. */
    public static final class Candidate {
        public final float x, y, size;
        public Candidate(float x, float y, float size) { this.x = x; this.y = y; this.size = size; }
    }

    /** Conservative three-finder coarse detector, independent of payload decoding. */
    public static Candidate detectCandidate(byte[] gray, int width, int height) {
        Candidate whole = detectCandidateRegion(gray, width, height);
        if (whole == AMBIGUOUS) return null;
        if (whole != null) return whole;
        // A 1920px frame reduced to 640px loses the rings of a distant code.
        // Recheck a centered, bounded native-resolution window, without enlarging
        // pixels or assuming a code exists. Map the result back to the full frame.
        if (gray == null || width < 24 || height < 24 || (long) width * height > gray.length) return null;
        int side = Math.min(640, Math.round(Math.min(width, height) * 0.55f));
        if (side < 24 || (width <= 640 && height <= 640)) return null;
        int left = (width - side) / 2, top = (height - side) / 2;
        byte[] center = new byte[side * side];
        for (int y = 0; y < side; y++) System.arraycopy(gray, (top + y) * width + left, center, y * side, side);
        Candidate local = detectCandidateRegion(center, side, side);
        if (local == null || local == AMBIGUOUS) return null;
        return new Candidate((left + local.x * side) / width, (top + local.y * side) / height,
                local.size * side / Math.min(width, height));
    }
    private static final Candidate AMBIGUOUS = new Candidate(Float.NaN, Float.NaN, Float.NaN);
    private static Candidate detectCandidateRegion(byte[] gray, int width, int height) {
        if (width < 24 || height < 24 || gray == null || (long) width * height > gray.length) return null;
        int step = Math.max(1, (Math.max(width, height) + 639) / 640);
        int w = width / step, h = height / step;
        byte[] pixels = new byte[w * h];
        int[] histogram = new int[256];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int value = gray[(y * step + step / 2) * width + x * step + step / 2] & 255;
            pixels[y * w + x] = (byte) value; histogram[value]++;
        }
        int low = 0, high = 255;
        while (low < 255 && histogram[low] == 0) low++;
        while (high > low && histogram[high] == 0) high--;
        if (high - low < 40) return null;
        long sum = 0, sumLow = 0;
        for (int i = 0; i < 256; i++) sum += (long) i * histogram[i];
        int countLow = 0, threshold = low; double bestVariance = -1;
        for (int i = low; i < high; i++) {
            countLow += histogram[i]; sumLow += (long) i * histogram[i];
            int countHigh = pixels.length - countLow;
            if (countLow == 0 || countHigh == 0) continue;
            double delta = (double) sumLow / countLow - (double) (sum - sumLow) / countHigh;
            double variance = (double) countLow * countHigh * delta * delta;
            if (variance > bestVariance) { bestVariance = variance; threshold = i; }
        }
        boolean[] dark = new boolean[pixels.length];
        for (int i = 0; i < pixels.length; i++) dark[i] = (pixels[i] & 255) <= threshold;
        java.util.ArrayList<float[]> finders = new java.util.ArrayList<>();
        int[] runs = new int[5];
        for (int y = 0; y < h; y++) {
            int x = 0;
            while (x < w) {
                while (x < w && !dark[y * w + x]) x++;
                if (x == w) break;
                int start = x, cursor = x, total = 0;
                for (int run = 0; run < 5; run++) {
                    runs[run] = 0;
                    while (cursor < w && dark[y * w + cursor] == (run % 2 == 0)) { cursor++; runs[run]++; }
                    total += runs[run];
                }
                int type = finderType(runs);
                if (type != 0 && total >= 7) {
                    int centerX = start + runs[0] + runs[1] + runs[2] / 2;
                    float[] vertical = crossFinder(dark, w, h, centerX, y, total, type);
                    if (vertical != null) {
                        float diameter = (total + vertical[1]) / 2f;
                        boolean merged = false;
                        for (float[] point : finders) {
                            if (point[4] == type && Math.hypot(point[0] - centerX, point[1] - vertical[0]) < diameter * 0.55) {
                                float hits = point[3];
                                point[0] = (point[0] * hits + centerX) / (hits + 1);
                                point[1] = (point[1] * hits + vertical[0]) / (hits + 1);
                                point[2] = (point[2] * hits + diameter) / (hits + 1); point[3]++;
                                merged = true; break;
                            }
                        }
                        if (!merged) finders.add(new float[]{centerX, vertical[0], diameter, 1, type});
                        if (finders.size() > 40) return AMBIGUOUS;
                    }
                }
                x = start + Math.max(1, runs[0] + runs[1]);
            }
        }
        Candidate answer = null;
        for (int i = 0; i < finders.size(); i++) for (int j = i + 1; j < finders.size(); j++) for (int k = j + 1; k < finders.size(); k++) {
            float[] a = finders.get(i), b = finders.get(j), c = finders.get(k);
            if (a[3] < 2 || b[3] < 2 || c[3] < 2 || a[4] != b[4] || a[4] != c[4]) continue;
            double ab = distanceSquared(a, b), ac = distanceSquared(a, c), bc = distanceSquared(b, c);
            if (ab > ac && ab > bc) { float[] swap = a; a = c; c = swap; }
            else if (ac > bc) { float[] swap = a; a = b; b = swap; }
            double legB = Math.sqrt(distanceSquared(a, b)), legC = Math.sqrt(distanceSquared(a, c));
            float minDiameter = Math.min(a[2], Math.min(b[2], c[2])), maxDiameter = Math.max(a[2], Math.max(b[2], c[2]));
            if (maxDiameter > minDiameter * 1.65 || Math.min(legB, legC) < maxDiameter * 1.4
                    || Math.max(legB, legC) > minDiameter * 16 || legB / legC < 0.55 || legB / legC > 1.8) continue;
            double cosine = ((b[0] - a[0]) * (c[0] - a[0]) + (b[1] - a[1]) * (c[1] - a[1])) / (legB * legC);
            if (Math.abs(cosine) > 0.28) continue;
            float fourthX = b[0] + c[0] - a[0], fourthY = b[1] + c[1] - a[1];
            double pad = Math.min(legB, legC) * (a[4] == 2 ? 0.35 : 0.22);
            double left = Math.min(Math.min(a[0], b[0]), Math.min(c[0], fourthX)) - pad;
            double right = Math.max(Math.max(a[0], b[0]), Math.max(c[0], fourthX)) + pad;
            double top = Math.min(Math.min(a[1], b[1]), Math.min(c[1], fourthY)) - pad;
            double bottom = Math.max(Math.max(a[1], b[1]), Math.max(c[1], fourthY)) + pad;
            if (left < -2 || top < -2 || right > w + 2 || bottom > h + 2) continue;
            Candidate candidate = new Candidate((b[0] + c[0]) / (2f * w), (b[1] + c[1]) / (2f * h),
                    (float) (Math.max(right - left, bottom - top) / Math.min(w, h)));
            if (answer != null && (Math.hypot(answer.x - candidate.x, answer.y - candidate.y) > 0.08
                    || Math.abs(answer.size - candidate.size) > answer.size * 0.25)) return AMBIGUOUS;
            answer = candidate;
        }
        return answer;
    }
    private static double distanceSquared(float[] a, float[] b) {
        return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
    }
    private static int finderType(int[] runs) {
        for (int run : runs) if (run == 0) return 0;
        double outer = (runs[0] + runs[4]) / 2.0;
        if (Math.abs(runs[0] - runs[4]) > outer * 0.8 || Math.abs(runs[1] - runs[3]) > outer * 0.8) return 0;
        if (Math.abs(runs[1] - outer) <= outer * 0.65 && Math.abs(runs[3] - outer) <= outer * 0.65
                && Math.abs(runs[2] - 3 * outer) <= outer) return 1;
        double white = (runs[1] + runs[3]) / 2.0;
        return white >= outer * 1.15 && white <= outer * 2.8 && runs[2] >= outer * 0.4 && runs[2] <= outer * 2.2 ? 2 : 0;
    }
    private static float[] crossFinder(boolean[] dark, int w, int h, int x, int y, int horizontal, int type) {
        int[] runs = new int[5];
        int up = y, down = y + 1;
        while (up >= 0 && dark[up * w + x]) { runs[2]++; up--; }
        int centerTop = up + 1;
        while (down < h && dark[down * w + x]) { runs[2]++; down++; }
        int centerBottom = down - 1;
        while (up >= 0 && !dark[up * w + x]) { runs[1]++; up--; }
        while (up >= 0 && dark[up * w + x]) { runs[0]++; up--; }
        while (down < h && !dark[down * w + x]) { runs[3]++; down++; }
        while (down < h && dark[down * w + x]) { runs[4]++; down++; }
        int total = 0; for (int run : runs) total += run;
        if (up < 0 || down >= h || finderType(runs) != type || Math.abs(total - horizontal) > horizontal * 0.5) return null;
        return new float[]{(centerTop + centerBottom) / 2f, total};
    }

    /** Only a persistent, centered small-code candidate can request more zoom. */
    public static final class AutoZoom {
        private long nextAt, lastSeen;
        private int stable;
        private Candidate previous;
        private boolean manual;
        public void reset(long now) { stable = 0; previous = null; manual = false; defer(now); }
        public void defer(long now) { nextAt = now + 1800; }
        public void manual() { manual = true; stable = 0; previous = null; }
        public boolean isManual() { return manual; }
        public float next(long now, float maxZoom, float actualZoom, Candidate candidate, boolean decoded) {
            if (manual || !finite(maxZoom) || !finite(actualZoom) || maxZoom <= 1.05f || actualZoom < 1f) return Float.NaN;
            if (decoded) { stable = 0; previous = null; defer(now); return Float.NaN; }
            if (candidate == null || !finite(candidate.size) || candidate.size < 0.04f || candidate.size >= 0.28f
                    || !finite(candidate.x) || !finite(candidate.y) || candidate.x < 0.3f || candidate.x > 0.7f
                    || candidate.y < 0.3f || candidate.y > 0.7f) { stable = 0; previous = null; return Float.NaN; }
            boolean matches = previous != null && now - lastSeen <= 1200
                    && Math.hypot(previous.x - candidate.x, previous.y - candidate.y) <= 0.06
                    && Math.abs(previous.size - candidate.size) <= previous.size * 0.4;
            stable = matches ? stable + 1 : 1; previous = candidate; lastSeen = now;
            if (stable < 3 || now < nextAt) return Float.NaN;
            float zoom = Math.min(Math.min(3f, maxZoom), Math.min(actualZoom * 1.25f, actualZoom * 0.38f / candidate.size));
            if (zoom <= actualZoom + 0.04f) return Float.NaN;
            stable = 0; nextAt = now + 1300;
            return zoom;
        }
        private static boolean finite(float value) { return !Float.isNaN(value) && !Float.isInfinite(value); }
    }

    public static double cameraScore(float horizontal, float vertical, boolean autofocus) {
        double angle = Math.max(horizontal, vertical);
        // Camera1 has no portable "main camera" flag. Prefer a normal field of view,
        // then autofocus; do not compare millimetres across different sensor sizes.
        double score = angle >= 20 && angle <= 150 ? 100 - 2 * Math.abs(angle - 68) : 45;
        return score + (autofocus ? 18 : 0);
    }

    public static int[] fitPreview(int width, int height, int rotation, int availableWidth, int availableHeight) {
        if (rotation % 180 != 0) { int swap = width; width = height; height = swap; }
        double scale = Math.min((double) availableWidth / width, (double) availableHeight / height);
        return new int[]{Math.max(1, (int) Math.round(width * scale)), Math.max(1, (int) Math.round(height * scale))};
    }

    /** Map a tap in the rotated rear-camera preview back to Camera1 sensor coordinates. */
    public static int[] focusArea(float x, float y, int viewWidth, int viewHeight, int rotation) {
        if (viewWidth <= 0 || viewHeight <= 0) throw new IllegalArgumentException("INVALID_PREVIEW_SIZE");
        float nx = Math.max(-1000f, Math.min(1000f, x * 2000f / viewWidth - 1000f));
        float ny = Math.max(-1000f, Math.min(1000f, y * 2000f / viewHeight - 1000f));
        float sx = nx, sy = ny;
        if (rotation == 90) { sx = ny; sy = -nx; }
        else if (rotation == 180) { sx = -nx; sy = -ny; }
        else if (rotation == 270) { sx = -ny; sy = nx; }
        int left = Math.max(-1000, Math.min(760, Math.round(sx) - 120));
        int top = Math.max(-1000, Math.min(760, Math.round(sy) - 120));
        return new int[]{left, top, left + 240, top + 240};
    }

    public static final class Frame {
        public final byte[] gray;
        public final int width, height;
        Frame(byte[] gray, int width, int height) { this.gray = gray; this.width = width; this.height = height; }
    }

    /** Copy the visible, centered digital-zoom crop from an NV21 luminance plane. */
    public static Frame cropZoom(byte[] gray, int width, int height, float zoom) {
        if (gray == null || width < 2 || height < 2 || (long) width * height > gray.length
                || Float.isNaN(zoom) || Float.isInfinite(zoom) || zoom < 1f || zoom > 3f) {
            throw new IllegalArgumentException("INVALID_ZOOM_INPUT");
        }
        int w = Math.max(2, (int) (width / zoom)), h = Math.max(2, (int) (height / zoom));
        int left = (width - w) / 2, top = (height - h) / 2;
        byte[] pixels = new byte[w * h];
        for (int y = 0; y < h; y++) System.arraycopy(gray, (top + y) * width + left, pixels, y * w, w);
        return new Frame(pixels, w, h);
    }

    public static Frame warp(byte[] gray, int width, int height, int candidate, int maxEdge) {
        if (width < 2 || height < 2 || (long) width * height > gray.length || maxEdge < 32
                || maxEdge > 1800 || candidate < 0 || candidate >= RETRY_COUNT) {
            throw new IllegalArgumentException("INVALID_GEOMETRY_INPUT");
        }
        double a = 1, b = 0, c = 0, d = 1, p = 0, q = 0;
        if (candidate < 6) {
            double angle = candidate < 2 ? 0 : candidate < 4 ? Math.PI / 2
                    : candidate == 4 ? Math.PI / 4 : -Math.PI / 4;
            double amount = candidate < 4 ? (candidate % 2 == 0 ? 0.4 : 0.8) : 0.6;
            double x = Math.cos(angle), y = Math.sin(angle);
            a += amount * x * x; b = c = amount * x * y; d += amount * y * y;
        } else if (candidate < 8) {
            b = candidate == 6 ? 0.28 : -0.28;
        } else if (candidate < 10) {
            p = candidate == 8 ? 0.18 : -0.18;
        } else {
            q = candidate == 10 ? 0.18 : -0.18;
        }
        double unit = Math.max(width - 1, height - 1) / 2.0;
        double cx = (width - 1) / 2.0, cy = (height - 1) / 2.0;
        double minX = Double.POSITIVE_INFINITY, minY = minX, maxX = -minX, maxY = -minX;
        for (int corner = 0; corner < 4; corner++) {
            double x = ((corner % 2 == 0 ? 0 : width - 1) - cx) / unit;
            double y = ((corner < 2 ? 0 : height - 1) - cy) / unit;
            double denominator = 1 + p * x + q * y;
            double tx = (a * x + b * y) / denominator, ty = (c * x + d * y) / denominator;
            minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
            minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
        }
        // Include the entire transformed image and a white border, never crop a code.
        double scale = Math.min(unit, (maxEdge - 9.0) / Math.max(maxX - minX, maxY - minY));
        int outputWidth = (int) Math.ceil((maxX - minX) * scale) + 9;
        int outputHeight = (int) Math.ceil((maxY - minY) * scale) + 9;
        byte[] output = new byte[outputWidth * outputHeight];
        Arrays.fill(output, (byte) 255);
        double determinant = a * d - b * c;
        for (int row = 4; row < outputHeight - 4; row++) {
            double vy = minY + (row - 4) / scale;
            for (int column = 4; column < outputWidth - 4; column++) {
                double vx = minX + (column - 4) / scale;
                double denominator = determinant + (b * q - d * p) * vx + (c * p - a * q) * vy;
                if (Math.abs(denominator) < 1e-8) continue;
                double sx = (d * vx - b * vy) / denominator * unit + cx;
                double sy = (-c * vx + a * vy) / denominator * unit + cy;
                if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
                int x = (int) sx, y = (int) sy, nextX = Math.min(width - 1, x + 1), nextY = Math.min(height - 1, y + 1);
                double fx = sx - x, fy = sy - y;
                double top = (gray[y * width + x] & 255) * (1 - fx) + (gray[y * width + nextX] & 255) * fx;
                double bottom = (gray[nextY * width + x] & 255) * (1 - fx) + (gray[nextY * width + nextX] & 255) * fx;
                output[row * outputWidth + column] = (byte) Math.round(top * (1 - fy) + bottom * fy);
            }
        }
        return new Frame(output, outputWidth, outputHeight);
    }
}
