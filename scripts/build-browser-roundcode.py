"""Build the browser's pure Python/JNI bundle; no Python runs on the server."""
from pathlib import Path
import sys
import textwrap
import zipfile
from roundcode_decoder import dependency_root

ROOT = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1])
source = (ROOT / 'scripts/roundcode_runtime_adapter.py').read_text(encoding='utf-8')
start = source.index('            status = call("ScanImage"')
end = source.index('        finally:\n            call("Release"', start)
scan = textwrap.dedent(source[start:end])
# Keep the already verified ELF/JNI implementation. Only retain its initialized
# handle between frames; local references are cleared after each complete scan.
source = source[:start] + '            def scan(gray, width, height):\n' + textwrap.indent(scan, '                ') + '''            while True:
                gray, width, height = yield
                try:
                    yield scan(gray, width, height)
                finally:
                    env.clear_locals()
''' + source[end:]
source = source.replace(
    'def _decode_gray(gray: bytes, width: int, height: int, runtime_root: Path, vfs_root: Path) -> dict:',
    'def _create_decoder(runtime_root: Path, vfs_root: Path):')
compile(source, 'browser_adapter.py', 'exec')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    with zipfile.ZipFile(ROOT / 'scripts/roundcode_assets/runtime.zip') as runtime:
        for name in runtime.namelist():
            archive.writestr(name, runtime.read(name))
    archive.writestr('browser_adapter.py', source.encode('utf-8'))
    for name in ('unicorn_const.py', 'arm_const.py', 'arm64_const.py'):
        archive.writestr('unicorn/' + name, (dependency_root() / 'unicorn' / name).read_bytes())
    archive.writestr('unicorn/__init__.py', (ROOT / 'scripts/browser-roundcode/unicorn-shim.py').read_bytes())
