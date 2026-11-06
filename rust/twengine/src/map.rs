use twgpu::image::RgbaImage;
use std::collections::HashMap;
use std::sync::Arc;
use twgpu::map::GpuMapRender;
use twgpu::{twgame, twmap, twsnap, vek, TwRenderPass};
use wasm_bindgen::prelude::*;

use crate::sprites_helper::SimpleCtx;
use crate::{error, sprites_helper};

#[wasm_bindgen]
pub struct TwMapIntermediate {
    pub(crate) twmap_map: twmap::TwMap,
    pub(crate) twgame_map: Arc<twgame::Map>,
}

#[wasm_bindgen]
pub struct TwMap {
    twmap_map: twmap::TwMap,
    twgame_map: Arc<twgame::Map>,
    map_data_dyn: twgpu::map::GpuMapDataDyn,
    map_data_static: twgpu::map::GpuMapDataStatic,
    map_render: twgpu::map::GpuMapRender,
    sprites: sprites_helper::SimpleCtx,
    clock: twgpu::shared::Clock,
    gpu_camera: twgpu::GpuCamera,
    camera_bind_group: wgpu::BindGroup,
    device: wgpu::Device,
    queue: wgpu::Queue,
}

#[wasm_bindgen]
impl TwMapIntermediate {
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Result<Self, JsError> {
        let mut twmap_map = error(twmap::TwMap::parse(data))?;
        error(twmap_map.load())?;
        let twgame_map = error(twgame::Map::try_from(&mut twmap_map))?;
        Ok(Self {
            twmap_map: twmap_map.into(),
            twgame_map: twgame_map.into(),
        })
    }

    #[wasm_bindgen]
    pub fn version(&self) -> String {
        match self.twmap_map.version {
            twmap::Version::DDNet06 => "DDNet06",
            twmap::Version::Teeworlds07 => "Teeworlds07",
        }
        .to_string()
    }

    #[wasm_bindgen]
    pub fn external_mapres(&self) -> Vec<String> {
        self.twmap_map
            .images
            .iter()
            .filter_map(|img| img.image().is_none().then(|| img.name().clone()))
            .collect()
    }

    /// Returns `true`, if all images are now embedded.
    pub(crate) fn embed_from(
        &mut self,
        mapres_06: &HashMap<String, RgbaImage>,
        mapres_07: &HashMap<String, RgbaImage>,
    ) -> bool {
        let mut all_embedded = true;
        let mapres = match self.twmap_map.version {
            twmap::Version::DDNet06 => mapres_06,
            twmap::Version::Teeworlds07 => mapres_07,
        };
        for img in &mut self.twmap_map.images {
            if matches!(img, twmap::Image::External(_)) {
                let name = img.name().clone();
                if let Some(image) = mapres.get(&name) {
                    *img = twmap::Image::Embedded(twmap::EmbeddedImage {
                        name,
                        image: image.clone().into(),
                    });
                } else {
                    all_embedded = false;
                }
            }
        }
        all_embedded
    }
}

#[wasm_bindgen]
impl TwMap {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new_from_intermediate(
        intermediate: TwMapIntermediate,
        map_static: Arc<twgpu::map::GpuMapStatic>,
        samplers: twgpu::textures::Samplers,
        device: wgpu::Device,
        queue: wgpu::Queue,
    ) -> Result<Self, JsError> {
        let TwMapIntermediate {
            twmap_map,
            twgame_map,
        } = intermediate;
        let map_data_static = twgpu::map::GpuMapDataStatic::upload(&twmap_map, &device, &queue);
        {
            // CPU 生成 mip 的代价:总耗时 / 峰值内存(峰值 = 最大那张 mapres 的 level0)
            let stats = map_data_static.mapres().mip_stats();
            let total_ms: f64 = stats.iter().map(|(_, _, ms)| ms).sum();
            let peak = stats.iter().map(|(_, bytes, _)| *bytes).max().unwrap_or(0);
            log::info!(
                "[mip] 共 {} 张 tilemap,合计 {total_ms:.1} ms,峰值额外内存 {:.2} MiB",
                stats.len(),
                peak as f64 / (1024.0 * 1024.0),
            );
            for (name, bytes, ms) in &stats {
                log::info!(
                    "[mip]   {name}: {:.2} MiB, {ms:.1} ms",
                    *bytes as f64 / (1024.0 * 1024.0)
                );
            }
        }
        let map_data_dyn = twgpu::map::GpuMapDataDyn::upload(&twmap_map, &device);

        let clock = twgpu::shared::Clock::new(0);
        let gpu_camera = twgpu::GpuCamera::upload(&twgpu::Camera::new(1.), &device);
        let camera_bind_group = gpu_camera.camera_bind_group(&device);

        let map_render = map_static.prepare_render(
            &twmap_map,
            &map_data_static,
            &map_data_dyn,
            &gpu_camera,
            &samplers,
            &device,
        );
        let mut sprites = SimpleCtx::new(twgame_map.clone());
        let mut from_snap = twsnap::Snap::default();
        let mut to_snap = twsnap::Snap::default();
        from_snap.pickups = get_pickups_from_map(&twmap_map);
        to_snap.pickups = from_snap.pickups.clone();
        sprites.from_snap = from_snap;
        sprites.to_snap = to_snap;
        Ok(Self {
            twmap_map,
            twgame_map,
            map_data_dyn,
            map_data_static,
            map_render,
            sprites,
            clock,
            gpu_camera,
            camera_bind_group,
            device,
            queue,
        })
    }

