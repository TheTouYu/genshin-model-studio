# GIA 静态模型资产格式（千星沙箱 模型/*.gia）破译文档

> 状态：容器/消息树/字段语义已由两个真实导出样本逐字节验证（编码器回放 100% 字节一致）
> 样本（原件只读，工作副本 + SHA-256 见 §1）：
> - `等角螺线.gia`（401,378 B，7 个版本单元 + 1,953 个装饰物项）
> - `足球.gia`（277,019 B，7 个版本单元 + 1,298 个装饰物项）
> 范围：Beyond Local 静态模型资产（编辑器 模型 目录导出物）。**不是**节点图玩法逻辑资产。

---

## 1. 样本与快照

| 文件 | 原件路径（只读） | 工作副本 | SHA-256 |
|---|---|---|---|
| 等角螺线.gia | `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/模型/等角螺线.gia` | `/tmp/gms-task-b/samples/equiangular-spiral.gia` | `850eb6881cb92d20c6ecb31552694a1135af16cb10dfef75a01baf96c875fbd6` |
| 足球.gia | `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/模型/足球.gia` | `/tmp/gms-task-b/samples/football.gia` | `3d10e44f22705851a78accc604999d14d3d8ab7bf952a5a08048804e2883f438` |

原件禁止修改；两个工作副本与原文件 hash 一致。

## 2. 容器格式（与 GIL 同一容器约定）

```
┌────────┬────────┬────────┬────────┬────────┬──────────────────────┬────────┐
│ BE u32 │ BE u32 │ BE u32 │ BE u32 │ BE u32 │ protobuf Root 负载   │ BE u32 │
│ leftSize│ schema │ headTag│fileType│protoSize│ (Root 消息)          │ tailTag│
│ 0..4   │ 4..8   │ 8..12  │ 12..16 │ 16..20 │ 20 .. -4             │ -4..   │
└────────┴────────┴────────┴────────┴────────┴──────────────────────┴────────┘
```

| 偏移 | 字段 | 样本值 | 语义 |
|---|---|---|---|
| 0 | `leftSize` | 文件大小−4（401,374 / 277,015） | 其后内容总长（= protoSize + 20） |
| 4 | `schema` | 1 | 容器 schema 版本（两个样本一致） |
| 8 | `headTag` | `0x0326` (806) | 头魔数（genshin-ts injector 同款校验 `headTag !== 0x0326`） |
| 12 | `fileType` | 3 | 文件类型标记（GIL 侧同样为 3；具体类型表未闭合） |
| 16 | `protoSize` | 401,354 / 276,995 | protobuf 负载长度；`20+protoSize == size−4` 恒成立 |
| 20..−4 | — | — | protobuf `Root` 消息 |
| −4 | `tailTag` | `0x0679` (1657) | 尾魔数（injector 校验 `tailTag !== 0x0679`） |

- 全部大端（BE）；`genshin-ts` 的 `binary.ts:buildFile/readUint32BE` 与本容器逐字节一致。
- 尾部 `0x0679` 在两文件中恒定 → 是魔数/标签，**不是**内容校验和。

## 3. Root 负载消息树（逐字段）

`Root`（gia.proto 同名消息，字段号一致）：

| 字段 | wire | 样本值 | 语义 |
|---|---|---|---|
| 1 | 2 | ×7（等角螺线 7 / 足球 7） | **repeated** GraphUnit：模型版本单元（proto 中为 singular `graph`，protobufjs 取最后一个） |
| 2 | 2 | ×1,953 / ×1,298 | repeated GraphUnit：装饰物项单元（所有版本的全部项，按版本分组、组内按项序号） |
| 3 | 2 | `110170759-1786444894-1073741880-\等角螺线.gia` | filePath，格式 `{UID}-{TIME}-{LEVEL_ID}-\{文件名}.gia`（与 gia.proto 注释一致） |
| 4 | 0 | 缺失 | modeFlag：两个样本均缺失（Beyond 模式；proto 注释称经典模式为 1） |
| 5 | 2 | `6.7.0` | gameVersion（proto 注释写 6.3.0，样本为 6.7.0） |

