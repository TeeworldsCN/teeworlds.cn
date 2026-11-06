/// Generates the array texture for this mapres, if it isn't already generated.
    ///
    /// 整块(把 16×16 网格切成 256 层 + 生成完整 mip 链)都在 CPU 上做,再一次性写进去。
    /// 原来用的是 GPU blit:先 `copy_texture_to_texture` 256 次,再用「拿 mip N-1 当输入、
    /// 渲染进 mip N」的办法生成 mip。后者在 WebGL 里两个 view 指向同一个 GL texture,
    /// 是跨 level 的 feedback loop(undefined behavior)——桌面 ANGLE 放行,mobile GLES
    /// 驱动往往返回全黑,于是 tilemap 在 lod>0 时整片消失
    /// (quad 用的是普通 2D 纹理,走的是完全不同的 GL 路径,没踩到这个问题)。
    pub fn generate_array_texture(&mut self, image: &RgbaImage, device: &Device, queue: &Queue) {
        if self.array_texture.is_some() {
            return;
        }
        assert_eq!(self.width % 16, 0);
        assert_eq!(self.height % 16, 0);
        let tile_width = self.width / 16;
        let tile_height = self.height / 16;
        let size = Extent3d {
            width: tile_width,
            height: tile_height,
            depth_or_array_layers: 256,
        };
        let array_texture = device.create_texture(&TextureDescriptor {
            label: Some(&format!("Array Image {}", self.name)),
            size,
            mip_level_count: size.max_mips(TextureDimension::D2),
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::TEXTURE_BINDING
                | TextureUsages::COPY_SRC
                | TextureUsages::COPY_DST
                | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });

        // 切网格 + 缩 mip 全程在 u32 视图上做,这里只在最后 cast 回字节
        let level0 = tile_grid_to_layers(image.as_raw(), image.width(), image.height());
        let level0_bytes = level0.len() * 4;
        queue.write_texture(
            TexelCopyTextureInfo {
                texture: &array_texture,
                mip_level: 0,
                origin: Origin3d::default(),
                aspect: TextureAspect::All,
            },
            bytemuck::cast_slice(&level0),
            TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(tile_width * 4),
                rows_per_image: Some(tile_height),
            },
            size,
        );
        let started = now_millis();
        // 传所有权:内部就地逐级缩小,峰值内存就等于这份 level0,不再额外分配
        Blit::fill_mip_levels_cpu(queue, &array_texture, level0, size);
        self.mip_bytes = level0_bytes;
        self.mip_millis = now_millis() - started;
        self.array_texture = Some(array_texture);
    }