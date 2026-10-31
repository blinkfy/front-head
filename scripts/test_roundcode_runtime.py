"""Fast bootstrap/resource checks. Real optical checks live in verify_roundcode_decoder.py."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roundcode_decoder as decoder


class RuntimeTests(unittest.TestCase):
    def test_two_device_packages_match_and_have_verified_runtime(self):
        root = Path(__file__).resolve().parents[2]
        left, right = root / 'front-head/scripts', root / 'smartBin/device-simulator'
        for name in ('roundcode_client.py', 'roundcode_decoder.py', 'roundcode_runtime_adapter.py',
                     'requirements-roundcode.txt', 'roundcode_assets/runtime.zip', 'roundcode_assets/runtime.sha256'):
            self.assertEqual((left / name).read_bytes(), (right / name).read_bytes(), name)
        archive = left / 'roundcode_assets/runtime.zip'
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(),
                         (left / 'roundcode_assets/runtime.sha256').read_text().strip())
        with zipfile.ZipFile(archive) as zipped:
            manifest = json.loads(zipped.read('manifest.json'))
            self.assertEqual(manifest['emulatorCommit'], '835265f33daa93e2046de5ffc71ccc496b1db61b')
            for name, expected in manifest['files'].items():
                self.assertEqual(hashlib.sha256(zipped.read(name)).hexdigest(), expected, name)
            self.assertFalse(any('keystone_in/' in name or name.endswith(('.jar', '.class', '.exe')) for name in zipped.namelist()))
            self.assertIn('vfs/system/lib64/libc++.so', zipped.namelist())

    def test_invalid_input_never_bootstraps_or_installs(self):
        with patch.object(decoder, 'prepare_resources') as prepare:
            for image, mime in [(b'', 'image/png'), (b'wrong header', 'image/png'),
                                (b'\x89PNG\r\n\x1a\n', 'text/html'),
                                (b'x' * (decoder.MAX_IMAGE + 1), 'image/jpeg')]:
                self.assertEqual(decoder.decode(image, mime), {'error': 'INVALID_IMAGE'})
            prepare.assert_not_called()

    def test_bad_resource_digest_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'runtime.zip').write_bytes(b'not a verified runtime')
            (path / 'runtime.sha256').write_text('0' * 64)
            with patch.object(decoder, 'ASSETS', path), self.assertRaisesRegex(RuntimeError, 'RUNTIME_INTEGRITY_FAILED'):
                decoder.prepare_resources()

    def test_managed_install_can_disable_network_setup(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,
                {'FTX_ROUNDCODE_CACHE': directory, 'FTX_ROUNDCODE_AUTO_INSTALL': '0'}):
            with patch.object(decoder, '_system_dependencies_available', return_value=False), \
                    patch.object(decoder.subprocess, 'run') as installer:
                with self.assertRaisesRegex(RuntimeError, 'DEPENDENCIES_MISSING'):
                    decoder.prepare_dependencies()
                installer.assert_not_called()

    def test_install_is_private_bounded_and_reused(self):
        def install(arguments, **kwargs):
            target = Path(arguments[arguments.index('--target') + 1])
            target.mkdir()
            for name in ('unicorn', 'capstone', 'PIL'):
                (target / name).mkdir()
            self.assertIn('--only-binary=:all:', arguments)
            self.assertEqual(kwargs['timeout'], 90)
            self.assertIs(kwargs['shell'], False)
            return Mock(returncode=0)
        original_path = sys.path[:]
        try:
            with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,
                    {'FTX_ROUNDCODE_CACHE': directory, 'FTX_ROUNDCODE_AUTO_INSTALL': '1'}):
                with patch.object(decoder, '_system_dependencies_available', return_value=False), \
                        patch.object(decoder.subprocess, 'run', side_effect=install) as installer:
                    target = decoder.prepare_dependencies()
                    self.assertTrue(target.is_relative_to(Path(directory)))
                    self.assertTrue(decoder.runtime_ready())
                    self.assertEqual(decoder.prepare_dependencies(), target)
                    self.assertEqual(installer.call_count, 1)
        finally:
            sys.path[:] = original_path


if __name__ == '__main__':
    unittest.main()
