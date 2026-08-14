#!/usr/bin/env python3
"""通用建模审计模块：把作品 JSON（gms.export）转成结构化基础数据 + 可编程派生能力。

设计（用户 2026-08-14 方向）：
  ① 基础层：audit(data) 返回 element 表（kind/center/r/size/z/rot 组/内缘外缘）——普适，
     任何模型（风扇/汽车/水杯）通用；不绑定领域规则。
  ② 派生层：大模型 import 本模块，基于 element 表写小脚本聚合领域组件
     （例：derive.py 里 wheel = disc组 + ring组 → 位置/半径/数量）。
  ③ 验证层：checks() 是内置示例规则（来自视觉反馈沉淀的通用语义：同心/分层/间隙/覆盖/粗细），
     可被派生规则替换或扩展。

用法：
  CLI:  python3 scripts/audit-model.py work.json [--checks|--elements|--raw]
  API:  from audit_model import audit; d = audit(work_dict)
"""
import json, math, sys

def audit(data):
    """基础层：作品 JSON → 结构化 element 表（+ 简单派生：旋转组合并）。
    返回 {"k_pxm", "base", "elements"}；elements 每项含 kind/center/z/size/
    group/n/radius/r/rx/ry/thick/len 等（按 kind 有效字段）。"""
    strokes = data["strokes"]
    if not strokes:
        return {"k_pxm": 0, "base": [0, 0], "elements": []}
    k = data["options"]["canvasHeightPx"] / max(data["options"]["heightMeters"], 1e-9)
    xs = [p[0] for s in strokes for p in s["points"]]
    ys = [p[1] for s in strokes for p in s["points"]]
    # 十六期：固定世界原点（画布中心/底）与服务端 toWorld 一致；旧作品无 canvasWidthPx 退回 bbox 中心
    if data["options"].get("canvasWidthPx"):
        cxp = data["options"]["canvasWidthPx"] / 2
        bottom = data["options"]["canvasHeightPx"]
    else:
        cxp = (min(xs) + max(xs)) / 2
        bottom = max(ys)
    def W(s):
        px = s["points"]
        cx = sum(p[0] for p in px) / len(px)
        cy = sum(p[1] for p in px) / len(px)
        zs = [p[2] if len(p) > 2 else 0 for p in px]
        tz = (s.get("transform") or {}).get("position", [0, 0, 0])[2]
        return (cx - cxp) / k, (bottom - cy) / k, tz + (sum(zs) / len(zs) if zs else 0)
    def geo(s):
        kind = s.get("kind", "?")
        wx, wy, wz = W(s)
        px = s["points"]
        w = max(p[0] for p in px) - min(p[0] for p in px)
        h = max(p[1] for p in px) - min(p[1] for p in px)
        out = {"kind": kind, "z": round(wz, 3), "size": s.get("size")}
        if kind == "ring":
            out["r"] = round(max(w, h) / 2 / k, 3)
        elif kind == "arc":
            zs = [p[2] if len(p) > 2 else 0 for p in px]
            tz = (s.get("transform") or {}).get("position", [0, 0, 0])[2]
            out["rise"] = round((max(zs) - min(zs)), 3)
            out["len"] = round(math.hypot(w, h) / k, 3)
            out["zBase"] = round(tz, 3)
            out["start"] = [round((px[0][0] - cxp) / k, 3), round((bottom - px[0][1]) / k, 3)]
            out["end"] = [round((px[-1][0] - cxp) / k, 3), round((bottom - px[-1][1]) / k, 3)]
        elif kind == "disc":
            out["r"] = round(max(w, h) / 2 / k, 3)
            out["thick"] = s.get("height")
        elif kind == "el-disc":
            out["rx"] = round(w / 2 / k, 3)
            out["ry"] = round(h / 2 / k, 3)
            out["thick"] = s.get("height")
            rot = s.get("transform", {}).get("rotation")
            out["pitch"] = round(rot[0] - 90, 1) if rot else 0
        elif kind == "rod":
            out["len"] = round(math.hypot(w, h) / k, 3)
        elif kind == "curve":
            out["len"] = round(math.hypot(w, h) / k, 3)
            out["start"] = [round((px[0][0] - cxp) / k, 3), round((bottom - px[0][1]) / k, 3)]
            out["end"] = [round((px[-1][0] - cxp) / k, 3), round((bottom - px[-1][1]) / k, 3)]
        out["center"] = [round(wx, 3), round(wy, 3)]
        return out

    comps = []
    for i, s in enumerate(strokes):
        g = geo(s)
        g["index"] = i
        rot = s.get("rot")
        if rot:
            g["rot"] = {"n": rot["n"], "k": rot["k"],
                        "center": [round((rot["cx"] - cxp) / k, 3), round((bottom - rot["cy"]) / k, 3)]}
        comps.append(g)

    # element 抽象：旋转组（rot 元数据合并）+ 独立件
    elements = []
    seen = set()
    for g in comps:
        rot = g.get("rot")
        if rot and rot["k"] == 0:
            key = (rot["n"], tuple(rot["center"]), g["z"])  # z 参与聚类：同中心同份数不同 z（前后罩）不合并
            if key in seen:
                continue
            seen.add(key)
            members = [c for c in comps if c.get("rot") and c["rot"]["n"] == rot["n"] and c["rot"]["center"] == rot["center"] and abs(c["z"] - g["z"]) < 0.02]
            cx, cy = rot["center"]
            dists = [math.hypot(m["center"][0] - cx, m["center"][1] - cy) for m in members]
            elements.append({**g, "group": True, "n": rot["n"], "radius": round(sum(dists) / len(dists), 3) if dists else 0,
                            "center": [round(cx, 3), round(cy, 3)], "members": len(members)})
        elif not rot:
            elements.append({**g, "group": False, "n": 1, "radius": 0, "members": 1})

    from collections import Counter
    centers = Counter(tuple(round(c, 2) for c in e["center"]) for e in elements)
    base = list(centers.most_common(1)[0][0]) if centers else [0, 0]
    return {"k_pxm": k, "base": base, "elements": elements}

