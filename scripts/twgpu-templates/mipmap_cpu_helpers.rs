/// 逐通道计算两个 RGBA8 像素的 floor 平均,整个 u32 一次算完。
///
/// 经典技巧:`(x & y) + (((x ^ y) >> 1) & 0x7f7f7f7f)` 等价于每通道 `(a+b)/2`,
/// 没有除法、没有浮点、没有分支。用 u32 而不是拆 4 个 u8,
/// 也让 wasm 侧每个像素只有 1 次 32 位 load/store 而不是 4 次 8 位。
#[inline(always)]
fn avg2(x: u32, y: u32) -> u32 {
    (x & y) + (((x ^ y) >> 1) & 0x7f7f_7f7f)
}

/// 2x2 盒式滤波,**就地**把一张 RGBA8 图层缩小到 `dst_w x dst_h`。
///
/// `src_base`/`dst_base` 是这一层在缓冲区里的起点(单位:像素)。写位置恒 <= 读位置
/// (`dst_w <= src_w` 且 `dst_base <= src_base`),所以边读边写是安全的。
///
/// 性能取向:
/// - 数据是 `&mut [u32]`,索引一次就是一次 32 位访问,没有逐字节边界检查
/// - 每像素 4 次 load + 1 次 store,平均只花 3 次 `avg2`
/// - 宽高都是偶数时(绝大多数贴图)走无分支快路径,不做 clamp
fn downsample_in_place(
    buf: &mut [u32],
    src_w: usize,
    src_h: usize,
    dst_w: usize,
    dst_h: usize,
    src_base: usize,
    dst_base: usize,
) {
    let exact = src_w % 2 == 0 && src_h % 2 == 0;

    for y in 0..dst_h {
        let row0 = src_base + (y * 2) * src_w;
        let row1 = if exact {
            row0 + src_w
        } else {
            src_base + (y * 2 + 1).min(src_h - 1) * src_w
        };
        let dst_row = dst_base + y * dst_w;

        if exact {
            // 快路径:行内 2 像素步进。
            // 每次索引都独立借用(先读进局部变量再写),因为源和目标区域可能重叠 ——
            // 第 0 层第 0 行就是 src 和 dst 同一块内存。这样写是安全的:
            // 写位置 x 用的 4 个源像素 (2x, 2x+1) 恒在 x 之后,不会被本次写入破坏。
            for x in 0..dst_w {
                let i = x * 2;
                let a = buf[row0 + i];
                let b = buf[row0 + i + 1];
                let c = buf[row1 + i];
                let d = buf[row1 + i + 1];
                buf[dst_row + x] = avg2(avg2(a, b), avg2(c, d));
            }
        } else {
            for x in 0..dst_w {
                let x0 = (x * 2).min(src_w - 1);
                let x1 = (x * 2 + 1).min(src_w - 1);
                buf[dst_row + x] = avg2(
                    avg2(buf[row0 + x0], buf[row0 + x1]),
                    avg2(buf[row1 + x0], buf[row1 + x1]),
                );
            }
        }
    }
}

#[cfg(test)]
mod mip_tests {
    use super::*;

    /// 跑完整条链(和 fill_mip_levels_cpu 完全同一套算法)
    fn chain(level0: &[u32], size: wgpu::Extent3d, mip_count: u32) -> Vec<(u32, u32, Vec<u32>)> {
        let layers = size.depth_or_array_layers as usize;
        let mut buf = level0.to_vec();
        let mut src_w = size.width as usize;
        let mut src_h = size.height as usize;
        let mut out = Vec::new();
        for _ in 1..mip_count {
            let dst_w = (src_w >> 1).max(1);
            let dst_h = (src_h >> 1).max(1);
            let src_layer_len = src_w * src_h;
            let dst_layer_len = dst_w * dst_h;
            for layer in 0..layers {
                downsample_in_place(
                    &mut buf,
                    src_w,
                    src_h,
                    dst_w,
                    dst_h,
                    layer * src_layer_len,
                    layer * dst_layer_len,
                );
            }
            buf.truncate(dst_layer_len * layers);
            out.push((dst_w as u32, dst_h as u32, buf.clone()));
            src_w = dst_w;
            src_h = dst_h;
        }
        out
    }

