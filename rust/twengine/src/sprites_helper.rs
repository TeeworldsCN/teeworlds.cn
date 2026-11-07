use std::sync::Arc;

use twgpu::buffer::GpuDeviceExt;
use twgpu::twgame;
use twgpu::twsnap;

pub struct CtxRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    buffer: twgpu::buffer::GpuVecBuffer<[twgpu::sprites::SpriteVertex; 4]>,
    sprite_range: std::ops::Range<usize>,
    particle_ranges: [std::ops::Range<usize>; 4],
    /// 准星那一格(总是画在最上层,所以单独一段)
    cursor_range: std::ops::Range<usize>,
    /// 自己拼的世界精灵(地图激光的光束/光头、血包),和玩家同一批画
    world_range: std::ops::Range<usize>,
    sprites_static: twgpu::sprites::SpritesStatic,
    cache: twgpu::sprites::SpriteCache,
    /// 这一帧要放的爆炸(地图预览里 crazy shotgun EX 撞墙),`prepare_render` 时喂给粒子系统
    explosions: Vec<twgpu::vek::Vec2<f32>>,
    /// 视锥裁剪之后真正上传的 quad / 对应贴图(和 `cache` 内容一一对应的子集)
    visible_quads: Vec<[twgpu::sprites::SpriteVertex; 4]>,
    visible_textures: Vec<twgpu::sprites::TextureToken>,
}

impl CtxRenderer {
    pub fn new(format: wgpu::TextureFormat, device: wgpu::Device, queue: wgpu::Queue) -> Self {
        let sprites_static = twgpu::sprites::SpritesStatic::new(format, &device);
        let buffer = device.vec_buffer(Some("Sprite Vertices"), wgpu::BufferUsages::VERTEX);
        Self {
            device,
            queue,
            buffer,
            sprite_range: 0..0,
            particle_ranges: [(); 4].map(|_| 0..0),
            cursor_range: 0..0,
            world_range: 0..0,
            sprites_static,
            cache: twgpu::sprites::SpriteCache::default(),
            explosions: Vec::new(),
            visible_quads: Vec::new(),
            visible_textures: Vec::new(),
        }
    }

    /// 排几个爆炸(坐标是 tile,和 `CEffects::Explosion` 一样)
    pub fn queue_explosions(&mut self, positions: impl IntoIterator<Item = twgpu::vek::Vec2<f32>>) {
        self.explosions.extend(positions);
    }

    pub fn prepare_render(
        &mut self,
        ctx: &mut twgpu::sprites::SpriteRenderContext,
        new_snap: bool,
        cursor: Option<CursorSprite>,
        world: &[WorldSprite],
        view: twgpu::vek::Aabr<f32>,
    ) {
        fn drain_sprites<T: twgpu::sprites::SpriteGenerator>(
            cache: &mut twgpu::sprites::SpriteCache,
            generator: &mut T,
        ) -> std::ops::Range<usize> {
            let start = cache.len();
            cache.drain_sprites(generator);
            let end = cache.len();
            start..end
        }
        ctx.particles.update(ctx.clock, ctx.map);
        if new_snap {
            ctx.process_events();
        }
        // 地图预览的爆炸不是 snap 事件,是这边自己攒的;`Particles::explosion` 就是客户端
        // `CEffects::Explosion` 的那一坨(150 unit 的 expl01 + 24 团烟)
        for position in std::mem::take(&mut self.explosions) {
            let twgpu::sprites::SpriteRenderContext {
                particles,
                textures,
                rng,
                ..
            } = &mut *ctx;
            particles.explosion(position, textures, rng);
        }
        self.cache.clear();
        // 世界精灵先入队:服务端/客户端里道具都在玩家之前画
        let start = self.cache.len();
        for sprite in world {
            self.cache.add_sprite(&sprite.quad(), sprite.texture);
        }
        self.world_range = start..self.cache.len();
        self.sprite_range = drain_sprites(&mut self.cache, &mut ctx.snap_sprite_generator());
        self.particle_ranges = twgpu::sprites::ParticleGroup::ALL
            .map(|group| drain_sprites(&mut self.cache, &mut ctx.particles.get_group(group)));
        // 准星排最后:它要盖在地形和别的精灵上面
        let start = self.cache.len();
        if let Some(cursor) = cursor {
            self.cache.add_sprite(&cursor.quad(), cursor.texture);
        }
        self.cursor_range = start..self.cache.len();
        self.cull(view);
        self.buffer
            .upload(&self.visible_quads, &self.device, &self.queue)
            .expect("GPU Buffer size limit exceeded");
        ctx.particles.finished_tick();
    }