def checks(audit_result, rules=None):
    """验证层（示例规则，通用语义；可被派生规则替换/扩展）。
    rules: 可选规则子集（"concentric"/"coplanar"/"motion-gap"/"hub-cover"/"thickness"/"rotation"/"wire"）。"""
    elements = audit_result["elements"]
    base = audit_result["base"]
    if not elements:
        return []
    out = []
    want = set(rules or ["concentric", "coplanar", "motion-gap", "hub-tangent", "gap-z", "thickness", "rotation", "wire"])
    if "concentric" in want:
        off = [e for e in elements if abs(e["center"][0] - base[0]) > 0.01 and e["kind"] in ("ring", "disc", "el-disc") and abs(e["center"][1] - base[1]) < 0.12]
        if off:
            for e in off[:6]:
                out.append({"rule": "concentric", "status": "warn",
                           "detail": f"{e['kind']}@{e['center']} 偏离基准{base} {round((e['center'][0]-base[0])*1000,1)}mm"})
        else:
            out.append({"rule": "concentric", "status": "ok", "detail": f"全部件同心于 {base}"})
    if "coplanar" in want:
        rings = sorted([e for e in elements if e["kind"] == "ring"], key=lambda e: e["z"])
        if rings:
            zs = [e["z"] for e in rings]
            out.append({"rule": "coplanar", "status": "info", "detail": f"ring×{len(zs)} z={zs}"})
        for kind in sorted(set(e["kind"] for e in elements if e["kind"] not in ("ring", "rod"))):
            zs = sorted(set(e["z"] for e in elements if e["kind"] == kind))
            if len(zs) > 1:
                out.append({"rule": "coplanar", "status": "info", "detail": f"{kind} z={zs} 分层"})
    if "motion-gap" in want:
        blades = next((e for e in elements if e["kind"] == "el-disc" and e["group"]), None)
        rings = [e for e in elements if e["kind"] == "ring"]
        if blades:
            outer = blades["radius"] + (blades.get("rx") or 0)
            for r in rings:
                if abs(r["z"] - blades["z"]) > 0.05:
                    continue
                if r["r"] < outer * 0.8:
                    continue  # 中心小环（hub 件）不做运动件间隙——它被旋转件包围是正常层级
                rin = r["r"] - (r.get("size") or 0) / 2
                gap = rin - outer
                same_z = abs(r["z"] - blades["z"]) < 0.02
                role = "焊接圈" if same_z else "罩环"
                st = "ok" if gap >= 0.008 else ("tangent" if gap >= 0 else "overlap")
                out.append({"rule": "motion-gap", "status": st,
                           "detail": f"叶片外缘{round(outer,3)} vs {role}内缘{round(rin,3)}：{st} {round(gap*1000,1)}mm"})
    if "hub-cover" in want or "hub-tangent" in want:
        # v6 反思：固定盘与旋转件内缘应"相切"（|盘r−内缘|<4mm ok；>5mm 覆盖=重叠过多 warn）
        blades = next((e for e in elements if e["kind"] == "el-disc" and e["group"]), None)
        if blades:
            inner = blades["radius"] - (blades.get("rx") or 0)
            hubs = [e for e in elements if e["kind"] == "disc" and e["r"] < blades["radius"] and abs(e["center"][1] - blades["center"][1]) < 0.05 and abs(e["z"] - blades["z"]) < 0.05]
            if hubs:
                hub = max(hubs, key=lambda e: e["r"])
                d = hub["r"] - inner
                same_z = abs(hub["z"] - blades["z"]) < 0.02
                st = "ok" if abs(d) < 0.004 and same_z else "warn"
                rel = "相切" if abs(d) < 0.004 else ("覆盖(重叠)" if d > 0 else "分离(悬空)")
                out.append({"rule": "hub-tangent", "status": st,
                           "detail": f"固定盘 r={hub['r']} z={hub['z']} vs 叶片内缘{round(inner,3)} z={blades['z']}：{rel} {round(d*1000,1)}mm{'，同面' if same_z else '，不同面!'}"})
    if "gap-z" in want or "coplanar" in want:
        # v6 反思：x/y 同心查不出"透视偏中心"（z 错位）；连接件 z 间距是独立维度
        rods = [e for e in elements if e["kind"] == "rod" and (e.get("len") or 0) > 0.2]  # 长杆（支架类）
        discs = [e for e in elements if e["kind"] == "disc"]
        if rods:
            r0 = rods[0]
            near = min(discs, key=lambda e: abs(e["center"][1] - r0["center"][1]))  # 同 y 域的盘（底座/电机）
            if near:
                dz = abs(r0["z"] - near["z"])
                st = "ok" if dz <= 0.03 else "warn"
                out.append({"rule": "gap-z", "status": st,
                           "detail": f"支架 z={r0['z']} vs 最近盘 z={near['z']}：z 距 {round(dz*1000,1)}mm（>30mm 会透视偏移/悬空观感）"})
        rings_z = sorted(e["z"] for e in elements if e["kind"] == "ring")
        if len(rings_z) >= 3:
            gaps = [round((rings_z[i+1] - rings_z[i]) * 1000, 1) for i in range(len(rings_z) - 1)]
            out.append({"rule": "gap-z", "status": "info", "detail": f"环 z 间距 {gaps}mm（<30mm 贴合；焊接圈应与前后环贴近）"})
    if "thickness" in want:
        for kind in ("ring", "arc"):
            ss = sorted(((e.get("size") or 0), e["z"]) for e in elements if e["kind"] == kind and e.get("size") and (kind != "arc" or e.get("group")))
            if len(ss) > 1:
                out.append({"rule": "thickness", "status": "info",
                           "detail": f"{kind} 粗细: " + ", ".join(f"z={z}->{s}" for s, z in ss)})
    if "rotation" in want:
        for e in elements:
            if e.get("group"):
                out.append({"rule": "rotation", "status": "info",
                           "detail": f"{e['kind']}×{e['n']} 中心{e['center']} 旋转半径{e['radius']} z={e['z']} 单件{e.get('rx') or e.get('len')}"})
    if "wire" in want:
        wires = [e for e in elements if e["kind"] == "arc" and not e.get("group") and e.get("len", 0) > 0.05]
        plugs = [e for e in elements if not e.get("group") and e["center"][1] < 0.2 and ((e["kind"] == "el-disc" and (e.get("rx") or 0) <= 0.03) or (e["kind"] == "ring" and (e.get("r") or 0) <= 0.03))]
        pins = [e for e in elements if e["kind"] == "rod" and e["center"][1] < 0.2 and (e.get("len") or 0) <= 0.04]
        motors = [e for e in elements if e["kind"] == "disc" and (e.get("thick") or 0) >= 0.08]
        wire_rods = [e for e in elements if e["kind"] == "rod" and e["center"][1] > 0.2 and e["center"][0] < 0.2]
        for e in wires:
            # 起点 = 电线组最高点（垂直段 rod 上端 或 弧线首点）——应贴近电机底部
            top_y = max([e.get("start", [0, 0])[1]] + [r["center"][1] + (r.get("len") or 0) / 2 for r in wire_rods])
            start = [min([e.get("start", [0, 0])[0]] + [r["center"][0] for r in wire_rods]), top_y]
            m = min(motors, key=lambda mo: abs(mo["center"][0] - start[0])) if motors else None
            conn = "?"
            if m:
                dy = abs(start[1] - (m["center"][1] - (m.get("thick") or 0) / 2))
                dz = abs(e["z"] - m["z"])
                conn = "ok" if dy < 0.06 and dz < 0.05 else "warn"
            plug = "有" if plugs else "无(插座漂浮!)"
            pin_ok = "接" if pins and plugs and min(math.hypot(p["center"][0]-plugs[0]["center"][0], p["center"][1]-plugs[0]["center"][1]) for p in pins) < 0.05 else "分离!"
            out.append({"rule": "wire", "status": conn if conn == "ok" else "warn",
                       "detail": f"电线: 中心{e['center']} 长{e['len']} 粗{e.get('size')} z={e['z']}；起点接电机:{conn} 插头体:{plug} 插脚:{pin_ok}"})
    return out

