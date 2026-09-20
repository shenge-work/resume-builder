#!/usr/bin/env python3
"""从头像生成新粗野主义风格 favicon。

用法：
  python3 make_favicon.py <头像图片路径> <输出目录> [--letters JY] [--bg "#FF5A1E"]

生成：favicon.png (512) 与 favicon-64.png，供 index.html / resume.html 引用。
仅依赖 Pillow。
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("需要 Pillow：pip3 install pillow")


# 像素字母矩阵（5 列宽，行数不限；'1' = 填充格）
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["11111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10011", "01111"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
}


def hex2rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def make_favicon(portrait_path: str, out_dir: str, letters: str, bg_hex: str,
                 fg_hex: str = "#F3EEE2", ink_hex: str = "#141311"):
    letters = "".join(c for c in letters.upper() if c in FONT)[:2] or "AB"
    bg, fg, ink = hex2rgb(bg_hex), hex2rgb(fg_hex), hex2rgb(ink_hex)

    src = Image.open(portrait_path).convert("RGB")
    W = 512
    icon = Image.new("RGB", (W, W), bg)
    d = ImageDraw.Draw(icon)

    # 外卡片
    pad = 56
    d.rectangle([pad, pad, W - pad, W - pad], fill=hex2rgb("#FFFCF4"),
                outline=ink, width=14)

    # 圆形头像
    mask = Image.new("L", (W, W), 0)
    dm = ImageDraw.Draw(mask)
    cx, cy, r = W // 2, W // 2 - 20, 150
    dm.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    icon.paste(src.resize((W, W)), (0, -10), mask)
    d.ellipse([cx - r - 7, cy - r - 7, cx + r + 7, cy + r + 7],
              outline=ink, width=14)

    # 字母徽章
    n = len(letters)
    bx1, by1 = W - 214, W - 152
    bx2, by2 = W - 50, W - 54
    d.rectangle([bx1, by1, bx2, by2], fill=ink, outline=ink, width=10)

    unit = 7
    cell_w = (bx2 - bx1 - 40) // n
    rows = max(len(FONT[c]) for c in letters)
    oy = by1 + ((by2 - by1) - rows * unit) // 2
    for i, ch in enumerate(letters):
        mat = FONT[ch]
        mat_w = len(mat[0]) * unit
        ox = bx1 + 20 + i * cell_w + (cell_w - mat_w) // 2
        for ri, row in enumerate(mat):
            for ci, c in enumerate(row):
                if c == "1":
                    x, y = ox + ci * unit, oy + ri * unit
                    d.rectangle([x, y, x + unit, y + unit], fill=fg)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    icon.save(out / "favicon.png")
    icon.resize((64, 64), Image.LANCZOS).save(out / "favicon-64.png")
    return out / "favicon.png", out / "favicon-64.png"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("portrait", help="头像图片路径")
    ap.add_argument("out_dir", help="输出目录（通常是网站根目录）")
    ap.add_argument("--letters", default="AB", help="徽章字母（1~2 个，默认姓名缩写）")
    ap.add_argument("--bg", default="#FF5A1E", help="背景色（默认品牌橙）")
    args = ap.parse_args()
    p1, p2 = make_favicon(args.portrait, args.out_dir, args.letters, args.bg)
    print(f"生成: {p1}\n生成: {p2}")


if __name__ == "__main__":
    main()
