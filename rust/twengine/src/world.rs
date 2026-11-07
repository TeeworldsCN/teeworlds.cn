//! 「空服务器」世界:把地图实体层里的东西按 DDNet 服务端加载地图时的方式摆一遍,
//! 让地图预览看起来像是刚连进一台没人的服,而不是一张静止的图。
//!
//! 服务端 `CGameContext::CreateAllEntities` 会遍历 game / front / switch 三张图层的 tile,
//! tile id >= `ENTITY_OFFSET`(191)的那一格按 `id - ENTITY_OFFSET` 交给
//! `IGameController::OnEntity` 去建实体。这里照抄那份规则,但只做「没人也能看见」的:
//!
//! - pickup:武器 / armor / 血包 / ninja —— 客户端本来就会让它们绕着圈飘
//! - plasma 炮台(`ENTITY_PLASMA*`):画成会转的粒子头
//! - crazy shotgun 子弹:服务端加载地图时就创建、而且永远在墙上弹(span = -2)
//! - 门 / 激光灯:dragger 那根激光,灯每 0.15 秒转一格、长度还会按修饰块伸缩
//!
//! 其它实体(dragger beam、plasma 子弹、需要玩家才出现的 projectile)在空服务器里没有
//! 任何画面,直接略过。位置和动画全部交给 twgpu 现成的 snap 精灵画法,这里只负责
//! 「摆什么」和「子弹怎么弹」。

use std::collections::HashMap;
use std::f32::consts::PI;

use twgpu::twmap::AnyTile;
use twgpu::{twmap, twsnap, vek};
use vek::Vec2;

use twsnap::enums::{
    ActiveWeapon, CollectableWeapon, LaserDraggerType, LaserGunType, LaserType, Powerup,
};
use twsnap::flags::{LaserFlags, PickupFlags, ProjectileFlags};
use twsnap::items::{Laser, MapProjectile, Pickup};
use twsnap::time::Instant;
use twsnap::SnapId;

/// 实体层里 tile id 从 191 开始才是实体(服务端的 `ENTITY_OFFSET`)
const ENTITY_OFFSET: u8 = 191;

/// 服务端 50 tick/s
const TICK_SECONDS: f32 = 0.02;
/// 服务端的灯每 `(int)(TickSpeed() * 0.15f)` = 7 个 tick 走一步,一步算 7.5 个 tick
const LIGHT_STEP_TICKS: i64 = 7;
const LIGHT_STEP_TIME: f32 = 7.5;
/// 一次 `update` 最多补这么多 tick(5 秒)。超过就当跳帧了:子弹必须一 tick 一 tick 走,
/// 跳过中间的 tick 等于让它不受碰撞地直飞(会穿墙),只能整体重开
const MAX_STEP_TICKS: i64 = 250;
/// 补「灯步」时的上限(一个灯步 7 tick)
const MAX_CATCH_UP: i64 = 50;

/// 服务端 `CGameContext::OnMapLoad` 会把 tuning 重置成 DDNet 那一套
/// (`shotgun_speed = 500`、`shotgun_curvature = 0`);twgame 的 `Map` 默认也是这份
/// (`Tuning::new_with_ddnet_parameters`)。地图可以自带 server command(`map.info.settings`,
/// 也就是编辑器里的 map settings)再改,`tune` 改全局、`tune_zone` 改某个 tune zone,
/// 这里按 `CTuningParams` 那套规则挑出 shotgun 的两项。
const DDNET_SHOTGUN: ShotgunTuning = ShotgunTuning {
    speed: 500.,
    curvature: 0.,
};

/// `shotgun_speed` / `shotgun_curvature`
#[derive(Clone, Copy)]
struct ShotgunTuning {
    speed: f32,
    curvature: f32,
}

/// 「移动块」(`TILE_CP` / `TILE_CP_F`),会推着 pickup / 灯 / dragger 走
const MOVER: u8 = 64;
const MOVER_FAST: u8 = 65;

/// 挡子弹的 tile(`CCollision::IsSolid`:`TILE_SOLID` / `TILE_NOHOOK`)
const BLOCK_PROJECTILE: u8 = 1;
/// 挡激光的 tile(`CCollision::IntersectNoLaser`:game 层 1/3/4、front 层的 4)
const BLOCK_LASER: u8 = 2;

// ---- 实体编号,和服务端 `mapitems.h` 的 `ENTITY_*` 一一对应 ----
const ENTITY_ARMOR_1: u8 = 6;
const ENTITY_HEALTH_1: u8 = 7;
const ENTITY_WEAPON_SHOTGUN: u8 = 8;
const ENTITY_WEAPON_GRENADE: u8 = 9;
const ENTITY_POWERUP_NINJA: u8 = 10;
const ENTITY_WEAPON_LASER: u8 = 11;
const ENTITY_LASER_FAST_CCW: u8 = 12;
const ENTITY_LASER_STOP: u8 = 15;
const ENTITY_LASER_FAST_CW: u8 = 18;
const ENTITY_LASER_SHORT: u8 = 19;
const ENTITY_LASER_LONG: u8 = 21;
const ENTITY_LASER_C_SLOW: u8 = 22;
const ENTITY_LASER_C_FAST: u8 = 24;
const ENTITY_LASER_O_SLOW: u8 = 25;
const ENTITY_LASER_O_FAST: u8 = 27;
const ENTITY_PLASMAE: u8 = 29;
const ENTITY_PLASMAF: u8 = 30;
const ENTITY_PLASMA: u8 = 31;
const ENTITY_PLASMAU: u8 = 32;
const ENTITY_CRAZY_SHOTGUN_EX: u8 = 33;
const ENTITY_CRAZY_SHOTGUN: u8 = 34;
const ENTITY_ARMOR_SHOTGUN: u8 = 35;
const ENTITY_ARMOR_GRENADE: u8 = 36;
const ENTITY_ARMOR_NINJA: u8 = 37;
const ENTITY_ARMOR_LASER: u8 = 38;
const ENTITY_DRAGGER_WEAK: u8 = 42;
const ENTITY_DRAGGER_NORMAL: u8 = 43;
const ENTITY_DRAGGER_STRONG: u8 = 44;
const ENTITY_DRAGGER_WEAK_NW: u8 = 45;
const ENTITY_DRAGGER_NORMAL_NW: u8 = 46;
const ENTITY_DRAGGER_STRONG_NW: u8 = 47;
const ENTITY_DOOR: u8 = 49;

