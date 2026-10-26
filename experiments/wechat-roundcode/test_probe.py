"""Offline regression tests for the independent round-code probe."""
import unittest
from pathlib import Path

import cv2
import numpy as np

from probe import analyze, read_image


ROOT = Path(__file__).resolve().parents[3]
ROUND_SAMPLE = ROOT / "smartBin" / "device-simulator" / "qr.jpg"
SCENE = "0123456789abcdef0123456789abcdef"


class RoundCodeProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.round_image = read_image(ROUND_SAMPLE)

    def assert_round_candidate(self, image, expected_scene=None):
        report, artifacts = analyze(image, expected_scene=expected_scene)
        self.assertEqual(report["status"], "roundcode_candidate_payload_unsupported", report)
        self.assertIsNone(report["scene"])
        self.assertIsNone(report["expectedSceneVerified"])
        self.assertFalse(report["payloadDecoderImplemented"])
        self.assertFalse(report["networkUsed"])
        self.assertGreaterEqual(report["finderCandidateCount"], 3)
        self.assertEqual(report["sampling"]["angles"], 720)
        self.assertEqual(report["sampling"]["radialSamples"], 128)
        self.assertFalse(report["sampling"]["isDecodedBitstream"])
        self.assertTrue(artifacts)
        for name, image_data in artifacts.items():
            with self.subTest(artifact=name):
                self.assertIsInstance(image_data, np.ndarray)
                self.assertTrue(all(dimension > 0 for dimension in image_data.shape))
                self.assertGreater(np.count_nonzero(image_data), 0)
        return report, artifacts

    def test_round_sample_survives_common_image_transforms(self):
        enlarged = cv2.resize(self.round_image, None, fx=1.2, fy=1.2,
                              interpolation=cv2.INTER_NEAREST)
        cases = {
            "original": self.round_image,
            "rotate_90": cv2.rotate(self.round_image, cv2.ROTATE_90_CLOCKWISE),
            "light_blur": cv2.GaussianBlur(self.round_image, (3, 3), 0.65),
            "nearest_scale": enlarged,
        }
        for name, image in cases.items():
            with self.subTest(transform=name):
                self.assert_round_candidate(image, expected_scene=SCENE)

    def test_standard_qr_baseline_decodes_expected_scene(self):
        encoded = cv2.QRCodeEncoder_create().encode(SCENE)
        self.assertIsNotNone(encoded)
        quiet = cv2.copyMakeBorder(encoded, 4, 4, 4, 4,
                                   cv2.BORDER_CONSTANT, value=255)
        side = max(quiet.shape) * 8
        scaled = cv2.resize(quiet, (side, side), interpolation=cv2.INTER_NEAREST)
        image = cv2.cvtColor(scaled, cv2.COLOR_GRAY2BGR)

        matching, _ = analyze(image, expected_scene=SCENE)
        self.assertEqual(matching["status"], "standard_qr_decoded", matching)
        self.assertTrue(matching["standardQrDecoded"])
        self.assertIsNone(matching["scene"])
        self.assertTrue(matching["expectedSceneVerified"])
        self.assertFalse(matching["payloadDecoderImplemented"])

        mismatching, _ = analyze(image, expected_scene=SCENE[:-1] + "e")
        self.assertEqual(mismatching["status"], "standard_qr_decoded", mismatching)
        self.assertFalse(mismatching["expectedSceneVerified"])

    def test_non_round_images_do_not_become_round_candidates(self):
        blank = np.full((430, 430, 3), 255, dtype=np.uint8)
        rng = np.random.default_rng(20261026)
        noise = rng.integers(0, 256, size=(430, 430, 3), dtype=np.uint8)

        three_circles = np.full((430, 430, 3), 255, dtype=np.uint8)
        for center in ((100, 100), (330, 100), (100, 330)):
            cv2.circle(three_circles, center, 25, (0, 0, 0), -1, cv2.LINE_AA)
            cv2.circle(three_circles, center, 17, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(three_circles, center, 8, (0, 0, 0), -1, cv2.LINE_AA)

        for name, image in (("blank", blank), ("random_noise", noise),
                            ("three_circles", three_circles)):
            with self.subTest(image=name):
                report, _ = analyze(image, expected_scene=SCENE)
                self.assertNotEqual(report["status"], "roundcode_candidate_payload_unsupported", report)
                self.assertIsNone(report["scene"])
                self.assertIsNone(report["expectedSceneVerified"])
                self.assertFalse(report["payloadDecoderImplemented"])


if __name__ == "__main__":
    unittest.main()
