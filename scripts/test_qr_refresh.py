"""Focused tests for the two Python WeChat QR refresh methods.

The production modules are intentionally not imported: the simulator module pulls
in PyQt and model dependencies, while these tests only need the methods under test.
Run with: python -m unittest front-head/scripts/test_qr_refresh.py
"""

import ast
import pathlib
import threading
import time
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]


def extract_method(relative_path, method_name):
    tree = ast.parse((ROOT / relative_path).read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)) and member.name == method_name:
                    module = ast.Module(body=[member], type_ignores=[])
                    ast.fix_missing_locations(module)
                    namespace = {
                        "requests": types.SimpleNamespace(post=None),
                        "register_generated": None,
                        "registration_error": lambda: "测试登记失败原因",
                        "threading": threading,
                        "time": time,
                        "WECHAT_QR_ENV_VERSION": "trial",
                    }
                    exec(compile(module, str(ROOT / relative_path), "exec"), namespace)
                    return namespace[method_name]
    raise AssertionError(f"{method_name} not found in {relative_path}")


class Response:
    status_code = 200
    headers = {"Content-Type": "image/png"}
    content = b"new-wechat-image"

    def json(self):
        return {}


class Signal:
    def __init__(self):
        self.calls = []

    def emit(self, *args):
        self.calls.append(args)


class MainWindowStub:
    def __init__(self, has_old=True):
        self.server = "http://test.invalid"
        self.device_id = "device-1"
        self._token = "token-1"
        self._has_wechat_qr_pixmap = has_old
        self.qr_update_signal = Signal()

    def _is_current_qr_token(self, token):
        return token == self._token


class TrackingLock:
    """RLock-compatible context manager that exposes lock ownership to mocks."""
    def __init__(self):
        self._lock = threading.RLock()
        self.owner = None

    def __enter__(self):
        self._lock.acquire()
        self.owner = threading.get_ident()
        return self

    def __exit__(self, *_):
        self.owner = None
        self._lock.release()

    def held_by_current_thread(self):
        return self.owner == threading.get_ident()


class SimulatorHandler:
    connection_bundle = {
        "token": "token-1", "qr_revision": "rev-1", "wechat_qr_png": b"old-image",
        "wechat_qr_content_type": "image/png", "wechat_qr_revision": "old-rev",
    }
    connection_history = {}
    simulator_state = {}


class SimulatorStub:
    def __init__(self):
        self.server = "http://test.invalid"
        self.device_id = "device-1"
        self.wechat_env_version = "trial"
        self._current_token = "token-1"
        self._state_lock = TrackingLock()


class QrRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main_method = extract_method("front-head/main_copy.py", "request_wechat_qr")
        cls.sim_method = extract_method("smartBin/device-simulator/设备模拟器.py", "_start_wechat_qr_request")

    def setUp(self):
        self.response = Response()

    def test_main_success_registers_before_publishing(self):
        window = MainWindowStub()
        entered, release = threading.Event(), threading.Event()
        namespace = type(self).main_method.__globals__
        namespace["requests"].post = lambda *a, **k: self.response

        def register(_response, _server):
            entered.set()
            release.wait(2)
            return True

        namespace["register_generated"] = register
        worker = threading.Thread(target=type(self).main_method, args=(window, "token-1"))
        worker.start()
        self.assertTrue(entered.wait(1), "registration should begin")
        self.assertTrue(all(call[2] is None for call in window.qr_update_signal.calls),
                        "new QR must not publish before registration finishes")
        release.set()
        worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertTrue(any(call[2] == self.response.content for call in window.qr_update_signal.calls))

    def test_main_registration_failure_keeps_existing_image_and_offers_retry(self):
        window = MainWindowStub(has_old=True)
        namespace = type(self).main_method.__globals__
        namespace["requests"].post = lambda *a, **k: self.response
        namespace["register_generated"] = lambda *_: False
        type(self).main_method(window, "token-1")
        self.assertTrue(window._has_wechat_qr_pixmap)
        self.assertFalse(any(call[2] == b"" for call in window.qr_update_signal.calls), "failure must not clear old image")
        self.assertTrue(any("重试" in str(call[-1]) for call in window.qr_update_signal.calls))

    def test_main_first_registration_failure_still_publishes_new_image_as_fallback(self):
        window = MainWindowStub(has_old=False)
        namespace = type(self).main_method.__globals__
        namespace["requests"].post = lambda *a, **k: self.response
        namespace["register_generated"] = lambda *_: False
        type(self).main_method(window, "token-1")
        self.assertTrue(any(call[2] == self.response.content for call in window.qr_update_signal.calls))
        self.assertTrue(any("普通" in str(call[-1]) and "APP" in str(call[-1]) for call in window.qr_update_signal.calls))

    def test_main_drops_result_if_token_changes_during_registration(self):
        window = MainWindowStub()
        entered, release = threading.Event(), threading.Event()
        namespace = type(self).main_method.__globals__
        namespace["requests"].post = lambda *a, **k: self.response

        def register(*_):
            entered.set()
            release.wait(2)
            return True

        namespace["register_generated"] = register
        worker = threading.Thread(target=type(self).main_method, args=(window, "token-1"))
        worker.start()
        self.assertTrue(entered.wait(1))
        window._token = "token-2"
        release.set()
        worker.join(2)
        self.assertFalse(any(call[2] == self.response.content for call in window.qr_update_signal.calls))

    def test_simulator_registers_outside_lock_then_publishes(self):
        SimulatorHandler.connection_bundle = {
            "token": "token-1", "qr_revision": "rev-1", "wechat_qr_png": b"old-image",
            "wechat_qr_content_type": "image/png", "wechat_qr_revision": "old-rev",
        }
        simulator = SimulatorStub()
        entered, release = threading.Event(), threading.Event()
        namespace = type(self).sim_method.__globals__
        namespace["StatusHandler"] = SimulatorHandler
        namespace["requests"].post = lambda *a, **k: self.response

        def register(_response, _server):
            self.assertFalse(simulator._state_lock.held_by_current_thread(), "decode/registration must run outside state lock")
            self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], b"old-image")
            entered.set()
            release.wait(2)
            return True

        namespace["register_generated"] = register
        worker = type(self).sim_method(simulator, "token-1")
        self.assertTrue(entered.wait(1), "registration should start before publishing")
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], b"old-image")
        release.set()
        worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], self.response.content)

    def test_simulator_failure_preserves_old_image_and_first_failure_publishes_image(self):
        namespace = type(self).sim_method.__globals__
        namespace["StatusHandler"] = SimulatorHandler
        namespace["requests"].post = lambda *a, **k: self.response
        namespace["register_generated"] = lambda *_: False

        SimulatorHandler.connection_bundle = {
            "token": "token-1", "qr_revision": "rev-1", "wechat_qr_png": b"old-image",
            "wechat_qr_content_type": "image/png", "wechat_qr_revision": "old-rev",
        }
        worker = type(self).sim_method(SimulatorStub(), "token-1")
        worker.join(2)
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], b"old-image")
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_status"], "error")
        self.assertIn("测试登记失败原因", SimulatorHandler.connection_bundle["wechat_qr_error"])

        SimulatorHandler.connection_bundle = {"token": "token-1", "qr_revision": "rev-1"}
        SimulatorHandler.connection_history = {}
        SimulatorHandler.simulator_state = {}
        worker = type(self).sim_method(SimulatorStub(), "token-1")
        worker.join(2)
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], self.response.content)
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_status"], "error")
        error_message = SimulatorHandler.connection_bundle["wechat_qr_error"]
        self.assertIn("普通", error_message)
        self.assertIn("APP", error_message)

    def test_simulator_discards_result_when_token_or_revision_changes_during_decode(self):
        namespace = type(self).sim_method.__globals__
        namespace["StatusHandler"] = SimulatorHandler
        namespace["requests"].post = lambda *a, **k: self.response
        entered, release = threading.Event(), threading.Event()

        def register(*_):
            entered.set()
            release.wait(2)
            return True

        namespace["register_generated"] = register
        SimulatorHandler.connection_bundle = {
            "token": "token-1", "qr_revision": "rev-1", "wechat_qr_png": b"old-image",
            "wechat_qr_content_type": "image/png", "wechat_qr_revision": "old-rev",
        }
        simulator = SimulatorStub()
        worker = type(self).sim_method(simulator, "token-1")
        self.assertTrue(entered.wait(1))
        SimulatorHandler.connection_bundle = dict(SimulatorHandler.connection_bundle, qr_revision="rev-2")
        release.set()
        worker.join(2)
        self.assertEqual(SimulatorHandler.connection_bundle["wechat_qr_png"], b"old-image")
        self.assertEqual(SimulatorHandler.connection_bundle["qr_revision"], "rev-2")


if __name__ == "__main__":
    unittest.main()