/// 服务端 `OnEntity` 里 `aSides[]` 的顺序:下、右下、右、右上、上、左上、左、左下。
/// 下标乘以 45° 就是光束朝向(`vec2(sin, cos)`,0 指向下方)。
const SIDES: [(i32, i32); 8] = [
    (0, 1),
    (1, 1),
    (1, 0),
    (1, -1),
    (0, -1),
    (-1, -1),
    (-1, 0),
    (-1, 1),
];

/// 自己拼的精灵类型(贴图在 `gpu.rs` 里选)
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SpriteKind {
    /// 纯色方块(门的光头),贴图用 1x1 白图
    Blank,
    /// extras.png 的 `part_pulley`:dragger 的珠子
    Pulley,
    /// extras.png 的 `part_hectagon`:激光灯的光头
    Hectagon,
    /// extras.png 的 `part_snowflake`:激光灯光头中间的雪花
    Snowflake,
    /// game.png 的 `pickup_freeze`:地图里的「血包」
    PickupFreeze,
}

/// 交给渲染层的一份「自己拼」的精灵
pub struct SpriteRequest {
    pub kind: SpriteKind,
    /// 世界中点(tile)
    pub center: Vec2<f32>,
    /// 尺寸(tile),`x` 是沿旋转方向的长度,`y` 是宽度
    pub size: Vec2<f32>,
    pub rotation: f32,
    pub color: [u8; 4],
}

/// 客户端自己拼的那几种地图激光(门 / 灯 / dragger)。炮台还是走 snap —— 客户端也是画粒子
#[derive(Clone, Copy, PartialEq, Eq)]
enum BeamKind {
    Door,
    Light,
    Dragger,
}

/// 一道光束。`origin` 是服务端 snap 里的 `To`(原点,光头画这儿),`end` 是 `From`
struct Beam {
    kind: BeamKind,
    origin: Vec2<f32>,
    end: Vec2<f32>,
    /// dragger 的 `Subtype`(强度 + 穿墙位),别的类型是 0
    subtype: u8,
}

/// 地图的碰撞信息:每格一个字节,记着这格挡不挡子弹 / 挡不挡激光
struct Tiles {
    /// 位掩码,见 `BLOCK_PROJECTILE` / `BLOCK_LASER`
    flags: Vec<u8>,
    /// 地图尺寸(tile)
    size: Vec2<usize>,
    /// 「移动块」(`TILE_CP` / `TILE_CP_F`)的 id 和 flags,只有这些才需要存
    movers: HashMap<(i32, i32), (u8, u8)>,
}

impl Tiles {
    /// 这一格挡不挡。`pos` 是 **tile** 坐标。
    ///
    /// 服务端是 `IsSolid(round_to_int(Pos.x), round_to_int(Pos.y))`,里面再 `/ 32` 整数截断,
    /// 等价于 `floor(Pos.x / 32)` —— 一格覆盖 `[32k, 32k+32)`,格子中心正好落在 `k + 0.5`。
    /// 之前写成 `round(pos)` 就整体偏了半格:迎面撞墙会提前 16 unit 停下,反方向则钻进墙里
    fn blocks(&self, pos: Vec2<f32>, mask: u8) -> bool {
        if self.size.x == 0 || self.size.y == 0 {
            return false;
        }
        let x = (pos.x.floor() as i64).clamp(0, self.size.x as i64 - 1) as usize;
        let y = (pos.y.floor() as i64).clamp(0, self.size.y as i64 - 1) as usize;
        self.flags[y * self.size.x + x] & mask != 0
    }

    /// `CCollision::IntersectLine`:按 1 tile 采样,返回(撞上的采样点, 撞之前最后一个空位)
    fn intersect_line(
        &self,
        from: Vec2<f32>,
        to: Vec2<f32>,
        mask: u8,
    ) -> Option<(Vec2<f32>, Vec2<f32>)> {
        let distance = from.distance(to);
        let end = (distance + 1.) as usize;
        if end == 0 {
            return None;
        }
        let mut last = from;
        for i in 0..=end {
            let step = i as f32 / end as f32;
            let pos = from + (to - from) * step;
            if self.blocks(pos, mask) {
                return Some((pos, last));
            }
            last = pos;
        }
        None
    }

    /// `CCollision::IntersectNoLaser`:门 / 灯打到墙上为止,返回碰撞点。
    /// 服务端这里采样到 `ceil(distance)` 但不含终点(`a` 除掉的是 `distance`),照抄。
    fn intersect_no_laser(&self, from: Vec2<f32>, to: Vec2<f32>) -> Vec2<f32> {
        let distance = from.distance(to);
        if distance <= 0. {
            return to;
        }
        for i in 0..distance.ceil() as usize {
            let step = i as f32 / distance;
            let pos = from + (to - from) * step;
            // `from` / `to` 是 unit,查表要换成 tile
            if self.blocks(pos / 32., BLOCK_LASER) {
                return pos;
            }
        }
        to
    }
}

/// 地图里的实体层,加一堆「空服务器」上会出现的实体
pub struct ServerWorld {
    /// 碰撞查询用的 tile 表
    tiles: Tiles,
    snap: twsnap::Snap,
    /// 炮台:走 snap(客户端画的也是粒子),每 tick 重新打包一次
    guns: Vec<Laser>,
    /// 门这类不随时间变的光束,自己拼
    static_beams: Vec<Beam>,
    draggers: Vec<DraggerState>,
    pickups: Vec<PickupState>,
    /// 地图里有没有「移动块」(`TILE_CP` / `TILE_CP_F`),没有就整段跳过
    has_movers: bool,
    /// 激光灯:姿态每 7 tick 走一步
    lights: Vec<Light>,
    /// 已经算到第几个灯步(`tick / LIGHT_STEP_TICKS`),变了才重建
    light_step: i64,
    bullets: Vec<Bullet>,
    /// 待画的爆炸位置(tile)。服务端 `CProjectile::Tick` 撞墙(或者飞出地图)时会对 `EX`
    /// 变体调 `CreateExplosion`,客户端 `CEffects::Explosion` 就是一团粒子;这里只攒事件,
    /// 渲染层每帧取走一次
    explosions: Vec<Vec2<f32>>,
    /// 每个 tune zone 的 shotgun tuning(zone 0 就是全局)
    tunings: [ShotgunTuning; 256],
    /// tune 图层:哪些格子在哪个 zone(只有地图真的 tune 了 shotgun 才建)
    tune_zones: HashMap<(i32, i32), u8>,
    /// 现在模拟到第几个 tick
    tick: i64,
}

