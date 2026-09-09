#!/usr/bin/env python3
"""按基础名挑选最高分辨率官方图并下载到 reference/macbook/img/。"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
URLS = (HERE / "img-urls.txt").read_text(encoding="utf-8").split()
OUT = HERE.parent / "img"
BASE = "https://www.apple.com.cn"

SIZE_ORDER = ["xlarge_2x", "xlarge", "large_2x", "large", "medium_2x", "medium", "small_2x", "small", ""]

WANTED = {
    # 14 英寸 MacBook Pro（当前设计语言主体）
    "dimensions_1_14_inch": "mbp14-dimensions-1",
    "dimensions_2_14_inch": "mbp14-dimensions-2",
    "ports_1_14_inch": "mbp14-ports-1",
    "ports_2_14_inch": "mbp14-ports-2",
    "ports_3_14_inch": "mbp14-ports-3",
    "ports_4_14_inch": "mbp14-ports-4",
    "finish_lockup_14": "mbp14-finish-lockup",
    "macbook_pro_14_inch": "mbp14-hero",
    "display_nano_texture": "mbp14-display-nano-texture",
    "display_promotion": "mbp14-display-promotion",
    "pv_colors_silver": "mbp14-color-silver",
    "pv_colors_spaceblack": "mbp14-color-spaceblack",
    "pv_durable": "mbp14-durable",
    "connections_hw_1": "mbp14-connections-1",
    "connections_hw_2": "mbp14-connections-2",
    "performance_mbp_hw": "mbp14-hardware",
    # 16 英寸
    "dimensions_1_16_inch": "mbp16-dimensions-1",
    "dimensions_2_16_inch": "mbp16-dimensions-2",
    "ports_1_16_inch": "mbp16-ports-1",
    "ports_2_16_inch": "mbp16-ports-2",
    "finish_lockup_16_inch": "mbp16-finish-lockup",
    "macbook_pro_16_inch": "mbp16-hero",
    # MacBook Air（备选机型）
    "mba_13_hero": "mba13-hero",
    "mba_13_size1": "mba13-size-1",
    "mba_13_size2": "mba13-size-2",
    "mba_13_charging1": "mba13-charging-1",
    "mba_13_charging2": "mba13-charging-2",
    "mba_13_specs_hero": "mba13-specs-hero",
    "mba_15_finish": "mba15-finish",
    "mba_15_charging_left": "mba15-charging-left",
    "mba_15_charging_right": "mba15-charging-right",
}


def best_url(base: str) -> str | None:
    cands = [u for u in URLS if re.search(rf"/{re.escape(base)}(_[a-z0-9_]+)?\.(jpg|png)$", u)]
    for size in SIZE_ORDER:
        suffix = f"_{size}.jpg" if size else ".jpg"
        for u in cands:
            if u.endswith(suffix) and (size or "_" not in u.rsplit("/", 1)[-1].split("__")[0][len(base):]):
                return BASE + u
    return BASE + cands[0] if cands else None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    got = miss = 0
    for base, name in WANTED.items():
        url = best_url(base)
        if not url:
            print(f"MISS  {base}")
            miss += 1
            continue
        ext = url.rsplit(".", 1)[-1]
        dst = OUT / f"official-{name}.{ext}"
        r = subprocess.run(
            ["curl", "-sSL", "--max-time", "60", "-A", "Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0", "-o", str(dst), url],
            capture_output=True,
        )
        size = dst.stat().st_size if dst.exists() else 0
        ok = r.returncode == 0 and size > 5000
        print(f"{'OK  ' if ok else 'FAIL'} {dst.name:44s} {size:>9d} B  <- {url.rsplit('/', 1)[-1]}")
        got += ok
        miss += not ok
    print(f"\n下载 {got} 张，失败/缺失 {miss} 张 -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
