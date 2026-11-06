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

### 地图预览（mappreview）

`/ddnet/maps` 的地图预览用的是 [twgpu](https://gitlab.com/ddnet-rs/twgpu) 的 `twgpu-web`（Rust → wasm），
直接嵌在页面里跑，不再经过外部静态服务。

- 源码以 submodule 形式引在 `vendor/twgpu`，检出后需要 `git submodule update --init --recursive`
- 编译产物（wasm、贴图、外部 mapres）不进版本库，需要先构建一次：

```bash
bun run mappreview   # 需要 rust + wasm32-unknown-unknown + wasm-pack + unzip
```

产物落在 `static/ddnet/mappreview/`，由 SvelteKit 当静态资源服务；`bun run build` 会自动先跑这一步，
子模块没变且产物已存在时会直接跳过。地图 `.map` 文件由
`src/routes/ddnet/mappreview/map/[file]/+server.ts` 从 `ddnet.org/mappreview` 流式代理，不落内存。

## 构建

```bash
bun --bun run build
```

## Development Notice

Due to the limitation of chinese bot platform. Bots can only send links from certified sites. Do not send links to other sites in bot messages.