/// 一个 dragger。位置会随「移动块」漂移(`CDragger::Tick` 里也调 `MoverSpeed`)
struct DraggerState {
    pos: Vec2<f32>,
    core: Vec2<f32>,
    /// 服务端 `CDragger` 的 Subtype:`(IgnoreWalls ? 1 : 0) | (strength - 1) << 1`
    subtype: u8,
}

/// 一个 pickup。位置会随「移动块」漂移,所以得自己存着
struct PickupState {
    kind: Powerup,
    /// 位置(unit)
    pos: Vec2<f32>,
    /// 服务端 `m_Core`:移动块给的速度(unit / 灯步),离开移动块后还会保留
    core: Vec2<f32>,
    flags: PickupFlags,
    switch_number: u8,
    /// 服务端 `POWERUP_FREEZE`(2026-09 起地图里的「血包」),twsnap 还没这个变体 → 自己画
    freeze: bool,
}

/// 一颗 crazy shotgun 子弹当前这一段的起点(和客户端一样,按 `CalcPos` 的闭式解往前走)
struct Bullet {
    /// 出生点(unit),用来在跑出地图之后放回去
    home: Vec2<f32>,
    /// 出生时的方向
    home_dir: Vec2<f32>,
    /// 段起点,单位是 DDNet 的 unit(1 tile = 32)
    start: Vec2<f32>,
    /// 单位方向向量
    dir: Vec2<f32>,
    /// 段起点对应的 tick,反弹时重置(服务端同样会重置 `m_StartTick`)
    start_tick: i64,
    /// 服务端 `m_Bouncing`:1 反弹 x 轴,2 反弹 y 轴
    bounce: u8,
    /// 服务端 `m_Freeze` / `m_Explosive`(两个变体都是 freeze,EX 还带 explosive)
    flags: ProjectileFlags,
    /// 实体所在 switch 图层的编号
    switch_number: u8,
    /// 出生点所在 tune zone(服务端 `m_TuneZone`,snap 里要带上)
    tune_zone: u8,
    /// 出生点所在 tune zone 的 shotgun tuning(服务端创建时按 `m_TuneZone` 取一次)
    tuning: ShotgunTuning,
}

/// 一盏激光灯:角度每个灯步加一点,朝向由初始的修饰块决定。
/// 带 `C_` / `O_` 修饰块的光束长度还会来回伸缩(服务端的 `m_Speed` / `m_CurveLength`)。
struct Light {
    pos: Vec2<f32>,
    rotation: f32,
    angular_speed: f32,
    /// `m_Length`:光束最长能到多少
    length: f32,
    /// `m_CurveLength`:当前长度
    curve_length: f32,
    /// `m_Speed`:每个灯步伸缩多少,0 表示不伸缩
    speed: f32,
    /// `m_LengthL`:顶到两端之后剩下的余量
    length_l: f32,
    /// 服务端 `m_Core`:移动块给的速度(unit / 灯步)
    core: Vec2<f32>,
    /// `Step()` 算出来的光束端点(缓存着,渲染时不用每帧重算)
    end: Vec2<f32>,
    switch_number: u8,
}

impl ServerWorld {
    pub fn new(map: &twmap::TwMap) -> Self {
        let mut world = Self {
            tiles: Tiles {
                flags: Vec::new(),
                size: Vec2::new(0, 0),
                movers: HashMap::new(),
            },
            snap: twsnap::Snap::default(),
            guns: Vec::new(),
            static_beams: Vec::new(),
            draggers: Vec::new(),
            pickups: Vec::new(),
            has_movers: false,
            lights: Vec::new(),
            light_step: -1,
            bullets: Vec::new(),
            explosions: Vec::new(),
            tunings: [DDNET_SHOTGUN; 256],
            tune_zones: HashMap::new(),
            tick: 0,
        };
        world.load_tuning(map);
        world.load(map);
        world.rebuild_pickups();
        world.rebuild_guns(0);
        world.rebuild_projectiles();
        world
    }

    pub fn snap(&self) -> &twsnap::Snap {
        &self.snap
    }

    /// 取走这一帧攒下的爆炸位置(tile),渲染层拿去喂粒子系统
    pub fn take_explosions(&mut self) -> Vec<Vec2<f32>> {
        std::mem::take(&mut self.explosions)
    }

    /// 把世界推进到 `tick`(地图预览每帧喂一次时间过来)
    pub fn update(&mut self, tick: i64) {
        if tick <= self.tick {
            return;
        }
        if tick - self.tick > MAX_STEP_TICKS {
            // 跳帧了(标签页在后台 / 长时间卡顿)。子弹必须一 tick 一 tick 走,跳过中间的
            // tick 等于让它不受碰撞地直飞(会穿墙);所以直接当「服务器刚开服」:所有子弹
            // 回到出生点重新跑。灯 / pickup 只是被移动块推着走,下面照旧补步
            self.tick = tick;
            for bullet in &mut self.bullets {
                bullet.respawn(tick);
            }
        }
        while self.tick < tick {
            self.tick += 1;
            self.step_bullets(self.tick);
        }
        // 每 tick 都把子弹的 `(pos, start_tick)` 重新钉到当前位置:twgpu 是按 twgame 里
        // 那份 DDNet 默认 tuning 外推的,地图自己 tune 过 shotgun 时速度/弯曲对不上,
        // 每 tick 重新锚定能把误差压在「一 tick 的量」以内(默认 tuning 下误差是 0)。
        self.rebuild_projectiles();
        self.rebuild_guns(self.tick);
        let light_step = tick / LIGHT_STEP_TICKS;
        if light_step != self.light_step {
            // 灯在构造函数里已经 `Step()` 过一次;`light_step` 从 -1 开始时补到当前步即可
            let advance = if self.light_step < 0 {
                light_step.clamp(0, MAX_CATCH_UP)
            } else {
                (light_step - self.light_step).clamp(0, MAX_CATCH_UP)
            };
            for _ in 0..advance {
                // 顺序照服务端来:先把「移动块」的速度加上去,再算光束方向(`CLight::Tick`
                // 里就是 `MoverSpeed` → `m_Pos += m_Core` → `Step()`)。反过来的话灯的位置
                // 会先挪、端点还是按旧的算,光束就整根歪在光头旁边(半个 tile 都够明显)
                self.step_movers();
                let tiles = &self.tiles;
                for light in &mut self.lights {
                    light.step();
                    light.update_end(tiles);
                }
            }
            self.light_step = light_step;
        }
    }

