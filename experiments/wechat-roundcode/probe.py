"""Offline round-code research probe. Not a WeChat payload decoder or APP plugin."""
import argparse
import hashlib
import itertools
import json
from pathlib import Path

import cv2
import numpy as np


def read_image(path):
    image = cv2.imdecode(np.fromfile(Path(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Cannot read image")
    return image


def _center(contour):
    moments = cv2.moments(contour)
    if not moments["m00"]:
        return None
    return np.array([moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]])


def find_bullseyes(gray):
    """Find nested circular contours; these are candidates, not decoded symbols."""
    masks = [cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]]
    masks.append(cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 41, 7))
    found = []
    for binary in masks:
        contours, hierarchy = cv2.findContours(binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        if hierarchy is None:
            continue
        for index, outer in enumerate(contours):
            child = hierarchy[0][index][2]
            inner = hierarchy[0][child][2] if child >= 0 else -1
            if inner < 0:
                continue
            area = cv2.contourArea(outer)
            perimeter = cv2.arcLength(outer, True)
            if area < 40 or not perimeter or len(outer) < 5:
                continue
            hole_area, dot_area = [cv2.contourArea(contours[k]) / area for k in (child, inner)]
            if not (0.30 < hole_area < 0.72 and 0.008 < dot_area < 0.14):
                continue
            circularity = 4 * np.pi * area / (perimeter * perimeter)
            if circularity < 0.72:
                continue
            center, dot_center = _center(outer), _center(contours[inner])
            radius = np.sqrt(area / np.pi)
            if center is None or dot_center is None or np.linalg.norm(center - dot_center) > radius * .25:
                continue
            if any(np.linalg.norm(center - other["center"]) < radius for other in found):
                continue
            found.append({"center": center, "radius": float(radius), "circularity": float(circularity)})
    return found


def choose_triangle(candidates):
    """Order three near-isosceles right-angle eyes; fourth corner is estimated."""
    best = None
    for triple in itertools.combinations(candidates[:24], 3):
        for pivot in range(3):
            origin = triple[pivot]["center"]
            others = [triple[k]["center"] for k in range(3) if k != pivot]
            u, v = [point - origin for point in others]
            a, b = np.linalg.norm(u), np.linalg.norm(v)
            if min(a, b) < 15:
                continue
            angle_error = abs(float(np.dot(u, v) / (a * b)))
            length_error = abs(float(a - b)) / max(a, b)
            radii = [item["radius"] for item in triple]
            radius_error = max(radii) / min(radii) - 1
            if angle_error > .22 or length_error > .22 or radius_error > .5:
                continue
            eye_scale = np.mean(radii) / ((a + b) / 2)
            if not .035 < eye_scale < .13:
                continue
            score = angle_error + length_error + radius_error * .2
            if best is None or score < best[0]:
                # Positive determinant preserves image orientation; no mirror guessing.
                if u[0] * v[1] - u[1] * v[0] < 0:
                    others.reverse()
                best = (score, np.float32([origin, *others]))
    return None if best is None else best[1]


def analyze(image, expected_scene=None):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    report = {"status": "unrecognized", "scene": None, "expectedSceneVerified": None,
              "payloadDecoderImplemented": False, "networkUsed": False}
    artifacts = {}
    text, _, _ = cv2.QRCodeDetector().detectAndDecode(gray)
    report["standardQrDecoded"] = bool(text)
    if text:
        report.update(status="standard_qr_decoded", decodedTextSha256=hashlib.sha256(text.encode()).hexdigest())
        if expected_scene is not None:
            report["expectedSceneVerified"] = text == expected_scene
        # Standard QR decoding is a baseline; it does not implement round-code decoding.
        return report, artifacts

    candidates = find_bullseyes(gray)
    report["finderCandidateCount"] = len(candidates)
    triangle = choose_triangle(candidates)
    if triangle is None:
        return report, artifacts
    canonical = np.float32([[128, 128], [384, 128], [128, 384]])
    transform = cv2.getAffineTransform(triangle, canonical)
    normalized = cv2.warpAffine(gray, transform, (512, 512), borderValue=255)
    radius = np.linspace(256 * .38, 256 * .86, 128, dtype=np.float32)[:, None]
    angle = np.linspace(-np.pi, np.pi, 720, endpoint=False, dtype=np.float32)[None, :]
    polar = cv2.remap(normalized, 256 + radius * np.cos(angle), 256 + radius * np.sin(angle),
                      cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=255)
    binary = cv2.threshold(polar, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    occupancy = (binary > 0).mean(axis=0)
    spectrum = np.abs(np.fft.rfft(occupancy - occupancy.mean()))
    powers = {str(n): round(float(spectrum[n]), 4) for n in (36, 54, 72)}
    floor = float(np.median(spectrum[10:100])) + 1e-6
    strongest = max(powers, key=powers.get)
    report.update(finderCenters=triangle.round(2).tolist(),
                  angularPeriodEvidence=powers, strongestAngularPeriod=int(strongest),
                  angularSignalToMedian=round(powers[strongest] / floor, 3),
                  normalization="three_finder_affine_not_perspective")
    # Three circular marks alone must not be reported as a recognized WeChat code.
    if powers[strongest] / floor < 4 or not .04 < float(occupancy.mean()) < .70:
        return report, artifacts
    report.update(status="roundcode_candidate_payload_unsupported",
                  sampling={"angles": 720, "radialSamples": 128, "isDecodedBitstream": False},
                  missingStages=["format_metadata", "32_mask_patterns", "data_cell_layout",
                                 "error_correction_parameters", "payload_to_scene_mapping"])
    overlay = image.copy()
    for label, point in zip(("origin", "right", "down"), triangle):
        xy = tuple(np.round(point).astype(int))
        cv2.circle(overlay, xy, 22, (0, 120, 255), 2)
        cv2.putText(overlay, label, (xy[0] + 10, xy[1] - 12), cv2.FONT_HERSHEY_SIMPLEX,
                    .4, (0, 90, 220), 1, cv2.LINE_AA)
    artifacts = {"finders.png": overlay, "affine-normalized.png": normalized,
                 "polar-grayscale.png": polar, "polar-threshold.png": 255 - binary}
    return report, artifacts


def write_png(path, image):
    ok, data = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("Cannot encode diagnostic image")
    data.tofile(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-scene", help="Comparison only; never seeds or fabricates a decoded value")
    args = parser.parse_args()
    report, artifacts = analyze(read_image(args.image), args.expected_scene)
    report.update(inputSha256=hashlib.sha256(args.image.read_bytes()).hexdigest(),
                  opencvVersion=cv2.__version__)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, image in artifacts.items():
        write_png(args.output / name, image)
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))
    # A detector-only result must never look like successful parameter decoding.
    return 0 if report["status"] == "standard_qr_decoded" else 2


if __name__ == "__main__":
    raise SystemExit(main())
