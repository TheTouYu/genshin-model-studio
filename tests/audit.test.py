#!/usr/bin/env python3
"""audit-model 回归测试：正确性（已知几何）+ 边界（空/单笔/旧作品/lathe）。
运行：python3 tests/audit.test.py（退出码 0 = 全过）"""
import json, sys, importlib.util, os
spec = importlib.util.spec_from_file_location("audit_model", os.path.join(os.path.dirname(__file__), "..", "scripts", "audit-model.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
audit, checks = m.audit, m.checks
fails = []
def check(name, cond, extra=""):
    print(("✓" if cond else "✗") + f" {name}" + (f" {extra}" if extra and not cond else ""))
    if not cond: fails.append(name)

def base():
    return {"version": 3, "strokes": [], "options": {"mode": "extrude", "shape": "cylinder", "size": 0.03, "count": 60, "heightMeters": 1, "canvasHeightPx": 320}}

# 边界
check("空作品", audit(base())["elements"] == [])
d = base(); d["strokes"] = [{"id": "a", "points": [[10,10],[20,10],[20,20],[10,20],[10,10]]}]
check("单笔画无元数据降级", len(audit(d)["elements"]) == 1 and audit(d)["elements"][0]["kind"] == "?")
d2 = base(); d2["options"]["mode"] = "lathe"; d2["strokes"] = [{"id": "cup", "points": [[100,300],[130,300],[130,250],[100,250],[100,300]]}]
check("lathe 母线", len(audit(d2)["elements"]) == 1)
check("空作品 checks 不崩", checks(audit(base())) == [])

# 正确性（当前风扇 work.json 需存在：python3 tests/audit.test.py <work.json>）
path = sys.argv[1] if len(sys.argv) > 1 else None
if path and os.path.exists(path):
    data = json.load(open(path, encoding="utf-8"))
    r = audit(data)
    els = r["elements"]
    def find(kind, group, pred=None):
        for e in els:
            if e["kind"] != kind or e.get("group") != group: continue
            if pred and not pred(e): continue
            return e
        return None
    cases = [
      ("后环", find("ring", False, lambda e: abs(e["z"]+0.05)<0.02), {"r": 0.125, "size": 0.0063}),
      ("后中心环", find("ring", False, lambda e: abs(e["z"]+0.085)<0.02), {"r": 0.05, "size": 0.012}),
      ("焊接圈", find("ring", False, lambda e: abs(e["z"])<0.02), {"r": 0.125, "size": 0.0075}),
      ("前环", find("ring", False, lambda e: abs(e["z"]-0.015)<0.02 and e["r"]>0.1), {"r": 0.125, "size": 0.004}),
      ("前中心环", find("ring", False, lambda e: abs(e["z"]-0.015)<0.02 and e["r"]<0.1), {"r": 0.045, "size": 0.008}),
      ("电机", find("disc", False, lambda e: abs(e["z"]+0.075)<0.02), {"r": 0.05, "thick": 0.09}),
      ("固定盘", find("disc", False, lambda e: abs(e["z"])<0.02 and 0.03<e["r"]<0.05), {"r": 0.035, "thick": 0.004}),
      ("前脸圆", find("disc", False, lambda e: abs(e["z"]-0.02)<0.02), {"r": 0.035}),
      ("前轴", find("disc", False, lambda e: abs(e["z"]+0.015)<0.01 and e["r"]<0.03), {"r": 0.02, "thick": 0.03}),
      ("后轴", find("disc", False, lambda e: abs(e["z"]+0.125)<0.02), {"r": 0.015, "thick": 0.01}),
      ("底座", find("disc", False, lambda e: e["r"]>0.1), {"r": 0.13, "thick": 0.02}),
      ("叶片组", find("el-disc", True, lambda e: e["n"]==3), {"radius": 0.077, "rx": 0.042, "pitch": 12, "z": 0.0}),
      ("后罩组", find("arc", True, lambda e: e["n"]==36 and e["zBase"]<0), {"len": 0.125, "size": 0.0015, "zBase": -0.015}),
      ("前罩组", find("arc", True, lambda e: e["n"]==36 and e["zBase"]>0), {"len": 0.125, "size": 0.0015, "zBase": 0.015}),
      ("支架", find("rod", False, lambda e: e["size"]==0.02), {"size": 0.02}),
      ("电线", find("arc", False, lambda e: e["size"]==0.005), {"size": 0.005}),
    ]
    for name, e, expect in cases:
        if e is None:
            check(name, False, "未找到"); continue
        bad = [k for k, v in expect.items() if abs((e.get(k) or 0) - v) > 0.011]
        check(name, not bad, str(bad))
else:
    print("（未传 work.json，跳过几何断言）")

sys.exit(1 if fails else 0)