    // ---- tuning ----

    /// 读地图自带的 server command + tune 图层:
    ///
    /// - `tune <param> <value>` 改全局(zone 0)
    /// - `tune_zone <zone> <param> <value>` 改某个 zone
    /// - 只认 `shotgun_speed` / `shotgun_curvature`,别的(重力、跳跃、gun_*…)对预览没影响
    fn load_tuning(&mut self, map: &twmap::TwMap) {
        let mut tuned = false;
        for line in &map.info.settings {
            let mut parts = line.split_whitespace();
            let Some(command) = parts.next() else {
                continue;
            };
            let zone = match command {
                // 注释行(`### Tune zones ###`)之类会被这里挡掉
                "tune" => 0,
                "tune_zone" => match parts.next().and_then(|zone| zone.parse::<usize>().ok()) {
                    Some(zone) if zone < self.tunings.len() => zone,
                    _ => continue,
                },
                _ => continue,
            };
            let Some(parameter) = parts.next() else {
                continue;
            };
            let Some(value) = parts.next().and_then(|value| value.parse::<f32>().ok()) else {
                continue;
            };
            let tuning = &mut self.tunings[zone];
            match parameter {
                "shotgun_speed" => tuning.speed = value,
                "shotgun_curvature" => tuning.curvature = value,
                _ => continue,
            }
            tuned = true;
        }
        if !tuned {
            return;
        }
        // 只有真的 tune 了 shotgun、而且这一区跟默认值不一样才需要记住
        if let Some(layer) = map.find_physics_layer::<twmap::TuneLayer>() {
            for ((y, x), tile) in layer.tiles.unwrap_ref().indexed_iter() {
                let zone = tile.number;
                if tile.id != 0 && self.is_tuned_zone(zone) {
                    self.tune_zones.insert((x as i32, y as i32), zone);
                }
            }
        }
    }

    fn is_tuned_zone(&self, zone: u8) -> bool {
        let tuning = self.tunings[zone as usize];
        tuning.speed != DDNET_SHOTGUN.speed || tuning.curvature != DDNET_SHOTGUN.curvature
    }

    /// 这个位置在哪个 tune zone(服务端 `CCollision::IsTune`)
    fn zone_at(&self, pos: Vec2<f32>) -> u8 {
        self.tune_zones
            .get(&((pos.x / 32.) as i32, (pos.y / 32.) as i32))
            .copied()
            .unwrap_or(0)
    }

    fn tuning_at(&self, pos: Vec2<f32>) -> ShotgunTuning {
        self.tunings[self.zone_at(pos) as usize]
    }

    // ---- 摆实体 ----

    fn load(&mut self, map: &twmap::TwMap) {
        // 先把碰撞表建出来:
        // - 子弹走 `CCollision::IntersectLine` → `IsSolid`,只认 `TILE_SOLID`(1) 和
        //   `TILE_NOHOOK`(3);DEATH(2) / NOLASER(4) 不挡子弹
        // - `IntersectNoLaser`(门 / 灯)看 game 层的 1/3/4 和 front 层的 4
        if let Some(layer) = map.find_physics_layer::<twmap::GameLayer>() {
            let tiles = layer.tiles.unwrap_ref();
            let shape = tiles.shape();
            self.tiles.size = Vec2::new(shape[1], shape[0]);
            self.tiles.flags = vec![0; shape[1] * shape[0]];
            for ((y, x), tile) in tiles.indexed_iter() {
                let id = tile.id();
                let mut flags = 0;
                if matches!(id, 1 | 3) {
                    flags |= BLOCK_PROJECTILE;
                }
                if matches!(id, 1 | 3 | 4) {
                    flags |= BLOCK_LASER;
                }
                self.tiles.flags[y * shape[1] + x] = flags;
                if id == MOVER || id == MOVER_FAST {
                    self.tiles
                        .movers
                        .insert((x as i32, y as i32), (id, tile.flags.bits()));
                    self.has_movers = true;
                }
            }
        }
        if let Some(layer) = map.find_physics_layer::<twmap::FrontLayer>() {
            for ((y, x), tile) in layer.tiles.unwrap_ref().indexed_iter() {
                if tile.id() == 4 && y * self.tiles.size.x + x < self.tiles.flags.len() {
                    self.tiles.flags[y * self.tiles.size.x + x] |= BLOCK_LASER;
                }
            }
        }

        // 服务端也是三张图层都扫一遍
        for layer in map.groups.iter().flat_map(|group| group.layers.iter()) {
            macro_rules! collect {
                ($layer:expr) => {
                    self.load_layer(
                        $layer
                            .tiles
                            .unwrap_ref()
                            .indexed_iter()
                            .filter_map(|((y, x), tile)| {
                                let id = tile.id();
                                (id >= ENTITY_OFFSET).then(|| {
                                    (
                                        (x as i32, y as i32),
                                        id - ENTITY_OFFSET,
                                        tile.flags().unwrap_or_default(),
                                        tile.switch_number(),
                                    )
                                })
                            })
                            .collect(),
                        matches!(layer, twmap::Layer::Switch(_)),
                    )
                };
            }
            match layer {
                twmap::Layer::Game(layer) => collect!(layer),
                twmap::Layer::Front(layer) => collect!(layer),
                twmap::Layer::Switch(layer) => collect!(layer),
                _ => {}
            }
        }
    }

    fn load_layer(
        &mut self,
        entries: Vec<((i32, i32), u8, twmap::TileFlags, u8)>,
        on_switch_layer: bool,
    ) {
        // 门和灯的「激光长短」是在邻居格子上,所以先把这一层的实体表建出来
        let grid: HashMap<(i32, i32), u8> = entries
            .iter()
            .map(|(coords, index, ..)| (*coords, *index))
            .collect();
        for ((x, y), index, flags, switch_number) in entries {
            self.add_entity((x, y), index, flags, switch_number, &grid, on_switch_layer);
        }
    }