def relation(a, b):
    """组件对几何关系查询（用户 2026-08-14 方向：让模型选择性查任意两组件关系，一眼发现问题）。
    关系类型：center_dist 中心距 / z_gap 轴向间距 / coplanar 同面 / radial 径向(分离|相切|重叠) /
    intersect3d 空间相交(穿模) / endpoint 端点最近距离 / axis 轴向关系。
    简化体积模型：ring/disc/el-disc 为实心圆柱（r+size/thick、z 区间）；arc/rod 为线段（size 半径）。"""
    import math
    r = {}
    dxy = math.hypot(a["center"][0] - b["center"][0], a["center"][1] - b["center"][1])
    r["center_dist"] = round(dxy, 4)
    dz = abs(a["z"] - b["z"])
    r["z_gap"] = round(dz, 4)
    r["coplanar"] = dz < 0.01
    # 轴向关系
    ax_a = a.get("axis") or ("up" if a["kind"] in ("disc", "el-disc", "plate") else "front")
    ax_b = b.get("axis") or ("up" if b["kind"] in ("disc", "el-disc", "plate") else "front")
    r["axis"] = "same" if ax_a == ax_b else "different"
    # 径向区间（相对各自中心）：[in, out]；中心距参与判断
    def span(e):
        # 实心盘 [0, r]；细环 [r±size/2]；旋转组按半径±半轴；弧线/曲线/杆按中心±半长
        if e["kind"] == "disc":
            return 0, (e.get("r") or 0)
        if e["kind"] == "ring":
            r0 = e.get("r") or 0
            half = (e.get("size") or 0) / 2
            return r0 - half, r0 + half
        if e["kind"] == "el-disc":
            if e.get("group"):
                return e["radius"] - (e.get("rx") or 0), e["radius"] + (e.get("rx") or 0)
            return 0, (e.get("rx") or 0)
        if e["kind"] == "arc":
            # 弧是部分圆环：径向范围 = [min(两端点旋转半径), max(两端点旋转半径)]
            st = e.get("start") or [0, 0]
            en = e.get("end") or st
            r0 = math.hypot(st[0] - e["center"][0], st[1] - e["center"][1])
            r1 = math.hypot(en[0] - e["center"][0], en[1] - e["center"][1])
            return min(r0, r1), max(r0, r1)
        half = (e.get("len") or 0) / 2
        return 0, half
    ra, rb = span(a), span(b)
    # 同心时直接比区间；不同心用中心距 + 半径和
    if dxy < 0.01:
        a_lo, a_hi = ra
        b_lo, b_hi = rb
        gap = max(a_lo, b_lo) - min(a_hi, b_hi)
        if gap > 0.005:
            r["radial"] = f"分离(间隙 {round(gap, 3)})"
        elif gap >= -0.005:
            r["radial"] = "相切"
        else:
            r["radial"] = f"重叠 {round(-gap, 3)}"
    else:
        gap = dxy - ra[1] - rb[1]
        r["radial"] = ("分离" if gap > 0.005 else ("相切" if gap >= -0.005 else f"重叠 {-round(gap, 3)}"))
    # 空间相交（穿模）：径向重叠且 z 区间重叠（用 size/thick 估计 z 半厚）
    def z_half(e):
        t = e.get("thick") or e.get("size") or 0.004
        return t / 2
    zov = max(0, (z_half(a) + z_half(b)) - dz)
    radial_touch = "重叠" in str(r.get("radial", "")) or "相切" in str(r.get("radial", ""))
    r["intersect3d"] = bool(radial_touch and zov > 0)
    r["z_overlap"] = round(zov, 4)
    # 端点最近距离（arc/rod 端点 vs 对方中心距）
    pts = []
    for e, other in ((a, b), (b, a)):
        if e["kind"] in ("arc", "rod", "curve"):
            s = e.get("start") or e["center"]
            en = e.get("end") or e["center"]
            pts.append(("start", s, math.hypot(s[0] - other["center"][0], s[1] - other["center"][1])))
            pts.append(("end", en, math.hypot(en[0] - other["center"][0], en[1] - other["center"][1])))
    if pts:
        best = min(pts, key=lambda p: p[2])
        r["endpoint"] = {"of": best[0], "dist_to_other_center": round(best[2], 4)}
    return r