**版本历史**：Root.field1 的多个 GraphUnit = 编辑器保存历史（每保存一个版本追加一条；文件名 ↔ 最后一个版本名一致：
`等角螺线.gia` ↔ `等角螺线-V11.2-800装饰物`、`足球.gia` ↔ `足球升级1凸面`）。**最后一个 = 当前版本**：
- 各版本的 item 结构链接（item f21.1.4 type-40 记录）指向**该版本自己的**单元 id（v6 项 → v6 单元 id）；
- 版本 f11.1.1（structureId）= 该版本单元自身 id。

## 4. 版本 GraphUnit（Root.field1 元素）

```
{ 1: Id, 2: relatedIds*, 3: name, 5: which=1, 11: 版本数据 }
```

| 字段 | wire | 语义 |
|---|---|---|
| 1 | 2 | Id `{2:class=1, 3:type=1, 4:id=<单元id>}`（class=1=Node；type=1 不在 gia.proto 枚举中，见 §7） |
| 2 | 2 ×N | relatedIds：本版本全部项 id，每个为 Id `{2:class=1, 3:type=14, 4:id=<项id>}` |
| 3 | 2 | 版本名（UTF-8，与 f6[0] 内名字一致） |
| 5 | 0 | `1`（版本单元标记；不在 gia.proto Which 枚举中） |
| 11 | 2 | 版本数据（见下） |

**f11 → f11.1**（field 1 包裹）：

| f11.1 字段 | wire | 样本值 | 语义 |
|---|---|---|---|
| 1 | 0 | = 本版本单元 id | structureId（项记录 40.50.502 指向同值） |
| 2 | 0 | 10005018 | 模板 prefab id（production-workflow 中 `templatePrefabId: 10005018` = "空模型" 模板） |
| 6 | 2 ×8 | 见下 | 版本记录 ×8（顺序固定） |
| 7 | 2 ×15 | 见下 | 模型级变量定义 ×15（f7[0]=根节点 Transform，f7[1..14] 恒定样板） |
| 8 | 2 ×6 | 见下 | 模型级变量定义/特效 ×6（恒定样板） |
| 10 | 0 | 1 | 未知常量 |

**f11.1.6 版本记录 ×8**（每条 `{1: <type>, <值字段>: <值>}`）：

| # | type | 值字段 | 内容 | 语义 |
|---|---|---|---|---|
| 0 | 1 | 11 | `{1: <版本名>}` | 版本名（与单元 field3 相同） |
| 1 | 13 | 22 | `{4: 4294967295(-1)}` | 常量（未闭合） |
| 2 | 14 | 23 | `{1: {3: "MPActionGroup"}}` | 分组名（两个样本均 "MPActionGroup"，未闭合是否可编辑） |
| 3 | 38 | 48 | `{1: 1.0}` | 常量浮点 1.0（未闭合） |
| 4 | 40 | 50 | `{501: <packed varint 项id列表>}` | **项 id 打包列表**（与 relatedIds 同序同值；packed wire2 无 tag） |
| 5 | 111 | 93 | `{}` | 空（未闭合） |
| 6 | 61 | 65 | `{}` | 空（未闭合） |
| 7 | 62 | 66 | `{}` | 空（未闭合） |

**f11.1.7 模型级变量 ×15**：

| # | type | 值字段 | 内容 | 语义 |
|---|---|---|---|---|
| 0 | 1 | 11 | `{1: pos, 2: rot, 3: scale, 501: -1}` | **模型根节点 Transform**（两样本 v0 均为 (0,0,0)/1.0 → 推测为新建默认；足球当前版已移到 (-3,1,0)/0.25，随版本变化） |
| 1..5 | 2,3,4,5,6 | 12,13,14,15,16 | `{}` / `{1:1}` / `{1:1,2:1}` | GUID/int/bool/float/string 类型空变量（未闭合） |
| 6 | 7 | 17 | `{1:1000.0, 3:500.0, 4:1, 5:1, 6:{2:10200002}, 8..15: 0.1×8}` | 配置记录（含资源 10200002 与 8 个 0.1，未闭合） |
| 7 | 8 | 18 | `{1:1, 501:1}` | 未闭合 |
| 8 | 11 | 21 | `{1:{1:"GI_RootNode", 2:{}, 3:{}, 502:"中心原点", 504:1, 505:"RootNode"}}` | **根节点声明**（名称 GI_RootNode / 中心原点 / RootNode） |
| 9 | 12 | 22 | `{501:1}` | 未闭合 |
| 10..13 | 16,17,19,20 | 26,27,29,30 | `{}` / `{1:1}` | 未闭合 |
| 14 | 22 | 32 | `{3:-1, 4:100.0, 5:0xFFFFFF, 6:6700}` | **模型级默认颜色**（白、不透明 100；注意 32.3 在此为 -1 而非 0xFF000000\|rgb，与项级颜色不同） |

