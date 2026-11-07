// 把 atlas 的第 L-1 级用 2x2 盒式降采样写进第 L 级(距离场直接平均就行)。
// 小字号时光栅化出来的字形只有几个像素,没有 mip 的话采样点乱跳,字形周围会冒出
// 零散像素;mip 链让远处采样取到的是整块的平均值。

@group(0)
@binding(0)
var src: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let p = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let base = vec2<i32>(pos.xy) * 2;
    let hi = vec2<i32>(textureDimensions(src)) - vec2<i32>(1, 1);
    let zero = vec2<i32>(0, 0);
    let c00 = textureLoad(src, clamp(base + vec2<i32>(0, 0), zero, hi), 0);
    let c10 = textureLoad(src, clamp(base + vec2<i32>(1, 0), zero, hi), 0);
    let c01 = textureLoad(src, clamp(base + vec2<i32>(0, 1), zero, hi), 0);
    let c11 = textureLoad(src, clamp(base + vec2<i32>(1, 1), zero, hi), 0);
    return (c00 + c10 + c01 + c11) * 0.25;
}