    fn add_entity(
        &mut self,
        (x, y): (i32, i32),
        index: u8,
        flags: twmap::TileFlags,
        switch_number: u8,
        grid: &HashMap<(i32, i32), u8>,
        on_switch_layer: bool,
    ) {
        // 服务端 `OnEntity` 的坐标永远是格子中心
        let pos = Vec2::new(x as f32 * 32. + 16., y as f32 * 32. + 16.);

        let powerup = match index {
            ENTITY_ARMOR_1 => Some(Powerup::Armor),
            // 服务端这里是 POWERUP_FREEZE(DDNet 的「血包」= 冻住),twsnap 没有这个变体,
            // 用血包的样子画
            ENTITY_HEALTH_1 => Some(Powerup::Health),
            ENTITY_WEAPON_SHOTGUN => Some(Powerup::Weapon(CollectableWeapon::Shotgun)),
            ENTITY_WEAPON_GRENADE => Some(Powerup::Weapon(CollectableWeapon::Grenade)),
            ENTITY_POWERUP_NINJA => Some(Powerup::Weapon(CollectableWeapon::Ninja)),
            ENTITY_WEAPON_LASER => Some(Powerup::Weapon(CollectableWeapon::Rifle)),
            ENTITY_ARMOR_SHOTGUN => Some(Powerup::Shield(CollectableWeapon::Shotgun)),
            ENTITY_ARMOR_GRENADE => Some(Powerup::Shield(CollectableWeapon::Grenade)),
            ENTITY_ARMOR_NINJA => Some(Powerup::Shield(CollectableWeapon::Ninja)),
            ENTITY_ARMOR_LASER => Some(Powerup::Shield(CollectableWeapon::Rifle)),
            _ => None,
        };
        if let Some(kind) = powerup {
            let mut pickup_flags = PickupFlags::empty();
            if flags.contains(twmap::TileFlags::FLIP_X) {
                pickup_flags |= PickupFlags::XFLIP;
            }
            if flags.contains(twmap::TileFlags::FLIP_Y) {
                pickup_flags |= PickupFlags::YFLIP;
            }
            if flags.contains(twmap::TileFlags::ROTATE) {
                pickup_flags |= PickupFlags::ROTATE;
            }
            self.pickups.push(PickupState {
                kind,
                pos,
                core: Vec2::new(0., 0.),
                flags: pickup_flags,
                switch_number,
                freeze: index == ENTITY_HEALTH_1,
            });
            return;
        }

        match index {
            ENTITY_PLASMAE..=ENTITY_PLASMAU => {
                let gun_type = match index {
                    ENTITY_PLASMAE => LaserGunType::Explosive,
                    ENTITY_PLASMAF => LaserGunType::Freeze,
                    ENTITY_PLASMA => LaserGunType::Expfreeze,
                    _ => LaserGunType::Unfreeze,
                };
                // 炮台就是一根 from == to 的 gun 激光,客户端在头上画会转的粒子 → 还是走 snap
                self.guns.push(Laser {
                    from: twsnap::vec2_from_bits(pos),
                    to: twsnap::vec2_from_bits(pos),
                    start_tick: Instant::from_snap_tick(0),
                    owner: None,
                    kind: LaserType::Gun(gun_type),
                    switch_number,
                    flags: LaserFlags::empty(),
                });
            }
            ENTITY_CRAZY_SHOTGUN_EX | ENTITY_CRAZY_SHOTGUN => {
                // 服务端按 tile flags 定初始方向,`2 - (dir % 2)` 定反弹哪个轴
                let direction = match flags.bits() {
                    0 => 0,
                    8 => 1,
                    3 => 2,
                    _ => 3,
                };
                let angle = direction as f32 * PI / 2.;
                let dir = Vec2::new(angle.sin(), angle.cos());
                // 两种 crazy shotgun 都是 `Freeze = true`,EX 的 `Explosive` 也是 true
                // `CProjectile::NetInfo` 打包:`m_Bouncing` 的位直接变成 BOUNCE_* 标记
                let mut bullet_flags = ProjectileFlags::FREEZE;
                if index == ENTITY_CRAZY_SHOTGUN_EX {
                    bullet_flags |= ProjectileFlags::EXPLOSIVE;
                }
                let bounce = 2 - (direction % 2);
                if bounce & 1 != 0 {
                    bullet_flags |= ProjectileFlags::BOUNCE_HORIZONTAL;
                }
                if bounce & 2 != 0 {
                    bullet_flags |= ProjectileFlags::BOUNCE_VERTICAL;
                }
                self.bullets.push(Bullet {
                    home: pos,
                    home_dir: dir,
                    start: pos,
                    dir,
                    start_tick: 0,
                    bounce,
                    flags: bullet_flags,
                    switch_number,
                    tune_zone: self.zone_at(pos),
                    tuning: self.tuning_at(pos),
                });
            }
            ENTITY_DRAGGER_WEAK..=ENTITY_DRAGGER_STRONG_NW => {
                // 空闲状态的 dragger 就是一根 from == to 的 dragger 激光,抓住人之后才换成
                // `CDraggerBeam`;空服务器上只有前者
                let dragger_type = match index {
                    ENTITY_DRAGGER_WEAK => LaserDraggerType::Weak,
                    ENTITY_DRAGGER_NORMAL => LaserDraggerType::Normal,
                    ENTITY_DRAGGER_STRONG => LaserDraggerType::Strong,
                    ENTITY_DRAGGER_WEAK_NW => LaserDraggerType::WeakNw,
                    ENTITY_DRAGGER_NORMAL_NW => LaserDraggerType::NormalNw,
                    _ => LaserDraggerType::StrongNw,
                };
                // 服务端 `Subtype = (IgnoreWalls ? 1 : 0) | (strength - 1) << 1`
                let strength = match dragger_type {
                    LaserDraggerType::Weak | LaserDraggerType::WeakNw => 0,
                    LaserDraggerType::Normal | LaserDraggerType::NormalNw => 1,
                    _ => 2,
                };
                let ignore_walls = matches!(
                    dragger_type,
                    LaserDraggerType::WeakNw
                        | LaserDraggerType::NormalNw
                        | LaserDraggerType::StrongNw
                );
                self.draggers.push(DraggerState {
                    pos,
                    core: Vec2::new(0., 0.),
                    subtype: (ignore_walls as u8) | (strength << 1),
                });
            }
            ENTITY_DOOR => {
                // 一个门上可能贴着好几块修饰块,服务端是每个方向各建一道
                for (side, length) in laser_modifiers(grid, x, y) {
                    let angle = side as f32 * PI / 4.;
                    let dir = Vec2::new(angle.sin(), angle.cos());
                    let end = self.tiles.intersect_no_laser(pos, pos + dir * length);
                    // 服务端 `SnapLaserObject(..., To = m_Pos, From = m_To, ...)`:
                    // 「原点」放在 `To` 里,客户端把光头画在 `To`
                    self.static_beams.push(Beam {
                        kind: BeamKind::Door,
                        origin: pos,
                        end,
                        subtype: 0,
                    });
                }
            }
            ENTITY_LASER_FAST_CCW..=ENTITY_LASER_FAST_CW => {
                // `CLight::Snap` 里,switch 图层上带编号的灯只有在「有玩家角色且开关是开的」
                // 时才给 From = m_To;没有玩家(旁观空服)时 From = m_Pos,也就是看不见
                if on_switch_layer && switch_number > 0 {
                    return;
                }
                for (side, length) in laser_modifiers(grid, x, y) {
                    // 服务端:离开「停止」越远转得越快,逆时针为正、顺时针为负
                    let offset = index as i32 - ENTITY_LASER_STOP as i32;
                    let angular_speed = match offset.abs() {
                        1 => PI / 360.,
                        2 => PI / 180.,
                        3 => PI / 90.,
                        _ => 0.,
                    };
                    let angular_speed = if offset < 0 {
                        angular_speed
                    } else if offset > 0 {
                        -angular_speed
                    } else {
                        0.
                    };
                    // 两格外的修饰块控制长度伸缩:C_ 从整条开始缩,O_ 从 0 开始长
                    let (dx, dy) = SIDES[side];
                    let (speed, curve_length) = match grid.get(&(x + dx * 2, y + dy * 2)) {
                        Some(value @ ENTITY_LASER_C_SLOW..=ENTITY_LASER_C_FAST) => {
                            (1. + (value - ENTITY_LASER_C_SLOW) as f32 * 2., length)
                        }
                        Some(value @ ENTITY_LASER_O_SLOW..=ENTITY_LASER_O_FAST) => {
                            (1. + (value - ENTITY_LASER_O_SLOW) as f32 * 2., 0.)
                        }
                        _ => (0., length),
                    };
                    let mut light = Light::new(
                        pos,
                        side,
                        angular_speed,
                        length,
                        speed,
                        curve_length,
                        switch_number,
                    );
                    light.update_end(&self.tiles);
                    self.lights.push(light);
                }
            }
            _ => {}
        }
    }

