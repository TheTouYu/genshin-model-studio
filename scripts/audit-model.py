#!/usr/bin/env python3
"""通用建模审计 v3：组件表 + 旋转组 + 语义化检查（运动件间隙/固定盘覆盖/同心/分层/粗细/端点连接）。
用法：python3 scripts/audit-model.py work.json
设计：最小几何单位（ring/arc/disc/el-disc/rod）+ 旋转组（rot 元数据）+ 通用检查。
检查聚焦"运动件 vs 静止件"关系（用户视觉反馈沉淀）：叶片-罩环间隙、叶片-固定盘覆盖、
同心（众数基准）、z 分层、粗细梯度、电线端点。"""
import json, math, sys

def audit(data):
    strokes = data["strokes"]
    k = data["options"]["canvasHeightPx"] / max(data["options"]["heightMeters"], 1e-9)
    xs = [p[0] for s in strokes for p in s["points"]]
    ys = [p[1] for s in strokes for p in s["points"]]
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

    elements = []
    seen = set()
    for g in comps:
        rot = g.get("rot")
        if rot and rot["k"] == 0:
            key = (rot["n"], tuple(rot["center"]))
            if key in seen:
                continue
            seen.add(key)
            members = [c for c in comps if c.get("rot") and c["rot"]["n"] == rot["n"] and c["rot"]["center"] == rot["center"]]
            cx, cy = rot["center"]
            dists = [math.hypot(m["center"][0] - cx, m["center"][1] - cy) for m in members]
            elements.append({**g, "group": True, "n": rot["n"], "radius": round(sum(dists) / len(dists), 3) if dists else 0,
                            "center": [round(cx, 3), round(cy, 3)], "members": len(members)})
        elif not rot:
            elements.append({**g, "group": False, "n": 1, "radius": 0, "members": 1})

    checks = []
    from collections import Counter
    centers = Counter(tuple(round(c, 2) for c in e["center"]) for e in elements)
    base = list(centers.most_common(1)[0][0]) if centers else [0, 0]

    off = [e for e in elements if abs(e["center"][0] - base[0]) > 0.01 and e["kind"] in ("ring", "disc", "el-disc")]
    if off:
        for e in off[:6]:
            d = math.hypot(e["center"][0] - base[0], e["center"][1] - base[1])
            checks.append({"rule": "concentric", "status": "warn",
                           "detail": f"{e['kind']}@{e['center']} 偏离基准{base} {round(d*1000,1)}mm"})
    else:
        checks.append({"rule": "concentric", "status": "ok", "detail": f"全部件同心于 {base}"})

    rings = sorted([e for e in elements if e["kind"] == "ring"], key=lambda e: e["z"])
    if rings:
        zs = [e["z"] for e in rings]
        sym = len(zs) == 3 and abs(zs[0] + zs[2] - 2 * zs[1]) < 0.02
        checks.append({"rule": "coplanar", "status": "ok" if sym else "info",
                       "detail": f"ring×{len(zs)} z={zs}" + ("（前后对称于中间环）" if sym else "")})
    for kind in sorted(set(e["kind"] for e in elements if e["kind"] not in ("ring", "rod"))):
        zs = sorted(set(e["z"] for e in elements if e["kind"] == kind))
        if len(zs) > 1:
            checks.append({"rule": "coplanar", "status": "info", "detail": f"{kind} z={zs} 分层"})

    blades = next((e for e in elements if e["kind"] == "el-disc" and e["group"]), None)
    if blades:
        inner = blades["radius"] - (blades.get("rx") or 0)
        outer = blades["radius"] + (blades.get("rx") or 0)
        for r in rings:
            if abs(r["z"] - blades["z"]) > 0.06:
                continue  # 不同面的环（后中心环等）不参与运动件间隙检查
            rin = r["r"] - (r.get("size") or 0) / 2
            gap = rin - outer
            same_z = abs(r["z"] - blades["z"]) < 0.02
            role = "焊接圈" if same_z else "罩环"
            st = "ok" if gap >= 0.008 else ("tangent" if gap >= 0 else "overlap")
            checks.append({"rule": "motion-gap", "status": st,
                           "detail": f"叶片外缘{round(outer,3)} vs {role}内缘{round(rin,3)}：{st} {round(gap*1000,1)}mm"})
        hubs = [e for e in elements if e["kind"] == "disc" and e["r"] < blades["radius"] and abs(e["center"][1] - blades["center"][1]) < 0.05]
        if hubs:
            hub = max(hubs, key=lambda e: e["r"])
            ov = hub["r"] - inner
            same_z = abs(hub["z"] - blades["z"]) < 0.02
            checks.append({"rule": "hub-cover", "status": "ok" if ov >= 0.002 and same_z else "warn",
                           "detail": f"固定盘 r={hub['r']} z={hub['z']} vs 叶片内缘{round(inner,3)} z={blades['z']}：覆盖{round(ov*1000,1)}mm{'，同面' if same_z else '，不同面!'}"})

    for kind in ("ring", "arc"):
        ss = sorted(((e.get("size") or 0), e["z"]) for e in elements if e["kind"] == kind and e.get("size") and (kind != "arc" or e.get("group")))
        if len(ss) > 1:
            checks.append({"rule": "thickness", "status": "info",
                           "detail": f"{kind} 粗细: " + ", ".join(f"z={z}->{s}" for s, z in ss)})

    for e in elements:
        if e.get("group"):
            checks.append({"rule": "rotation", "status": "info",
                           "detail": f"{e['kind']}×{e['n']} 中心{e['center']} 旋转半径{e['radius']} z={e['z']} 单件{e.get('rx') or e.get('len')}"})
    for e in elements:
        if e["kind"] == "arc" and not e.get("group") and e.get("len", 0) > 0.05:
            checks.append({"rule": "wire", "status": "info",
                           "detail": f"电线: 中心{e['center']} 长{e['len']} 粗{e.get('size')} z={e['z']}（需连接电机与插头）"})

    return {"k_pxm": k, "base": base, "elements": elements, "checks": checks}

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    data = json.load(open(path, encoding="utf-8")) if path else json.load(sys.stdin)
    print(json.dumps(audit(data), ensure_ascii=False, indent=1))