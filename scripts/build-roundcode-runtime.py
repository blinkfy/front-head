"""Rebuild the small, offline Python QBar runtime from pinned development inputs.

No JRE, JVM, APK or emulator service is included. The runtime executes only on
the generating device, using Python/Unicorn and the existing Android ARM64 kernel.
"""
import hashlib
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EMU = ROOT / 'experiments/wechat-roundcode/artifacts/python-emu'
COMMIT = '835265f33daa93e2046de5ffc71ccc496b1db61b'
NATIVE_SHA = 'bcc8fe759fb7ea0d325712f0db63c4296d30e4ccf044402bc8baa0957e691e1b'


def build():
    files = {}
    for path in sorted((EMU / 'androidemu').rglob('*.py')):
        relative = path.relative_to(EMU).as_posix()
        if '/keystone_in/' in relative:
            continue
        content = path.read_bytes()
        # These two modules import Keystone but use fixed, pre-encoded stubs.
        # Neither uses Ks/KS_* at runtime. Removing the unused import avoids a
        # second native assembler and its host-architecture-specific libraries.
        if relative in ('androidemu/hooker.py', 'androidemu/native_hook_utils.py'):
            lines = content.splitlines(keepends=True)
            assert lines[0].startswith(b'from .keystone_in import ')
            content = b''.join(lines[1:])
        files[relative] = content
    for relative in ['emu_cfg/default.json', 'vfs/system/bin/app_process64',
                     *['vfs/system/lib64/' + name for name in
                       ('libc.so', 'libm.so', 'libdl.so', 'liblog.so', 'libstdc++.so', 'libc++.so')]]:
        files[relative] = (EMU / relative).read_bytes()
    kernel = (ROOT.parent / 'back-end/native/qbar/libwechatQrMod.so').read_bytes()
    assert hashlib.sha256(kernel).hexdigest() == NATIVE_SHA
    files['libwechatQrMod.so'] = kernel
    manifest = {'version': 1, 'emulatorCommit': COMMIT,
                'emulatorSource': 'https://github.com/maiyao1988/ExAndroidNativeEmu',
                'kernelSource': 'https://github.com/sollyu/wechat-scanner/tree/8ba599fd90216d1ba148eda4cd051eb86cc5b16d',
                'transformations': ['Remove unused Keystone imports in hooker.py and native_hook_utils.py'],
                'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    files['manifest.json'] = json.dumps(manifest, indent=2).encode('utf-8')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    data = output.getvalue()
    for directory in (ROOT / 'scripts/roundcode_assets', ROOT.parent / 'smartBin/device-simulator/roundcode_assets'):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'runtime.zip').write_bytes(data)
        (directory / 'runtime.sha256').write_text(hashlib.sha256(data).hexdigest() + '\n', encoding='ascii')
    print(f'Bundled {len(files)} files, {len(data)} bytes; no Java/Keystone host runtime')


if __name__ == '__main__':
    build()
