import sys, types, json, logging
from pathlib import Path
sys.path.insert(0, '/runtime')
# Disassembly is only used by optional upstream trace logging, never decoding.
capstone = types.ModuleType('capstone')
capstone.CS_ARCH_ARM = capstone.CS_ARCH_ARM64 = capstone.CS_MODE_ARM = capstone.CS_MODE_THUMB = 0
class TraceDisabled:
    def __init__(self, *args): pass
    def disasm(self, *args): return []
capstone.Cs = TraceDisabled
sys.modules['capstone'] = capstone
# Pyodide has a private in-memory VFS, not host file descriptors or file locks.
fcntl = types.ModuleType('fcntl')
def unsupported_fcntl(*args): raise OSError('Unsupported guest file operation')
fcntl.fcntl = unsupported_fcntl
sys.modules['fcntl'] = fcntl
logging.disable(logging.CRITICAL)
import browser_adapter
for name in ('proc', 'dev', 'data', 'tmp', 'sdcard'):
    Path('/runtime/vfs', name).mkdir(exist_ok=True)
_decoder = browser_adapter._create_decoder(Path('/runtime'), Path('/runtime/vfs'))
next(_decoder)
def decode_frame(gray, width, height):
    if not (24 <= width <= 384 and 24 <= height <= 384 and len(gray) == width * height):
        return {'error': 'INVALID_IMAGE'}
    result = _decoder.send((bytes(gray), width, height))
    next(_decoder)
    return result
