#!/usr/bin/env python3
"""既存の公開済み HTML 記事を Yomite の新 md 形式へ変換する移行スクリプト。

- 標準的な要素 (見出し/段落/表/リスト/引用) は md にする
- 判断キット (.rv-*) や流れ図 (.rpt-flow / .rpt-cols) など複雑な構造は :::html ブロックでそのまま残す
- .rpt-decision は :::decision ブロックにする
- 出力: articles/<slug>.md と articles/manifest.json (再公開用メタ情報)
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup
from markdownify import markdownify as md_convert

BASE = "https://yomite.void2610.workers.dev"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "articles"
OUT.mkdir(exist_ok=True)

PRESERVE_CLASSES = ("rv-", "rpt-flow", "rpt-cols")


def fetch(url):
    import subprocess
    out = subprocess.run(["curl", "-sL", "--compressed", url], capture_output=True, check=True)
    return out.stdout.decode("utf-8")


def convert(html, slug):
    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one(".rpt") or soup.body or soup
    # 後付けの戻るピルと不要部品を除去
    for sel in [".yomite-backpill", ".rpt-foot", ".rpt-toc", ".rpt-crumb",
                ".rpt-sub", ".rpt-meta", "script"]:
        for el in container.select(sel):
            el.decompose()
    for h1 in container.find_all("h1"):
        h1.decompose()
    for num in container.select(".rpt-num"):
        num.decompose()
    # section は中身だけ残す
    for sec in container.find_all("section"):
        sec.unwrap()

    html_blocks = []
    decision_blocks = []

    def placeholder(kind, idx):
        return f"\n\nYMD{kind}{idx}YMD\n\n"

    # 判断ボックス → :::decision (中身は md 化)
    for el in list(container.select(".rpt-decision")):
        inner_md = md_convert(str(el), heading_style="ATX").strip()
        decision_blocks.append(inner_md)
        el.replace_with(BeautifulSoup(placeholder("DEC", len(decision_blocks) - 1), "html.parser"))

    # 複雑な構造 → :::html (外側の要素だけを対象にし、入れ子は親ごと残す)
    def is_preserve(el):
        classes = " ".join(el.get("class", []))
        return any(classes.startswith(c) or f" {c}" in f" {classes}" for c in PRESERVE_CLASSES) \
            or any(cls.startswith("rv-") for cls in el.get("class", []))

    candidates = [el for el in container.find_all(True) if is_preserve(el)]
    topmost = [el for el in candidates if not any(p in candidates for p in el.parents)]
    for el in topmost:
        html_blocks.append(str(el))
        el.replace_with(BeautifulSoup(placeholder("HTML", len(html_blocks) - 1), "html.parser"))

    md = md_convert(str(container), heading_style="ATX", bullets="-")
    # プレースホルダを独自形式へ戻す
    def sub_html(m):
        idx = int(m.group(1))
        return "\n\n:::html\n" + html_blocks[idx].strip() + "\n:::\n\n"

    def sub_dec(m):
        idx = int(m.group(1))
        return "\n\n:::decision\n" + decision_blocks[idx] + "\n:::\n\n"

    md = re.sub(r"YMDHTML(\d+)YMD", sub_html, md)
    md = re.sub(r"YMDDEC(\d+)YMD", sub_dec, md)
    # 掃除: 3行以上の空行、末尾空白、エスケープされたアンダースコア等は軽く整える
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    return md


def main():
    pages = json.loads(fetch(f"{BASE}/api/pages"))["pages"]
    manifest = []
    for p in pages:
        slug = p["slug"]
        if slug == "2026-11-27-unity-7-alpha-daowa5":
            src = Path.home() / "workspace/research_notes/unity7-alpha-report-20261127-0357/report.md"
            md = src.read_text(encoding="utf-8")
        else:
            html = fetch(f"{BASE}/p/{slug}")
            md = convert(html, slug)
        (OUT / f"{slug}.md").write_text(md, encoding="utf-8")
        manifest.append({
            "slug": slug, "title": p["title"], "project": p["project"],
            "summary": p.get("summary") or "", "decision_points": p.get("decision_points") or "",
            "file": f"articles/{slug}.md", "md_bytes": len(md.encode()),
        })
        print(f"converted {slug}: {len(md.encode())} bytes")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"total {len(manifest)} pages")


if __name__ == "__main__":
    sys.exit(main())
