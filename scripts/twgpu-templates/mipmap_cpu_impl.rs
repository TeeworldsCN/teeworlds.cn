/// CPU 侧盒式滤波逐级生成 mip 链,就地缩小、逐级写进贴图。
    ///
    /// 为什么需要这条路径:tilemap 采的是 array texture(16×16 个 tile 拼成 256 层),
    /// 它的 mip 链原来靠 GPU blit 生成 —— 「拿 mip N-1 当输入、渲染进 mip N」。
    /// 在 WebGL 上这两个 view 背后是同一个 GL texture,属于跨 level 的 feedback loop,
    /// 规范上是 undefined behavior。ANGLE 放行,部分 mobile GLES 驱动直接返回全黑:
    /// 于是 mip>=1 整片没内容,tilemap 的 lod 一变大地形就消失了。
    /// quad 用的是普通 2D 贴图(完全不同的 GL code path),没踩到这个问题。
    ///
    /// **内存**:`level0` 直接接管(不拷贝),每级都在同一个缓冲区里就地缩小,
    /// 峰值就是 `level0` 本身 —— 不会为 mip 链额外再分配一份。
    ///
    /// **速度**:数据是 `Vec<u32>`(每个元素一个像素),整条链都在 32 位视图上跑,
    /// 没有逐字节的边界检查,每像素只花 4 次 load + 1 次 store + 3 次位运算平均。
    /// 写进纹理时才 `cast_slice` 回字节。
    pub fn fill_mip_levels_cpu(
        queue: &wgpu::Queue,
        texture: &wgpu::Texture,
        mut level0: Vec<u32>,
        size: wgpu::Extent3d,
    ) {
        let layers = size.depth_or_array_layers as usize;
        let mut src_w = size.width as usize;
        let mut src_h = size.height as usize;
        for level in 1..texture.mip_level_count() {
            let dst_w = (src_w >> 1).max(1);
            let dst_h = (src_h >> 1).max(1);
            let src_layer_len = src_w * src_h;
            let dst_layer_len = dst_w * dst_h;
            // 每层就地缩到**紧凑**位置:读 layer*src_layer_len,写 layer*dst_layer_len。
            // 因为 dst_layer_len <= src_layer_len,写永远落在读过的区域之前,原地安全;
            // 缩完就是紧凑布局,不需要再搬一次(省掉一整遍全量拷贝)。
            for layer in 0..layers {
                downsample_in_place(
                    &mut level0,
                    src_w,
                    src_h,
                    dst_w,
                    dst_h,
                    layer * src_layer_len,
                    layer * dst_layer_len,
                );
            }
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture,
                    mip_level: level,
                    origin: wgpu::Origin3d::default(),
                    aspect: wgpu::TextureAspect::All,
                },
                bytemuck::cast_slice(&level0[..dst_layer_len * layers]),
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(dst_w as u32 * 4),
                    rows_per_image: Some(dst_h as u32),
                },
                wgpu::Extent3d {
                    width: dst_w as u32,
                    height: dst_h as u32,
                    depth_or_array_layers: size.depth_or_array_layers,
                },
            );
            src_w = dst_w;
            src_h = dst_h;
            level0.truncate(src_w * src_h * layers);
        }
    }