**f11.1.8 模型级记录 ×6**（全部恒定）：

| # | type | 值字段 | 内容 | 语义 |
|---|---|---|---|---|
| 0 | 18 | 28 | `{9:{...503:"受击特效", 507:13}, 10:{...503:"被击倒特效", 507:13}, 11:"GI_RootNode"}` | **特效配置**（受击/被击倒特效，f28.507=13） |
| 1..5 | 1,3,19,6,14 | 11,13,29,16,24 | `{2:1, <值字段>: {}}` | 空变量声明（未闭合） |

## 5. 装饰物项 GraphUnit（Root.field2 元素）

```
{ 1: Id, 3: name, 5: which=28, 21: 项数据 }
```

| 字段 | wire | 语义 |
|---|---|---|
| 1 | 2 | Id `{2:class=1, 3:type=14, 4:id=<项id>}`（与版本 relatedIds 同形态） |
| 3 | 2 | 项名 `装饰物_N`（N = 该项在所属版本内的 1 基序号；每版本从 1 重新计） |
| 5 | 0 | `28`（项单元标记；不在 gia.proto Which 枚举中） |
| 21 | 2 | 项数据（proto 无此字段号，protobufjs 会静默丢弃） |

**f21 → f21.1**（field 1 包裹）：

| f21.1 字段 | wire | 语义 |
|---|---|---|
| 1 | 0 | 项 id（= 单元 id） |
| 2 | 0 | **resourceId**（资源/prefab id，如 10009001/10009004/10009005/10009008） |
| 3 | 0 | `1`（常量） |
| 4 | 2 ×3 | 变量定义 ×3（顺序固定，见下） |
| 5 | 2 ×4 | 变量值 ×4（顺序固定，见下） |
| 11 | 2 | `{}` 空消息（常量） |

**f21.1.4 定义 ×3**（`{1: <type>, <值字段>: <值>}`，顺序固定）：

| # | type | 值字段 | 内容 | 语义 |
|---|---|---|---|---|
| 0 | 1 | 11 | `{1: "装饰物_N"}` | 项显示名 |
| 1 | 40 | 50 | `{502: <structureId>}` | **结构链接**（= 所属版本单元 id / f11.1.1） |
| 2 | 111 | 93 | `{}` | 空（未闭合） |

**f21.1.5 值 ×4**（顺序固定：transform, float, guid, color）：

| # | type | 值字段 | 内容 | 语义 |
|---|---|---|---|---|
| 0 | 1 | 11 | `{1: pos, 2: rot, 3: scale}` | **Transform**（见下） |
| 1 | 5 | 15 | `{1: 1, 2: 1}` | 常量（未闭合） |
| 2 | 2 | 12 | `{}` | 空 GUID（未闭合） |
| 3 | 22 | 32 | 见下 | **颜色** |

**Transform（type-1 值的 11 字段）**：
- `11.1` = position Vec3 `{1:x, 2:y, 3:z}`；值为 0 的轴**省略**（足球五棱柱 (0.06, 1.25) ⇒ z=0）
- `11.2` = rotation Vec3（欧拉角，样本为度：五棱柱 y=-90、三角片 y/z 组合；游戏内单位未验证）
- `11.3` = scale Vec3（**三个轴恒全写**，样本无一省略）

**颜色（type-22 值的 32 字段）**：

| 字段 | wire | 样本值 | 语义 |
|---|---|---|---|
| 1 | 0 | 1 | enabled（布尔） |
| 3 | 0 | `0xFF000000 \| rgb` | ARGB 形式颜色（全部 3,251 个项验证 `f3 == 0xFF000000 \| f5`） |
| 4 | 5 | 100.0 | opacity（0-100 浮点） |
| 5 | 0 | `0xRRGGBB` | RGB 颜色（与 structure.json `color.rgb` 同语义） |
| 6 | 0 | 6700 | 常量（overlay 模式等语义**未闭合**） |

