#!/usr/bin/env python3
# 使い方: python3 scripts/og_image.py "<タイトル>" <出力.png>
# 記事タイトル入りの OGP 画像 (1200x630) を生成する。publish.mjs から呼ばれる。
import sys
from PIL import Image, ImageDraw, ImageFont

BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
W, H = 1200, 630


def layout(draw, text, font, max_width):
    # 行の長さが均等になるよう折り返す (末尾の1文字孤立を防ぐ)。
    # textlength は実描画より小さく出るため 1.1 倍で見積もる。
    def w(s):
        return draw.textlength(s, font=font) * 1.1

    # 英単語の途中では折らない (単語はひとかたまりとして扱う)
    tokens, buf = [], ""
    for ch in text:
        if ch.isascii() and (ch.isalnum() or ch in "._/-"):
            buf += ch
        else:
            if buf:
                tokens.append(buf)
                buf = ""
            tokens.append(ch)
    if buf:
        tokens.append(buf)

    total = w(text)
    n = max(1, -(-int(total) // int(max_width)))
    target = total / n
    lines, cur = [], ""
    for tok in tokens:
        if tok == "\n":
            lines.append(cur)
            cur = ""
            continue
        if cur and w(cur + tok) > target and len(lines) < n - 1:
            lines.append(cur.rstrip())
            cur = tok.lstrip()
        else:
            cur += tok
    if cur:
        lines.append(cur.rstrip())
    return lines


def main():
    title, out = sys.argv[1], sys.argv[2]
    img = Image.new("RGB", (W, H))
    px = img.load()
    top, bottom = (18, 41, 77), (10, 53, 80)
    for y in range(H):
        t = y / H
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    # ブランド
    d.rounded_rectangle([90, 62, 122, 126], radius=10, fill=(18, 165, 180))
    d.text((140, 66), "Yomite", font=ImageFont.truetype(BOLD, 52), fill=(255, 255, 255))
    # タイトル: 3行以内に収まるよう自動で縮小
    size = 84
    while size >= 40:
        font = ImageFont.truetype(BOLD, size)
        lines = layout(d, title, font, 1000)
        if len(lines) <= 3:
            break
        size -= 8
    y = 190
    for line in lines[:3]:
        d.text((90, y), line, font=font, fill=(255, 255, 255))
        y += int(size * 1.3)
    d.text((90, 540), "yomite.void2610.workers.dev", font=ImageFont.truetype(REG, 30), fill=(111, 147, 184))
    img.save(out, optimize=True)


if __name__ == "__main__":
    main()
