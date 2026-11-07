use wasm_bindgen::prelude::*;

use crate::camera::TwCamera;
use crate::demo::TwDemo;
use crate::map::{TwMap, TwMapIntermediate};
use crate::surface::TwSurface;
use crate::{error, sprites_helper, LABEL};
use std::collections::HashMap;
use std::sync::Arc;
use twgpu::image::{self, ImageDecoder as _};

const FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

thread_local! {
    /// `performance.now()`,一帧调十来次也就几微秒,但比 `window().performance()` 每次
    /// 跨一遍 JS 边界便宜。
    static PERF: web_sys::Performance = web_sys::window()
        .expect("no window")
        .performance()
        .expect("no performance");
}

fn now_ms() -> f64 {
    PERF.with(|perf| perf.now())
}

/// 一个 wgpu device + 一份贴图/字体资源,地图和 demo 共用。
///
/// 注意:同一个 wasm 实例上 `TwGpu::init` 只能成功一次(twgpu 的全局日志/panic hook
/// 不能重置),换 canvas 用 `create_surface`,别重新 init。
#[wasm_bindgen]
pub struct TwGpu {
    instance: wgpu::Instance,
    surface: Option<TwSurface>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    samplers: twgpu::textures::Samplers,
    map_static: Arc<twgpu::map::GpuMapStatic>,
    sprite_textures: twgpu::sprites::SpriteTextures,
    external_06: HashMap<String, image::RgbaImage>,
    external_07: HashMap<String, image::RgbaImage>,
    ctx_renderer: sprites_helper::CtxRenderer,
    /// 实体层图集。客户端那套 `cl_assets_entities` 有好几种风格(comfort / default …),
    /// 这里按 id 存,由前端决定用哪一张;反正格子布局都是 16x16 个 64px tile,转换逻辑一样。
    entities: HashMap<String, image::RgbaImage>,
    render_nameplates: bool,
    scribble: twgpu::text::Scribble,
    /// DDNet 的 6 个武器准星,从 game.png 里裁出来的(索引 = 武器 id,见 `CURSOR_ROWS`)
    cursor_textures: [twgpu::sprites::TextureToken; 6],
    /// 上一帧各阶段的毫秒耗时,顺序见 `last_frame_timings()` 的注释
    last_timings: [f32; 7],
    /// 名字牌:Canvas2D 光栅化的字形 atlas + SDF/彩色两条管线
    nameplates: crate::nameplate::NameplateRenderer,
    /// 地图里自己拼的贴图:血包(game.png)和 dragger 滑轮 / 灯光头(extras.png)
    freeze_pickup_texture: twgpu::sprites::TextureToken,
    pulley_texture: twgpu::sprites::TextureToken,
    hectagon_texture: twgpu::sprites::TextureToken,
    snowflake_texture: twgpu::sprites::TextureToken,
}

/// game.png 里 6 个武器准星所在的格行(每格 32px,各占 2x2 格)。
///
/// 顺序和 DDNet 的 `m_aSpriteWeaponCursors` 一致,也就是武器 id:
/// 0 锤子 / 1 手枪 / 2 霰弹枪 / 3 榴弹 / 4 激光 / 5 武士刀。
/// 注意到 4 和 5:客户端那边是 laser 在前、ninja 在后,不是数据文件里的行号顺序。
const CURSOR_ROWS: [u32; 6] = [0, 4, 6, 8, 12, 10];