## 6. 负载类型判断

- 两个样本的 Root 负载 = 静态模型资产：版本 GraphUnit + 装饰物项 GraphUnit。
- **不使用** gia.proto 的 NodeGraphWrapper/CompositeDefWrapper/StructureDefWrapper（字段 13/14/22 均不存在）；
  模型数据在 **GraphUnit 字段 11（版本）/ 21（项）**——proto 未定义，protobufjs 解码会静默丢弃。
- 因此 injector 的 `slice(20,-4)+Root.decode` 能解出 filePath/gameVersion/版本名，但拿不到项数据。

## 7. 与 gia.proto 的差异（以样本二进制为准）

| 项 | gia.proto | 样本实际 |
|---|---|---|
| GraphUnit.Id.Type | 0/3/15 | 版本单元 **1**、项单元 **14** |
| GraphUnit.Which | 9..64（无 1/28） | 版本单元 **1**、项单元 **28** |
| Root.graph | singular | **repeated**（版本历史，最后=当前） |
| graphType oneof | 13/14/22 | 版本数据 **11**、项数据 **21** |
| gameVersion 注释 | 6.3.0 | **6.7.0** |
| modeFlag | 经典模式 1 | Beyond 模式缺失 |

## 8. 与 GIL root 4/8/27 闭包及 structure.json 的关系

（GIL 侧结论引自 `static-gil-model-builder/references/production-workflow.md`，非本次直接读图验证）

- GIL 静态模型闭包 = root 4（definition）+ root 8（instance）+ root 27（aux，definition-side 与 instance-side 各一套，条数与 items 数相等）；条数证据：足球 v2 = 12 五棱柱 + 120 三角片 = 132 项，与 `.gia` 的 `足球v2基准` 版本（132 项）**完全一致**。
- `.gia` 模型资产是"模型源"（编辑器 模型 目录，含版本历史）；GIL 闭包是"地图放置实例"。
- structure.json `items[]` 字段映射（GIA 编码器侧）：

| structure.json | GIA wire |
|---|---|
| `items[i].resourceId` | 项单元 `f21.1.2` |
| `items[i].position / rotation / scale` | 项单元 `f21.1.5` type-1 记录 `11.{1,2,3}`（0 轴省略；scale 三轴恒写） |
| `items[i].color.enabled` | 颜色记录 `32.1` |
| `items[i].color.rgb` | 颜色记录 `32.5`（及 `32.3 = 0xFF000000\|rgb`） |
| `items[i].color.opacity` | 颜色记录 `32.4`（浮点） |
| `items[i].color.overlay` | **未闭合**（`32.6` 恒 6700，无映射证据） |
| 模型名 | 版本单元 `f3` / `f11.1.6[0]` / f6[0] |
| 模型根放置 | `f11.1.7[0]` rootTransform（样本 v0 默认 (0,0,0)/1.0） |

- 资源 id 语义（由足球几何对照确认）：10009004 = 三角片（120 条）、10009005 = 五棱柱（12 条），与 production-workflow 足球 v2 结构一致；10009001/10009002/10009008 名称**未闭合**（等角螺线 v6 用 10009001×401 + 10009004×400 组成 801 项，颜色为红→橙渐变）。

## 9. 验证结果

解析器 `src/gia_parser.py`：
- 两个样本完整解析，**0 warning、0 未知字段**；输出逐字段 JSON + 摘要（版本 7+7、项 1,953+1,298、item id 连续段与版本一一对应）。
- 逐项说明：每项 id/resourceId/Transform/颜色/名字全部输出，与静态模型语义一致（足球五棱柱位置 = 正二十面体顶点 (0,±0.50,±0.81)、黑 0x171A22 ×12 + 灰 0xB8C0C8 ×120；等角螺线 XZ 平面螺线、y 恒 0.025、rotY 沿切线、红→橙渐变）。

