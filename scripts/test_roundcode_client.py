"""Isolated protocol tests; no real device, WeChat, native decoder or backend."""
import base64
import json
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roundcode_client as client
import roundcode_worker as worker


RAW = base64.b64encode(b"opaque-test-payload").decode("ascii")
IMAGE = b"test-only-image"


def command(program):
    return [sys.executable, "-c", program]


GOOD = command("import json,sys; data=json.load(sys.stdin); print(json.dumps({'scanType':'WX_CODE','rawBase64':" + repr(RAW) + "}))")


def task():
    return {"id": "rq_" + "a" * 24, "ticket": "b" * 64, "expiresAt": time.time() * 1000 + 60000}


def response(value=None):
    header = base64.urlsafe_b64encode(json.dumps(value or task()).encode()).decode().rstrip("=")
    return Mock(headers={"X-Round-Code-Task": header, "Content-Type": "image/png"}, content=IMAGE)


class ClientTests(unittest.TestCase):
    def test_helper_copies_match(self):
        root = Path(__file__).resolve().parents[2]
        self.assertEqual((root / "front-head/scripts/roundcode_client.py").read_bytes(),
                         (root / "smartBin/device-simulator/roundcode_client.py").read_bytes())

    def test_explicitly_disabled_does_not_start_process_or_http(self):
        post = Mock()
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": "", "FTX_ROUNDCODE_ENABLED": "0"}), patch.object(client.subprocess, "Popen") as popen:
            self.assertFalse(client.register_generated(response(), "http://localhost:3000", post))
        popen.assert_not_called(); post.assert_not_called()

    def test_default_bundled_decoder_needs_no_override(self):
        selected = client.decoder_command({})
        self.assertEqual(selected[0], sys.executable)
        self.assertEqual(Path(selected[1]).name, 'roundcode_decoder.py')
        self.assertEqual(selected[2], '--stdin-json')

    def test_command_requires_explicit_non_java_argv(self):
        for value in ["java -jar helper.jar", '"helper"', "[]", '["java","-jar","a.jar"]', '["bash","-c","anything"]', '["helper","unidbg"]']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                client.decoder_command({"FTX_ROUNDCODE_DECODER": value})

    def test_decode_bounded_valid_wx_only(self):
        self.assertEqual(client.decode_image(IMAGE, "image/png", GOOD), RAW)
        self.assertIsNone(client.decode_image(IMAGE, "text/html", GOOD))
        self.assertIsNone(client.decode_image(b"x" * (client.MAX_IMAGE + 1), "image/png", GOOD))
        for payload in [{"scanType": "QR_CODE", "rawBase64": RAW}, {"scanType": "WX_CODE", "rawBase64": "broken"}, {"error": "MULTIPLE_CODES"}, [RAW]]:
            with self.subTest(payload=payload):
                self.assertIsNone(client.decode_image(IMAGE, "image/png", command("print(" + repr(json.dumps(payload)) + ")")))

    def test_invalid_json_nonzero_oversized_and_timeout(self):
        for program in ["print('not-json')", "raise SystemExit(2)", "import sys; sys.stdout.write('x'*2000000); sys.stdout.flush()"]:
            with self.subTest(program=program):
                self.assertIsNone(client.decode_image(IMAGE, "image/png", command(program)))
        started = time.monotonic()
        self.assertIsNone(client.decode_image(IMAGE, "image/png", command("import time; time.sleep(10)"), timeout=0.1))
        self.assertLess(time.monotonic() - started, 2)

    def test_registration_uses_only_task_receipt_and_raw(self):
        current = task()
        post = Mock(return_value=Mock(status_code=200, json=lambda: {"code": 0, "data": {"registered": True}}))
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": json.dumps(GOOD)}):
            self.assertTrue(client.register_generated(response(current), "http://localhost:3000/", post))
        args, kwargs = post.call_args
        self.assertEqual(args, ("http://localhost:3000/api/device/wechat-qr/register-generated",))
        self.assertEqual(kwargs["json"], {"taskId": current["id"], "ticket": current["ticket"], "rawBase64": RAW})
        self.assertLessEqual(kwargs["timeout"], 8)

    def test_stale_receipts_invalid_headers_do_not_register(self):
        stale = {**task(), "expiresAt": time.time() * 1000 - 1}
        self.assertIsNone(client.task_from_header(response(stale).headers["X-Round-Code-Task"]))
        for header in ["@@@", "a" * 2049, base64.urlsafe_b64encode(b"[]").decode()]:
            self.assertIsNone(client.task_from_header(header))
        post = Mock()
        self.assertFalse(client.register_task(stale, IMAGE, "image/png", "http://localhost", post, GOOD))
        post.assert_not_called()

    def test_local_errors_or_http_failure_are_optional(self):
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": json.dumps(GOOD)}):
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock(side_effect=RuntimeError("secret must not escape"))))
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock(return_value=Mock(status_code=410, json=lambda: {"code": 1}))))
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": "invalid"}):
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock()))

    def test_failure_diagnostics_distinguish_decoder_and_receipt(self):
        failed = command("import json; print(json.dumps({'error':'DEPENDENCIES_MISSING'})); raise SystemExit(1)")
        self.assertIsNone(client.decode_image(IMAGE, "image/png", failed))
        self.assertIn("依赖安装失败", client.registration_error())
        post = Mock()
        missing = Mock(headers={"Content-Type": "image/png"}, content=IMAGE)
        self.assertFalse(client.register_generated(missing, "http://localhost", post))
        self.assertIn("未返回圆码登记凭证", client.registration_error())
        post.assert_not_called()
        self.assertFalse(client.register_generated(response({**task(), "expiresAt": 0}), "http://localhost", post))
        self.assertIn("已过期", client.registration_error())

    def test_registration_http_diagnostics_and_redaction(self):
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": json.dumps(GOOD)}):
            html404 = Mock(status_code=404, json=Mock(side_effect=ValueError("private response")))
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock(return_value=html404)))
            html404.json.assert_not_called()
            self.assertIn("更新后端", client.registration_error())
            failure = Mock(status_code=503, json=lambda: {"reason": "ROUND_CODE_STORE_UNAVAILABLE", "msg": RAW})
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock(return_value=failure)))
            self.assertIn("存储暂不可用", client.registration_error())
            self.assertNotIn(RAW, client.registration_error())
            self.assertFalse(client.register_generated(response(), "http://localhost", Mock(side_effect=RuntimeError(RAW))))
            self.assertIn("检查后端网络", client.registration_error())
            self.assertNotIn(RAW, client.registration_error())
            good = Mock(status_code=200, json=lambda: {"code": 0, "data": {"registered": True}})
            self.assertTrue(client.register_generated(response(), "http://localhost", Mock(return_value=good)))
            self.assertEqual(getattr(client._diagnostic, "message"), "")

    def test_claimed_worker_task_and_idle(self):
        claimed = {**task(), "imageBase64": base64.b64encode(IMAGE).decode(), "mime": "image/png"}
        post = Mock(side_effect=[Mock(status_code=200, json=lambda: {"code": 0, "data": {"task": claimed}}),
                                Mock(status_code=200, json=lambda: {"code": 0, "data": {"registered": True}})])
        with patch.dict(os.environ, {"FTX_ROUNDCODE_DECODER": json.dumps(GOOD)}):
            self.assertTrue(worker.process_one("http://localhost", "test-worker-key", post))
        self.assertEqual(post.call_args_list[0].kwargs["headers"], {"X-Round-Code-Worker": "test-worker-key"})
        self.assertNotIn("headers", post.call_args_list[1].kwargs)
        idle = Mock(return_value=Mock(status_code=200, json=lambda: {"code": 0, "data": {"task": None}}))
        self.assertFalse(worker.process_one("http://localhost", "test-key", idle))
        self.assertEqual(idle.call_count, 1)

    def test_worker_rejects_invalid_task_or_claim(self):
        for current in [{**task(), "imageBase64": "a" * (client.MAX_IMAGE * 2), "mime": "image/png"},
                        {**task(), "imageBase64": "@@@", "mime": "image/png"}, {**task(), "mime": "text/html"}]:
            with self.subTest(current=current["mime"]), self.assertRaises(RuntimeError):
                worker.process_one("http://localhost", "test", Mock(return_value=Mock(status_code=200, json=lambda: {"code": 0, "data": {"task": current}})))
        with self.assertRaises(RuntimeError):
            worker.process_one("http://localhost", "test", Mock(return_value=Mock(status_code=403)))


if __name__ == "__main__":
    unittest.main()
