# H5 本地微信小程序码识别

手机网页的相机和相册共用本地解码器。普通 QR 优先走原生 BarcodeDetector，jsQR 和候选定位在轻量 Worker 中执行；圆码在独立 Worker 中运行 QBar ARM64 内核（Unicorn WASM + Pyodide）。不启动服务端 Java，不上传相机图片，也不在页面线程执行仿真。Worker 被浏览器禁用时保留普通码兼容路径。

## 数据路径

1. 相机检测到稳定圆码候选后自动识别；相册在普通 QR 失败后尝试圆码，候选几何检测遗漏也可重试。
2. 手机实时圆码交替使用最长边 160/192 像素，相册先 160 再 192；避免自动进入桌面样本中需十几秒的 288 像素路径。同一扫码页只有一个圆码任务，圆码工作时暂停普通码检测，避免争抢 CPU。复杂、模糊圆码仍可能需要更清晰图片、微信或原生 APP，不能承诺所有手机都能快速解码。
3. 仅将解出的 `WX_CODE` 原始字节提交现有 `/api/device/wechat-qr/resolve-raw`。不把原始字节当设备 ID，不猜测 scene，不使用相似图片匹配。
4. 后端根据生成时登记的精确索引返回设备 scene 或登录 session。管理员先预览再使用；登录码在扫码遮罩内部显示确认框，无需先退出扫码页，确认后才授权。
5. 关闭扫码、切后台、重新开启相机或切相册时终止 Worker；账号变化会丢弃迟到结果。

普通码实时首轮最长边 720，候选定位输入不超过 960，保留 1280 中心细节重试；相册先 960，再候选局部，最后按需 1600，不再先同步扫描 1600/2400 两张大图。普通码 Worker 只允许一个在途帧，像素移交后不堆积摄像头任务；最清晰帧缓存单独复制，避免转移缓冲区使其失效。慢帧会延长下一次检测间隔，相机预览保持原生视频流。

生成端和扫码端必须连接同一后端/共享索引，码必须已登记且未过期。本地成功解码不等于可以恢复任意微信码的私有业务参数。

## 网页生成码后自动登记

H5 的登录面板、注册引导和微信绑定提醒共用生成登记钩子。登录/注册页拿到二维码 URL 即开始获取图片及 `X-Round-Code-Task`，无需等待可见图片加载；在浏览器本地解码，再通过现有 `register-generated` 提交 `{taskId,ticket,rawBase64}`。二维码加载完成即正常显示，准备状态仅在码下方显示，不遮挡图片、不阻止微信扫码或保存。不传 scene，不修改账号绑定或登录授权逻辑。

APP 准备进度独立于登录会话的 waiting/scanned/authorized 状态。图片读取、资源加载、初始化、解码和登记分别占据固定进度区间；文件完成事件提供实际阶段进展，无法量化的阶段内部按计时估算，指数趋近阶段上限、增长逐渐放缓，界面明确标注“估算”。计时不能跨阶段，更不能自行达到 100%；只有后端登记成功才显示“APP 扫码已就绪 · 100%”。失败、隐藏、刷新和卸载会停止估算计时器。

未登录也能凭本次生成任务凭证登记自己的图片；H5 不领取其他人的解码队列。多个图片任务串行处理，同一 URL 登记成功后去重到任务过期。刷新、组件卸载、隐藏页面会取消未完成任务，切换账号或任务过期后不提交迟到结果。扫码相机优先，会暂停生成登记并释放其 Worker。

旧后端没有任务响应头时直接跳过，不加载 WASM，也不调用登记接口；接口或解码资源异常只在码下方显示 APP 扫码未就绪，二维码仍直接展示，微信扫码和原有账号密码登录保持可用。后端跨域配置需暴露 `X-Round-Code-Task`（现有生成登记协议已使用此头）。

## 部署与回退