def human(audit_result):
    """人可读中文摘要（供用户在浏览器对照模型核验）。"""
    els = audit_result["elements"]
    lines = ["【组件清单】"]
    for e in els:
        parts = [f"  {e['kind']}", f"z={e['z']}"]
        if e.get("group"):
            parts.append(f"旋转组×{e['n']} 旋转半径{e['radius']}")
            if e["kind"] == "el-disc":
                parts.append(f"单叶片 rx={e.get('rx')} ry={e.get('ry')} 桨距{e.get('pitch')}°")
            if e["kind"] == "arc":
                parts.append(f"弧长{e.get('len')} 凸起{e.get('rise')} 平面z={e.get('zBase')}")
        else:
            if e["kind"] == "ring":
                parts.append(f"环半径={e.get('r')}")
            if e["kind"] == "disc":
                parts.append(f"盘半径={e.get('r')} 厚={e.get('thick')}")
            if e["kind"] == "rod":
                parts.append(f"杆长={e.get('len')}")
            if e["kind"] == "arc":
                parts.append(f"弧长={e.get('len')} 凸起={e.get('rise')}")
        if e.get("size"):
            parts.append(f"粗细={e['size']}")
        parts.append(f"中心{e['center']}")
        lines.append(" ".join(parts))
    lines.append("")
    lines.append("【几何检查】")
    for c in checks(audit_result):
        lines.append(f"  [{c['status']}] {c['rule']}: {c['detail']}")
    return "\n".join(lines)

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    data = json.load(open(path, encoding="utf-8")) if path else json.load(sys.stdin)
    mode = sys.argv[2] if len(sys.argv) > 2 else "--all"
    result = audit(data)
    if mode == "--elements":
        print(json.dumps(result, ensure_ascii=False, indent=1))
    elif mode == "--checks":
        print(json.dumps(checks(result), ensure_ascii=False, indent=1))
    elif mode == "--human":
        print(human(result))
    elif mode == "--rel":
        i = int(sys.argv[3]); j = int(sys.argv[4])
        a = result["elements"][i]; b = result["elements"][j]
        print(json.dumps({"a": {k: a.get(k) for k in ("kind", "index", "center", "z") if k in a},
                           "b": {k: b.get(k) for k in ("kind", "index", "center", "z") if k in b},
                           "relation": relation(a, b)}, ensure_ascii=False, indent=1))
    else:
        result["checks"] = checks(result)
        print(json.dumps(result, ensure_ascii=False, indent=1))