    /// 交给渲染层的「自己拼」的精灵:地图激光(光束 + 光头)和血包。
    /// `time` 是播放时间(秒),和客户端 `GameTick + IntraTick` 对得上。
    pub fn extra_sprites(&self, time: f32) -> Vec<SpriteRequest> {
        let mut sprites = Vec::new();
        let tick = time * 50.;

        // `CItems::RenderPickup`:所有 pickup 都在绕小圈飘
        for pickup in &self.pickups {
            if !pickup.freeze {
                continue;
            }
            let base = pickup.pos / 32.;
            let phase = base.x + base.y + time * 2.;
            sprites.push(SpriteRequest {
                kind: SpriteKind::PickupFreeze,
                center: base + Vec2::new(phase.cos(), phase.sin()) * (2.5 / 32.),
                // 客户端:64 * 2/√8 = 45.25 unit
                size: Vec2::new(45.254_834 / 32., 45.254_834 / 32.),
                rotation: 0.,
                color: [255, 255, 255, 255],
            });
        }

        for beam in &self.static_beams {
            beam_sprites(&mut sprites, beam, tick);
        }
        for light in &self.lights {
            beam_sprites(&mut sprites, &light.beam(), tick);
        }
        for dragger in &self.draggers {
            let beam = Beam {
                kind: BeamKind::Dragger,
                origin: dragger.pos,
                end: dragger.pos,
                subtype: dragger.subtype,
            };
            beam_sprites(&mut sprites, &beam, tick);
        }

        sprites
    }

    // ---- 每帧推进 ----

    /// 推进子弹一个 tick
    fn step_bullets(&mut self, tick: i64) {
        let tiles = &self.tiles;
        let explosions = &mut self.explosions;
        for bullet in &mut self.bullets {
            let current = bullet.pos_at(tick);
            if bullet.is_outside(current, tiles.size) {
                // 服务端这时候 `GameLayerClipped` 只放一朵爆炸(`EX` 变体),子弹本身不销毁
                // (`m_Freeze` 的会一直往外飞);预览里看不到那么远的东西,所以送回出生点重跑
                if bullet.explosive() {
                    explosions.push(current);
                }
                bullet.respawn(tick);
                continue;
            }
            let previous = bullet.pos_at(tick - 1);
            // 服务端用 `IntersectLine` 同时拿到碰撞点和「撞之前最后一个空位」,反弹时用的是后者
            if let Some((at, last)) = tiles.intersect_line(previous, current, BLOCK_PROJECTILE) {
                bullet.bounce(last, tick);
                // `CreateExplosion(ColPos, ...)`:位置就是撞上的那个采样点
                if bullet.explosive() {
                    explosions.push(at);
                }
            }
        }
        // 卡在墙里的子弹每 tick 都会「撞」一次,别让队列无限长
        if explosions.len() > 64 {
            let extra = explosions.len() - 64;
            explosions.drain(..extra);
        }
    }

    fn rebuild_projectiles(&mut self) {
        self.snap.map_projectiles.clear();
        let tick = self.tick;
        for (id, bullet) in self.bullets.iter().enumerate() {
            self.snap.map_projectiles.insert(
                SnapId(id as u32),
                MapProjectile {
                    pos: twsnap::vec2_from_bits(bullet.pos_at(tick) * 32.),
                    // 服务端给免费子弹发的是 …×1e6 的真实速度,客户端自己归一化
                    direction: Vec2::new((bullet.dir.x * 1e6) as i32, (bullet.dir.y * 1e6) as i32),
                    kind: ActiveWeapon::Shotgun,
                    start_tick: Instant::from_snap_tick(tick as i32),
                    switch_number: bullet.switch_number,
                    tune_zone: bullet.tune_zone,
                    flags: bullet.flags,
                },
            );
        }
    }

    fn rebuild_pickups(&mut self) {
        self.snap.pickups.clear();
        let mut id = 0;
        for pickup in &self.pickups {
            if pickup.freeze {
                continue;
            }
            self.snap.pickups.insert(
                SnapId(id),
                Pickup {
                    pos: twsnap::vec2_from_bits(pickup.pos),
                    kind: pickup.kind,
                    switch_number: pickup.switch_number,
                    flags: pickup.flags,
                },
            );
            id += 1;
        }
    }

