/// 把 DDNet 的 mapres(16×16 网格图像)切成 256 层,每层一个 tile。
///
/// 层号 = y * 16 + x,和 `tile_to_gpu` 里 `tile.y` 编码的 tile 索引一致。
/// 层 0 保持全透明 —— 客户端把 tile 索引 0 当作「这里什么都没有」,
/// tilemap 着色器也会对 index 0 直接 discard。
///
/// 直接产出 `Vec<u32>`(每元素一个像素):后面整条 mip 链都在这个视图上跑,
/// 避免了逐字节的索引和边界检查。
pub fn tile_grid_to_layers(source: &[u8], width: u32, height: u32) -> Vec<u32> {
    assert_eq!(width % 16, 0, "mapres 宽度必须是 16 的倍数");
    assert_eq!(height % 16, 0, "mapres 高度必须是 16 的倍数");
    let tile_width = (width / 16) as usize;
    let tile_height = (height / 16) as usize;
    let source_width = width as usize;
    let tile_pixels = tile_width * tile_height;
    let mut layers = vec![0u32; tile_pixels * 256].into_boxed_slice();
    for tile_y in 0..16usize {
        for tile_x in 0..16usize {
            if (tile_x, tile_y) == (0, 0) {
                continue;
            }
            let base = (tile_y * 16 + tile_x) * tile_pixels;
            for y in 0..tile_height {
                // 源行里本 tile 的起点
                let src_row = (tile_y * tile_height + y) * source_width + tile_x * tile_width;
                let dst_row = base + y * tile_width;
                for x in 0..tile_width {
                    let si = (src_row + x) * 4;
                    layers[dst_row + x] = u32::from_le_bytes([
                        source[si],
                        source[si + 1],
                        source[si + 2],
                        source[si + 3],
                    ]);
                }
            }
        }
    }
    layers.into_vec()
}

#[cfg(test)]
mod tile_tests {
    use super::*;

    /// 16×16 的 mapres,每个 tile 是 1×1,颜色 = (tile_y, tile_x, 0, 255)
    #[test]
    fn slices_tiles_in_row_major_order() {
        let mut src = vec![0u8; 16 * 16 * 4];
        for y in 0..16 {
            for x in 0..16 {
                let i = (y * 16 + x) * 4;
                src[i] = y as u8;
                src[i + 1] = x as u8;
                src[i + 2] = 7;
                src[i + 3] = 255;
            }
        }
        let layers = tile_grid_to_layers(&src, 16, 16);
        assert_eq!(layers.len(), 256);
        assert_eq!(layers[0], 0, "层 0 必须全透明");
        for tile_y in 0..16usize {
            for tile_x in 0..16usize {
                if (tile_x, tile_y) == (0, 0) {
                    continue;
                }
                let layer = tile_y * 16 + tile_x;
                assert_eq!(
                    layers[layer].to_le_bytes(),
                    [tile_y as u8, tile_x as u8, 7, 255],
                    "层 {layer} 应该是 tile ({tile_x}, {tile_y})"
                );
            }
        }
    }

    /// 每个 tile 4×2 像素:检查块内像素没有转置/错行
    #[test]
    fn keeps_pixels_inside_tile() {
        let (w, h) = (64u32, 32u32);
        let mut src = vec![0u8; (w * h * 4) as usize];
        for y in 0..h as usize {
            for x in 0..w as usize {
                let i = (y * w as usize + x) * 4;
                src[i] = (x % 4) as u8;
                src[i + 1] = (y % 2) as u8;
                src[i + 3] = 255;
            }
        }
        let layers = tile_grid_to_layers(&src, w, h);
        for y in 0..2usize {
            for x in 0..4usize {
                let di = 4 * 2 + (y * 4 + x); // tile (1, 0)
                let bytes = layers[di].to_le_bytes();
                assert_eq!(bytes[0], x as u8, "像素 ({x},{y}) 的 R");
                assert_eq!(bytes[1], y as u8, "像素 ({x},{y}) 的 G");
            }
        }
    }
}