    fn extent(w: u32, h: u32, layers: u32) -> wgpu::Extent3d {
        wgpu::Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: layers,
        }
    }

    #[inline]
    fn px(r: u8, g: u8, b: u8, a: u8) -> u32 {
        u32::from_le_bytes([r, g, b, a])
    }

    /// 每一级都必须有内容 —— 这正好是手机上坏掉的表现
    #[test]
    fn every_level_keeps_content() {
        let (w, h, layers) = (64u32, 64u32, 4u32);
        let l0: Vec<u32> = (0..(w * h * layers) as usize)
            .map(|i| {
                px(
                    ((i / 3) % 255) as u8,
                    90,
                    if (i / 8) % 2 == 0 { 200 } else { 40 },
                    255,
                )
            })
            .collect();
        let levels = chain(&l0, extent(w, h, layers), 7);
        for (w, h, data) in &levels {
            let expect = (*w * *h * layers) as usize;
            assert_eq!(data.len(), expect, "{w}x{h} 像素数");
            let alive = data.iter().filter(|p| (*p >> 24) != 0).count();
            assert_eq!(alive, expect, "{w}x{h} 有像素 alpha 丢了");
        }
        let (w, h, data) = levels.last().unwrap();
        assert_eq!((*w, *h), (1, 1));
        assert_eq!(data[0] >> 24, 255, "最后一级 alpha 丢了");
    }

    /// 纯色必须原样保留(证明 avg2 没有系统性偏差)
    #[test]
    fn flat_color_survives_downsampling() {
        let (w, h) = (32u32, 32u32);
        let color = px(10, 20, 30, 255);
        let l0 = vec![color; (w * h) as usize];
        for (_, _, data) in chain(&l0, extent(w, h, 1), 6) {
            assert!(data.iter().all(|p| *p == color), "纯色被改动了");
        }
    }

    /// 每层独立:就地缩小时最容易踩的坑就是层间串色
    #[test]
    fn layers_do_not_bleed() {
        let (w, h, layers) = (8u32, 8u32, 3u32);
        let colors = [px(255, 0, 0, 255), px(0, 0, 255, 255), px(0, 255, 0, 255)];
        let mut l0 = Vec::new();
        for layer in 0..layers as usize {
            for _ in 0..(w * h) as usize {
                l0.push(colors[layer]);
            }
        }
        for (lv_w, lv_h, data) in chain(&l0, extent(w, h, layers), 4) {
            let per_layer = lv_w as usize * lv_h as usize;
            for layer in 0..layers as usize {
                let base = layer * per_layer;
                assert!(
                    data[base..base + per_layer].iter().all(|p| *p == colors[layer]),
                    "{lv_w}x{lv_h} 的层 {layer} 串色了"
                );
            }
        }
    }

    /// 奇数尺寸不能越界,结果尺寸是 floor 的一半
    #[test]
    fn odd_sizes_do_not_panic() {
        let (w, h) = (7u32, 5u32);
        let color = px(200, 200, 200, 255);
        let l0 = vec![color; (w * h) as usize];
        let levels = chain(&l0, extent(w, h, 1), 4);
        let sizes: Vec<(u32, u32)> = levels.iter().map(|(w, h, _)| (*w, *h)).collect();
        assert_eq!(sizes, vec![(3, 2), (1, 1), (1, 1)]);
        for (_, _, data) in &levels {
            assert!(data.iter().all(|p| *p == color), "奇数尺寸下纯色被改动了");
        }
    }

    /// avg2 必须等于逐通道 floor 平均(位运算别写错)
    #[test]
    fn avg2_matches_manual_average() {
        let cases: [u8; 7] = [0, 1, 7, 100, 128, 254, 255];
        for &a in &cases {
            for &b in &cases {
                let pa = px(a, a.wrapping_add(3), a ^ 0x55, a / 2);
                let pb = px(b, b.wrapping_add(5), b ^ 0x11, b / 3);
                let got = avg2(pa, pb).to_le_bytes();
                let expect = [
                    (a as u32 + b as u32) / 2,
                    (a.wrapping_add(3) as u32 + b.wrapping_add(5) as u32) / 2,
                    ((a ^ 0x55) as u32 + (b ^ 0x11) as u32) / 2,
                    (a as u32 / 2 + b as u32 / 3) / 2,
                ];
                assert_eq!(
                    got,
                    [
                        expect[0] as u8,
                        expect[1] as u8,
                        expect[2] as u8,
                        expect[3] as u8
                    ],
                    "avg2({a},{b}) 每通道对不上"
                );
            }
        }
    }
}