"""Compile and exercise LoopbackMapServer in a temporary JVM; optionally test its real SDK bridge."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
JAVA_SOURCE = ROOT / "src/uni_modules/ftx-map-local-server/native-src/android/LoopbackMapServer.java"
APP_MAP = ROOT / "src/static/app-map"
STATIC = ROOT / "src/static"
APP_MAP_FILES = ("index.html", "host.mjs", "renderer.mjs")
MARKER_FILES = ("normal-marker.png", "smart-marker.png", "pending-bin-marker.png")
PLAYWRIGHT = Path(r"D:/nodejs/node_global/node_modules/openclaw/node_modules/playwright-core")
CHROMIUM = Path(r"C:/Users/29513/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe")


HARNESS = r'''import ftx.map.LoopbackMapServer;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicBoolean;

public final class LocalServerHarness {
    public static void main(String[] args) throws Exception {
        final File appMap = new File(args[0]);
        final File staticDir = new File(args[1]);
        final AtomicBoolean missing = new AtomicBoolean(false);
        LoopbackMapServer server = new LoopbackMapServer(path -> {
            if (missing.get() && "static/pending-bin-marker.png".equals(path))
                throw new IOException("fixture resource intentionally missing");
            File file;
            if ("index.html".equals(path) || "host.mjs".equals(path) || "renderer.mjs".equals(path))
                file = new File(appMap, path);
            else if ("static/normal-marker.png".equals(path) || "static/smart-marker.png".equals(path)
                    || "static/pending-bin-marker.png".equals(path))
                file = new File(staticDir, path.substring("static/".length()));
            else throw new IOException("unmapped fixture resource");
            return new FileInputStream(file);
        });
        System.out.println(server.getBaseUrl());
        System.out.flush();
        java.io.BufferedReader input = new java.io.BufferedReader(new java.io.InputStreamReader(System.in, "UTF-8"));
        String command;
        while ((command = input.readLine()) != null) {
            if ("MISSING".equals(command)) missing.set(true);
            else if ("AVAILABLE".equals(command)) missing.set(false);
            else if ("STOP".equals(command)) {
                server.close();
                server.close();
                return;
            }
        }
        server.close();
        server.close();
    }
}'''


BROWSER_RUNNER = r'''const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createRequire } = require('node:module')
const { chromium } = require(process.env.MAP_TEST_PLAYWRIGHT)
const root = process.env.MAP_TEST_ROOT
const projectRequire = createRequire(path.join(root, 'scripts/test-app-tencent-map.mjs'))
const { transformWithEsbuild } = projectRequire('@dcloudio/uni-cli-shared')

;(async () => {
  const baseUrl = process.env.MAP_TEST_BASE_URL
  const screenshot = path.join(process.env.MAP_TEST_TMP, 'satellite.png')
  const sourcePath = path.join(root, 'src/components/AppTencentMap.vue')
  const source = fs.readFileSync(sourcePath, 'utf8')
  const renderjs = source.match(/<script\s+module="mapView"\s+lang="renderjs">([\s\S]*?)<\/script>/)[1]
  const compiled = (await transformWithEsbuild(renderjs, sourcePath, {
    format: 'iife', globalName: '__renderjsMapTest', target: 'es6', bundle: true, write: false
  })).outputFiles[0].text
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'))
  const key = manifest['app-plus']?.distribute?.sdkConfigs?.maps?.tencent?.key
  if (!key) throw new Error('Tencent map key missing from app manifest')
  const parent = path.join(process.env.MAP_TEST_TMP, 'map-parent.html')
  fs.writeFileSync(parent, `<!doctype html><meta charset="utf-8"><style>html,body,#map-host{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="map-host"></div><script>${compiled}</script><script>window.events=[];window.testOwner={callMethod(name,event){if(name==='onMapEvent')window.events.push(event)}};window.mapContext={frame:null,token:null,frameOrigin:null,frameReady:false,stopped:false,owner:window.testOwner,sendEvent:window.__renderjsMapTest.default.methods.sendEvent,sendPacket:window.__renderjsMapTest.default.methods.sendPacket};window.startMap=packet=>window.__renderjsMapTest.default.methods.update.call(window.mapContext,packet,null,window.testOwner);window.updateMap=packet=>window.__renderjsMapTest.default.methods.update.call(window.mapContext,packet,null,window.testOwner);</script>`)

  const browser = await chromium.launch({ executablePath: process.env.MAP_TEST_CHROMIUM, headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
    page.setDefaultTimeout(90000)
    await page.goto(pathToFileURL(parent).href)
    if (await page.evaluate(() => location.protocol) !== 'file:') throw new Error('parent page is not file://')
    const packet = { hostId: 'map-host', frameUrl: baseUrl + 'index.html', key, assetBase: baseUrl,
      latitude: 25.033, longitude: 121.5654, scale: 12, satellite: false, markers: [], userLocation: {} }
    await page.evaluate(value => window.startMap(value), packet)
    await page.waitForFunction(() => window.events.some(e => e.type === 'phase' && e.detail?.phase === 'http_frame_ready'), null, { timeout: 30000 })
    await page.waitForFunction(() => window.events.some(e => e.type === 'updated' && e.detail?.satellite === false), null, { timeout: 60000 })
    await page.evaluate(() => window.updateMap({ ...window.mapContext.latestPacket, satellite: true }))
    await page.waitForFunction(() => window.events.some(e => e.type === 'updated' && e.detail?.satellite === true), null, { timeout: 90000 })
    await page.screenshot({ path: screenshot })
    await page.evaluate(() => window.updateMap({ ...window.mapContext.latestPacket, satellite: false }))
    await page.waitForFunction(() => window.events.filter(e => e.type === 'updated' && e.detail?.satellite === false).length >= 2, null, { timeout: 60000 })
    await page.evaluate(() => window.updateMap({ ...window.mapContext.latestPacket, satellite: true }))
    await page.waitForFunction(() => window.events.filter(e => e.type === 'updated' && e.detail?.satellite === true).length >= 2, null, { timeout: 90000 })
    await page.evaluate(() => window.updateMap({ ...window.mapContext.latestPacket, latitude: 24.5, longitude: 120.3, command: { id: 42 } }))
    await page.waitForFunction(() => window.events.some(e => e.type === 'center' && e.detail?.requestId === 42), null, { timeout: 15000 })
    const result = await page.evaluate(() => ({
      frame: document.querySelector('iframe')?.src,
      satelliteUpdates: window.events.filter(e => e.type === 'updated' && e.detail?.satellite === true).length,
      center: window.events.find(e => e.type === 'center' && e.detail?.requestId === 42)?.detail
    }))
    if (result.frame !== baseUrl + 'index.html#' + encodeURIComponent(await page.evaluate(() => window.mapContext.token)))
      throw new Error('iframe did not use the JVM server URL')
    if (result.satelliteUpdates < 2 || result.center?.latitude !== 24.5 || result.center?.longitude !== 120.3)
      throw new Error('satellite tilesloaded bridge or center query failed')
    console.log('PASS [browser] file parent -> JVM HTTP iframe; real Tencent SDK satellite/vector tilesloaded and center query')
    console.log('Temporary satellite screenshot: ' + screenshot)
  } finally { await browser.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
'''


LIFECYCLE_RUNNER = r'''const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync(process.env.MAP_TEST_COMPONENT, 'utf8')
assert.match(source, /<map v-if="rendererFallback" v-show="!covered"/, 'covered only hides the native-map fallback')
assert.match(source, /<view v-else :id="hostId" class="app-tencent-map" :map-packet="packet"/, 'HTTP map host remains mounted')
assert.match(source, /active:\s*this\.mapActive/)
assert.match(source, /disposed:\s*this\.mapDisposed/)
assert.match(source, /enableSatellite:\s*Boolean,\s*covered:\s*Boolean/)
assert.match(source, /\.app-tencent-map\s*\{\s*width:\s*100%;\s*height:\s*100%;\s*\}/, 'covered does not change the map host dimensions')
const root = process.env.MAP_TEST_ROOT
for (const pagePath of ['src/pages/map/map.vue', 'src/pages-dark/map/map.vue']) {
  const page = fs.readFileSync(require('node:path').join(root, pagePath), 'utf8')
  const appMapTag = page.match(/<AppTencentMap\b[^>]*>/)?.[0]
  assert.ok(appMapTag, pagePath + ' has an AppTencentMap element')
  assert.match(appMapTag, /:covered="showAddModal"/, pagePath + ' passes the modal cover state')
  assert.match(appMapTag, /class="[^"]*map-canvas/, pagePath + ' retains the map frame class')
  assert.doesNotMatch(appMapTag, /\bv-(?:if|show)=/, pagePath + ' does not toggle the whole map component')
  assert.doesNotMatch(appMapTag, /(?:covered|showAddModal)[^>]*(?:width|height)|(?:width|height)[^>]*(?:covered|showAddModal)/,
    pagePath + ' does not resize the map frame when covered')
}
const optionSource = source.match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import\s+[^\r\n]*\r?\n/gm, '').replace(/export\s+default\s+/, 'return ')
const hookSets = []
const starts = []
const stops = []
let platform = 'android'
let startResults = []
const component = new Function('mapConfig', 'manifest', 'baseUrl', 'getCurrentInstance',
  'onHide', 'onShow', 'onUnload', 'startLocalMapServer', 'stopLocalMapServer', 'uni', 'console', optionSource)(
  { qqMapKey: '' }, {}, 'https://app.example', () => ({ root: {} }),
  callback => hookSets.at(-1).hide = callback,
  callback => hookSets.at(-1).show = callback,
  callback => hookSets.at(-1).unload = callback,
  () => { starts.push(platform); return startResults.shift() },
  url => stops.push(url),
  { getSystemInfoSync: () => ({ platform }) },
  { info() {}, warn() {} }
)
function createInstance(currentPlatform, results, satellite = false) {
  platform = currentPlatform
  startResults = [...results]
  const hooks = {}
  hookSets.push(hooks)
  const events = []
  const instance = { latitude: 25, longitude: 121, scale: 12, enableSatellite: satellite,
    markers: [], userLocation: {}, $nextTick: fn => fn(), $emit: (...args) => events.push(args) }
  Object.assign(instance, component.data.call(instance), component.methods)
  component.created.call(instance)
  return { instance, hooks, events }
}

const a = 'http://127.0.0.1:19001/token-a/'
const b = 'http://127.0.0.1:19002/token-b/'
const beforeStarts = starts.length
const beforeStops = stops.length
const android = createInstance('android', [a, b])
assert.equal(starts.length - beforeStarts, 1)
assert.equal(android.instance.frameUrl, a + 'index.html')
assert.equal(android.instance.assetBase, a)
assert.equal(android.instance.rendererFallback, false)
android.hooks.hide()
assert.equal(android.instance.mapActive, false)
assert.equal(android.instance.localMapBase, a)
assert.deepEqual(stops.slice(beforeStops), [])
for (let index = 0; index < 3; index++) {
  android.hooks.show()
  assert.equal(android.instance.mapActive, true)
  assert.equal(android.instance.frameUrl, a + 'index.html')
  android.hooks.hide()
  assert.equal(android.instance.mapActive, false)
}
android.hooks.show()
assert.equal(starts.length - beforeStarts, 1, 'repeated hide/show keeps the existing local server')
assert.equal(android.instance.frameUrl, a + 'index.html')
assert.equal(android.instance.assetBase, a)
assert.equal(android.instance.mapActive, true)
assert.equal(android.instance.rendererFallback, false)
assert.equal(android.instance.mapDisposed, false)
component.beforeUnmount.call(android.instance)
assert.equal(android.instance.mapDisposed, true)
assert.equal(component.computed.packet.call(android.instance).disposed, true)
const emittedBeforeLateEvent = android.events.length
android.instance.onMapEvent({ type: 'error', detail: { code: 'frame_load_failed' } })
assert.equal(android.events.length, emittedBeforeLateEvent, 'disposed component ignores late renderer events')
android.hooks.unload()
android.instance.releaseLocalMapServer()
assert.deepEqual(stops.slice(beforeStops), [a], 'actual unmount/unload releases the retained URL exactly once')
console.log('PASS [options] Android repeated hide/show retains one server URL; actual dispose stops once and ignores late events')

const beforeIosStarts = starts.length
const beforeIosStops = stops.length
const ios = createInstance('ios', [])
const onlineFrame = 'https://app.example/web/static/app-map/index.html'
assert.equal(starts.length, beforeIosStarts)
assert.equal(ios.instance.frameUrl, onlineFrame)
assert.equal(ios.instance.assetBase, 'https://app.example/web/')
ios.hooks.hide(); ios.hooks.show()
assert.equal(ios.instance.mapActive, true)
assert.equal(ios.instance.frameUrl, onlineFrame)
assert.equal(starts.length, beforeIosStarts)
assert.equal(stops.length, beforeIosStops)
console.log('PASS [options] iOS remains on the online frame without native start/stop')

const beforeEmptyStarts = starts.length
const empty = createInstance('android', [''], true)
assert.equal(starts.length - beforeEmptyStarts, 1)
assert.equal(empty.instance.rendererFallback, true)
assert.equal(empty.instance.mapActive, true)
assert.equal(empty.instance.frameUrl, onlineFrame)
assert.deepEqual(empty.events, [['error', { detail: { code: 'local_server_unavailable', satellite: true } }]])
console.log('PASS [options] empty native start result immediately selects normal fallback and emits local_server_unavailable')

const renderSource = source.match(/<script\s+module="mapView"\s+lang="renderjs">([\s\S]*?)<\/script>/)[1]
let currentHost
let observer
let rafId = 0
const rafs = new Map()
const cancelledRafs = new Set()
let timerId = 0
const timers = new Map()
const frames = []
const host = name => ({ name, isConnected: true, children: [], appendChild(frame) { this.children.push(frame); frame.parent = this } })
const messageListeners = new Set()
const context = {
  URL, Math, JSON,
  document: { getElementById: () => currentHost, createElement: () => {
    const frame = { style: {}, contentWindow: { postMessage() { frame.posted = (frame.posted || 0) + 1 } }, remove() { this.removed = true } }
    frames.push(frame); return frame
  }, documentElement: {} },
  window: { addEventListener(type, callback) { if (type === 'message') messageListeners.add(callback) }, removeEventListener(type, callback) { if (type === 'message') messageListeners.delete(callback) } },
  requestAnimationFrame(callback) { const id = ++rafId; rafs.set(id, callback); return id },
  cancelAnimationFrame(id) { cancelledRafs.add(id); rafs.delete(id) },
  setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id }, clearTimeout(id) { timers.delete(id) },
  MutationObserver: class { constructor(callback) { this.callback = callback; observer = this } observe() {} disconnect() { this.disconnected = true } }
}
vm.runInNewContext('globalThis.render = (' + renderSource.replace(/export\s+default\s+/, '') + ')', context)
const emitted = []
const state = { stopped: false }
const owner = { callMethod(name, event) { if (name === 'onMapEvent') emitted.push(event) } }
const packet = (url, active = true, disposed = false) => ({ hostId: 'map-host', active, disposed, frameUrl: url, latitude: 25, longitude: 121, scale: 12 })
const flushRaf = () => { for (const [id, callback] of [...rafs]) { rafs.delete(id); callback() } }
const renderMethods = context.render.methods
Object.assign(state, renderMethods)
currentHost = host('persistent-host')
const sameUrl = 'http://127.0.0.1:19001/token-a/index.html'
renderMethods.update.call(state, packet(sameUrl), null, owner)
const pendingRaf = state.pendingFrame
renderMethods.update.call(state, packet(sameUrl, false), null, owner)
assert.ok(cancelledRafs.has(pendingRaf), 'hide cancels the pending animation frame')
flushRaf()
assert.equal(frames.length, 0, 'cancelled hidden render does not create a frame')
renderMethods.update.call(state, packet(sameUrl), null, owner)
flushRaf()
assert.equal(frames.length, 1)
assert.match(frames[0].src, /^http:\/\/127\.0\.0\.1:19001\/token-a\/index\.html#/)
const staleFrame = frames[0]
const staleMessage = [...messageListeners][0]
const staleTimeout = [...timers.values()][0]
renderMethods.update.call(state, packet(sameUrl, false), null, owner)
assert.equal(state.stopped, false, 'inactive packet retains the live frame')
assert.equal(staleFrame.removed, undefined)
assert.equal(state.frame, staleFrame)
assert.equal(messageListeners.size, 1)
staleFrame.onload()
assert.equal(staleFrame.posted || 0, 0, 'inactive frame does not send packets')
renderMethods.update.call(state, packet(sameUrl), null, owner)
flushRaf()
assert.equal(frames.length, 1, 'show reuses the existing iframe')
assert.equal(state.frame, staleFrame)
assert.match(staleFrame.src, /^http:\/\/127\.0\.0\.1:19001\/token-a\/index\.html#/)
assert.equal(staleFrame.parent, currentHost)
assert.equal(state.stopped, false)
assert.equal(messageListeners.size, 1)
assert.equal(staleFrame.posted, 1, 'reactivated iframe receives the current packet')
const disposedFrame = staleFrame
const emittedBeforeStaleCallbacks = emitted.length
renderMethods.update.call(state, packet(sameUrl, false, true), null, owner)
assert.equal(state.stopped, true)
assert.equal(disposedFrame.removed, true)
assert.equal(state.frame, null)
assert.equal(messageListeners.size, 0)
disposedFrame.onload()
disposedFrame.onerror()
staleTimeout()
staleMessage({ source: disposedFrame.contentWindow, origin: 'http://127.0.0.1:19001', data: {
  channel: 'app-tencent-map', token: state.token, event: { type: 'error', detail: { code: 'stale_frame_error' } }
} })
assert.equal(emitted.length, emittedBeforeStaleCallbacks, 'old frame callbacks and messages are ignored')
assert.equal(disposedFrame.posted, 1, 'disposed frame callback does not send another packet')
console.log('PASS [renderjs] hide/show reuses the same iframe; actual dispose isolates stale callbacks')
'''


def run_lifecycle_checks():
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js required for lifecycle mock checks")
    with tempfile.TemporaryDirectory(prefix="map-lifecycle-mock-") as temp:
        runner = Path(temp) / "lifecycle-check.cjs"
        runner.write_text(LIFECYCLE_RUNNER, encoding="utf-8", newline="\n")
        env = os.environ.copy()
        env["MAP_TEST_COMPONENT"] = str(ROOT / "src/components/AppTencentMap.vue")
        env["MAP_TEST_ROOT"] = str(ROOT)
        result = subprocess.run([node, str(runner)], cwd=ROOT, env=env, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        if result.returncode:
            raise RuntimeError("Lifecycle mock verification failed:\n" + result.stdout)
        print(result.stdout.rstrip())


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print("PASS " + message)


def get(url, method="GET"):
    request = Request(url, method=method)
    try:
        with urlopen(request, timeout=8) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


def raw_request(base_url, request_target, method="GET"):
    parsed = urlsplit(base_url)
    with socket.create_connection((parsed.hostname, parsed.port), timeout=5) as client:
        client.sendall((f"{method} {request_target} HTTP/1.1\r\nHost: {parsed.netloc}\r\nConnection: close\r\n\r\n").encode("ascii"))
        chunks = []
        while True:
            data = client.recv(8192)
            if not data:
                return b"".join(chunks)
            chunks.append(data)


def run_browser(base_url, temporary):
    if not PLAYWRIGHT.is_dir() or not CHROMIUM.is_file():
        print("SKIP [browser] configured Playwright/Chromium path unavailable")
        return
    node = shutil.which("node")
    if not node:
        print("SKIP [browser] Node.js unavailable")
        return
    runner = temporary / "browser-check.cjs"
    runner.write_text(BROWSER_RUNNER, encoding="utf-8", newline="\n")
    env = os.environ.copy()
    env.update({
        "MAP_TEST_PLAYWRIGHT": str(PLAYWRIGHT), "MAP_TEST_CHROMIUM": str(CHROMIUM),
        "MAP_TEST_ROOT": str(ROOT), "MAP_TEST_BASE_URL": base_url,
        "MAP_TEST_TMP": str(temporary),
    })
    result = subprocess.run([node, str(runner)], cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=240)
    if result.returncode:
        raise RuntimeError("Browser verification failed:\n" + result.stdout)
    print(result.stdout.rstrip())


def main():
    required = [JAVA_SOURCE, *(APP_MAP / name for name in APP_MAP_FILES), *(STATIC / name for name in MARKER_FILES)]
    absent = [str(path) for path in required if not path.is_file()]
    if absent:
        raise FileNotFoundError("Missing test inputs: " + ", ".join(absent))
    javac, java = shutil.which("javac"), shutil.which("java")
    if not javac or not java:
        raise RuntimeError("JDK javac and java are required")

    temporary = Path(tempfile.mkdtemp(prefix="map-local-server-test-"))
    classes = temporary / "classes"
    classes.mkdir()
    fixture = temporary / "LocalServerHarness.java"
    fixture.write_text(HARNESS, encoding="utf-8", newline="\n")
    subprocess.run([javac, "-encoding", "UTF-8", "-source", "8", "-target", "8", "-proc:none",
                    "-d", str(classes), str(JAVA_SOURCE), str(fixture)], check=True)
    print("PASS [compile] LoopbackMapServer and temporary Java fixture compile with -source8 -target8")

    process = subprocess.Popen([java, "-cp", str(classes), "LocalServerHarness", str(APP_MAP), str(STATIC)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8")
    try:
        base_url = process.stdout.readline().strip()
        if not re.fullmatch(r"http://127\.0\.0\.1:\d+/[0-9a-f-]{36}/", base_url):
            raise AssertionError("server did not publish a loopback URL with a random token")
        check(True, "server binds 127.0.0.1, an ephemeral port, and a random URL token")
        token = base_url.rstrip("/").rsplit("/", 1)[1]

        for filename in APP_MAP_FILES:
            status, headers, body = get(base_url + filename)
            check(status == 200 and len(body) > 0, "GET " + filename + " serves asset bytes")
            if filename.endswith(".mjs"):
                check(headers.get_content_type() == "text/javascript", filename + " MIME is text/javascript")
        for filename in MARKER_FILES:
            status, _, body = get(base_url + "static/" + filename)
            check(status == 200 and body.startswith(b"\x89PNG\r\n\x1a\n"), filename + " is read from src/static")

        status, _, body = get(base_url + "index.html", "HEAD")
        check(status == 200 and body == b"", "HEAD returns headers without a body")
        status, _, _ = get(base_url + "index.html", "POST")
        check(status == 405, "POST is rejected with 405")

        origin_path = "/" + token + "/"
        for path in ("/wrong-token/index.html", origin_path + "extra.txt", origin_path + "privatepath",
                     origin_path + "../manifest.json", origin_path + "%2e%2e/manifest.json",
                     origin_path + "static/%2e%2e/manifest.json", origin_path + "static%2f..%2fmanifest.json"):
            response = raw_request(base_url, path)
            check(response.startswith(b"HTTP/1.1 404"), "unlisted or traversal path returns 404: " + path)

        process.stdin.write("MISSING\n"); process.stdin.flush()
        time.sleep(0.05)
        missing = raw_request(base_url, origin_path + "static/pending-bin-marker.png")
        check(b"fixture resource intentionally missing" not in missing and b"Exception" not in missing
              and b"at ftx.map" not in missing, "missing resource never exposes Java exception/stack trace")
        process.stdin.write("AVAILABLE\n"); process.stdin.flush()

        def parallel_read(_):
            status, _, payload = get(base_url + "renderer.mjs")
            return status, len(payload)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(parallel_read, range(8)))
        check(all(status == 200 and size > 0 for status, size in results), "8 concurrent requests complete successfully")

        run_browser(base_url, temporary)

        address = urlsplit(base_url)
        process.stdin.write("STOP\n"); process.stdin.flush()
        process.wait(timeout=8)
        check(process.returncode == 0, "STOP plus repeated close exits cleanly")
        try:
            with socket.create_connection((address.hostname, address.port), timeout=1):
                raise AssertionError("listener still accepts connections after stop")
        except OSError:
            check(True, "listener port refuses connections after stop")
        print("Temporary verification files: " + str(temporary))
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--lifecycle-only"]:
            run_lifecycle_checks()
        else:
            main()
    except Exception as error:
        print("FAIL " + str(error), file=sys.stderr)
        raise