    /// 服务端每个「灯步」(0.15s)对 pickup / 灯 / dragger 调一次 `MoverSpeed`:站在
    /// `TILE_CP` / `TILE_CP_F` 上就会被推着走,离开之后速度还会保留(和 `m_Core` 一样)
    fn step_movers(&mut self) {
        if !self.has_movers {
            return;
        }
        let movers = &self.tiles.movers;
        for pickup in &mut self.pickups {
            mover_speed(movers, pickup.pos, &mut pickup.core);
            pickup.pos += pickup.core;
        }
        for light in &mut self.lights {
            mover_speed(movers, light.pos, &mut light.core);
            light.pos += light.core;
        }
        for dragger in &mut self.draggers {
            mover_speed(movers, dragger.pos, &mut dragger.core);
            dragger.pos += dragger.core;
        }
        self.rebuild_pickups();
    }

    /// 炮台(`LASERTYPE_GUN`)的 `StartTick`:客户端在自己算出来的 `(GameTick / 7) * 7`
    /// 上让光束/粒子按 7 tick 一个节拍闪,这里跟着重新打包
    fn rebuild_guns(&mut self, tick: i64) {
        self.snap.lasers.clear();
        let start_tick = ((tick / LIGHT_STEP_TICKS) * LIGHT_STEP_TICKS) as i32;
        for (id, gun) in self.guns.iter().enumerate() {
            let mut laser = gun.clone();
            laser.start_tick = Instant::from_snap_tick(start_tick);
            self.snap.lasers.insert(SnapId(id as u32), laser);
        }
    }
}

impl Bullet {
    /// 当前位置(tile 坐标),和服务端 `CProjectile::GetPos` 是同一个公式
    fn pos_at(&self, tick: i64) -> Vec2<f32> {
        let time = (tick - self.start_tick) as f32 * TICK_SECONDS * self.tuning.speed;
        Vec2::new(
            self.start.x + self.dir.x * time,
            self.start.y + self.dir.y * time + self.tuning.curvature / 10_000. * time * time,
        ) / 32.
    }

    /// 撞墙了:照服务端 `CProjectile::Tick` 的反弹分支来(服务端没有别的兜底)
    fn bounce(&mut self, last_air: Vec2<f32>, tick: i64) {
        let hit = last_air * 32.;
        let mut dir = self.dir;
        if self.bounce == 1 {
            dir.x = -dir.x;
        } else {
            dir.y = -dir.y;
        }
        // `m_Pos = NewPos - m_Direction * 4`,翻转完再 `m_Pos += m_Direction`(新的方向)
        self.start = hit - self.dir * 4. + dir;
        self.dir = dir;
        self.start_tick = tick;
    }

    /// 服务端 `m_Explosive`:`ENTITY_CRAZY_SHOTGUN_EX` 才有,撞墙 / 出界会炸一朵
    fn explosive(&self) -> bool {
        self.flags.contains(ProjectileFlags::EXPLOSIVE)
    }

    /// 跑出地图了没(服务端的 `GameLayerClipped`)
    fn is_outside(&self, pos: Vec2<f32>, size: Vec2<usize>) -> bool {
        pos.x < 0. || pos.y < 0. || pos.x > size.x as f32 || pos.y > size.y as f32
    }

    /// 回到出生点重新开始
    fn respawn(&mut self, tick: i64) {
        self.start = self.home;
        self.dir = self.home_dir;
        self.start_tick = tick;
    }
}

impl Light {
    #[allow(clippy::too_many_arguments)]
    fn new(
        pos: Vec2<f32>,
        side: usize,
        angular_speed: f32,
        length: f32,
        speed: f32,
        curve_length: f32,
        switch_number: u8,
    ) -> Self {
        let mut light = Self {
            pos,
            rotation: side as f32 * PI / 4.,
            angular_speed,
            length,
            curve_length,
            speed,
            length_l: 0.,
            core: Vec2::new(0., 0.),
            end: pos,
            switch_number,
        };
        // 服务端的构造函数结尾就是 `Step()`
        light.step();
        light
    }

    /// `CLight::Move()`:长度伸缩 + 旋转
    fn step(&mut self) {
        if self.speed != 0. {
            if (self.curve_length >= self.length && self.speed > 0.)
                || (self.curve_length <= 0. && self.speed < 0.)
            {
                self.speed = -self.speed;
            }
            self.curve_length += self.speed * LIGHT_STEP_TIME + self.length_l;
            self.length_l = 0.;
            if self.curve_length > self.length {
                self.length_l = self.curve_length - self.length;
                self.curve_length = self.length;
            } else if self.curve_length < 0. {
                self.length_l = self.curve_length;
                self.curve_length = 0.;
            }
        }
        self.rotation += self.angular_speed * LIGHT_STEP_TIME;
        if self.rotation > PI * 2. {
            self.rotation -= PI * 2.;
        } else if self.rotation < 0. {
            self.rotation += PI * 2.;
        }
    }

    /// `CLight::Step()`:算出光束打到哪儿
    fn update_end(&mut self, tiles: &Tiles) {
        let dir = Vec2::new(self.rotation.sin(), self.rotation.cos());
        self.end = tiles.intersect_no_laser(self.pos, self.pos + dir * self.curve_length);
    }

    fn beam(&self) -> Beam {
        Beam {
            kind: BeamKind::Light,
            origin: self.pos,
            end: self.end,
            subtype: 0,
        }
    }
}

/// 客户端 `CItems::RenderLaser` 里三种地图激光的配色(DDNet 的 `cl_laser_*` 默认值,
/// 配置里是 HSLA 打包的整数,这里已经换成 RGB)
fn laser_colors(kind: BeamKind) -> ([u8; 4], [u8; 4]) {
    match kind {
        BeamKind::Door => ([0, 34, 25, 255], [67, 195, 163, 255]),
        // `cl_laser_dragger_*` 默认是红的(twgpu 那边借用了门的青色)
        BeamKind::Dragger => ([34, 2, 2, 255], [221, 95, 95, 255]),
        BeamKind::Light => ([34, 31, 47, 255], [123, 114, 144, 255]),
    }
}

