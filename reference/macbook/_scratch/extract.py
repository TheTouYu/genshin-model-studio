#!/usr/bin/env python3
"""把 Apple 官网 HTML 转成可 grep 的纯文本（零依赖）。"""
import html
import re
import sys
from pathlib import Path

BLOCK = re.compile(r"</?(p|div|li|tr|td|th|h[1-6]|br|section|article|dt|dd|figcaption|table|ul|ol)[^>]*>", re.I)
SCRIPT = re.compile(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", re.I | re.S)
TAG = re.compile(r"<[^>]+>")


def to_text(raw: str) -> str:
    raw = SCRIPT.sub(" ", raw)
    raw = BLOCK.sub("\n", raw)
    raw = TAG.sub(" ", raw)
    raw = html.unescape(raw)
    lines = []
    for line in raw.splitlines():
        line = re.sub(r"[ \t\u00a0]+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def main() -> int:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    dst.write_text(to_text(src.read_text(encoding="utf-8", errors="replace")), encoding="utf-8")
    print(f"{src.name} -> {dst.name}: {len(dst.read_text(encoding='utf-8'))} chars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
