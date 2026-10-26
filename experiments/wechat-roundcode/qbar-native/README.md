# QBar 原生圆码解码实验

2026-10-26 已实际运行，不是只检查 GitHub 说明或图像特征。

后续已增加 Android APP 桥接及后端精确内容索引，见 [APP 接入说明](../../../docs/app-roundcode-integration.md)。本页描述原生离线实验本身；[补充扰动结果](robustness-result.json) 中五项也全部匹配原图内容。正式接入通过生成时的索引关联 scene，不声称解开了微信私有参数协议。

## 已验证的结果

本机没有 Android SDK、adb、模拟器；使用已有 JDK 23.0.1，在 Windows x64 上通过 unidbg 0.9.8 / Unicorn2 仿真 ARM64 Android JNI，加载公开仓库中的 `libwechatQrMod.so`。

| 输入 | 原生返回 | 验证 |
| --- | --- | --- |
| 合成普通 QR（固定无敏感测试串） | `QR_CODE`，35 字节 | 与预先已知的内容逐字节 SHA-256、长度相符 |
| 项目 `smartBin/device-simulator/qr.jpg` | `WX_CODE`，48 字节 | 解出原始内容 |
| 同一圆码旋转 90° | `WX_CODE`，48 字节 | 与原图原始内容一致 |
| 同一圆码轻微模糊 | `WX_CODE`，48 字节 | 与原图原始内容一致 |
| 同一圆码缩小至 70% | `WX_CODE`，48 字节 | 与原图原始内容一致 |
| 空白图 | 0 条结果 | 未误报 |

3 个 unittest 方法、6 次 JNI 调用全部通过，退出码 0。脱敏结果保存在 [native-result.json](native-result.json)，详细日志和输入变体在忽略的 `artifacts/native-tests/` 下。默认只记录类型、长度和哈希，不记录原始内容。

这次已经越过图像定位、位采样、码制解码这一层。它并没有还原完整 `scene` 或页面路径，也没有用已知的原始 scene 对照验证；不要把 `WX_CODE` 原始串直接当作设备 token 或登录 session。本地样本的内容不能由截取尾部、匹配已有图像或预设 expected 值来冒充完整解析。

## 运行方式

需要 Java 11+、Python 3.9+；测试还需已有的 OpenCV 和 numpy。测试在当前电脑用 JDK 23.0.1、OpenCV 4.10.0 执行。下面命令从本目录运行：

```powershell
# Python 可使用已有环境，避免全局安装。
python prepare.py
# JAVA_HOME 应指向 JDK 根目录，不是 bin 子目录。
$env:JAVA_HOME = 'D:/Java_SE'
& ./artifacts/tools/apache-maven-3.9.9/bin/mvn.cmd `
  -s maven-settings.xml -gs maven-settings.xml `
  "-Dmaven.repo.local=$PWD/artifacts/m2" -B -q compile dependency:build-classpath `
  '-Dmdep.outputFile=artifacts/classpath.txt'
$env:QBAR_JAVA = "$env:JAVA_HOME/bin/java.exe"
python test_native.py
```

`prepare.py` 只下载并校验固定版本的输入和 Maven，不执行 native 库。所有二进制、依赖缓存和 rootfs 都留在忽略的 `artifacts/` 中。Maven 显式使用空 settings，不读取个人仓库凭据。实验没有调用项目后端或微信服务，也未读取本地凭据。

`QbarProbe.java` 只实现已跑通的 sollyu 版 JNI 签名。MrWangChong 版仅用于静态比较，没有验证其运行接口；其 `armeabi` 目录里的 `.so` 实际也是 AArch64。两个来源均固定提交、逐文件 SHA-256 见 [vendor-manifest.json](vendor-manifest.json)。

测试按灰度图片调用 `Init → SetReaders → ScanImage → GetResults → Release`。本次关闭神经检测和超分选项，普通 QR 与圆码均无需初始化那两个模型即可解码；这不等于复杂相机画面也可省去检测处理。

## 与正式 APP 的边界

- 此实验目录保持独立；正式扫码接入位于后续新增的 UTS 插件及前后端适配层，不通过首页运行桌面仿真。
- 没有验证 Android 真机相机输入、uni-app 原生插件、iOS 或扫码性能；桌面仿真耗时不能当作手机性能。
- 下一步必须用明确的测试 scene 与对应圆码验证“原始内容 → 完整参数”，再考虑 APP 接入。现有后端 `deviceWechatQrService.js` 的设备 scene 为 32 位 token，登录接力 scene 为 `r_` 加 24 位随机标识；本次读取的原始串不符合任一种格式。
- 这里使用的是公开项目中提取的微信闭源二进制，不是独立实现的圆码算法。包装器开源许可证不等于腾讯原生库的商用再分发授权；本实验不把这些二进制打入 APP。

来源：[sollyu/wechat-scanner](https://github.com/sollyu/wechat-scanner/tree/8ba599fd90216d1ba148eda4cd051eb86cc5b16d)、[MrWangChong/Qbar](https://github.com/MrWangChong/Qbar/tree/30aedea1e3de0e05165880453364daab35e904fa)、[unidbg 0.9.8](https://github.com/zhkl0228/unidbg/tree/v0.9.8)。
