#!/usr/bin/env python3
"""
resize_gif.py
将 GIF 动图按目标分辨率或缩放比例压缩（保持动画时长 & 循环设置）。

用法示例：
  python resize_gif.py input.gif output.gif --scale 0.5
  python resize_gif.py input.gif output.gif --width 320
  python resize_gif.py input.gif output.gif --width 320 --height 180

参数优先级：
  如果传了 --scale 则按比例缩放；
  否则如果同时给 width 和 height 则直接按这两个值；
  否则如果只给 width（或 height），则按宽（或高）等比缩放。
"""
import argparse
from PIL import Image, ImageSequence

def compute_new_size(orig_w, orig_h, width, height, scale):
    if scale is not None:
        new_w = max(1, int(orig_w * scale))
        new_h = max(1, int(orig_h * scale))
    elif width is not None and height is not None:
        new_w, new_h = width, height
    elif width is not None:
        new_w = width
        new_h = max(1, int(orig_h * width / orig_w))
    elif height is not None:
        new_h = height
        new_w = max(1, int(orig_w * height / orig_h))
    else:
        # 没有给尺寸或比例，返回原始大小
        new_w, new_h = orig_w, orig_h
    return new_w, new_h

def resize_gif(input_path, output_path, width=None, height=None, scale=None, optimize=True):
    im = Image.open(input_path)
    loop = im.info.get('loop', 0)

    frames = []
    durations = []  # 毫秒
    disposal = im.info.get('disposal', 2)  # 若可用

    # 原始尺寸（使用第一帧）
    orig_w, orig_h = im.size
    new_w, new_h = compute_new_size(orig_w, orig_h, width, height, scale)

    for i, frame in enumerate(ImageSequence.Iterator(im)):
        # 统一成 RGBA（处理透明），然后缩放，再转回 P 调色板以生成 GIF
        rgba = frame.convert('RGBA')
        resized_rgba = rgba.resize((new_w, new_h), resample=Image.LANCZOS)

        # 转为 P 模式并自适应调色（减少颜色损失）
        paletted = resized_rgba.convert('P', palette=Image.ADAPTIVE)

        frames.append(paletted)

        # 每帧的 duration 优先取帧 info，否则取总体 info，默认 100ms
        dur = frame.info.get('duration', im.info.get('duration', 100))
        durations.append(dur)

    if not frames:
        raise RuntimeError("没有读取到任何帧。请确认输入文件是 gif 动图。")

    # 保存 GIF（把 durations 列表传入）
    save_kwargs = dict(
        save_all=True,
        append_images=frames[1:],
        loop=loop,
        duration=durations,
        optimize=optimize,
    )

    # Pillow 有时接受 disposal 参数，但不同版本行为不同；仅在 info 中存在时尝试写入
    try:
        frames[0].save(output_path, **save_kwargs)
    except TypeError:
        # 若 Pillow 抛出关于不支持某参数的 TypeError，去掉 optimize 再试一次
        save_kwargs.pop('optimize', None)
        frames[0].save(output_path, **save_kwargs)

    print(f"已保存：{output_path} （{orig_w}x{orig_h} -> {new_w}x{new_h}，{len(frames)} 帧）")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="压缩 GIF 分辨率（保持动画时长与循环）")
    parser.add_argument("input", help="输入 GIF 文件路径")
    parser.add_argument("output", help="输出 GIF 文件路径")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--scale", type=float, help="缩放比例，例如 0.5 表示缩小到 50%")
    group.add_argument("--width", type=int, help="目标宽度（px）；若未给高度则等比缩放高度）")
    parser.add_argument("--height", type=int, help="目标高度（px）；若未给宽度则等比缩放宽度）")
    parser.add_argument("--no-optimize", action="store_true", help="不要对 GIF 进行 optimize（有时提高兼容性）")
    args = parser.parse_args()

    resize_gif(args.input, args.output, width=args.width, height=args.height, scale=args.scale, optimize=not args.no_optimize)