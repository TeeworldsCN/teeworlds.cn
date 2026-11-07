// 字形 quad:单色字形用 SDF 距离场(描边 = 第二个阈值),彩色字形直接采样 RGBA atlas。
// 两种 pipeline 共用这个顶点着色器。

struct Camera {
    position: vec2<f32>,
    base_dimensions: vec2<f32>,
    zoom: vec2<f32>,
    _padding: vec2<f32>,
};

struct Vertex {
    @location(0) pos: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) outline: f32,
};

struct Frag {
    @builtin(position) clip: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) outline: f32,
};

@group(0)
@binding(0)
var<uniform> camera: Camera;

@group(1)
@binding(0)
var atlas: texture_2d<f32>;

@group(1)
@binding(1)
var atlas_sampler: sampler;

const REF_FONT: f32 = 64.0;
const SDF_RADIUS: f32 = 12.0;
// 和 twgpu 的 sprite shader 一致:世界坐标 Y 轴要翻一下
const CORRECTION = vec2<f32>(2.0, -2.0);

@vertex
fn vs_main(vertex: Vertex) -> Frag {
    var frag: Frag;
    let position = vertex.pos - camera.position;
    let factor = CORRECTION / camera.base_dimensions / camera.zoom;
    frag.clip = vec4<f32>(position * factor, 0.0, 1.0);
    frag.uv = vertex.uv;
    frag.outline = vertex.outline;
    return frag;
}

@fragment
fn fs_mono(frag: Frag) -> @location(0) vec4<f32> {
    let r = textureSample(atlas, atlas_sampler, frag.uv).r;
    // 距离场按参考字号的像素归一化,换算成 em(和显示字号无关)
    let distance_em = (r - 0.5) * 2.0 * SDF_RADIUS / REF_FONT;
    // 半宽:整个过渡只有 1 个屏幕像素,小字号下描边不会被糊成一大片
    let aa = 0.5 * max(fwidth(distance_em), 0.0001);
    let fill = 1.0 - smoothstep(-aa, aa, distance_em);
    let outline = 1.0 - smoothstep(-aa, aa, distance_em - frag.outline);
    // 预乘 alpha:白色填充 + 50% 黑描边
    let alpha = fill + (1.0 - fill) * outline * 0.5;
    return vec4<f32>(fill, fill, fill, alpha);
}

@fragment
fn fs_color(frag: Frag) -> @location(0) vec4<f32> {
    let color = textureSample(atlas, atlas_sampler, frag.uv);
    return vec4<f32>(color.rgb * color.a, color.a);
}