    /// 视锥裁剪:只保留和相机视野相交的 quad,顺便把每一段的 range 映射到新下标。
    ///
    /// 生成阶段拦不住(twgpu 的 generator 不知道相机),但上传和绘制都能省:一张大图上
    /// 几百个 pickup / 子弹 / 粒子,真正在画面里的可能就十几个。
    fn cull(&mut self, view: twgpu::vek::Aabr<f32>) {
        let quads = self.cache.sprites();
        let textures = self.cache.textures();
        self.visible_quads.clear();
        self.visible_textures.clear();
        self.visible_quads.reserve(quads.len());
        self.visible_textures.reserve(textures.len());
        // quad 是轴对齐包围盒判断(旋转过的 quad 用包围盒偏保守,只会多画不会漏画)
        let visible = |quad: &[twgpu::sprites::SpriteVertex; 4]| {
            let mut min = twgpu::vek::Vec2::broadcast(f32::INFINITY);
            let mut max = twgpu::vek::Vec2::broadcast(f32::NEG_INFINITY);
            for vertex in quad {
                let p: twgpu::vek::Vec2<f32> = vertex.vertex.position.into();
                min.x = min.x.min(p.x);
                min.y = min.y.min(p.y);
                max.x = max.x.max(p.x);
                max.y = max.y.max(p.y);
            }
            max.x >= view.min.x && min.x <= view.max.x && max.y >= view.min.y && min.y <= view.max.y
        };
        let mut ranges = Vec::with_capacity(6);
        for range in std::iter::once(self.world_range.clone())
            .chain(std::iter::once(self.sprite_range.clone()))
            .chain(self.particle_ranges.iter().cloned())
            .chain(std::iter::once(self.cursor_range.clone()))
        {
            let start = self.visible_quads.len();
            for index in range {
                if visible(&quads[index]) {
                    self.visible_quads.push(quads[index]);
                    self.visible_textures.push(textures[index]);
                }
            }
            ranges.push(start..self.visible_quads.len());
        }
        self.world_range = ranges[0].clone();
        self.sprite_range = ranges[1].clone();
        for (i, range) in self.particle_ranges.iter_mut().enumerate() {
            *range = ranges[2 + i].clone();
        }
        self.cursor_range = ranges[6].clone();
    }

    pub fn render_bg<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        camera_bind_group: &'a wgpu::BindGroup,
        textures: &'a twgpu::sprites::SpriteTextures,
    ) {
        self.sprites_static.render_range(
            self.particle_ranges[twgpu::sprites::ParticleGroup::Trails].clone(),
            camera_bind_group,
            &self.buffer,
            &self.visible_textures,
            textures,
            render_pass,
        );
        self.sprites_static.render_range(
            self.world_range.clone(),
            camera_bind_group,
            &self.buffer,
            &self.visible_textures,
            textures,
            render_pass,
        );
        self.sprites_static.render_range(
            self.sprite_range.clone(),
            camera_bind_group,
            &self.buffer,
            &self.visible_textures,
            textures,
            render_pass,
        );
    }
    pub fn render_particles_fg<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        camera_bind_group: &'a wgpu::BindGroup,
        textures: &'a twgpu::sprites::SpriteTextures,
    ) {
        for group in [
            twgpu::sprites::ParticleGroup::Explosions,
            twgpu::sprites::ParticleGroup::Extra,
            twgpu::sprites::ParticleGroup::General,
        ] {
            self.sprites_static.render_range(
                self.particle_ranges[group].clone(),
                camera_bind_group,
                &self.buffer,
                &self.visible_textures,
                textures,
                render_pass,
            );
        }
    }

    pub fn render_cursor<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        camera_bind_group: &'a wgpu::BindGroup,
        textures: &'a twgpu::sprites::SpriteTextures,
    ) {
        // 准星盖在最上面(它在精灵之后、在地形之后,和客户端里 HUD 最后画一致)
        self.sprites_static.render_range(
            self.cursor_range.clone(),
            camera_bind_group,
            &self.buffer,
            &self.visible_textures,
            textures,
            render_pass,
        );
    }
}

