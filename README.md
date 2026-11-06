# TeeworldsCN 网站

## 说明

本项目为 TeeworldsCN 网站，使用 SvelteKit 构建。目前推荐使用 [bun](https://bun.sh/) 运行。

同时本项目中还包含了 ddbot（豆豆）的QQ与微信机器人代码。

## 开发

为了能更快速地处理玩家数据，本项目会自动同步全部玩家数据。因为玩家数据量过大，该项目需要一些 rust 应用来预处理相关数据。

网站的部分功能需要已有处理过的数据才可使用。

使用 Rust 处理数据

```bash
cargo run --release --manifest-path ./rust/player-cache/Cargo.toml -- --force-gen
```

安装依赖

```bash
bun install
```

启动开发服务端

```bash
bun --bun run dev
```

### 渲染引擎（twengine）

地图预览和 demo 回放共用**一个 wasm**：`rust/twengine`（Rust → wasm），底座是
[twgpu](https://gitlab.com/ddnet-rs/twgpu)，另外加了自己的 `.demo` reader 和声音事件抽取。
两个前端各是一个普通 JS 模块，`import` 同一份 `pkg/twengine.js`：

| 前端      | 文件                                              | 用途                          |
| --------- | ------------------------------------------------- | ----------------------------- |
| 地图预览  | `src/lib/components/mappreview/MapPreview.svelte` | `/ddnet/maps/<地图>` 里看地图 |
| demo 回放 | `static/ddnet/engine/demo.js`                     | `/ddnet/watch?uuid=…` 看录像  |

- twgpu 以 submodule 形式引在 `vendor/twgpu`，检出后需要 `git submodule update --init --recursive`
- 编译产物（wasm、贴图、外部 mapres、音效）不进版本库，需要先构建一次：

```bash
bun run engine   # 需要 rust + wasm32-unknown-unknown + wasm-pack + unzip + ffmpeg
```

产物落在 `static/ddnet/engine/`（`engine.js`/`sound.js`/`demo.js` 是手写的前端，在库里；
`pkg/`、`assets/`、`sounds/`、`version.json` 是构建产物，忽略）。`bun run build` 会自动先跑这一步，
子模块 / crate / 补丁 / 声音表都没变且产物已存在时直接跳过。

前端所有会变的产物都挂 `?v=<version>`（`pkg/twengine.js`、`pkg/twengine_bg.wasm`、
`assets/*.png`、`sounds/sounds.zip`），版本号本身放在 `version.json` 里，
由 `子模块提交 / crate 指纹 / 资源指纹 / wasm 哈希` 四段拼成 —— **任何一项变了 URL 就变**，
所以缓存不会串。`version.json` 自己用 `cache: 'no-cache'` 取（条件请求，没变就 304），
它就是那个"指针"，被缓存住的话整套缓存都会失效成旧版本。

几个外部数据的代理（都在本站范围内转发，不改内容）：

- `src/routes/ddnet/mappreview/map/[file]/+server.ts` → `ddnet.org/mappreview/<名字>.map`
- `src/routes/ddnet/watch/api/[...path]/+server.ts` → `ddnet.org/watch/{runs,demos,watchable.jsonl}`
- `src/routes/ddnet/skins/[...path]/+server.ts` → `ddnet.org/skins/skin/<名字>.png`

声音来自 DDNet 的 `data/audio/*.wv`（WavPack，浏览器不认），构建时用 ffmpeg 转成 Opus
（浏览器支持的最新编码），再打进一个 STORE 的 `sounds.zip`（约 210 KiB）：只发一个请求，
前端解包后每个音效各自解码，互不串音。只打包 demo 里真的会出现的声音。
声音表（41 个声音集的顺序 = `SOUND_*` 枚举 id）在构建时从 ddnet 的 `datasrc/content.py` 读，
并和 `rust/twengine/src/sound.rs` 里的表逐项比对，不一致就构建失败。

## 构建

```bash
bun --bun run build
```

## Development Notice

Due to the limitation of chinese bot platform. Bots can only send links from certified sites. Do not send links to other sites in bot messages.
