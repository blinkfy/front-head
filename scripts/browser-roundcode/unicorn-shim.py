"""Unicorn 2.1.4 Python API bridge to the browser-local AArch64 WASM engine.

Addresses stay below 2**32; register buffers preserve all 128 SIMD bits.
The Worker owns the engine and its callbacks. No host/network syscalls exist.
"""
from .unicorn_const import *
import js, sys
unicorn = sys.modules[__name__]
from pyodide.ffi import to_js, create_proxy

class UcError(Exception):
    def __init__(self, message):
        self.errno = 0
        import re
        match = re.search(r"code (\d+)", str(message))
        if match: self.errno = int(match[1])
        super().__init__(str(message))

class Uc:
    def __init__(self, arch, mode):
        self.e = js.qbarUnicorn.Unicorn.new(arch, mode)
        self.proxies = []
    def run(self, name, *args):
        try: return getattr(self.e, name)(*args)
        except Exception as exc: raise UcError(str(exc)) from exc
    def mem_map(self, address, size, perms=UC_PROT_ALL):
        self.run('mem_map',address,size,perms)
        # The WASM allocator can reuse dirty pages; guest mmap must start zeroed.
        self.mem_write(address,bytes(size))
    def mem_unmap(self, address, size): return self.run('mem_unmap',address,size)
    def mem_protect(self, address, size, perms): return self.run('mem_protect',address,size,perms)
    def mem_regions(self): return [(r['begin'],r['end'],r['perms']) for r in self.run('mem_regions').to_py()]
    def mem_read(self, address, size): return bytes(self.run('mem_read',address,size).to_py())
    def mem_write(self, address, data): return self.run('mem_write',address,to_js(bytes(data)))
    def reg_read(self, reg): return int.from_bytes(self.run('reg_read',reg,16).to_py(),'little')
    def reg_write(self, reg, value): return self.run('reg_write',reg,to_js((value % (1<<128)).to_bytes(16,'little')))
    def emu_start(self, begin, until, timeout=0, count=0): return self.run('emu_start',begin,until,timeout,count)
    def emu_stop(self): return self.run('emu_stop')
    def query(self, query): return self.run('query',query)
    def context_save(self):
        ctx=self.run('context_alloc'); self.run('context_save',ctx); return ctx
    def context_restore(self, ctx): return self.run('context_restore',ctx)
    def hook_add(self, kind, callback, user_data=None, begin=1, end=0, *args):
        def call(*values):
            values=list(values)
            # JS API passes its own engine and user-data, replaced by Python API values.
            return callback(self, *values[1:-1], user_data)
        proxy=create_proxy(call); self.proxies.append(proxy)
        return self.run('hook_add',kind,proxy,None,begin,end,*args)
    def close(self):
        self.run('close')
        for proxy in self.proxies: proxy.destroy()
        self.proxies.clear()
