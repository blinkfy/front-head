# 无服务端 Java 的圆码生成登记

本轮保留 Android 相机/相册本地 QBar 解码和普通码回退；服务端不启动 Java、unidbg、JNI 或新的识图进程。改善的是圆码解码后找不到 scene 的问题，未宣称提升相机算法的实景识别率。

## 各端的实际能力

| 端 | 生成码时 | 是否能本地解码 |
| --- | --- | --- |
| Android APP | 注册引导、绑定提醒中的码加载成功后尝试本地登记；管理员前台可代领其他端的任务 | 新 0.1.17 原生依赖提供无相机图片解码；旧基座仍正常回退 |
| Python 模拟器、front-head/main_copy.py | 默认先在本机解码登记，再替换刷新图；处理期间保留旧码 | 已内置 Python/Unicorn ARM64 运行资源；Windows x64 真实圆码验证通过，不调用 Java |
| H5 | 登录、注册引导、微信绑定提醒显示图片后，凭本次任务凭证在浏览器本机解码登记；不领取他人的队列 | 手机网页相机/相册也支持本地 WASM 圆码解码；使用同一后端的精确登记索引，详见 [H5 解码说明](browser-roundcode.md) |
| 微信小程序 | 原 path/scene 扫码、注册与登录接力继续工作 | 不用非交互式微信接口冒充本地图片解码；可受益于同一后端生成队列 |
| iOS APP | 原有普通码扫码/回退 | 本轮新增接口返回 UNSUPPORTED，没有伪造 iOS 圆码能力 |

生成端、工作端和扫码端必须连接同一后端；多实例使用同一 Redis，不能跨本地/服务器混用索引。

没有可用 worker 时，圆码仍可被微信扫描；APP 对尚未登记的圆码明确提示使用普通二维码或微信，不猜测 scene。

## 流程与接口

1. Node 使用原微信接口生成 PNG/JPEG，不解码。后端绑定本次 appId、scene、kind、原截止时间，创建短期任务。
2. 原图片响应额外返回 `X-Round-Code-Task`：base64url 编码的 JSON `{id,ticket,expiresAt}`。原 Content-Type、图片 body 和旧客户端保持兼容，CORS 暴露此头。
3. 生成端读取原图后，或有权限的 worker 领取任务后，在本地解出完整 WX_CODE 原始字节。
4. `POST /api/device/wechat-qr/register-generated` 仅接受 `{taskId,ticket,rawBase64}`，不能指定 scene、User、AppID 或截止时间。
5. 后端使用生成时的业务参数写入精确原始载荷索引。APP 原 `resolve-raw`、设备 token 校验、APP 授权确认和网页登录一次性 consume 保持不变。

`POST /api/device/wechat-qr/decode-task/claim` 返回 `{code:0,data:{task:null}}` 或 task `{id,ticket,expiresAt,imageBase64,mime}`。领取需后端验证的管理员 JWT，或受控环境的 `X-Round-Code-Worker` 密钥。普通用户能处理自己图片响应中的凭证，但不能浏览全站登录码任务。

共享队列使用现有 Redis/CAS 存储，没有新增业务表。默认最多 32 个任务，每图最多 256KiB，任务最长 3 分钟且不超过原业务截止时间；每个工作身份同一时间最多领取一项，租约 20 秒。完成后释放图片和队列槽位。开启 Redis 后故障明确返回，不偷偷改用各实例独立缓存；未配置 Redis 时只支持单 Node 进程内存，重启会丢失短期任务和索引。

相同载荷登记可幂等重试，不同载荷不能替换已选定结果；真实映射冲突继续隔离，不能覆盖。一次性任务凭证限制了登记范围，但不构成对客户端解码结果真实性的密码学证明。

## Android 启用与资源占用

- 后端更新、重启 Node；无须安装 JRE 或上传旧 native/qbar 服务端资源。
- 前端更新后，新无相机接口需要包含 0.1.17 AAR 的自定义基座/正式 APP。只热更新旧基座时返回 UNAVAILABLE，并保留普通扫码。本轮只重建依赖 AAR，没有生成 APK。
- APP 注册引导和绑定提醒原样显示图片，登记不阻塞显示。短暂后台、页面退出、账号改变会丢弃迟结果；恢复可重新尝试。
- 管理员账号在 APP 前台时协作领取任务；空闲约 8 秒轮询，失败退避 30–60 秒，旧服务/权限失效会停止本轮任务。登录变化最多 15 秒被本地检查发现。切后台停止轮询，扫码相机优先。
- 所有本地任务共用串行原生解码通道；图片、尺寸、输出有上限，结束释放 Bitmap 和 native handle。不持续开相机、不上传相机照片、不运行后台常驻服务。