- `npm run build:h5` 自动把 `vendor/browser-roundcode/v1` 复制到 H5 发布目录 `h5-roundcode/v1`。必须发布完整目录，不能只上传 JS。支持 Vite 配置的发布 base 路径。
- 资源同源，约 18.5 MiB；打开扫码页即用两条下载通道预加载文件，解码运行环境在真正识别圆码时初始化。没有运行时 CDN 依赖，不进入小程序包、APP 包或首页首屏 JS。
- 公共解码文件按 SHA256 版本写入 CacheStorage，预加载、相机、相册、生成登记共用；读取时校验哈希，损坏则删除并重取。同一文件最多保留最近两个版本，不缓存圆码图片、原始载荷、任务票据或登录凭据。退出扫码不会删除这些公共文件，浏览器仍可按配额策略清理缓存。
- 解码器初始化时并行获取 Python WASM/标准库和仿真内核资源，避免先下载 runtime.zip 再开始下载 Python WASM；初始化期间复用这些请求，存储被禁用时也不重复下载同一关键文件。
- 无 CacheStorage 权限或写入失败时回退到浏览器 HTTP 缓存/网络；旧版本接口的兼容规则不变。关闭或隐藏扫码页会取消未完成预加载，退出仍终止 Worker，不让几百 MiB 的运行环境常驻。
- 需要 Worker、WebAssembly、BigInt、SubtleCrypto；手机相机仍需 HTTPS/localhost 和用户相机权限。缺少能力、资源失败、解码超时等会提示使用微信或普通 APP 码，不影响普通 QR。
- 已加载的 Worker 复用初始化后的内核，退出扫码后释放；首次任务最长 60 秒，后续任务最长 30 秒，超时直接终止。
- 未进行跨手机浏览器的实机性能验收，不能将桌面样本解码时间当作手机耗时承诺。

## 固定资源与开发重建

发布资源已纳入仓库，常规 H5/小程序构建和 Node 部署均不需要 Python、编译器或网络下载。

- Unicorn.js：`@alexaltea/unicorn-js@2.1.4` 的 AArch64 构建，GPL-2.0，保留 `UNICORN-LICENSE.txt`。上游源码 https://github.com/AlexAltea/unicorn.js ，该版本构建使用 Unicorn 引擎提交 `8028ec436f2d9376525352dd38ed9ed6b9f6be10`。
- Pyodide：`pyodide@0.27.7`，MPL-2.0，保留 `PYODIDE-LICENSE.txt`；源码 https://github.com/pyodide/pyodide/tree/0.27.7 。CPython 标准库随该发行版。
- QBar/JNI、Android 仿真及系统库复用已有 `scripts/roundcode_assets/runtime.zip`，未新增服务端解码进程。
- `scripts/build-browser-roundcode.mjs` 是开发用重建脚本：输入放在 `experiments/wechat-roundcode/artifacts/browser/{unicorn,pyodide/package,wabt/package}`，分别使用上述固定版本和 `wabt@1.0.39`。`unicorn` 目录包含 npm 包的 `unicorn_aarch64.js` 和 `LICENSE`。
- 构建脚本校验上游 JS SHA256，抽出 WASM，使用 WABT 修复固定构建的三个 TCI 缺失加载指令：`ld8s_i32`、`ld16u_i32`、`ld16s_i32`。复用已有 `ld8u_i32` 的寄存器/指令指针流程，仅替换对应有符号/无符号加载。转换步骤完整保留在脚本中，上游布局变化会拒绝构建。
- `scripts/build-browser-roundcode.py` 复用现有 Python/JNI 适配器，增加浏览器 Unicorn 桥和复用初始化句柄的生成器。需要已有本地解码依赖缓存中的 Unicorn 2.1.4 常量文件。
- 重建后 `manifest.json` 保存版本和每个文件的 SHA256；Worker 加载关键二进制/适配资源时校验哈希，资源版本不一致则回退。

## 定向验证

```text
node scripts/test-h5-roundcode-local.mjs
node scripts/test-h5-roundcode-cache.mjs
node scripts/test-h5-qr-scanner.mjs
node scripts/test-h5-qr-analysis.mjs
node scripts/test-h5-roundcode.mjs
node scripts/test-h5-generated-roundcode.mjs
node scripts/test-roundcode-preparation-progress.mjs
node scripts/test-roundcode-client.mjs
npm run build:h5
npm run build:mp-weixin
git diff --check
```

真实圆码样本已在浏览器解出与 Python/原生相同的载荷 SHA256。浏览器的登记查询使用隔离测试响应，不操作真实设备或账号。
