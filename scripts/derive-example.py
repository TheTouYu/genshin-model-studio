#!/usr/bin/env python3
"""派生组件示例：基于 audit 基础数据，大模型写小脚本聚合领域组件。
演示：把"环 + 弧线旋转组"聚合为"罩子"（cage）组件；把"盘 + 椭圆旋转组"聚合为"旋转单元"。
这证明 audit 是技术能力底座：任何模型可写自己的 derive 脚本（如汽车：wheel = 轮毂盘+轮胎环+辐条组）。"""
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("audit_model", "/home/h/genshin-model-studio/scripts/audit-model.py")
audit_model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_model)
audit = audit_model.audit

data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/home/h/genshin-model-studio/.bh/work.json", encoding="utf-8"))
r = audit(data)
els = r["elements"]

def derive_cages(elements):
    """罩子 = 同中心同 z 的 ring + arc 旋转组（半径接近）。"""
    cages = []
    rings = [e for e in elements if e["kind"] == "ring"]
    arcs = [e for e in elements if e["kind"] == "arc" and e.get("group")]
    for arc in arcs:
        match = [r2 for r2 in rings
                 if abs(r2["z"] - (arc.get("zBase") or arc["z"])) < 0.03
                 and abs(r2["r"] - arc.get("len", 0)) < 0.01]
        cages.append({"component": "cage", "ring_z": match[0]["z"] if match else None,
                      "ring_r": match[0]["r"] if match else None, "spokes": arc["n"],
                      "rise": arc.get("rise"), "wire_size": arc.get("size"),
                      "center": arc["center"]})
    return cages

def derive_rotor(elements):
    """旋转单元 = 椭圆盘旋转组（叶片类）+ 同 z 中心盘（固定件）。"""
    blades = [e for e in elements if e["kind"] == "el-disc" and e.get("group")]
    hubs = [e for e in elements if e["kind"] == "disc"]
    out = []
    for b in blades:
        hub = max([h for h in hubs if abs(h["z"] - b["z"]) < 0.02 and h["r"] < b["radius"]],
                  key=lambda h: h["r"], default=None)
        out.append({"component": "rotor", "blades": b["n"], "radius": b["radius"],
                    "blade_rx": b.get("rx"), "blade_ry": b.get("ry"), "pitch": b.get("pitch"),
                    "z": b["z"], "hub_r": hub["r"] if hub else None})
    return out

result = {"cages": derive_cages(els), "rotors": derive_rotor(els)}
print(json.dumps(result, ensure_ascii=False, indent=1))