/// 一份「自己拼」的精灵:世界中点(tile)+ 尺寸(tile)+ 旋转 + 颜色 + 贴图。
/// `size.x` 是沿旋转方向的长度,`size.y` 是宽度(光束就是靠这个拼的)。
pub struct WorldSprite {
    pub center: twgpu::vek::Vec2<f32>,
    pub size: twgpu::vek::Vec2<f32>,
    pub rotation: f32,
    pub color: twgpu::vek::Rgba<u8>,
    pub texture: twgpu::sprites::TextureToken,
}

impl WorldSprite {
    fn quad(&self) -> [twgpu::sprites::SpriteVertex; 4] {
        use twgpu::shared::{Vertex, QUAD};
        let (sin, cos) = self.rotation.sin_cos();
        let half = self.size / 2.;
        QUAD.map(|corner| {
            let direction = corner.direction();
            // 先把「沿旋转方向的长度 / 垂直方向的宽度」摊到角点上,再整体旋转。
            // 反过来的话只有正方形精灵是对的(雪花、珠子都看不出问题),光束这种长方形会被
            // 挤成一根斜的细条——看起来就像激光方向不对
            let offset = direction * half;
            let rotated = twgpu::vek::Vec2::new(
                offset.x * cos - offset.y * sin,
                offset.x * sin + offset.y * cos,
            );
            twgpu::sprites::SpriteVertex {
                vertex: Vertex {
                    position: self.center + rotated,
                    uv: corner.uv(),
                },
                color: self.color,
            }
        })
    }
}

/// 要画的一个准星:世界中点(tile)+ 边长(tile)+ 贴图 + 透明度
pub struct CursorSprite {
    /// 世界中点,单位是 tile
    pub center: twgpu::vek::Vec2<f32>,
    /// 边长,单位是 tile(屏幕上是固定的像素大小,跟着缩放换算过来)
    pub size: f32,
    pub alpha: u8,
    pub texture: twgpu::sprites::TextureToken,
}

impl CursorSprite {
    fn quad(&self) -> [twgpu::sprites::SpriteVertex; 4] {
        use twgpu::shared::{Vertex, QUAD};
        let half = self.size / 2.;
        QUAD.map(|corner| twgpu::sprites::SpriteVertex {
            vertex: Vertex {
                position: self.center + corner.direction() * half,
                uv: corner.uv(),
            },
            color: twgpu::vek::Rgba::new(255, 255, 255, self.alpha),
        })
    }
}

/// 没有 demo 时的渲染上下文:地图预览用,精灵来自「空服务器」那份 snap(`ServerWorld`)。
/// 那份额外的 `twsnap::Snap` 不在这里持有,由调用方传进来,省掉每帧一次 clone。
pub struct SimpleCtx {
    map: Arc<twgame::Map>,
    particles: twgpu::sprites::Particles,
    rng: twgpu::shared::Rng,
}

impl SimpleCtx {
    pub(crate) fn new(map: Arc<twgame::Map>) -> Self {
        Self {
            map,
            particles: twgpu::sprites::Particles::new(0.),
            rng: twgpu::shared::Rng::new(21),
        }
    }

    pub fn to_ctx<'a>(
        &'a mut self,
        textures: &'a twgpu::sprites::SpriteTextures,
        clock: &'a twgpu::shared::Clock,
        snap: &'a twsnap::Snap,
    ) -> twgpu::sprites::SpriteRenderContext<'a> {
        twgpu::sprites::SpriteRenderContext {
            clock,
            from_snap: snap,
            to_snap: snap,
            map: &self.map,
            particles: &mut self.particles,
            textures,
            rng: &mut self.rng,
        }
    }
}
