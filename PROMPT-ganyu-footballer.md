# 甘雨足球运动员建模提示词

你是严谨的角色建模师。依据 [参考图] reference/ganyu-3view.png 与 reference/body-wire-{front,side,quarter,back}.png，从零完成足球服甘雨 #10 的最高质量可交付模型。

按顺序执行：加载 gms-character-modeling；读取 landmarks/palette，先用正交 overlay 定标；低面数 profileLoft 建立带前后厚度的躯干、头和四肢；用 extrudePatch/extrudeRing/branch 让颈、肩、髋、掌、五指从主网格共享顶点长出；cage 点调形后用 Catmull-Rom、dense、adaptiveAngularStops 升面。胸、臀、小腿、踝必须变形主表面，禁止贴块。

外观必须匹配：甘雨蓝白渐变发、黑红弯角及红金饰件；白蓝球衣/短裤、领口袖口滚边、GANYU 与 10；黑手套、白蓝条纹袜、白蓝足球鞋、鞋底与鞋钉。人体/脸皮一体；衣、发、鞋、眼睫可分件且贴合。

硬门禁：禁止 mergeMeshes、独立脸拼身体、rod 手指、jitterMesh、浮空装饰；meshCheck、seamCheck(onePiece)、verify 必须通过，selfIntersections=0、无退化/瘦三角且水密。每个阶段保存 iteration-records JSON、截图并 read_image 复核。先网页 1:1 正交/多视角预览，再 export-mesh 默认 gate 导出 structure/gil/gia；10009019 不直出，GIA root=0.1 的位置与缩放双补偿。未获用户游戏验收，不得宣称完成。