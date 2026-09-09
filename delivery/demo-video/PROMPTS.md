# 给视频生成模型的提示词（可选包装用）

> ## ⚠️ 先读这一条
> **AI 生成的视频不能当"我的模型"的演示。** 它生成的是它自己想象的一台 MacBook，
> 尺寸、键距、接口朝向、圆角半径都跟我的模型无关。用它冒充演示，等于把盲测里
> 唯一有价值的东西——"这真的是我的几何"——丢掉。
>
> **正确用法**：AI 视频只做**片头/片尾/转场**的风格化包装（不出现具体产品细节），
> 产品本体镜头一律用 `scripts/max/demo-record.mjs` 从真实页面录。
>
> 下面每一段都标了 **[可安全用于包装]** 或 **[不要用]**。

---

## 1. 片头（4 s）[可安全用于包装]

**中文**
```
极简科技广告片头：纯黑背景，一束柔和的白色矩形光箱从左上方缓慢扫过，
空气中漂浮极细的尘埃微粒，镜头缓慢推进。没有任何产品出现在画面里。
电影级质感，微妙的胶片颗粒，冷暖平衡，无文字。4 秒，24 fps。
```

**English**
```
Minimalist tech commercial intro: pure black background, a soft white rectangular light box
sweeps slowly from the upper left, faint dust particles drifting in the air, slow dolly-in.
No product visible. Cinematic, subtle film grain, balanced cool/warm, no text. 4 seconds, 24 fps.
```

**Negative**：`text, logo, watermark, laptop, product, cartoon, oversaturated, HDR halos, lens flare artifacts, flicker, distorted geometry`

---

## 2. 转场（1 s）[可安全用于包装]

**中文**
```
一束光从画面中心向外扩散，画面由黑渐亮，细密的粒子被光照亮后消散。
```

**English**
```
A light pulse expands from the center of frame; the image fades from black to light;
fine particles are lit by the light and disperse.
```

---

## 3. 章节卡背景（2.6 s）[可安全用于包装]

**中文**
```
深灰蓝色渐变背景，一道极细的水平高光线缓慢划过，画面轻微呼吸式明暗变化。
```

**English**
```
Deep slate-grey gradient background, an extremely thin horizontal highlight line glides across,
subtle breathing luminance. No objects.
```

---

## 4. 产品镜头（本片第 1–9 镜）[不要用 AI 生成]

这些镜头必须是**真实页面录制**，理由是它们承载了可核对的信息：

| 镜头 | 画面里可核对的东西 | 为什么不能 AI 生成 |
|---|---|---|
| 3/4 视角 | 机身 312.6 × 221.2 × 15.5、圆角 R20 的连续曲率 | AI 会给出一个"看起来像"的比例 |
| 屏幕正面 | 302.4 × 196.4 的活动区、刘海位置、黑边 5.1 mm | AI 会把刘海画错位置或干脆没有 |
| 键盘俯视 | F1–F12 图标 + 编号、esc / fn / 方向键、空格 92.5 mm | AI 的键盘字标必然是糊的假字 |
| 左/右壁接口 | MagSafe 3 / USB-C / 3.5 mm / HDMI / SDXC 的位置与朝向 | AI 常把接口画成 USB-A 或凭空加口 |
| 闭合上盖 | Apple 标 37.1 × 45.6 镜面嵌件、平面圆角 R20 | AI 的 logo 会变形 |
| 底面 | 脚垫 4 × Ø15 距边 22 mm、刻蚀铭牌 | AI 会画成四个黑色圆片 |

**如果一定要用 AI 生成来"补镜头"**，规则是：只允许出现在**没有可核对细节**的角度
（例如纯逆光剪影、极虚焦背景、仅露出一条边缘的特写），并且必须在字幕里标注
「示意图，非模型渲染」。**否则宁可不放。**

---

## 5. 结尾卡背景（6.4 s）[可安全用于包装]

**中文**
```
纯黑背景，右下角极淡的蓝灰色光晕缓慢呼吸，画面干净，留给文字的空间充足。
```

**English**
```
Pure black background, a very faint blue-grey glow in the lower right breathing slowly,
clean frame with ample negative space for text.
```

---

## 6. 通用风格锚（把这段加到每个包装镜头后面）

```
电影级产品广告质感，柔光箱主光，深色无缝背景，35 mm 焦段观感，浅景深，
微妙胶片颗粒，无眩光溢出，无镜头畸变，色彩克制（中性灰 + 一点点冷调）。
```

```
Cinematic product-commercial look: softbox key light, seamless dark background,
35 mm perspective, shallow depth of field, subtle grain, no bloom or flare,
no barrel distortion, restrained palette (neutral grey with a cool bias).
```

---

## 7. 一句话口径（写进任何说明文字）

> 片头/片尾为风格化包装（AI 生成）；产品镜头为浏览器实时渲染的实拍录屏，
> 几何来自本项目 `src/model/macbook/` 的标定模型。
