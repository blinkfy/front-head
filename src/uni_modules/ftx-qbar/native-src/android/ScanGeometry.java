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
        // Point-sampling a distant ring at one fixed phase can erase its thin rim.
        // Retry two alternate phases only after a miss; never bypass ambiguity.
        if (whole == null && Math.max(width, height) > 640) {
            whole = detectCandidateRegion(gray, width, height, 0);
            if (whole == null) whole = detectCandidateRegion(gray, width, height, 2);
        }
        if (whole == AMBIGUOUS) return null;
        if (whole != null) return whole;
        // A 1920px frame reduced to 640px loses the rings of a distant code.
        // Recheck a centered, bounded native-resolution window, without enlarging
        // pixels or assuming a code exists. Map the result back to the full frame.
        if (gray == null || width < 24 || height < 24 || (long) width * height > gray.length) return null;
        int side = Math.min(960, Math.min(width, height));
        if (side < 24) return null;
        int left = (width - side) / 2, top = (height - side) / 2;
        byte[] center = new byte[side * side];
        for (int y = 0; y < side; y++) System.arraycopy(gray, (top + y) * width + left, center, y * side, side);
        Candidate local = width == side && height == side ? null : detectCandidateRegion(center, side, side, -1, 960, false);
        if (local == null) local = detectCandidateRegion(center, side, side, -1, 960, true);
        if (local == null) local = detectCandidateRegion(sharpenCandidate(center, side), side, side, -1, 960, false);
        if (local == null || local == AMBIGUOUS) return null;
        return new Candidate((left + local.x * side) / width, (top + local.y * side) / height,
                local.size * side / Math.min(width, height));
    }
    /** Robust brightness of the central half, sampled to at most 64x64 pixels. */
    static int lightLevel(byte[] gray, int width, int height) {
        if (gray == null || width < 4 || height < 4 || (long) width * height > gray.length) return -1;
        int[] histogram = new int[256];
        int stepX = Math.max(1, (width / 2 + 63) / 64), stepY = Math.max(1, (height / 2 + 63) / 64);
        int count = 0;
        for (int y = height / 4; y < height * 3 / 4; y += stepY)
            for (int x = width / 4; x < width * 3 / 4; x += stepX) { histogram[gray[y * width + x] & 255]++; count++; }
        int total = 0;
        for (int i = 0; i < 256; i++) { total += histogram[i]; if (total * 4 >= count * 3) return i; }
        return -1;
    }
    /** Half-stop maximum, hysteresis, stable observations and a three-second cooldown. */
    static final class ExposureControl {
        private int applied, pending = -1, hits;
        private long since, changedAt, observedAt;
        void reset(long now) { applied = 0; pending = -1; hits = 0; changedAt = observedAt = now; }
        float next(int brightness, long now) {
            if (now < observedAt || now - observedAt > 1200) { pending = -1; hits = 0; }
            observedAt = now;
            int desired = brightness >= 0 && brightness < 60 ? 1 : brightness >= 95 && brightness <= 255 ? 0 : -1;
            if (desired < 0 || desired == applied) { pending = -1; hits = 0; return Float.NaN; }
            if (pending != desired) { pending = desired; hits = 0; since = now; }
            hits++;
            if (hits < 3 || now - since < 750 || now - changedAt < 3000) return Float.NaN;
            applied = desired; changedAt = now; pending = -1; hits = 0;
            return applied == 1 ? 0.5f : 0f;
        }
    }
    static int exposureIndex(int baseline, int minimum, int maximum, float step, float ev) {
        if (!Float.isFinite(step) || step <= 0 || !Float.isFinite(ev) || minimum > maximum)
            throw new IllegalArgumentException("INVALID_EXPOSURE_RANGE");
        return Math.max(minimum, Math.min(maximum, baseline + (int) Math.floor(Math.max(0f, Math.min(0.5f, ev)) / step + 0.0001f)));
    }
    /** One bounded, mild edge retry for coarse localization, never payload reconstruction. */
    private static byte[] sharpenCandidate(byte[] source, int side) {
        byte[] pixels = source.clone();
        for (int y = 1; y < side - 1; y++) for (int x = 1; x < side - 1; x++) {
            int i = y * side + x, value = source[i] & 255;
            int delta = (4 * value - (source[i - 1] & 255) - (source[i + 1] & 255)
                    - (source[i - side] & 255) - (source[i + side] & 255)) / 2;
            pixels[i] = (byte) Math.max(0, Math.min(255, value + Math.max(-32, Math.min(32, delta))));
        }
        return pixels;
    }
    private static final Candidate AMBIGUOUS = new Candidate(Float.NaN, Float.NaN, Float.NaN);
    private static Candidate detectCandidateRegion(byte[] gray, int width, int height) {
        return detectCandidateRegion(gray, width, height, -1);
    }
    private static Candidate detectCandidateRegion(byte[] gray, int width, int height, int phase) {
        return detectCandidateRegion(gray, width, height, phase, 640, false);
    }
    private static Candidate detectCandidateRegion(byte[] gray, int width, int height, int phase, int maxEdge, boolean softRings) {
        if (width < 24 || height < 24 || gray == null || (long) width * height > gray.length) return null;
        int step = Math.max(1, (Math.max(width, height) + maxEdge - 1) / maxEdge);
        int w = width / step, h = height / step;
        int sample = phase < 0 ? step / 2 : Math.min(step - 1, phase);
        byte[] pixels = new byte[w * h];
        int[] histogram = new int[256];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int value = gray[(y * step + sample) * width + x * step + sample] & 255;
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
        // Blur can merge the thin rim into its white annulus at Otsu's cutoff.
        // A lower cutoff is tried only in the bounded native-pixel fallback.
        if (softRings) threshold = Math.max(low + 8, threshold - 24);
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
            if (a[4] != b[4] || a[4] != c[4]) continue;
            int strong = (a[3] >= 2 ? 1 : 0) + (b[3] >= 2 ? 1 : 0) + (c[3] >= 2 ? 1 : 0);
            // At small sizes a third ring can occupy one scan line. Accept it only
            // with two multi-line anchors and stricter size/angle agreement below.
            boolean weakRing = softRings && a[4] == 2 && strong == 2;
            if (strong < 3 && !weakRing) continue;
            double ab = distanceSquared(a, b), ac = distanceSquared(a, c), bc = distanceSquared(b, c);
            if (ab > ac && ab > bc) { float[] swap = a; a = c; c = swap; }
            else if (ac > bc) { float[] swap = a; a = b; b = swap; }
            double legB = Math.sqrt(distanceSquared(a, b)), legC = Math.sqrt(distanceSquared(a, c));
            float minDiameter = Math.min(a[2], Math.min(b[2], c[2])), maxDiameter = Math.max(a[2], Math.max(b[2], c[2]));
            if (maxDiameter > minDiameter * 1.65 || Math.min(legB, legC) < maxDiameter * 1.4
                    || Math.max(legB, legC) > minDiameter * 16 || legB / legC < 0.55 || legB / legC > 1.8) continue;
            double cosine = ((b[0] - a[0]) * (c[0] - a[0]) + (b[1] - a[1]) * (c[1] - a[1])) / (legB * legC);
            if (Math.abs(cosine) > (a[4] == 2 ? 0.40 : 0.28)) continue;
            if (weakRing && (maxDiameter > minDiameter * 1.35 || Math.abs(cosine) > 0.22 || legB / legC < 0.72 || legB / legC > 1.4)) continue;
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
        return answer == null && softRings ? recoverRoundCandidate(pixels, w, h, finders, false) : answer;
    }
    // A pair of observed rings bounds the search only. A third real concentric
    // ring and strict geometry must agree; no payload is inferred here.
    private static final double[][] RING_DIRECTIONS = {
        {1, 0}, {0.70710678, 0.70710678}, {0, 1}, {-0.70710678, 0.70710678},
        {-1, 0}, {-0.70710678, -0.70710678}, {0, -1}, {0.70710678, -0.70710678}
    };
    private static double grayAt(byte[] pixels, int width, double x, double y) {
        int ix = (int) Math.floor(x), iy = (int) Math.floor(y), i = iy * width + ix;
        double dx = x - ix, dy = y - iy;
        return ((pixels[i] & 255) * (1 - dx) + (pixels[i + 1] & 255) * dx) * (1 - dy)
                + ((pixels[i + width] & 255) * (1 - dx) + (pixels[i + width + 1] & 255) * dx) * dy;
    }
    private static double ringStrength(byte[] pixels, int width, int height, double x, double y, double diameter) {
        double radius = diameter / 2;
        if (radius < 3 || x - radius - 1 < 0 || y - radius - 1 < 0
                || x + radius + 1 >= width || y + radius + 1 >= height) return 0;
        double center = grayAt(pixels, width, x, y), white = 0, ring = 0;
        int matched = 0;
        for (double[] direction : RING_DIRECTIONS) {
            double dx = direction[0], dy = direction[1];
            double light = grayAt(pixels, width, x + dx * radius * 0.55, y + dy * radius * 0.55);
            double dark = grayAt(pixels, width, x + dx * radius * 0.87, y + dy * radius * 0.87);
            white += light; ring += dark;
            if (light - dark >= 18) matched++;
        }
        white /= 8; ring /= 8;
        return matched >= 6 && white - center >= 28 && white - ring >= 32
                ? Math.min(white - center, white - ring) : 0;
    }
    private static float[] searchRing(byte[] pixels, int width, int height, double x, double y, double diameter, double spread) {
        float[] best = null; double score = 0, step = spread > 3 ? 1 : 0.5;
        for (double ratio : new double[]{1, 0.9, 1.1}) {
            double d = diameter * ratio;
            for (double dy = -spread; dy <= spread; dy += step) for (double dx = -spread; dx <= spread; dx += step) {
                double strength = ringStrength(pixels, width, height, x + dx, y + dy, d);
                if (strength > score) { score = strength; best = new float[]{(float) (x + dx), (float) (y + dy), (float) d}; }
            }
        }
        return best;
    }
    private static Candidate recoverRoundCandidate(byte[] pixels, int width, int height, java.util.ArrayList<float[]> finders, boolean allowSingle) {
        java.util.ArrayList<float[]> rings = new java.util.ArrayList<>();
        for (float[] point : finders) {
            if (point[4] != 2 || point[3] < (allowSingle ? 1 : 2) || point[2] < 7 || point[2] > 48) continue;
            float[] refined = searchRing(pixels, width, height, point[0], point[1], point[2], 1.5);
            if (refined == null || point[3] < 2 && ringStrength(pixels, width, height, refined[0], refined[1], refined[2]) < 48) continue;
            boolean duplicate = false;
            for (float[] ring : rings) if (Math.hypot(ring[0] - refined[0], ring[1] - refined[1]) < refined[2]) { duplicate = true; break; }
            if (!duplicate) rings.add(refined);
            if (rings.size() > 8) return AMBIGUOUS;
        }
        Candidate answer = null; int attempts = 0;
        for (int i = 0; i < rings.size(); i++) for (int j = i + 1; j < rings.size(); j++) {
            float[] a = rings.get(i), b = rings.get(j);
            double diameter = (a[2] + b[2]) / 2.0, dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
            if (Math.max(a[2], b[2]) > Math.min(a[2], b[2]) * 1.3 || distance < diameter * 2 || distance > diameter * 14) continue;
            double[][] guesses = {
                {a[0] - dy, a[1] + dx}, {a[0] + dy, a[1] - dx},
                {b[0] - dy, b[1] + dx}, {b[0] + dy, b[1] - dx},
                {(a[0] + b[0] - dy) / 2, (a[1] + b[1] + dx) / 2},
                {(a[0] + b[0] + dy) / 2, (a[1] + b[1] - dx) / 2}
            };
            for (double[] guess : guesses) {
                if (++attempts > 48) return AMBIGUOUS;
                float[] c = searchRing(pixels, width, height, guess[0], guess[1], diameter, Math.min(5, diameter * 0.4));
                if (c == null) continue;
                float[] corner = a, left = b, right = c;
                double ab = distanceSquared(a, b), ac = distanceSquared(a, c), bc = distanceSquared(b, c);
                if (ab > ac && ab > bc) { float[] swap = corner; corner = right; right = swap; }
                else if (ac > bc) { float[] swap = corner; corner = left; left = swap; }
                double legA = Math.sqrt(distanceSquared(corner, left)), legB = Math.sqrt(distanceSquared(corner, right));
                double cosine = ((left[0] - corner[0]) * (right[0] - corner[0]) + (left[1] - corner[1]) * (right[1] - corner[1])) / (legA * legB);
                if (Math.abs(cosine) > 0.18 || legA / legB < 0.8 || legA / legB > 1.25) continue;
                double fourthX = left[0] + right[0] - corner[0], fourthY = left[1] + right[1] - corner[1];
                double pad = Math.min(legA, legB) * 0.35;
                double minX = Math.min(Math.min(corner[0], left[0]), Math.min(right[0], fourthX)) - pad;
                double maxX = Math.max(Math.max(corner[0], left[0]), Math.max(right[0], fourthX)) + pad;
                double minY = Math.min(Math.min(corner[1], left[1]), Math.min(right[1], fourthY)) - pad;
                double maxY = Math.max(Math.max(corner[1], left[1]), Math.max(right[1], fourthY)) + pad;
                if (minX < -2 || minY < -2 || maxX > width + 2 || maxY > height + 2) continue;
                Candidate candidate = new Candidate((left[0] + right[0]) / (2f * width), (left[1] + right[1]) / (2f * height),
                        (float) (Math.max(maxX - minX, maxY - minY) / Math.min(width, height)));
                if (answer != null && (Math.hypot(answer.x - candidate.x, answer.y - candidate.y) > 0.06
                        || Math.abs(answer.size - candidate.size) > answer.size * 0.2)) return AMBIGUOUS;
                answer = candidate;
            }
        }
        return answer != null || allowSingle ? answer : recoverRoundCandidate(pixels, width, height, finders, true);
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
        private long nextAt, lastSeen, stableSince;
        private int stable;
        private Candidate previous;
        private boolean manual;
        public void reset(long now) { stable = 0; previous = null; manual = false; nextAt = now + 600; }
        public void defer(long now) { nextAt = now + 650; }
        public void manual() { manual = true; stable = 0; previous = null; }
        public boolean isManual() { return manual; }
        public float next(long now, float maxZoom, float actualZoom, Candidate candidate, boolean decoded) {
            if (manual || !finite(maxZoom) || !finite(actualZoom) || maxZoom <= 1.05f || actualZoom < 1f) return Float.NaN;
            if (decoded) { stable = 0; previous = null; defer(now); return Float.NaN; }
            if (candidate == null) {
                if (now - lastSeen > 700) { stable = 0; previous = null; }
                return Float.NaN;
            }
            if (!finite(candidate.size) || candidate.size < 0.025f || candidate.size >= 0.36f
                    || !finite(candidate.x) || !finite(candidate.y) || candidate.x < 0.3f || candidate.x > 0.7f
                    || candidate.y < 0.3f || candidate.y > 0.7f) { stable = 0; previous = null; return Float.NaN; }
            boolean matches = previous != null && now - lastSeen <= 1200
                    && Math.hypot(previous.x - candidate.x, previous.y - candidate.y) <= 0.06
                    && Math.abs(previous.size - candidate.size) <= previous.size * 0.4;
            if (!matches) stableSince = now;
            stable = matches ? stable + 1 : 1; previous = candidate; lastSeen = now;
            if (stable < 2 || now - stableSince < 180 || now < nextAt) return Float.NaN;
            float offset = Math.max(Math.abs(candidate.x - 0.5f), Math.abs(candidate.y - 0.5f));
            // Leave room for the whole code when it is slightly off the guide center.
            float visibleLimit = 0.46f / (offset + candidate.size * 0.7f);
            float step = Math.min(candidate.size < 0.12f ? 2f : 1.8f, Math.min(0.40f / candidate.size, visibleLimit));
            float zoom = Math.min(Math.min(3f, maxZoom), actualZoom * step);
            if (zoom <= actualZoom + 0.04f) return Float.NaN;
            stable = 0; nextAt = now + 650;
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

    private static boolean validPoint(float x, float y) {
        return !Float.isNaN(x) && !Float.isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
    }
    /** Inverse of the rear-camera display rotation, in normalized coordinates. */
    public static float[] previewPoint(float x, float y, int rotation) {
        if (!validPoint(x, y)) throw new IllegalArgumentException("INVALID_PREVIEW_POINT");
        if (rotation == 90) return new float[]{y, 1 - x};
        if (rotation == 180) return new float[]{1 - x, 1 - y};
        if (rotation == 270) return new float[]{1 - y, x};
        if (rotation != 0) throw new IllegalArgumentException("INVALID_PREVIEW_ROTATION");
        return new float[]{x, y};
    }

    /** Copy the visible, centered digital-zoom crop from an NV21 luminance plane. */
    public static Frame cropZoom(byte[] gray, int width, int height, float zoom) {
        return cropZoom(gray, width, height, zoom, 0.5f, 0.5f);
    }
    /** Scale about the visible guide pivot, matching SurfaceView's transform. */
    public static Frame cropZoom(byte[] gray, int width, int height, float zoom, float pivotX, float pivotY) {
        if (!validPoint(pivotX, pivotY)) throw new IllegalArgumentException("INVALID_ZOOM_PIVOT");
        if (gray == null || width < 2 || height < 2 || (long) width * height > gray.length
                || Float.isNaN(zoom) || Float.isInfinite(zoom) || zoom < 1f || zoom > 3f) {
            throw new IllegalArgumentException("INVALID_ZOOM_INPUT");
        }
        int w = Math.max(2, (int) (width / zoom)), h = Math.max(2, (int) (height / zoom));
        int left = (int) ((width - w) * pivotX), top = (int) ((height - h) * pivotY);
        byte[] pixels = new byte[w * h];
        for (int y = 0; y < h; y++) System.arraycopy(gray, (top + y) * width + left, pixels, y * w, w);
        return new Frame(pixels, w, h);
    }

    /** Bounded center retry at double sample size; preserves the input frame. */
    public static Frame centerDetail(byte[] gray, int width, int height, boolean sharpen) {
        return centerDetail(gray, width, height, sharpen, 0.5f, 0.5f);
    }
    public static Frame centerDetail(byte[] gray, int width, int height, boolean sharpen, float centerX, float centerY) {
        if (!validPoint(centerX, centerY)) throw new IllegalArgumentException("INVALID_DETAIL_CENTER");
        if (gray == null || width < 4 || height < 4 || (long) width * height > gray.length)
            throw new IllegalArgumentException("INVALID_DETAIL_INPUT");
        int side = Math.max(2, Math.min(640, (int) (Math.min(width, height) * 0.65)));
        int left = Math.max(0, Math.min(width - side, (int) (width * centerX - side / 2f)));
        int top = Math.max(0, Math.min(height - side, (int) (height * centerY - side / 2f))), output = side * 2;
        byte[] pixels = new byte[output * output];
        for (int y = 0; y < side; y++) for (int x = 0; x < side; x++) {
            int sx = left + x, sy = top + y, value = gray[sy * width + sx] & 255;
            if (sharpen && sx > 0 && sy > 0 && sx < width - 1 && sy < height - 1) {
                int delta = (4 * value - (gray[sy * width + sx - 1] & 255)
                        - (gray[sy * width + sx + 1] & 255) - (gray[(sy - 1) * width + sx] & 255)
                        - (gray[(sy + 1) * width + sx] & 255)) / 2;
                value = Math.max(0, Math.min(255, value + Math.max(-32, Math.min(32, delta))));
            }
            int index = y * 2 * output + x * 2;
            pixels[index] = pixels[index + 1] = pixels[index + output] = pixels[index + output + 1] = (byte) value;
        }
        return new Frame(pixels, output, output);
    }

    /** Prefer actual supported HD modes within a memory budget, never fabricate sizes. */
    public static int[] selectPreview(int[][] sizes, int maxPixels) {
        int[] chosen = null; long best = 0;
        if (sizes == null) return null;
        for (int[] size : sizes) {
            if (size == null || size.length < 2 || size[0] < 2 || size[1] < 2) continue;
            long area = (long) size[0] * size[1];
            if (area > maxPixels || Math.max(size[0], size[1]) > 3840 || Math.min(size[0], size[1]) > 2160) continue;
            if (area > best) { chosen = new int[]{size[0], size[1]}; best = area; }
        }
        return chosen;
    }
    private static void imageInput(byte[] gray, int width, int height, int maxEdge) {
        if (gray == null || width < 2 || height < 2 || (long) width * height > gray.length || maxEdge < 2 || maxEdge > 4096)
            throw new IllegalArgumentException("INVALID_SAMPLE_INPUT");
    }
    private static int[] visibleBounds(int width, int height, float zoom, float x, float y) {
        if (!validPoint(x, y) || Float.isNaN(zoom) || Float.isInfinite(zoom) || zoom < 1 || zoom > 3)
            throw new IllegalArgumentException("INVALID_SAMPLE_ZOOM");
        int w = Math.max(2, (int) (width / zoom)), h = Math.max(2, (int) (height / zoom));
        return new int[]{(int) ((width - w) * x), (int) ((height - h) * y), w, h};
    }
    private static Frame sampleRegion(byte[] gray, int width, int left, int top, int regionWidth, int regionHeight, int maxEdge) {
        double scale = Math.min(1, (double) maxEdge / Math.max(regionWidth, regionHeight));
        int w = Math.max(1, (int) Math.round(regionWidth * scale)), h = Math.max(1, (int) Math.round(regionHeight * scale));
        byte[] pixels = new byte[w * h];
        if (w == regionWidth && h == regionHeight) {
            for (int y = 0; y < h; y++) System.arraycopy(gray, (top + y) * width + left, pixels, y * w, w);
        } else {
            for (int y = 0; y < h; y++) {
                int sy = top + Math.min(regionHeight - 1, (int) ((y + 0.5) * regionHeight / h));
                for (int x = 0; x < w; x++) pixels[y * w + x] = gray[sy * width + left
                        + Math.min(regionWidth - 1, (int) ((x + 0.5) * regionWidth / w))];
            }
        }
        return new Frame(pixels, w, h);
    }
    /** Sample full visible field cheaply; a candidate ROI is separately copied from the original buffer. */
    public static Frame sampleZoom(byte[] gray, int width, int height, float zoom, float x, float y, int maxEdge) {
        imageInput(gray, width, height, maxEdge);
        int[] bounds = visibleBounds(width, height, zoom, x, y);
        return sampleRegion(gray, width, bounds[0], bounds[1], bounds[2], bounds[3], maxEdge);
    }
    /** Candidate uses normalized coordinates of the visible field, not the downsampled pixel count. */
    public static Frame candidateRegion(byte[] gray, int width, int height, float zoom, float x, float y, Candidate candidate, int maxEdge) {
        imageInput(gray, width, height, maxEdge);
        int[] bounds = candidateBounds(width, height, zoom, x, y, candidate);
        return bounds == null ? null : sampleRegion(gray, width, bounds[0], bounds[1], bounds[2], bounds[3], maxEdge);
    }
    /** Native sensor-pixel bounds, also used to compare clarity of the same ROI. */
    public static int[] candidateBounds(int width, int height, float zoom, float x, float y, Candidate candidate) {
        if (width < 2 || height < 2 || candidate == null || !validPoint(candidate.x, candidate.y) || Float.isNaN(candidate.size)
                || Float.isInfinite(candidate.size) || candidate.size <= 0 || candidate.size > 1.5f) return null;
        int[] bounds = visibleBounds(width, height, zoom, x, y);
        int side = Math.max(2, Math.min(Math.min(bounds[2], bounds[3]), (int) Math.ceil(candidate.size * Math.min(bounds[2], bounds[3]) * 1.6)));
        int left = bounds[0] + Math.max(0, Math.min(bounds[2] - side, (int) (candidate.x * bounds[2] - side / 2f)));
        int top = bounds[1] + Math.max(0, Math.min(bounds[3] - side, (int) (candidate.y * bounds[3] - side / 2f)));
        return new int[]{left, top, side, side};
    }
    public static boolean sameSelectionRegion(int[] before, int[] after) {
        if (before == null || after == null) return before == after;
        return before.length == 4 && after.length == 4 && before[2] > 0 && before[3] > 0
                && before[2] == after[2] && before[3] == after[3]
                && Math.abs((long) before[0] - after[0]) <= Math.max(2, before[2] * 0.04)
                && Math.abs((long) before[1] - after[1]) <= Math.max(2, before[3] * 0.04);
    }
    public static boolean freshSelection(long capturedAt, long now) {
        return capturedAt >= 0 && now >= capturedAt && now - capturedAt <= 350;
    }
    /** Reproject a verified candidate immediately when the visible digital crop changes. */
    public static Candidate reprojectCandidate(Candidate candidate, float before, float after, float pivotX, float pivotY) {
        if (candidate == null || !validPoint(pivotX, pivotY) || !validPoint(candidate.x, candidate.y)
                || (Float.isNaN(candidate.size) || Float.isInfinite(candidate.size)) || candidate.size <= 0 || candidate.size > 1.5f
                || (Float.isNaN(before) || Float.isInfinite(before)) || (Float.isNaN(after) || Float.isInfinite(after)) || before < 1 || after < 1 || before > 3 || after > 3) return null;
        float ratio = after / before;
        float x = pivotX + (candidate.x - pivotX) * ratio, y = pivotY + (candidate.y - pivotY) * ratio;
        float size = candidate.size * ratio;
        return validPoint(x, y) && size <= 1.5f ? new Candidate(x, y, size) : null;
    }
    /** Bounded spatial edge score for selecting between nearby frames of the same candidate. */
    public static double clarity(Frame frame) {
        if (frame == null || frame.width < 3 || frame.height < 3) return 0;
        int step = Math.max(1, Math.min(frame.width, frame.height) / 96), count = 0;
        long total = 0;
        for (int y = 1; y < frame.height - 1; y += step) for (int x = 1; x < frame.width - 1; x += step) {
            int i = y * frame.width + x;
            total += Math.abs(4 * (frame.gray[i] & 255) - (frame.gray[i - 1] & 255) - (frame.gray[i + 1] & 255)
                    - (frame.gray[i - frame.width] & 255) - (frame.gray[i + frame.width] & 255)); count++;
        }
        return count == 0 ? 0 : (double) total / count / 1020;
    }
    /** Short-lived capture budget; cancellation must not reset the retry limit. */
    public static final class SnapshotGate {
        private long nextAt;
        private int attempts;
        private boolean running;
        public boolean start(long now) {
            if (now < 0 || running || attempts >= 3 || now < nextAt) return false;
            attempts++; running = true; nextAt = now + 12000; return true;
        }
        public void finish() { running = false; }
        public void cancel() { running = false; }
        public boolean busy() { return running; }
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
