//! 一个 wasm,两个前端:地图预览(只画图)和 demo 播放(画图 + 声音事件)。
//!
//! - 渲染:twgpu(AGC 的 wgpu 地图/精灵渲染器),单线程编译,不需要 SharedArrayBuffer
//! - demo:自己实现的 `.demo` reader,比 twgpu-web 多做的事是把消息 chunk 里的
//!   `Sv_SoundGlobal` 也解析出来(客户端用 `PlayAndRecord` 录进 demo 的那部分音效)
//! - 声音:Rust 侧只做“事件抽取”,真正的播放交给 JS 的 Web Audio(见 static 里的 player.js)
//!
//! 类名保持和 twgpu-web 一致(`TwGpu`/`TwMap`/`TwMapIntermediate`/`TwCamera`/`TwSurface`),
//! 所以地图预览页不需要改动;demo 相关的是新增的 `TwDemo`/`TwDemoIntermediate`。

mod demo;
mod sound;

// 下面这些要么直接碰 web-sys / wgpu 的 canvas surface,要么只在浏览器里有意义。
// 单独门控是为了能在 native 上跑 `cargo test`(声音抽取的验证不依赖 GPU)。
#[cfg(target_arch = "wasm32")]
mod camera;
#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(target_arch = "wasm32")]
mod map;
#[cfg(target_arch = "wasm32")]
mod nameplate;
#[cfg(target_arch = "wasm32")]
mod sprites_helper;
#[cfg(target_arch = "wasm32")]
mod surface;
#[cfg(target_arch = "wasm32")]
mod world;

use wasm_bindgen::JsError;

#[cfg(target_arch = "wasm32")]
pub use camera::TwCamera;
pub use demo::{TwDemo, TwDemoIntermediate};
#[cfg(target_arch = "wasm32")]
pub use gpu::TwGpu;
#[cfg(target_arch = "wasm32")]
pub use map::{TwMap, TwMapIntermediate};
#[cfg(target_arch = "wasm32")]
pub use surface::TwSurface;

const LABEL: Option<&str> = Some("TwEngine");

pub(crate) fn error<T, E: ToString>(res: Result<T, E>) -> Result<T, JsError> {
    res.map_err(|err| JsError::new(&err.to_string()))
}