编码器 `src/gia-encoder.ts` + 回放 `src/roundtrip.py`：
- 从样本提取当前版本 → 编码 → 重解析：两个样本 **全部检查 PASS**（容器、filePath、gameVersion、版本名、unitId、structureId、templatePrefabId、rootTransform、f7/f8 计数、项数、which/class/type 模式、逐项 id/resource/position/rotation/scale/color/name、单版本计数）。
- **字节级对照**：重建文件的当前版本单元与全部项与样本**逐字节一致**（足球 2836B 单元 + 132 项；等角螺线 14223B 单元 + 801 项）。
- 与样本唯一结构差异：样本含 7 个版本单元（编辑器历史），重建为 1 个（新模型无历史）——设计如此，已在 roundtrip 断言中显式检查。

## 10. 未闭合项清单（禁止猜测的字节语义）

1. **Id.type = 1/14、Which = 1/28 的枚举名**——样本值与 gia.proto 不符，真实枚举含义未知。
2. **颜色记录 `32.6` = 6700**——恒量，overlay（'overwrite'/'multiply'）映射未知；`color.overlay` 输入不映射。
3. **模型级默认颜色 `32.3` = -1**（f7[14]）与项级 `0xFF000000|rgb` 不一致的原因。
4. **f7[1..14]/f8[0..5] 各记录语义**（type 7 配置含 10200002、type 11 根节点声明、type 18 特效等）——仅观察到结构，作用机制未闭合；编码器原样复刻字节。
5. **f6 记录 type 13/38/111/61/62** 与 f7[0] 的 `501=-1` 语义。
6. **项 f21.1.3=1、f21.1.11={}、type-5 值 {15:{1:1,2:1}}、type-2 值 {12:{}}** 语义。
7. **rootTransform 默认值 (0,0,0)/1.0** 的编辑器含义（两个样本 v0 相同 → 推测为新建默认；足球当前版 (-3,1,0)/0.25 为编辑器移动结果；未验证）。
8. **rotation 单位/顺序**（度 vs 弧度、Euler 约定）——样本值支持"度"，但无游戏侧验证；scale 缺失轴默认值（样本恒三轴全写）。
9. **ID 分配规则**——单元 id（≈1077936xxx）与项 id（≈1073741xxx..1073750xxx）的分配策略无法由两个样本推导；编码器要求输入显式 id（fail-closed）。
10. **版本历史块是否必需**——游戏是否接受单版本文件未验证（无法运行游戏）；编码器按"新模型=1 版本"生成。
11. **filePath 的 UID/TIME/LEVEL_ID 语义**——仅观察到格式 `{UID}-{TIME}-{LEVEL_ID}-\{名}.gia`；LEVEL_ID 与沙箱地图 id 的关系未验证。
12. **headTag 0x0326 / tailTag 0x0679 / schema 1 / fileType 3** 的完整含义（fileType 是否区分资产类型）。
13. **10005018 模板 prefab id 是否恒为"空模型"**——两个样本一致；其他模板值未闭合。
14. **f11.1.10=1、f6[1].22.4=-1** 常量语义。
15. **gameVersion 兼容性**——样本均为 6.7.0；其他版本行为未知。

## 11. 编码器使用说明

`src/gia-encoder.ts`（零依赖 TS；Node ≥22.6 直接 `node` 运行，或 `npx tsx`）：

```bash
node /tmp/gms-task-b/src/gia-encoder.ts <structure.json> <output.gia>
```

输入 `structure.json`（超集，字段必需项见代码 `validate()`）：

```json
{
  "schemaVersion": 1,
  "model": {
    "name": "我的模型",
    "unitId": 1077936150,
    "templatePrefabId": 10005018,
    "rootTransform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
    "items": [
      { "id": 1073742000, "resourceId": 10009001,
        "position": [0.03, 0.025, 0.002], "rotation": [0, 4.01, 0], "scale": [0.0101, 0.0101, 0.0054],
        "color": { "enabled": true, "rgb": 16712448, "opacity": 100, "overlay": "overwrite" } }
    ]
  },
  "file": { "filePath": "110170759-1786444894-1073741880-\\我的模型.gia", "gameVersion": "6.7.0" }
}
```

- 项名缺省为 `装饰物_{序号+1}`；`color` 缺省写白不透明（记录必填，见 §5）；`overlay` 不映射（§10-2）。
- 回放验证：`python3 src/roundtrip.py <sample.gia>`（PASS 输出 + 字节对照见 §9）。
