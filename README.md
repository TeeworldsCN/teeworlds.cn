# TeeworldsCN 网站

## 说明

本项目为 TeeworldsCN 网站，使用 SvelteKit 构建。目前推荐使用 [bun](https://bun.sh/) 运行。

同时本项目中还包含了 ddbot（豆豆）的QQ与微信机器人代码。

## 开发

为了能更快速地处理玩家数据，本项目会自动同步全部玩家数据。因为玩家数据量过大，该项目需要一些 rust 应用来预处理相关数据。

网站的部分功能需要已有处理过的数据才可使用。

使用 Rust 处理数据

```bash
cargo run --release --manifest-path ./rust/Cargo.toml -- --force-gen
```

```bash
bun --bun dev
```

## 构建

```bash
bun --bun run vite build
```

## Development Notice

Due to the limitation of chinese bot platform. Bots can only send links and images from certified sites. If you need to send image from other sites, use imgproxy. If you need to send link from other sites, you can send a redirect link with `/link/?ref={target_link}`. Note that when opening a redirect pages in chinese apps, user will need to manually copy the link and paste it into a browser instead.
