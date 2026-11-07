// 把一个字形 alpha 位图变成距离场。输入/输出都是字形大小的纹理,
// 生成完再由 Rust copy 到 atlas 的分配区域。

@group(0)
@binding(0)
var src: texture_2d<f32>;

const RADIUS: i32 = 12;

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
    let p = vec2<f32>(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let local = vec2<i32>(pos.xy);
    let dims = vec2<i32>(textureDimensions(src));
    let center = textureLoad(src, local, 0).r;
    let inside = center > 0.5;
    var best = f32(RADIUS) + 1.0;
    for (var dy = -RADIUS; dy <= RADIUS; dy = dy + 1) {
        for (var dx = -RADIUS; dx <= RADIUS; dx = dx + 1) {
            let p = local + vec2<i32>(dx, dy);
            let in_bounds = p.x >= 0 && p.y >= 0 && p.x < dims.x && p.y < dims.y;
            let a = select(0.0, textureLoad(src, clamp(p, vec2<i32>(0, 0), dims - vec2<i32>(1, 1)), 0).r, in_bounds);
            if ((a > 0.5) != inside) {
                let d = sqrt(f32(dx * dx + dy * dy));
                best = min(best, d);
            }
        }
    }
    let signed = select(best, -best, inside);
    let norm = clamp(0.5 + signed / (2.0 * f32(RADIUS)), 0.0, 1.0);
    return vec4<f32>(norm, 0.0, 0.0, 1.0);
}
