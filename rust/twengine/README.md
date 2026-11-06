# twengine

一个 wasm，两个前端：地图预览和 demo 回放。

底座是 [twgpu](https://gitlab.com/ddnet-rs/twgpu)（地图/精灵渲染），这个 crate 在它上面加了三件事：

1. **自己的 `.demo` reader**（`src/demo.rs`）
   twgpu-tools 里那份 reader 会把 message chunk 吞掉；这里换成直接读 libtw2 的实现，
   于是能顺手把 demo 里的声音事件也抽出来。
2. **声音事件**（`src/sound.rs`）
   Rust 只负责"什么时候、在哪、响什么"，真正的播放交给 JS 的 Web Audio
   （`static/ddnet/engine/sound.js`）。
3. **相机跟随**（`src/camera.rs`）
   twgpu 的 `Camera` 只有位置和缩放，加了一个与帧率无关的平滑跟随。

## demo 里的声音是从哪来的

demo 文件没有音轨，但有**声音事件**，两个来源：

- **snapshot 里的 net event**：服务端 `CreateSound()` → `CNetEvent_SoundWorld`，
  `Sv_SoundGlobal` 同理。twsnap 已经把它们解析到 `Snap::events`：
  `Events::Sound{pos, sound}` / `Events::SoundGlobal{sound}`。
  另外客户端对 `NETEVENTTYPE_HAMMERHIT`、`NETEVENTTYPE_SPAWN` 也会各播一个声音，这里一起补上。
- **message chunk 里的 `Sv_SoundGlobal`**：客户端自己那声跳 / 钩子（服务端的
  TeamMask 把"自己"排除了）和 CTF 提示音，由 `CSounds::PlayAndRecord()` 录进 demo。
  libtw2 已经把消息解成了 `msg::Game::SvSoundGlobal`，直接用。

> 顺带一提：`content.py` 里的 `hook_loop`、`body_land`、`weapon_noammo`、`tee_cry`、`hit`
> 在现在的 DDNet 客户端里已经没人调用了（`grep SOUND_ src/` 就能看出来），所以这里也不做。
> 真正只在本地播、demo 里没有的只剩 `player_airjump` 和 `player_skid`，见下面的 TODO。

声音 id → 名字的顺序来自 ddnet 的 `datasrc/content.py`（`container.sounds` 的添加顺序就是
`SOUND_*` 枚举的值）。`scripts/build-engine.ts` 在构建时会把这张表和本 crate 的 `SOUND_NAMES`
逐项比对，不一致直接失败；换 DDNet 版本时先看这个报错。

### 客户端预测音

demo 里根本没有这两类声音，只能自己从 snapshot 推（条件照抄客户端）：

| 声音             | 条件                                                       | 出处                                |
| ---------------- | ---------------------------------------------------------- | ----------------------------------- |
| `player_airjump` | `m_JumpedTotal` 变大（落地跳会清 0，所以"变大"就是二段跳） | `gamecore.cpp` `COREEVENT_AIR_JUMP` |
| `player_skid`    | 在地面上 + 朝向和速度相反 + 速度 > 10 tile/s，限流 100ms   | `players.cpp` / `effects.cpp`       |

实现在 `TwDemo::collect_client_predicted()`（每个 snapshot 只处理一次）。
注意 `twgame::Map::is_grounded()` 收的是 DDNet 世界单位（tile × 32），twsnap 给的是 tile，要乘 32。

### 音频打包

`scripts/build-engine.ts` 把用到的音效（31 个集合 / 85 个变体）转成 Opus（40k 单声道 VBR，
`compression_level 10`），塞进一个 **STORE 的 zip**（213 KiB）一次请求拿到，前端解包后
**每个音效单独 `decodeAudioData`**。

> 之前试过"全部拼成一条 Opus、按采样偏移切片"，结果上一段的尾巴会漏到下一段里
> （编码器的帧边界不在切片点上）。独立 opus 流就没有这个问题，代价只是 zip 头 ~20KB。
> 没用压缩（zip method 0）是因为 opus 已经压过了，再 deflate 白花 CPU。

## 对外接口（wasm-bindgen）

和 twgpu-web 保持同名，所以地图预览那边不用改代码：

`TwGpu` / `TwMap` / `TwMapIntermediate` / `TwCamera` / `TwSurface`，另加：

- `TwDemoIntermediate(bytes)` —— 解析 `.demo`；`.length` / `.map_name` / `.map_sha256` /
  `.contained_map_data()` / `.build(map)`
- `TwDemo` —— `continue_to_tick(tick)` / `seek_to_tick(tick)` / `.time` / `.ended` /
  `focused_player()` / `player_position(id)` / `new_player_skins()` / `players_json()` /
  **`drain_sounds()`**（JSON 数组，每帧取一次）
- `TwGpu.render_demo(surface, camera, map, demo)`
- `TwCamera.follow(x, y, dt, snap)`

## 队伍视角（multiview）

客户端里 multiview 不是分屏，而是**一个镜头把整队框进画面**：`HandleMultiView()` 取同队所有人的
包围盒，`CalculateMultiViewZoom()` 把包围盒换算成 zoom，`CalculateMultiViewMultiplier()` 决定镜头
追过去的速度。这些都在 `static/ddnet/engine/demo.js` 里照着实现了一份（`MV` 常量 + `updateCamera`）。

队伍信息有三级来源：

1. 快照里的 `Player.team`（客户端自己录的 demo，`team > 0` 就用它）
2. 网页链接里那一档名次的 `finishers`（ddnet.org 的 demo 是服务端从 teehistorian 合成的，
   里面所有人的 `team` 都是 0，只能靠名次数据）
3. 都没有时退回客户端的 `InitMultiView(0)` 逻辑：取当前画面里的玩家

## 播放器 UI（`static/ddnet/engine/demo.js`）

- 控制条和标题都是**浮在画面上**的 overlay：播放时鼠标不动 2.5 秒自动淡出，暂停时常驻
- 控制条分三行：①「跟随 + 团队视角」②进度条独占一行 ③播放/静音/速度/缩放/下载/全屏 —— 谁都不会把别人挤到别的行
- 窄屏不再靠隐藏按钮腾地方（按钮各占一行后就放得下），只收紧尺寸；360px 下所有控件都在
- 启用的按钮（队伍视角、全屏）hover 时**变亮**而不是变暗，不然看不出是"按下去会关掉"还是"要打开"
- 自由视角时队伍视角自动失效、按钮置灰；关掉队伍视角则回到单人跟随
- 音量只有一个开关，固定 70% 音量
  - 默认是否静音**看浏览器给不给自动播放权限**：有 `navigator.getAutoplayPolicy('audiocontext')` 就直接问；
    没有的浏览器看 AudioContext 建起来是不是直接 `running`（被拦会停在 `suspended`）。
    放行就默认有声 —— 用户在这个站上互动过就属于这种情况
  - 探测用的上下文就是真正播声音的那个，不额外建一个来试
  - 静音时喇叭按钮**标红**（红图标 + 淡红底 + 内描边），不然"没声音"很容易被误判成播放器坏了
- 自由视角的缩放/平移/双指完全照搬地图预览页（mappreview）：一根手指 = `move_zoom(factor 1)` 平移，两根手指 = 以两指中点锚定、按距离比缩放（缩放+平移一步到位），滚轮同 `move_zoom(x, y, x, y, exp(deltaY*0.0015))`，zoom 范围 0.05–20
- 锁定视角（跟随某人/某队）时拖动不生效，滚轮/双指只改 zoom、镜头位置不动
- 名字牌用 **DOM** 渲染（`updateNameplates()`），不再走 wasm 里的 SDF 文字：DejaVuSans 里没有汉字，`坤坤` 这种名字根本画不出来。DOM 直接吃系统字体（`ui-sans-serif, system-ui, …, sans-serif` 兜底），中文/日文/emoji 都对，还省掉 757 KB（gzip 380 KB）的 ttf 下载。成本实测 0.29 ms/帧（2 个名字）
- 描边抄客户端 `AdjustOutlineThicknessToFontSize()`：<18px 一像素、18–48px 两像素、>48px 四像素；`-webkit-text-stroke` 是居中描边，配合 `paint-order: stroke fill` 要写两倍宽度才是“往外扩 thickness 像素”。alpha 0.5 的黑描边、无阴影无发光
- 字号和定位都对齐到**设备像素**网格（用真实 `devicePixelRatio`，不是 canvas 那个封顶 2 的渲染 dpr），3x 屏上也不会落到 1/3 像素被重采样
- 控制条有「名字」开关，关掉会清空 DOM 节点；自由视角下也照常每帧采位置（不然放大后名字牌会冻住）
- 播放时用 Screen Wake Lock API 保持屏幕常亮，暂停/销毁就放掉；浏览器不支持或拒绝就静默跳过（不搞静音视频循环那种 workaround）

## 从哪进播放器

- `/ddnet/watch?uuid=<uuid>&time=<秒>`：和 ddnet.org/watch 一样的链接形状
  - 先试上游为每场单独生成的 `runs/<uuid>.jsonl`（小、最新）
  - 没有再问服务端的 `/ddnet/watch/api/lookup?uuid=&time=`，它查的是下面这份索引
  - **不再把 `watchable.jsonl` 整个下到浏览器**：那是 3 MB 的 JSONL，还是每分钟级更新的
- 地图详情页（`/ddnet/maps/<名字>`）SSR 时就查好"这张图有没有可播的回放"：
  - `src/lib/server/fetches/watchable.ts` 把 `https://ddnet.org/watch/watchable.jsonl`
    解析成 `地图名(小写) → 回放列表`，存进 sqlite 缓存，进程内再 memo（1 分钟 TTL + 上游变更时重建）
  - 和官方名次对齐（时间 0.02 秒容差 + 玩家名），**不是**取时间最短的那条 —— 清单里混着
    旧版本地图的记录，AiP-Gores 最快的 58.38 秒是 `rank 32`，官方第一是 97.34 秒
  - 只看第一名；某一档没有预生成 demo 就顺延到下一档，tooltip 会写清是"团队第 N 名"
  - 客户端只拿到一条摘要（uuid / time / ts / kind / rank / names），不是整份清单

## tee 动画状态（patches/twgpu-web-fixes.patch）

上游 twgpu 挑动画状态的方式和 DDNet 客户端对不上：它只按"两个 snapshot 的 `pos.x` 是否相等"
分 Idle/Walking，其余一律 InAir。现在照客户端 `players.cpp` 的 `evaluate animation` 逐行搬过来：

| 判定           | 客户端                                                            | 之前 twgpu           | 现在                                              |
| -------------- | ----------------------------------------------------------------- | -------------------- | ------------------------------------------------- |
| 在空中         | `!Collision()->CheckPoint(x, y + 16)`（脚下 16 单位那**一个点**） | 两只脚所在格是否实心 | 同客户端                                          |
| 站着           | `m_VelX ∈ [-1, 1]`（和位置有没有变无关）                          | `pos.x` 前后相等     | 同客户端                                          |
| 跑             | `                                                                 | m_VelX               | >= 5000`→`run_left`/`run_right`，相位周期 **200** | 没有跑动画 | 补上（数据照抄 `datasrc/content.py`） |
| 走路           | `WalkTime = fmod(x, 100)/100`                                     | 同（周期对）         | 同                                                |
| 想反向（滑步） | **不加**走路动画，脚停在 base 姿势                                | 照常摆腿             | 同客户端                                          |

- `m_VelX` 是 NetObj 里的定点值（速度 ×256，单位是 DDNet 世界单位/tick），`WantOtherDir`
  判的却是插值后的速度 —— 客户端本来就是两个口径的输入，别统一
- 判定抽成了纯函数 `tee_anim()`，patch 里带 5 个单元测试（`cargo test -p twgpu` 可跑），
  把"空中优先 / 站着看速度不看位置 / 5000 门槛 / 滑步冻结 / 相位取模"都钉住了

## 准星(旁观玩家的瞄准点)

- **Rust 画的,不走 DOM**：名字牌用 DOM 是因为字体(DejaVuSans 没有汉字)，准星是几何图形，
  没这个理由，所以直接进精灵管线
- 贴图来自 `game.png`：DDNet 的 6 个武器准星在**第 0 列**，每格 32px、各占 2x2 格。
  注册 `game` 贴图时顺手裁出来存成 6 张独立小图（索引 = 武器 id，注意激光/武士刀的行号是
  12/10 反过来，跟客户端 `m_aSpriteWeaponCursors` 的顺序对齐）
- 位置照抄客户端 `CHud::RenderCursor`，**screen space** 但挂在玩家身上：
  屏幕上离玩家多少像素 = 瞄准点（DDNet 单位），和游戏 zoom 无关 —— 客户端 HUD 用 zoom 1 的变换，
  再把 `WorldTarget` 里乘过的那次 Zoom 除掉，刚好抵消；换算成 tile 就是 `aim * zoom / 32`。
  贴边时按最大比例压回屏幕、同时半透明
- 大小照客户端：`QuadContainerAddSprite(64.f * ScaleX)`，其中 `ScaleX = 64 / length(64, 64) = 0.7071`，
  即 45.25 个 HUD 单位；HUD 单位再按 zoom 1 的视野换算成像素（窗口越宽像素越多）。
  1008px 宽的画布里约 **35px** —— 之前按"64 逻辑像素 + 窗口高度缩放"算成了 68px，明显偏大
- 团队视角下**照画**：准星挂在被跟随的玩家身上（客户端在 multiview 里不画，这里按需求放开）
- 玩家死了不画（没有瞄准点可用）
- 瞄准点做了 85ms 的一阶平滑，近似客户端的 4.25 tick 插值延迟，不然准星会一跳一跳

## 镜头在单人跟随 / 团队视角之间切换

进出团队视角时目标会跳很远（玩家身上 ↔ 包围盒中点），以前是硬切：`snapCamera` 一置位，
位置和 zoom 一帧到位，看着"啪"一下。现在：

- **zoom 只有一个来源 `camera.zoom`**，每帧都指数平滑到当前模式的目标值
  （单人 = `followZoom`，团队 = 按包围盒算出来的目标），时间常数沿用 `cl_multiview_zoom_smoothness`
  那一档（0.28s）。顺带修掉一个老问题：退出团队视角后 zoom 会停在团队视角那个拉远的值上，
  现在会回到用户自己用滚轮调的那个（`followZoom`）
- **位置**在模式切换后走一段过渡（`blendCamera`，时间常数 0.12s），结束条件是"离目标足够近"
  而不是到点硬收（距离远的时候到点还没到位，交还给模式自己的 `move_to` 会补一脚）
- 换观察对象也走同一套（客户端的 `cl_smooth_spectating_time` 也是平滑过去的），
  进出自由视角仍然直接落位（那里本来就该瞬移）
- 团队视角里用户自己缩的那几格（`mv.personal`）不受影响

## 动态镜头（`cl_dyncam` 的旁观版）

- **没有开关**：只要在跟随、且没处于团队视角，就一直启用（团队视角下由 multiview 自己管镜头）
- 参数锁死成客户端 `CCamera::UpdateCamera()` 里旁观那组硬编码值
  （源码注释：_use hardcoded smooth camera for spectating_）：
  `Smoothness = 50`、`Stabilizing = 50`、`IsDyncam = true`
  → `CameraSpeed = (1 - 50/100) * 9.5 + 0.5 = 5.25`、`CameraStabilizingFactor = 1.5`
- 死区/跟随比例用 `cl_dyncam` 的默认值 300 / 60：客户端那几个值来自服务器发的相机信息，
  从 teehistorian 转出来的 demo 里没有，用 0 的话动态镜头等于没开
- 三行公式原样搬过来：速度偏置 `bias`（瞄准点一动就减，减 `dist * log10(1.5) * 0.02`）、
  目标偏移 `max(|瞄准| - 死区, 0) * 跟随比例`（上限 `350 * zoom`）、
  当前偏移按 `min(dt * bias, 1)` 追过去
- 镜头中心 = 玩家位置 + 偏移，**位置本身不再额外平滑**（客户端也是这样，只有偏移是平滑的）；
  切到团队视角、玩家死了都会把状态清零，不会从旧偏移慢慢飘回来

## WebGL 上的 mipmap

**症状**：手机上开 mipmap 时 tilemap 整片消失，quad/tee 正常。关掉 mipmap 就正常；开着时 L0 也正常。

**为什么只有 tilemap**：tilemap 采的是 **array texture**（16×16 个 tile 拼成 256 层），quad/tee 用的是普通 **2D 纹理**。两者都走 `generate_mipmaps`，但 array 多了一层「array 层 ↔ 2D 临时贴图」的来回拷贝，而且 mip≥1 要写回 array 的某一层。桌面上没问题，部分 mobile GLES 驱动上这一步拿不到数据。

**修法**：tilemap 的 array texture 整块改成 CPU 生成（切 tile 网格 + 盒式滤波），逐级 `write_texture` 写进去 —— 和驱动怎么实现 mip 彻底无关。quad/tee 继续走原来的 GPU 路径（它们在手机上本来就是好的）。

**性能**（wasm，真实地图 8 张 1024×1024 tilemap）：

| 指标          | 值                                         |
| ------------- | ------------------------------------------ |
| 全部 mip 生成 | **26 ms**（优化前 48 ms）                  |
| 单张          | 2.2 – 5.8 ms                               |
| 峰值额外内存  | **4 MiB**（= 最大那张的 level0，不是总和） |

优化手段：

- 数据用 `Vec<u32>`（每元素一个像素），整条链在 32 位视图上跑，无逐字节边界检查
- 4 像素平均 = 3 次 `avg2` 位运算 `(x&y) + (((x^y)>>1) & 0x7f7f7f7f)`，无除法无浮点
- 原地缩小 + 直接缩到紧凑位置，省掉一整遍全量拷贝
- 偶数尺寸走无分支快路径

**验证**（不靠肉眼）：

- 8 个单测：每级非空 / 纯色不变 / 层间不串色 / 奇数尺寸不越界 / `avg2` 逐通道等于 floor 平均 / tile 网格切分与像素顺序
- 端到端：拉远到 zoom=20（lod 极大，mip 真正起作用）时，`?mips=1` 与 `?mips=0` 的画面**平均亮度 103/103、覆盖率 100%/100%** —— 若 mip 链是空的，这里会变黑或消失

**兜底开关**：`?tilemip=0` 让 tilemap 单独用 `lod_max_clamp = 0` 的采样器只采 level 0；`?mips=0` 全局关掉。mipmap 现在两个后端默认都开。

## 皮肤来源

demo 里的玩家皮肤**不在客户端拼 URL**，而是查上游 `skins.json` 的 `name → url` 映射：

- 页面把全局皮肤缓存的 `getSkinUrl` 注入给播放器（`resolveSkin` 选项）
  - `src/lib/stores/skins.ts` 是全站单例，只拉一次 `/api/skins`
  - 播放器是浏览器直接加载的静态模块，用不了 `$lib`，所以靠注入
- 皮肤分 `normal` / `community` 两类，路径规则不同（`/api/skins/<名>.png` vs `/api/skins/community/<名>.png`），
  拼路径一换皮肤包就错，所以只查表
- **查不到 key 就跳过**（用 default 渲染），不做任何"猜一次试试"的额外请求
- `x_` 开头的是客户端内置功能皮肤（`x_ninja` 忍者、`x_spec` 旁观）。
  **服务端照常提供**（皮肤库里的合法条目、`/api/skins/x_ninja.png` 正常 200），
  但**玩家不能拿它们当自己的皮肤** —— 名字是玩家自己填的，谁都能改成 `x_ninja` 去伪装。
  所以守卫只放在"玩家皮肤"这条路上：`getSkinUrl`（名字 → URL 的唯一出口）返回 null，
  `TeeRender` / `tee-canvas` 再各兜一层 → 直接落到兜底皮肤、连请求都不发。
  按 `url` 传的不拦（那是皮肤库自己算出来的地址，图鉴预览要照常显示）
- 大小写：`map` 的 **key 统一小写**（服务端规范化，`fetches/skins.ts` 里 `name.toLowerCase()`），
  所有查表的地方都 `name.toLowerCase()`。`skins[].name` 和 `skins[].url` 仍保留原名 ——
  上游皮肤路径是大小写敏感的（`10Nanami_glow.png`）。DDNet 客户端本身也是大小写不敏感
  比较皮肤名的（`str_comp_nocase`），所以 demo 里记录的 `10nanami_glow` 能命中库里的 `10Nanami_glow`

## 渲染器只有一份实现

`static/ddnet/engine/engine.js` 是 demo 播放器和地图预览页（`MapPreview.svelte`）**共用**的启动层：

| 导出                                                                    | 作用                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------- |
| `bootRenderer({ canvas \| createCanvas, rememberKey, font, onStatus })` | 选后端 → 载 wasm → 建 TwGpu → 装贴图，含 WebGPU 失败回退 |
| `planGraphics({ rememberKey })`                                         | 后端探测（WebGPU 带 1.5s 超时）+ mipmap 决策             |
| `freshEngine()`                                                         | 每次拿一份新 wasm 实例（twgpu 的全局 logger 没法重置）   |
| `loadMap()` / `fetchMapByName()`                                        | mapres 补齐 + 地图下载                                   |

浏览器坑只在这里修一次：

- **QQ / X5**：`navigator.gpu` 是桩，`requestAdapter()` 永不 resolve → 探测带 1.5s 超时
- **能探测但不能用**：建 device 时失败 → 自动退回 WebGL，写进 `localStorage`（key 由调用方给，地图预览页记 `ddnet:mappreview:backend`）→ 必须换新 wasm 实例重试
- 两者都在 `bootRenderer` 里，两个页面都吃到了

**改 vendor 的流程**：`bun run engine` 会在编译后自动还原 `vendor/twgpu`，所以不能直接改 vendor。所有 vendor 侧改动写在 `scripts/twgpu-patch-prepare.py` 里（Rust 片段放 `scripts/twgpu-templates/`），运行它生成 `patches/twgpu-web-fixes.patch`，patch 才是唯一事实来源。

- 进度条自己画（`div` 轨道 + 已播放填充 + 圆点），native `input[type=range]` 透明盖在上面只负责交互，
  省得跟各浏览器 `::-webkit-slider-runnable-track` 的差异较劲
- **默认静音**：浏览器本来也不让自动出声，用户点喇叭那一下正好是用户手势；拖音量条也会取消静音
- 锁定视角（跟随玩家/队伍）时拖动被屏蔽，滚轮/双指只缩放不动相机位置；自由视角才允许拖拽平移

## 构建 / 测试

```bash
# 需要 vendor/twgpu 子模块 + 打上 patches/twgpu-web-fixes.patch(脚本会自动做)
bun run engine --force

# 声音抽取的验证(不需要 GPU):跑完整个 demo 打印统计
TWENGINE_TEST_DEMO=/path/to/xxx.demo \
  cargo test --release --target x86_64-unknown-linux-gnu -- --nocapture
```

## TODO

- [ ] `player_airjump` / `player_skid`:客户端用预测事件播,只能从 `Tee.jumped` 之类推出来
- [ ] 地图音源:`NETEVENTTYPE_MAPSOUNDWORLD` / `Sv_MapSoundGlobal`（twsnap 目前 `TODO`），
      需要读地图的 sound 列表 + sound envelope
- [ ] 聊天提示音（`Sv_Chat` → `chat_server` / `chat_highlight`）
- [x] 队伍视角（DDNet 的 multiview）：前端 `demo.js` 里做，见下
- [ ] 队友的“消失”规则（客户端是 freeze + 3 秒才隐藏，这里只留 2 秒位置）
- [ ] 终点线标记（`?time=` 显示那一刻的位置）
