# 微信圆码离线识别实验

**当前结论：已实现定位、旋转/缩放归一化和放射采样，尚未实现圆码参数解码。不能用于 APP 连接设备或授权登录。**

本目录不被应用代码引用，不修改现有设备扫码、登录接力或后端。实验不联网、不读取微信凭据、不使用微信客户端或开发者工具的内部接口；未新增 APP/Python 项目依赖。

## 实际样本和结果

- 使用仓库已有 `smartBin/device-simulator/qr.jpg`，读取原图而不修改它。
- 样本 SHA-256：`2e4831492fb8211cfcd905ef78472dad20c6e89b31a24782dd70f0aae1c8957c`。
- 找到 3 个牛眼中心，近似为 `(88.2, 88.2)`、`(341.2, 88.2)`、`(88.2, 341.2)`。
- 导出 `720 × 128` 的角度/半径灰度采样图。它包含定位图案和装饰区域，**不是已经解码、去掩码或纠错的有效比特流**。
- 36/54/72 的角度频谱中，72 分量最强。这里只是几何周期证据，不能当作已经解析了版本元信息。
- 本样本的对应 `scene` 未在仓库中找到；测试中的固定 scene 不能冒充这张圆码的真实内容。
- `scene: null`、`expectedSceneVerified: null`、`payloadDecoderImplemented: false` 是明确的未实现结果。传入 `--expected-scene` 不会使实验生成或猜出参数。

原始结果保存在 [project-sample-result.json](./project-sample-result.json)。

## 已完成与未完成

| 阶段 | 当前能力 |
| --- | --- |
| 普通 QR 对照 | 使用 OpenCV 标准 QR 解码，能匹配合成测试 scene，也能拒绝错误的 expected 值 |
| 牛眼定位 | 自行实现嵌套轮廓、面积比例、中心一致性检查 |
| 定位点组合 | 自行实现三个定位点的近似等腰直角三角形筛选 |
| 图像归一化 | 三点仿射变换；没有第四个实测点，未声称支持透视校正 |
| 放射线采样 | 输出灰度/阈值图，检查角度周期，保留诊断结果 |
| 元信息、掩码、数据位顺序、纠错参数 | 尚未实现或经真实样本验证 |
| 原始载荷还原为 scene/path | 尚未实现；无法确认是否还有需要微信解析的间接标识 |
| APP 集成 | 未接入；不能将本实验作为可用解码器 |

定位和采样是自行编写的实验代码，未复制外部实现。检测到三个牛眼也不证明解码成功，额外增加了放射周期筛选；它仍只是候选检测，不能证明图像来自微信。

## 运行

需要现有 Python 环境中具备 `cv2`、`numpy`。本机验证使用已有的 Codex bundled Python（OpenCV 4.10.0），没有执行安装或修改项目锁文件。

在 `front-head` 下运行：

```powershell
$labPython = 'C:/Users/29513/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $labPython experiments/wechat-roundcode/probe.py ../smartBin/device-simulator/qr.jpg --output experiments/wechat-roundcode/artifacts/project-roundcode
& $labPython -m unittest discover -s experiments/wechat-roundcode -p test_probe.py -v
```

圆码当前返回退出码 `2`，表示没有解出参数；标准 QR 对照解码返回 `0`。输入文件无法读取等异常会抛出错误。生成的诊断图片和运行报告在 `artifacts/`，该目录不提交。

## 验证范围

3 项 unittest 通过，覆盖：

- 本地圆码原图、旋转 90°、轻微模糊、1.2 倍缩放的候选定位及采样。
- 正常/错误 expected 值的合成普通二维码对照。
- 空白、固定随机噪声、只有三个圆环的负样本，以及圆码未解码时不伪造 scene 的约束。

这不是多设备真机识别率验收，也没有证明强透视、反光、遮挡或其他样式圆码的可靠性。应用未修改，因此本轮未重复运行应用构建。

## 继续解码需要的证据

后续 APP 集成已加入 QBar 原生桥接与后端精确索引，详见 [接入与部署说明](../../docs/app-roundcode-integration.md)。本文件中“应用未修改”等描述仅对应最初的 Python 探针实验阶段。

2026-10-26 更新：新增 [QBar 原生实验](qbar-native/README.md)，已通过 ARM64/JNI 仿真实际读出本地圆码的 `WX_CODE` 原始内容。下方关于纯 Python 探针的限制仍有效；原生实验也尚未还原/验证完整业务 `scene`，不能视为正式 APP 已支持。

1. 至少一组明确的测试圆码和对应测试 `scene`，最好包含同一小程序下只改变一个字符的一组码。不使用线上登录 token 作为测试输入。
2. 可复核的元信息位布局/编码规则、32 个掩码的定义、各版本有效数据位位置和纠错参数。
3. 完成离线参数还原后，再测试倾斜、拍照和低清输入；通过后才考虑 APP 原生实现。

只有已知 scene 仍不足以推导出全部私有码制。当前不能根据图像匹配、中心图标、频谱或者预先传入的 expected 值冒充解码。

## 研究来源

- [腾讯原作者：小程序码设计篇](https://developer.cloud.tencent.com/article/1005027)：定位点、版本、32 个掩码和元信息设计。
- [腾讯原作者：微信如何识别小程序码](https://cloud.tencent.com/developer/article/1005031)：图像预处理、定位和放射采样思路。
- [weapp-vite/qr 作者文档](https://github.com/weapp-vite/weapp-vite/blob/main/packages/qr/README.md#小程序码结构识别)：该项目明确区分结构检测与链接/路径解码，不能作为完整圆码解码器直接接入。

以上来源用于确认研究边界，不代表已获得完整可运行的解码协议。