    pub(crate) fn prepare_render<'a>(
        &'a mut self,
        tw_render_pass: &TwRenderPass,
        textures: &'a twgpu::sprites::SpriteTextures,
        demo: Option<f64>,
    ) -> (
        &'a GpuMapRender,
        twgpu::sprites::SpriteRenderContext<'a>,
        &'a wgpu::BindGroup,
    ) {
        let render_size = tw_render_pass.size;
        let camera = &tw_render_pass.camera;
        let time = match demo {
            None => self.clock.current_time(),
            Some(time) => time,
        };
        self.gpu_camera.update(camera, &self.queue);
        self.map_data_dyn.update(
            &self.twmap_map.envelopes,
            &self.map_data_static,
            camera,
            render_size.into(),
            (time * 1_000_000.) as i64,
            &self.queue,
        );
        (
            &self.map_render,
            self.sprites.to_ctx(textures, &self.clock),
            &self.camera_bind_group,
        )
    }

    #[wasm_bindgen]
    pub fn set_time(&mut self, time: f64) {
        self.clock.update(time * 50.);
    }

    #[wasm_bindgen]
    pub fn spawn_location(&self) -> Vec<f32> {
        let game_tiles = self
            .twmap_map
            .find_physics_layer::<twmap::GameLayer>()
            .unwrap()
            .tiles
            .unwrap_ref();
        let front_tiles = self
            .twmap_map
            .find_physics_layer::<twmap::FrontLayer>()
            .map(|l| l.tiles.unwrap_ref());
        let mut sum_x = 0;
        let mut sum_y = 0;
        let mut total = 0;
        for tiles in Some(game_tiles).into_iter().chain(front_tiles) {
            for ((y, x), tile) in tiles.indexed_iter() {
                if !(192..=194).contains(&tile.id) {
                    continue;
                }
                sum_x += x;
                sum_y += y;
                total += 1;
            }
        }
        if total == 0 {
            vec![0., 0.]
        } else {
            vec![sum_x as f32 / total as f32, sum_y as f32 / total as f32]
        }
    }

    pub(crate) fn twmap_map(&self) -> &twmap::TwMap {
        &self.twmap_map
    }
    pub(crate) fn twgame_map(&self) -> &Arc<twgame::Map> {
        &self.twgame_map
    }
}

fn get_pickups_from_map(map: &twmap::TwMap) -> twsnap::OrderedMap<twsnap::items::Pickup> {
    let mut pickups = twsnap::OrderedMap::default();
    for layer in map
        .find_physics_layer::<twmap::GameLayer>()
        .map(|l| l.tiles.unwrap_ref())
        .into_iter()
        .chain(
            map.find_physics_layer::<twmap::FrontLayer>()
                .map(|l| l.tiles.unwrap_ref()),
        )
    {
        for ((y, x), t) in layer.indexed_iter() {
            let kind = match t.id {
                197 => twsnap::enums::Powerup::Armor,
                198 => twsnap::enums::Powerup::Health,
                199 => twsnap::enums::Powerup::Weapon(twsnap::enums::CollectableWeapon::Shotgun),
                200 => twsnap::enums::Powerup::Weapon(twsnap::enums::CollectableWeapon::Grenade),
                201 => twsnap::enums::Powerup::Weapon(twsnap::enums::CollectableWeapon::Ninja),
                202 => twsnap::enums::Powerup::Weapon(twsnap::enums::CollectableWeapon::Rifle),
                _ => continue,
            };
            let pos = vek::Vec2::new(
                fixed::types::I27F5::from_bits(x as i32 * 32 + 16),
                fixed::types::I27F5::from_bits(y as i32 * 32 + 16),
            );
            let mut flags = twsnap::flags::PickupFlags::empty();
            if t.flags.contains(twmap::TileFlags::FLIP_X) {
                flags.insert(twsnap::flags::PickupFlags::XFLIP);
            }
            if t.flags.contains(twmap::TileFlags::FLIP_Y) {
                flags.insert(twsnap::flags::PickupFlags::YFLIP);
            }
            let pickup = twsnap::items::Pickup {
                pos,
                kind,
                switch_number: 0,
                flags,
            };
            pickups.insert(twsnap::SnapId(pickups.len() as u32), pickup);
        }
    }
    pickups
}