## Python 自带解码器与可选 worker

两处 Python 生成端都已附带同版本 `roundcode_decoder.py`、`roundcode_runtime_adapter.py` 和 `roundcode_assets/runtime.zip`。约 4.1MB 的资源包包含固定版本的 ARM64 QBar 内核、必要 Android 系统库及 Python 仿真代码，不包含 Java、JRE、unidbg、相机服务或桌面模拟器。

正常运行设备模拟器或 `front-head/main_copy.py` 即可：刷新期间保留旧微信码，默认子进程读取新生成原图、恢复 WX_CODE 原始载荷，再用服务端任务凭证登记；成功后才替换新图。失败时保留旧图并提供重试；首次没有旧图时，仍展示新图供微信扫描，并提示 APP 使用普通码。解码后再次检查 token/版本，旧请求的迟到结果不替换当前图。成功时控制台显示“已在设备本机解码并完成登记”。不需要配置 `FTX_ROUNDCODE_DECODER` 或管理员账号；自行生成的码不需要 worker key。

首次使用若缺少 Unicorn 2.1.4、Capstone 5.0.6、Pillow，会把所需 wheel 安装到当前 Python 专属的用户缓存，不改全局/设备项目依赖环境。首次安装需要网络和该 Python 的 pip；后续离线复用。安装失败不会影响原微信码和普通码。为避免首次等待，也可提前运行：

```text
python scripts/roundcode_decoder.py --prepare
```

模拟器目录使用 `python roundcode_decoder.py --prepare`。受控离线环境可先安装 `requirements-roundcode.txt` 中依赖，并设置 `FTX_ROUNDCODE_AUTO_INSTALL=0` 禁止自动安装。缓存可通过 `FTX_ROUNDCODE_CACHE` 指定。保留整个 `roundcode_assets` 目录，不能只复制设备主脚本。

默认运行时采用真实 QBar 内核的 ARM64 仿真，没有改写或猜测微信私有编码协议；原始载荷仍通过生成时的精确索引关联 scene。每次解码启动一个临时子进程、独立 VFS；结束释放，单进程内串行，空白图提前拒绝。原图最多 512KiB、边长最多 1600。首次准备总预算 150 秒，准备好后每次 20 秒端到端上限，原生执行另有 15 秒 watchdog；登记前后均检查任务过期。

在本机 Windows x64 上，真实圆码原图、旋转、轻微模糊、70%缩小全部解出同一载荷，约 1–2.1 秒；圆码解码子进程观测 RSS 峰值约 74–83MiB（包含 Python/Unicorn，非额外服务端内存；其他输入不保证同样峰值）。其他主机需要对应的 Python wheel，本轮没有 Linux/ARM 设备实机验收。

需要覆盖默认实现时，仍可设置 `FTX_ROUNDCODE_DECODER` 为非 Java helper 的 JSON argv。协议保持 `{imageBase64,mime}` → `{scanType:"WX_CODE",rawBase64:"..."}`；外部 helper 维持 8 秒上限和 8KiB stdout 上限。设置 `FTX_ROUNDCODE_ENABLED=0` 且不指定覆盖命令，可关闭默认本机解码。

若希望 Python 主机也代领其他端任务，可额外运行：

```text
python scripts/roundcode_worker.py --server https://your-backend.example
```

仅这项共享 worker 功能需要在后端与受控主机配置相同的 `ROUND_CODE_WORKER_KEY`（至少 32 字符）。密钥不要写进前端、Git、命令参数或日志。不运行 worker 时，设备只处理自己生成的码，不轮询共享队列。

资源来源和逐文件 SHA-256 保存在 runtime.zip 的 manifest.json；包整体校验值在 runtime.sha256。开发者可用 `scripts/build-roundcode-runtime.py` 从固定输入重建资源。只会在设备端使用，Node 服务无需安装这些 Python 依赖。

## 验证边界

隔离测试覆盖生成、登记、队列、租约、并发、凭证/TTL、冲突、缓存故障恢复、旧服务/旧基座回退，以及前后台和账号变化。Android Java/AAR、Kotlin 编译检查不替代新基座真机验证。Python 默认解码、两处入口、图像扰动和登记 HTTP mock 已通过；真实 Redis、多机 worker、后端上线登记与真实手机 native 图片解码仍需部署后联调。