/// 扫实体层的时候两种 tile 只差一个 switch 编号
trait EntityTile: twmap::AnyTile + Copy {
    fn switch_number(&self) -> u8 {
        0
    }
}

impl EntityTile for twmap::GameTile {}

impl EntityTile for twmap::Switch {
    fn switch_number(&self) -> u8 {
        self.number
    }
}

/// 门 / 灯的方向和长度都写在邻居格子的「laser 长短」修饰块上
fn laser_modifiers(grid: &HashMap<(i32, i32), u8>, x: i32, y: i32) -> Vec<(usize, f32)> {
    SIDES
        .iter()
        .enumerate()
        .filter_map(|(side, (dx, dy))| {
            let modifier = *grid.get(&(x + dx, y + dy))?;
            if !(ENTITY_LASER_SHORT..=ENTITY_LASER_LONG).contains(&modifier) {
                return None;
            }
            // 短 / 中 / 长 = 96 / 192 / 288 unit
            let length = 32. * 3. + 32. * (modifier - ENTITY_LASER_SHORT) as f32 * 3.;
            Some((side, length))
        })
        .collect()
}

/// `CCollision::MoverSpeed`:站在 `TILE_CP` / `TILE_CP_F` 上就按 tile 的旋转方向推
fn mover_speed(movers: &HashMap<(i32, i32), (u8, u8)>, pos: Vec2<f32>, core: &mut Vec2<f32>) {
    let coords = ((pos.x / 32.) as i32, (pos.y / 32.) as i32);
    let Some(&(id, flags)) = movers.get(&coords) else {
        return;
    };
    // 只有 `ROTATION_0/90/180/270` 四种会动,别的组合(带 OPAQUE 之类)服务端给 (0, 0)
    let target = match flags {
        0 => Vec2::new(0., -4.),
        8 => Vec2::new(4., 0.),
        3 => Vec2::new(0., 4.),
        11 => Vec2::new(-4., 0.),
        _ => Vec2::new(0., 0.),
    };
    *core = if id == MOVER_FAST {
        target * 4.
    } else {
        target
    };
}

/// `CItems::RenderLaser`:一道光束 + 对应的光头
fn beam_sprites(out: &mut Vec<SpriteRequest>, beam: &Beam, tick: f32) {
    // 客户端给每种地图激光算的 `TicksBody`:门固定 1(不闪),灯 / dragger 用
    // `DraggerStartTick = max((tick/7)*7, tick-4)`,7 tick 一个节拍
    let ticks_body = match beam.kind {
        BeamKind::Door => 1.,
        BeamKind::Light | BeamKind::Dragger => {
            let start_tick =
                ((tick / LIGHT_STEP_TICKS as f32).floor() * LIGHT_STEP_TICKS as f32).max(tick - 4.);
            tick - start_tick
        }
    };
    // `RenderLaser`:光束随「年龄」变细(`Ms = TicksBody * 20`,`a = Ms / 150`)
    let age = (ticks_body * 20. / 150.).clamp(0., 1.);
    let thin = 1. - age;
    let (outer, inner) = laser_colors(beam.kind);

    let delta = beam.end - beam.origin;
    let len = delta.magnitude() / 32.;
    if len > 0. {
        let rotation = delta.y.atan2(delta.x);
        let center = (beam.origin + beam.end) / 2. / 32.;
        out.push(SpriteRequest {
            kind: SpriteKind::Blank,
            center,
            size: Vec2::new(len, 14. * thin / 32.),
            rotation,
            color: outer,
        });
        out.push(SpriteRequest {
            kind: SpriteKind::Blank,
            center,
            size: Vec2::new(len, 10. * thin / 32.),
            rotation,
            color: inner,
        });
    }

    let origin = beam.origin / 32.;
    let ticks_head = tick;
    match beam.kind {
        // 16x16 外框 + 12x12 内芯,纯色方块
        BeamKind::Door => {
            out.push(SpriteRequest {
                kind: SpriteKind::Blank,
                center: origin,
                size: Vec2::new(16. / 32., 16. / 32.),
                rotation: 0.,
                color: outer,
            });
            out.push(SpriteRequest {
                kind: SpriteKind::Blank,
                center: origin,
                size: Vec2::new(12. / 32., 12. / 32.),
                rotation: 0.,
                color: inner,
            });
        }
        // hectagon(外色)+ snowflake(白色),跟着光束方向转,还会「呼吸」
        BeamKind::Light => {
            let pulsation = 6. / 5. + 1. / 10. * (ticks_head / 2.).sin();
            let rotation = (beam.origin - beam.end).y.atan2((beam.origin - beam.end).x);
            let size = 14.142_136 / 32.;
            out.push(SpriteRequest {
                kind: SpriteKind::Hectagon,
                center: origin,
                size: Vec2::new(size * 6. / 5. * pulsation, size * 6. / 5. * pulsation),
                rotation,
                color: outer,
            });
            out.push(SpriteRequest {
                kind: SpriteKind::Snowflake,
                center: origin,
                size: Vec2::new(size * pulsation, size * pulsation),
                rotation,
                color: [255, 255, 255, 255],
            });
        }
        // 滑轮:内/外两层各 3 颗珠子绕着转
        BeamKind::Dragger => {
            let strength = (beam.subtype >> 1) % 3;
            let mut ticks_head = ticks_head * (strength as f32 * 4. + 1.);
            if beam.subtype & 1 != 0 {
                ticks_head = -ticks_head;
            }
            let size = 14.142_136 / 32.;
            for inner_layer in 0..2 {
                let scale = if inner_layer == 1 { 0.75 - 0.2 } else { 0.75 };
                let color = if inner_layer == 1 { inner } else { outer };
                for orb in 0..3 {
                    // 位置用 `rotate()`,它按 **角度** 算(`Orb * 120` = 三颗均分);
                    // 下面那颗珠子的自转用 `QuadsSetRotation()`,是 **弧度**,客户端这两处
                    // 都直接拿了 `TicksHead`,照抄
                    let offset_angle = (orb as f32 * 120. + ticks_head) * PI / 180.;
                    let offset = Vec2::new(offset_angle.cos(), offset_angle.sin()) * (10. / 32.);
                    out.push(SpriteRequest {
                        kind: SpriteKind::Pulley,
                        center: origin + offset,
                        size: Vec2::new(size * scale, size * scale),
                        rotation: ticks_head + orb as f32 * PI * 2. / 3.,
                        color,
                    });
                }
            }
        }
    }
}
