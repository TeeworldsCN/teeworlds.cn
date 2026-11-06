use wasm_bindgen::prelude::*;

/// 相机:位置 + 缩放 + 宽高比。
///
/// twgpu 的 `Camera` 只有这些,跟随/平滑是这里补的。数值口径和 DDNet 客户端一致:
/// 1 单位 = 1 个 tile,`zoom` 是屏幕上一个 tile 占多少像素的倒数(zoom 越小看的地方越大)。
#[wasm_bindgen]
pub struct TwCamera(twgpu::Camera);

/// 客户端 `CCamera` 在观战模式下用的平滑时间量级(它默认 50ms 的 "smooth spectating")
const FOLLOW_TAU: f32 = 0.06;

#[wasm_bindgen]
impl TwCamera {
    #[wasm_bindgen(constructor)]
    pub fn new(aspect_ratio: f32) -> Self {
        Self(twgpu::Camera::new(aspect_ratio))
    }

    #[wasm_bindgen(setter = aspect_ratio)]
    pub fn set_aspect_ratio(&mut self, aspect_ratio: f32) {
        self.0.switch_aspect_ratio(aspect_ratio)
    }

    #[wasm_bindgen(getter = zoom)]
    pub fn get_zoom(&self) -> f32 {
        self.0.zoom.x
    }

    #[wasm_bindgen(setter = zoom)]
    pub fn set_zoom(&mut self, zoom: f32) {
        self.0.zoom = (zoom, zoom).into();
    }

    #[wasm_bindgen(getter = x)]
    pub fn get_x(&self) -> f32 {
        self.0.position.x
    }

    #[wasm_bindgen(setter = x)]
    pub fn set_x(&mut self, x: f32) {
        self.0.position.x = x;
    }

    #[wasm_bindgen(getter = y)]
    pub fn get_y(&self) -> f32 {
        self.0.position.y
    }

    #[wasm_bindgen(setter = y)]
    pub fn set_y(&mut self, y: f32) {
        self.0.position.y = y;
    }

    #[wasm_bindgen]
    pub fn move_to(&mut self, x: f32, y: f32) {
        self.0.position = (x, y).into();
    }

    /// 跟随某个 tee。`dt` 是这一帧的秒数,时间常数与帧率无关;
    /// `snap` 为 true 时直接贴上去(切换观察目标、拖动进度条之后用)。
    #[wasm_bindgen]
    pub fn follow(&mut self, x: f32, y: f32, dt: f32, snap: bool) {
        if snap || dt <= 0. {
            self.0.position = (x, y).into();
            return;
        }
        let alpha = 1. - (-dt / FOLLOW_TAU).exp();
        self.0.position.x += (x - self.0.position.x) * alpha;
        self.0.position.y += (y - self.0.position.y) * alpha;
    }

    /// 屏幕坐标 -> 地图坐标,滚轮缩放时保持光标下的点不动
    #[wasm_bindgen]
    pub fn move_zoom(&mut self, prev_x: f32, prev_y: f32, x: f32, y: f32, factor: f32) {
        let map_pos = self.0.map_position((prev_x, prev_y).into());
        self.0.zoom *= factor;
        self.0.move_to(map_pos, (x, y).into());
    }

    pub(crate) fn inner(&self) -> &twgpu::Camera {
        &self.0
    }
}