#[wasm_bindgen]
impl TwGpu {
    #[wasm_bindgen(constructor)]
    pub async fn init(
        backend: Option<String>,
        canvas: Option<web_sys::HtmlCanvasElement>,
        mipmaps: Option<bool>,
        tilemap_mips: Option<bool>,
    ) -> Result<Self, JsError> {
        std::panic::set_hook(Box::new(console_error_panic_hook::hook));
        console_log::init().expect("Could not initialize logger");
        log::info!("Surface is some: {}", canvas.is_some());

        // 显式指定后端时不要再碰 navigator.gpu:有些内置浏览器(QQ/X5)的 WebGPU 是桩,
        // `requestAdapter()` 会一直挂着,而 wgpu 这句探测没有超时,整个初始化就卡死了。
        let webgpu_supported = match backend.as_deref() {
            Some(_) => false,
            None => wgpu::util::is_browser_webgpu_supported().await,
        };
        log::warn!("WebGPU supported: {webgpu_supported}");
        let backend = match backend.as_ref().map(String::as_ref) {
            None => None,
            Some("webgpu") => Some(wgpu::Backends::BROWSER_WEBGPU),
            Some("webgl") => Some(wgpu::Backends::GL),
            Some(other) => {
                log::warn!("Unknown backend '{other}', select either 'webgpu' or 'webgl'. Defaulting to automatic detection");
                None
            }
        };
        let backends = match backend {
            Some(backend) => backend,
            None => {
                let mut backends = wgpu::Backends::GL;
                if webgpu_supported {
                    backends.insert(wgpu::Backends::BROWSER_WEBGPU);
                }
                backends
            }
        };
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends,
            ..twgpu_tools::instance_descriptor()
        });
        let mut surface = None;
        if let Some(canvas) = canvas {
            surface = Some(TwSurface::new(&instance, canvas, None)?);
        }
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: surface.as_ref().map(|s| s.inner()),
                ..*twgpu_tools::request_adapter_options()
            })
            .await
            .expect("No suitable adapter found");

        log::info!("{:?}", adapter.get_info());
        log::info!("Adapter {:?}", adapter.limits());
        log::info!("Supported features: {:?}", adapter.features());

        let (device, queue) = adapter
            .request_device(&twgpu::device_descriptor(&adapter))
            .await
            .unwrap();
        if let Some(surface) = &mut surface {
            surface.set_device(device.clone());
        }

        // mip 相关开关(见 patches/twgpu-web-fixes.patch):
        // - mipmaps=false:全局退回 level 0
        // - tilemap_mips=false:只让 tilemap 退回,精灵/tee 继续用 mipmap
        let mipmaps = mipmaps.unwrap_or(true);
        let tilemap_mips = tilemap_mips.unwrap_or(true);
        log::info!("Samplers: mipmaps={mipmaps} tilemap_mips={tilemap_mips}");
        let samplers = twgpu::textures::Samplers::new(&device)
            .with_mipmaps(mipmaps)
            .with_tilemap_lod0(!tilemap_mips);
        let map_static = twgpu::map::GpuMapStatic::new(FORMAT, &device);
        let sprite_textures =
            twgpu::sprites::SpriteTextures::new(samplers.clone(), device.clone(), queue.clone());
        let ctx_renderer = sprites_helper::CtxRenderer::new(FORMAT, device.clone(), queue.clone());
        let nameplates =
            crate::nameplate::NameplateRenderer::new(device.clone(), queue.clone(), FORMAT);
        let scribble =
            twgpu::text::Scribble::new(samplers.clone(), FORMAT, device.clone(), queue.clone());
        Ok(Self {
            instance,
            surface,
            device,
            queue,
            samplers,
            map_static: map_static.into(),
            sprite_textures,
            external_06: HashMap::new(),
            external_07: HashMap::new(),
            ctx_renderer,
            entities: HashMap::new(),
            render_nameplates: false,
            scribble,
            cursor_textures: [twgpu::sprites::TextureToken::INVALID; 6],
            nameplates,
            last_timings: [0.; 7],
            freeze_pickup_texture: twgpu::sprites::TextureToken::INVALID,
            pulley_texture: twgpu::sprites::TextureToken::INVALID,
            hectagon_texture: twgpu::sprites::TextureToken::INVALID,
            snowflake_texture: twgpu::sprites::TextureToken::INVALID,
        })
    }

    #[wasm_bindgen]
    pub fn surface(&mut self) -> Option<TwSurface> {
        self.surface.take()
    }

    #[wasm_bindgen]
    pub fn create_surface(&self, canvas: web_sys::HtmlCanvasElement) -> Result<TwSurface, JsError> {
        TwSurface::new(&self.instance, canvas, Some(self.device.clone()))
    }

    pub fn embed_mapres(&self, map: &mut TwMapIntermediate) -> bool {
        map.embed_from(&self.external_06, &self.external_07)
    }

    #[wasm_bindgen]
    pub fn upload_map(&self, mut intermediate: TwMapIntermediate) -> Result<TwMap, JsError> {
        if !intermediate.embed_from(&self.external_06, &self.external_07) {
            return Err(JsError::new("Not all images in map are embedded"));
        }
        TwMap::new_from_intermediate(
            intermediate,
            self.map_static.clone(),
            self.samplers.clone(),
            self.device.clone(),
            self.queue.clone(),
        )
    }

    /// 把地图转成「只有实体层」的那一份(地图预览页用,默认取 comfort)。
    #[wasm_bindgen]
    pub fn map_to_entities(&self, map: &TwMap) -> Result<TwMap, JsError> {
        self.entities_map(map, None)
    }

    /// 指定实体层风格(demo 播放器的「实体层样式」子菜单用)。
    #[wasm_bindgen]
    pub fn map_to_entities_with_style(&self, map: &TwMap, style: &str) -> Result<TwMap, JsError> {
        self.entities_map(map, Some(style))
    }

    fn entities_map(&self, map: &TwMap, style: Option<&str>) -> Result<TwMap, JsError> {
        let entities = match style {
            Some(style) => self.entities.get(style),
            // 不指定风格时优先 comfort,再退到随便一张(预览页的老调用)
            None => self
                .entities
                .get("comfort")
                .or_else(|| self.entities.values().next()),
        };
        let Some(entities) = entities else {
            return Err(JsError::new(&match style {
                Some(style) => format!("Unknown entities style: {style}"),
                None => "No entities texture set on TwGpu object".to_string(),
            }));
        };
        let entities_map = twgpu_tools::map_to_entities(map.twmap_map(), entities.clone());
        let intermediate = TwMapIntermediate {
            twmap_map: entities_map,
            twgame_map: map.twgame_map().clone(),
        };
        TwMap::new_from_intermediate(
            intermediate,
            self.map_static.clone(),
            self.samplers.clone(),
            self.device.clone(),
            self.queue.clone(),
        )
    }

    /// 上传一个字形的位图。`color == false` 时 `pixels` 是 alpha(1 字节/像素),
    /// 在 GPU 上生成 SDF;否则是 RGBA(emoji),直接进彩色 atlas。
    #[wasm_bindgen]
    pub fn nameplate_glyph_upload(
        &mut self,
        id: u32,
        width: u32,
        height: u32,
        color: bool,
        pixels: &[u8],
    ) -> Result<(), JsError> {
        self.nameplates
            .upload_glyph(id, width, height, color, pixels)
            .map_err(|err| JsError::new(&err))
    }

    /// 每帧的名字牌字形:`[id, center_x, center_y, width, height, outline_em]` × n
    #[wasm_bindgen]
    pub fn set_nameplate_glyphs(&mut self, data: &[f32]) {
        self.nameplates.set_quads(data);
    }

    #[wasm_bindgen]
    pub fn render_map(
        &mut self,
        surface: &TwSurface,
        camera: &TwCamera,
        map: &mut TwMap,
    ) -> Result<(), JsError> {
        self.render(surface, camera, map, None)
    }

    #[wasm_bindgen]
    pub fn render_demo(
        &mut self,
        surface: &TwSurface,
        camera: &TwCamera,
        map: &mut TwMap,
        demo: &mut TwDemo,
    ) -> Result<(), JsError> {
        self.render(surface, camera, map, Some(demo))
    }

    /// 上一帧各阶段的毫秒耗时:
    /// `[acquire, prepare, entities, record, submit, present, total]`
    /// (`prepare` = 地图/瓦片更新 + 开 render pass,`entities` = demo 精灵与准星上传,
    /// `record` = 把所有 draw call 录进 command buffer,`submit`/`present` = 交 GPU 与上屏)。
    #[wasm_bindgen]
    pub fn last_frame_timings(&self) -> Vec<f32> {
        self.last_timings.to_vec()
    }

    fn render(
        &mut self,
        surface: &TwSurface,
        camera: &TwCamera,
        map: &mut TwMap,
        demo: Option<&mut TwDemo>,
    ) -> Result<(), JsError> {
        let render_size = surface.get_size();
        let camera = camera.inner();
        self.nameplates.prepare(camera);
        let demo_time = demo.as_ref().map(|d| d.current_time());
        let t0 = now_ms();
        let frame = surface.frame()?;
        let t1 = now_ms();
        let frame_view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut command_encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: LABEL });
        let (t2, t3);
        {
            let mut render_pass = command_encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: LABEL,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &frame_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            let mut tw_render_pass =
                twgpu::TwRenderPass::new(&mut render_pass, render_size.into(), camera);
            let (map, mut ctx, camera_bind_group, sprite_requests, explosions) =
                map.prepare_render(&tw_render_pass, &self.sprite_textures, demo_time);
            t2 = now_ms();
            let world_sprites = sprite_requests
                .iter()
                .map(|request| {
                    let texture = match request.kind {
                        crate::world::SpriteKind::Blank => self.sprite_textures.blank_texture(),
                        crate::world::SpriteKind::PickupFreeze => self.freeze_pickup_texture,
                        crate::world::SpriteKind::Pulley => self.pulley_texture,
                        crate::world::SpriteKind::Hectagon => self.hectagon_texture,
                        crate::world::SpriteKind::Snowflake => self.snowflake_texture,
                    };
                    sprites_helper::WorldSprite {
                        center: request.center,
                        size: request.size,
                        rotation: request.rotation,
                        color: twgpu::vek::Rgba::new(
                            request.color[0],
                            request.color[1],
                            request.color[2],
                            request.color[3],
                        ),
                        texture,
                    }
                })
                .collect::<Vec<_>>();
            // 准星状态要在 render_ctx 之前取:它返回的 ctx 会把 demo 可变借走到渲染结束
            let cursor_state = demo.as_ref().and_then(|demo| demo.cursor());
            let mut new_snap = false;
            if let Some(demo) = demo {
                (ctx, new_snap) = demo.render_ctx(&self.sprite_textures);
            }
            let cursor = self.cursor_sprite(cursor_state, camera, render_size.into());
            self.ctx_renderer.queue_explosions(explosions);
            // 相机看到的世界范围(tile),给精灵做视锥裁剪用;parallax 取 1 就是实体所在的那层
            let view = camera.world_perspective(twgpu::vek::Vec2::broadcast(1.));
            self.ctx_renderer
                .prepare_render(&mut ctx, new_snap, cursor, &world_sprites, view);
            t3 = now_ms();
            map.render_background(&mut tw_render_pass);
            self.ctx_renderer.render_bg(
                &mut tw_render_pass.render_pass,
                camera_bind_group,
                &self.sprite_textures,
            );
            map.render_foreground(&mut tw_render_pass);
            self.ctx_renderer.render_particles_fg(
                &mut tw_render_pass.render_pass,
                camera_bind_group,
                &self.sprite_textures,
            );
            self.nameplates.render(&mut tw_render_pass.render_pass);
            self.ctx_renderer.render_cursor(
                &mut tw_render_pass.render_pass,
                camera_bind_group,
                &self.sprite_textures,
            );
            if self.render_nameplates {
                self.scribble.resize(surface.get_size().into());
                self.scribble.queue_nameplates(camera, &mut ctx);
                self.scribble.render(&mut tw_render_pass.render_pass);
            }
        }
        let t4 = now_ms();
        self.queue.submit([command_encoder.finish()]);
        let t5 = now_ms();
        self.scribble.clear();
        self.queue.present(frame);
        let t6 = now_ms();
        self.last_timings = [
            (t1 - t0) as f32,
            (t2 - t1) as f32,
            (t3 - t2) as f32,
            (t4 - t3) as f32,
            (t5 - t4) as f32,
            (t6 - t5) as f32,
            (t6 - t0) as f32,
        ];
        Ok(())
    }

    /// 把准星的状态换算成世界坐标。
    ///
    /// 准星是 **screen space** 的,但挂在玩家身上(客户端 `CHud::RenderCursor` 也是这么算的):
    /// 屏幕像素偏移 = 瞄准点(DDNet 单位),和游戏 zoom 无关 —— 客户端的 HUD 变换本身用
    /// zoom 1,再把 `WorldTarget` 里乘过的那次 Zoom 除掉,刚好抵消。换算成 tile 就是
    /// `aim * zoom / 32`,缩得越远准星离玩家越近,但屏幕上大小和"离玩家多少像素"不变。
    ///
    /// 剩下的照抄客户端:贴边时按最大比例压回屏幕内、同时半透明(`Alpha /= 2`),
    /// 大小固定 64 逻辑像素(`64.f * ScaleX`),跟着窗口高度缩一点。
    fn cursor_sprite(
        &self,
        cursor: Option<crate::demo::CursorState>,
        camera: &twgpu::Camera,
        render_size: twgpu::vek::Vec2<u32>,
    ) -> Option<sprites_helper::CursorSprite> {
        let cursor = cursor?;
        let texture = *self.cursor_textures.get(cursor.weapon as usize)?;
        if texture == twgpu::sprites::TextureToken::INVALID {
            return None;
        }

        let width = render_size.x as f32;
        let height = render_size.y as f32;
        if width < 1. || height < 1. {
            return None;
        }
        // 一像素等于多少 tile(跟着游戏 zoom 走)
        let tiles_per_px = camera.base_dimensions.x * camera.zoom.x / width;

        // 玩家位置 + 瞄准点(单位换算成 tile 时乘 zoom,见上)
        let mut center = twgpu::vek::Vec2::new(
            cursor.anchor.0 + cursor.aim.0 * camera.zoom.x / 32.,
            cursor.anchor.1 + cursor.aim.1 * camera.zoom.y / 32.,
        );

        // 贴边保护:算屏幕坐标,超出半个屏幕就按同一比例压回来,并让准星半透明
        let mut alpha = 255;
        let half = twgpu::vek::Vec2::new(width / 2., height / 2.);
        if tiles_per_px > 0. {
            let screen = (center - camera.position) / tiles_per_px;
            let factor = 1_f32
                .max((screen.x / half.x).abs())
                .max((screen.y / half.y).abs());
            if factor > 1. {
                center = camera.position + screen / factor * tiles_per_px;
                alpha = 128;
            }
        }

        // 大小照客户端 `CHud::RenderCursor`:
        //   QuadContainerAddSprite(64.f * ScaleX)
        //   而 `ScaleX` 来自 `GetSpriteScaleImpl(64, 64)` = 64 / length(64, 64) = 0.7071
        // 也就是 64 * 0.7071 = 45.25 个"HUD 单位",再按 zoom 1 的视野换算成像素
        // (窗口越宽,1 单位占的像素越多,所以它随窗口缩放,和游戏 zoom 无关)。
        let px_per_unit = width / (camera.base_dimensions.x * 32.);
        let sprite_scale = 64. / (64f32 * 64. + 64. * 64.).sqrt();
        let size_px = 64. * sprite_scale * px_per_unit;

        Some(sprites_helper::CursorSprite {
            center,
            size: size_px * tiles_per_px,
            alpha,
            texture,
        })
    }

    #[wasm_bindgen]
    pub fn add_external_06(&mut self, name: String, bytes: &[u8]) -> Result<(), JsError> {
        self.external_06.insert(name, decode_image(bytes)?);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_external_07(&mut self, name: String, bytes: &[u8]) -> Result<(), JsError> {
        self.external_07.insert(name, decode_image(bytes)?);
        Ok(())
    }

    /// 实体层图集,一套风格一张(`comfort` / `classic` …)。
    /// 和 `add_texture` 分开是因为这个图集不止一张,前端要按名字挑。
    #[wasm_bindgen]
    pub fn add_entities(&mut self, name: String, bytes: &[u8]) -> Result<(), JsError> {
        self.entities.insert(name, decode_image(bytes)?);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_texture(&mut self, name: String, bytes: &[u8]) -> Result<(), JsError> {
        let image = decode_image(bytes)?;
        match name.as_ref() {
            "game" => {
                self.sprite_textures.game_skin = self.sprite_textures.register_atlas_image(&image);
                // 准星是独立的小图(64x64),单独注册成贴图,画的时候一个 quad 就行,
                // 不用去趟 atlas 那套 sprite 索引。
                for (slot, row) in self.cursor_textures.iter_mut().zip(CURSOR_ROWS) {
                    let cursor = image::imageops::crop_imm(&image, 0, row * 32, 64, 64).to_image();
                    *slot = self.sprite_textures.register_image(&cursor);
                }
                // 地图里的「血包」= `pickup_freeze`(game.png 第 2 行第 6 格,2x2 格 = 64px)
                let freeze = image::imageops::crop_imm(&image, 6 * 32, 2 * 32, 64, 64).to_image();
                self.freeze_pickup_texture = self.sprite_textures.register_image(&freeze);
            }
            "particles" => {
                self.sprite_textures.particles = self.sprite_textures.register_atlas_image(&image)
            }
            "emoticons" => {
                self.sprite_textures.emoticons = self.sprite_textures.register_atlas_image(&image)
            }
            "extras" => {
                self.sprite_textures.extras = self.sprite_textures.register_atlas_image(&image);
                // extras.png 也是 16x16 个 32px 格:`part_pulley`(4,0,1,1)、
                // `part_hectagon`(6,0,2,2)、`part_snowflake`(0,0,2,2)
                let pulley = image::imageops::crop_imm(&image, 4 * 32, 0, 32, 32).to_image();
                self.pulley_texture = self.sprite_textures.register_image(&pulley);
                let hectagon = image::imageops::crop_imm(&image, 6 * 32, 0, 64, 64).to_image();
                self.hectagon_texture = self.sprite_textures.register_image(&hectagon);
                let snowflake = image::imageops::crop_imm(&image, 0, 0, 64, 64).to_image();
                self.snowflake_texture = self.sprite_textures.register_image(&snowflake);
            }
            "default" => {
                self.sprite_textures.default_skin =
                    self.sprite_textures.register_skin_image(&image, name)
            }
            "x_ninja" => {
                let skin = self.sprite_textures.register_skin_image(&image, name);
                self.sprite_textures.ninja_skin = skin.normal;
            }
            _ => return Err(JsError::new(
                "Unknown texture, known are: game, particles, emoticons, extras, default, x_ninja",
            )),
        }
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_skin(&mut self, name: String, bytes: &[u8]) -> Result<(), JsError> {
        let image = decode_image(bytes)?;
        self.sprite_textures.register_skin_image(&image, name);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_font(&mut self, bytes: &[u8]) -> Result<(), JsError> {
        let font = error(twgpu::text::Font::new(bytes.into()))?;
        self.scribble.add_font(font);
        self.render_nameplates = true;
        Ok(())
    }
}

fn decode_image(data: &[u8]) -> Result<image::RgbaImage, JsError> {
    let data = std::io::Cursor::new(data);
    let image_decoder = error(image::codecs::png::PngDecoder::new(data))?;
    assert_eq!(image_decoder.color_type(), image::ColorType::Rgba8);
    let mut image_buffer = vec![0_u8; image_decoder.total_bytes() as usize];
    let (width, height) = image_decoder.dimensions();
    error(image_decoder.read_image(&mut image_buffer))?;
    Ok(image::RgbaImage::from_vec(width, height, image_buffer).unwrap())
}
