//! `.demo` 读取 + 播放。
//!
//! 相比 twgpu-tools 里那份 `DemoDemo`,这里多做一件事:把 message chunk 里的
//! `Sv_SoundGlobal` / `Sv_MapSoundGlobal` 也解析出来(libtw2 已经把消息解成了具体类型),
//! 和 snapshot 里的 net event 一起塞进共享的 `Sink`,由 JS 每帧取走播放。
//!
//! 播放/跳转本身的时钟、关键帧、死推(dead reckoning)都交给 `twgpu_tools::DemoProcessor`,
//! 我们只实现 `DemoLike`,免得自己重写一遍 tick 逻辑。

#[cfg(target_arch = "wasm32")]
use crate::map::TwMap;
use crate::sound::{self, SoundEvent};
use crate::error;
use libtw2_demo::{ddnet, ChunkType};
use libtw2_gamenet_ddnet::{msg, Protocol as DDNet};
use libtw2_warn::Ignore;
use std::cell::RefCell;
use std::error::Error;
use std::io;
use std::rc::Rc;
use twgpu::fixed::traits::FromFixed;
use twgpu::sprites::Particles;
use twgpu::vek;
use twgpu_tools::{DemoChunk, DemoLike, DemoProcessor};
use wasm_bindgen::prelude::*;

/// demo 里攒下来的待播声音,reader 写、`TwDemo` 读。
struct Sink {
    events: Vec<SoundEvent>,
    /// 跳转期间关掉,否则拖一下进度条会瞬间放出几十秒的声音
    armed: bool,
}

#[derive(Clone)]
pub(crate) struct SoundSink(Rc<RefCell<Sink>>);

impl SoundSink {
    fn new() -> Self {
        Self(Rc::new(RefCell::new(Sink {
            events: Vec::new(),
            armed: true,
        })))
    }
    fn push(&self, events: impl IntoIterator<Item = Option<SoundEvent>>) {
        let mut sink = self.0.borrow_mut();
        if !sink.armed {
            return;
        }
        for event in events.into_iter().flatten() {
            sink.events.push(event);
        }
    }
    fn set_armed(&self, armed: bool) {
        self.0.borrow_mut().armed = armed;
    }
    fn take(&self) -> Vec<SoundEvent> {
        std::mem::take(&mut self.0.borrow_mut().events)
    }
    fn clear(&self) {
        self.0.borrow_mut().events.clear();
    }
}

#[derive(Clone, Copy, PartialEq)]
enum SeekSnap {
    Zero,
    One,
    Two,
}

impl SeekSnap {
    fn inc(self) -> SeekSnap {
        match self {
            SeekSnap::Zero => SeekSnap::One,
            SeekSnap::One | SeekSnap::Two => SeekSnap::Two,
        }
    }
    fn dec(self) -> SeekSnap {
        match self {
            SeekSnap::Zero | SeekSnap::One => SeekSnap::Zero,
            SeekSnap::Two => SeekSnap::One,
        }
    }
}

#[derive(Default)]
struct BufferedSnap {
    tick: i32,
    snap: twsnap::Snap,
    keyframe_position: Option<u64>,
}

/// twsnap 0.10 之前只能手动克隆(TODO 与 twgpu-tools 里一样)
fn clone_snap(snap: &twsnap::Snap) -> twsnap::Snap {
    twsnap::Snap {
        game_infos: snap.game_infos.clone(),
        lasers: snap.lasers.clone(),
        map_projectiles: snap.map_projectiles.clone(),
        pickups: snap.pickups.clone(),
        players: snap.players.clone(),
        projectiles: snap.projectiles.clone(),
        pvp_flags: snap.pvp_flags.clone(),
        events: snap.events.clone(),
    }
}

#[derive(Default)]
struct Keyframes(Vec<(i32, u64)>);

impl Keyframes {
    fn insert(&mut self, tick: i32, position: u64) {
        if let Err(index) = self.0.binary_search_by_key(&tick, |a| a.0) {
            self.0.insert(index, (tick, position));
        }
    }
    fn look_for_tick(&mut self, tick: i32) -> Result<(i32, u64), ()> {
        match self.0.binary_search_by_key(&tick, |a| a.0) {
            Ok(index) => Ok(self.0[index]),
            Err(0) => Err(()),
            Err(higher_index) => Ok(self.0[higher_index - 1]),
        }
    }
}

/// 一个 chunk 的读取结果,和 twgpu-tools 的 `ddnet::DemoChunk` 同形,
/// 但读取路径换成我们自己写的(为了拿到消息字节)。
enum RawChunk {
    Tick {
        tick: twsnap::time::Instant,
        keyframe: bool,
        snapshot: bool,
    },
    Message,
    End,
}

struct Reader {
    inner: ddnet::DemoReader<'static, DDNet>,
}

impl Reader {
    fn new(data: Vec<u8>) -> Result<Self, Box<dyn Error>> {
        let cursor = io::Cursor::new(data);
        let inner = ddnet::DemoReader::new(cursor, &mut Ignore)?;
        Ok(Self { inner })
    }

    fn stream_position(&mut self) -> Result<u64, Box<dyn Error>> {
        Ok(self.inner.stream_position()?)
    }
    fn seek(&mut self, position: u64) -> Result<(), Box<dyn Error>> {
        Ok(self.inner.seek(position)?)
    }

    fn next_chunk(
        &mut self,
        snap: &mut twsnap::Snap,
        sink: &SoundSink,
    ) -> Result<RawChunk, Box<dyn Error>> {
        loop {
            match self.inner.next_chunk(&mut Ignore)? {
                None => return Ok(RawChunk::End),
                Some(ddnet::Chunk::Tick { tick, keyframe }) => {
                    let tick = twsnap::time::Instant::from_snap_tick(tick);
                    let has_snapshot = self.inner.next_chunk_type()? == Some(ChunkType::Snapshot);
                    if !has_snapshot {
                        return Ok(RawChunk::Tick {
                            tick,
                            keyframe,
                            snapshot: false,
                        });
                    }
                    let Some(ddnet::Chunk::Snapshot(items)) = self.inner.next_chunk(&mut Ignore)?
                    else {
                        return Err("demo: snapshot flagged but not read".into());
                    };
                    snap.process_next(items);
                    // snapshot 里的 net event 就是把声音发下来的地方
                    let mut events = Vec::new();
                    sound::from_snap_events(&snap.events, &mut events);
                    sink.push(events.into_iter().map(Some));
                    return Ok(RawChunk::Tick {
                        tick,
                        keyframe,
                        snapshot: true,
                    });
                }
                Some(ddnet::Chunk::Snapshot(_)) => {
                    return Err("demo: snapshot without a tick in front".into())
                }
                Some(ddnet::Chunk::Message(message)) => {
                    // 客户端用 PlayAndRecord 录进 demo 的声音(自己那声跳/钩子、CTF 提示音)
                    match message {
                        msg::Game::SvSoundGlobal(m) => {
                            sink.push([SoundEvent::global(m.sound_id.to_i32())]);
                        }
                        // 地图自带音源(sound layer)的全局播放
                        msg::Game::SvMapSoundGlobal(_) => {
                            // TODO: 需要地图的 sound 列表才能把 id 变成文件
                        }
                        _ => {}
                    }
                    return Ok(RawChunk::Message);
                }
                Some(ddnet::Chunk::Invalid) => continue,
            }
        }
    }
}

/// 真正实现 `DemoLike` 的那一层:只管按 chunk 推进、跳转和关键帧缓存。
struct DemoFile {
    reader: Reader,
    keyframes: Keyframes,
    starting_position: u64,
    seek_snap1: BufferedSnap,
    seek_snap2: BufferedSnap,
    seeked: SeekSnap,
    sink: SoundSink,
}

impl BufferedSnap {
    fn fill_from_demo(
        &mut self,
        reader: &mut Reader,
        sink: &SoundSink,
        prev: &twsnap::Snap,
    ) -> Result<Option<bool>, Box<dyn Error>> {
        loop {
            let position = reader.stream_position()?;
            match reader.next_chunk(&mut self.snap, sink)? {
                RawChunk::Tick {
                    tick,
                    keyframe,
                    snapshot,
                } => {
                    self.tick = tick.snap_tick();
                    self.keyframe_position = keyframe.then_some(position);
                    if !snapshot {
                        self.snap = clone_snap(prev);
                    }
                    return Ok(Some(keyframe));
                }
                RawChunk::Message => continue,
                RawChunk::End => return Ok(None),
            }
        }
    }
    fn drain(&mut self, snap: &mut twsnap::Snap) -> DemoChunk {
        std::mem::swap(&mut self.snap, snap);
        self.snap.clear();
        DemoChunk::Snapshot(twsnap::time::Instant::from_snap_tick(self.tick))
    }
}

impl DemoLike for DemoFile {
    fn next_chunk(
        &mut self,
        snap: &mut twsnap::Snap,
        prev: &twsnap::Snap,
    ) -> Result<Option<DemoChunk>, Box<dyn Error>> {
        match self.seeked {
            SeekSnap::Zero => loop {
                let position = self.reader.stream_position()?;
                match self.reader.next_chunk(snap, &self.sink)? {
                    RawChunk::End => return Ok(None),
                    RawChunk::Message => return Ok(Some(DemoChunk::Message)),
                    RawChunk::Tick {
                        tick,
                        keyframe,
                        snapshot,
                    } => {
                        if keyframe {
                            self.keyframes.insert(tick.snap_tick(), position);
                        }
                        if !snapshot {
                            *snap = clone_snap(prev);
                        }
                        return Ok(Some(DemoChunk::Snapshot(tick)));
                    }
                }
            },
            SeekSnap::One | SeekSnap::Two => {
                let chunk = self.seek_snap1.drain(snap);
                std::mem::swap(&mut self.seek_snap1, &mut self.seek_snap2);
                self.seeked = self.seeked.dec();
                Ok(Some(chunk))
            }
        }
    }

    fn skip_forward(
        &mut self,
        tick: i32,
        prev: &twsnap::Snap,
    ) -> Result<Option<i32>, Box<dyn Error>> {
        loop {
            match self.seeked {
                SeekSnap::Zero => {}
                SeekSnap::One => {
                    if self.seek_snap1.tick > tick {
                        return Ok(None);
                    }
                    if self.seek_snap1.tick == tick {
                        return Ok(Some(tick));
                    }
                }
                SeekSnap::Two => {
                    if self.seek_snap1.tick > tick {
                        return Ok(None);
                    }
                    if self.seek_snap1.tick == tick
                        || self.seek_snap1.tick < tick && self.seek_snap2.tick > tick
                    {
                        return Ok(Some(self.seek_snap1.tick));
                    }
                }
            }
            let (snap, prev_snap) = match self.seeked {
                SeekSnap::Zero => (&mut self.seek_snap1, prev),
                SeekSnap::One => (&mut self.seek_snap2, &self.seek_snap1.snap),
                SeekSnap::Two => (&mut self.seek_snap1, &self.seek_snap2.snap),
            };
            let Some(_) = snap.fill_from_demo(&mut self.reader, &self.sink, prev_snap)? else {
                return match self.seeked {
                    SeekSnap::Zero => Ok(None),
                    SeekSnap::One => Ok(Some(self.seek_snap1.tick)),
                    SeekSnap::Two => {
                        self.seeked = SeekSnap::One;
                        std::mem::swap(&mut self.seek_snap1, &mut self.seek_snap2);
                        Ok(Some(self.seek_snap1.tick))
                    }
                };
            };
            if let Some(position) = snap.keyframe_position {
                self.keyframes.insert(snap.tick, position);
            }
            if self.seeked == SeekSnap::Two {
                std::mem::swap(&mut self.seek_snap1, &mut self.seek_snap2);
            }
            self.seeked = self.seeked.inc();
        }
    }

    fn seek(&mut self, tick: i32) -> Result<Option<i32>, Box<dyn Error>> {
        match self.keyframes.look_for_tick(tick) {
            Ok((keyframe_tick, keyframe_position)) => {
                self.reader.seek(keyframe_position)?;
                if keyframe_tick == tick {
                    return Ok(Some(tick));
                }
                if tick - keyframe_tick > 250 {
                    if let Some((tick, position)) =
                        self.reader.inner.next_keyframe_position_for_tick(tick, &mut Ignore)?
                    {
                        self.keyframes.insert(tick, position);
                        self.reader.seek(position)?;
                        return Ok(Some(tick));
                    }
                }
                Ok(Some(keyframe_tick))
            }
            Err(()) => {
                self.reader.seek(self.starting_position)?;
                Ok(None)
            }
        }
    }
}

/// 解析好的 demo(还没绑地图),对应 JS 里的 `TwDemoIntermediate`。
#[wasm_bindgen]
pub struct TwDemoIntermediate {
    data: Vec<u8>,
    map_data: Option<Vec<u8>>,
    map_name: String,
    map_sha256: Option<[u8; 32]>,
    map_crc: u32,
    length: f64,
    net_version: String,
    timestamp: String,
}

#[wasm_bindgen]
impl TwDemoIntermediate {
    /// 只支持 DDNet 的 `.demo`。teehistorian 请在服务端转成 demo(见 ddnet.org/watch 的做法)。
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>) -> Result<Self, JsError> {
        let reader = error(Reader::new(data.clone()))?;
        let map_data = match reader.inner.map_data() {
            [] => None,
            data => Some(data.to_vec()),
        };
        let map_name = String::from_utf8_lossy(reader.inner.map_name()).into_owned();
        let map_crc = reader.inner.map_crc();
        let map_sha256 = reader.inner.map_sha256().map(|sha| sha.0);
        let length = reader.inner.length() as f64;
        let net_version = String::from_utf8_lossy(reader.inner.net_version()).into_owned();
        let timestamp = String::from_utf8_lossy(reader.inner.timestamp()).into_owned();
        Ok(Self {
            data,
            map_data,
            map_name,
            map_sha256,
            map_crc,
            length,
            net_version,
            timestamp,
        })
    }

    /// demo 头里内嵌的地图(自己录的 demo 通常有;服务端转出来的也有)
    #[wasm_bindgen]
    pub fn contained_map_data(&self) -> Option<Vec<u8>> {
        self.map_data.clone()
    }

    #[wasm_bindgen(getter = map_name)]
    pub fn map_name(&self) -> String {
        self.map_name.clone()
    }

    /// 十六进制 sha256,用来找地图文件
    #[wasm_bindgen(getter = map_sha256)]
    pub fn map_sha256(&self) -> String {
        self.map_sha256
            .map(|sha| sha.iter().map(|b| format!("{b:02x}")).collect())
            .unwrap_or_default()
    }

    #[wasm_bindgen(getter = map_crc)]
    pub fn map_crc(&self) -> u32 {
        self.map_crc
    }

    #[wasm_bindgen(getter = net_version)]
    pub fn net_version(&self) -> String {
        self.net_version.clone()
    }

    #[wasm_bindgen(getter = timestamp)]
    pub fn timestamp(&self) -> String {
        self.timestamp.clone()
    }

    /// demo 总时长(秒)
    #[wasm_bindgen(getter = length)]
    pub fn length(&self) -> f64 {
        self.length
    }

    #[cfg(target_arch = "wasm32")]
    #[wasm_bindgen]
    pub fn build(self, map: &TwMap) -> Result<TwDemo, JsError> {
        self.build_processor(map.twgame_map().clone())
    }
}

impl TwDemoIntermediate {
    /// 不经过 GPU 的版本(测试和 native 工具用得上)
    pub(crate) fn build_processor(
        self,
        map: std::sync::Arc<twgpu::twgame::Map>,
    ) -> Result<TwDemo, JsError> {
        let sink = SoundSink::new();
        let mut reader = error(Reader::new(self.data))?;
        let starting_position = error(reader.stream_position())?;
        let file = DemoFile {
            reader,
            keyframes: Keyframes::default(),
            starting_position,
            seek_snap1: BufferedSnap::default(),
            seek_snap2: BufferedSnap::default(),
            seeked: SeekSnap::Zero,
            sink: sink.clone(),
        };
        let inner = error(DemoProcessor::new(Box::new(file), map.clone()))?;
        // 第一帧的事件不播
        sink.clear();
        Ok(TwDemo {
            inner,
            sink,
            map: map.clone(),
            last_client_tick: None,
            prev_jumped_total: std::collections::HashMap::new(),
            last_skid_tick: i32::MIN / 2,
            particles: Particles::new(0.),
            rng: twgpu::Rng::new(21),
            known_skins: std::collections::HashSet::new(),
            new_snap: false,
            pending: Vec::new(),
            ended: false,
            cursor: None,
        })
    }
}

/// 播放中的 demo,对应 JS 里的 `TwDemo`。
#[wasm_bindgen]
pub struct TwDemo {
    inner: DemoProcessor,
    sink: SoundSink,
    /// 客户端预测音要用地图判断"是否在地面上"
    map: std::sync::Arc<twgpu::twgame::Map>,
    /// 上一次处理的 tick,以及每个玩家的 m_JumpedTotal(算二段跳用)
    last_client_tick: Option<i32>,
    prev_jumped_total: std::collections::HashMap<u32, i32>,
    /// 滑步音的限流(客户端是 100ms)
    last_skid_tick: i32,
    particles: Particles,
    rng: twgpu::Rng,
    known_skins: std::collections::HashSet<String>,
    new_snap: bool,
    pending: Vec<SoundEvent>,
    ended: bool,
    /// 准星:瞄准点(DDNet 单位,相对玩家)、武器 id、以及动态镜头当前的位移(单位)。
    /// `None` = 不画(自由视角 / 团队视角 / 关掉开关 / 跟随的玩家死了)。
    cursor: Option<CursorState>,
}

/// 准星的状态,由 JS 每帧推过来(它才知道被跟随玩家在哪、瞄准点平滑到哪了)。
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct CursorState {
    /// 被跟随玩家的位置,tile 单位。准星挂在玩家身上,所以团队视角里也对
    pub anchor: (f32, f32),
    /// 瞄准点,DDNet 单位(一个 tile = 32 单位),相对玩家
    pub aim: (f32, f32),
    /// 武器 id,0..6,用来挑对应的准星贴图
    pub weapon: u32,
}

#[wasm_bindgen]
impl TwDemo {
    /// 推进到第 `tick` 帧(50 tick/秒)。返回 false 表示 demo 放完了。
    #[wasm_bindgen]
    pub fn continue_to_tick(&mut self, tick: f64) -> Result<bool, JsError> {
        if self.ended {
            return Ok(false);
        }
        let tick = tick.max(self.inner.current_tick_f64());
        self.sink.set_armed(true);
        match error(self.inner.continue_to_tick(tick))? {
            None => {
                self.ended = true;
                self.drain_pending();
                Ok(false)
            }
            Some(new_snap) => {
                self.new_snap = new_snap;
                self.drain_pending();
                Ok(true)
            }
        }
    }

    /// 跳到第 `tick` 帧。跳转过程不发声。
    #[wasm_bindgen]
    pub fn seek_to_tick(&mut self, tick: f64) -> Result<(), JsError> {
        self.sink.set_armed(false);
        self.sink.clear();
        let result = error(self.inner.seek_tick(tick as i32));
        self.sink.set_armed(true);
        self.particles.reset(0.);
        self.new_snap = true;
        self.ended = false;
        self.last_client_tick = None;
        self.prev_jumped_total.clear();
        result?;
        Ok(())
    }

    pub(crate) fn current_time(&self) -> f64 {
        self.inner.current_time()
    }

    #[wasm_bindgen(getter = time)]
    pub fn time(&self) -> f64 {
        self.inner.current_time().max(0.)
    }

    #[wasm_bindgen(getter = ended)]
    pub fn ended(&self) -> bool {
        self.ended
    }

    /// 这份 demo 是从谁的视角录的(`team 0` 里的本机玩家),相机默认跟这个
    #[wasm_bindgen]
    pub fn focused_player(&mut self) -> Option<u32> {
        self.inner.focused_player()
    }

    #[wasm_bindgen]
    pub fn player_position(&mut self, id: u32) -> Option<Vec<f32>> {
        self.inner.position_of_player(id).map(|p| vec![p.x, p.y])
    }

    /// 当前画面里出现了哪些皮肤但还没上传过(`TwGpu.add_skin` 用)
    #[wasm_bindgen]
    pub fn new_player_skins(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        for (_, player) in self.inner.to_snap().players.iter() {
            if !self.known_skins.contains(player.skin.as_str()) {
                out.push(player.skin.to_string());
                self.known_skins.insert(player.skin.to_string());
            }
        }
        out
    }

    /// 某个玩家现在的瞄准点,`[x, y, weapon]`(单位:DDNet 的世界单位,相对玩家)。
    /// 没这个玩家、或者他已经死了(没有 tee)就是 `None` —— 和客户端一样,死了不画准星。
    #[wasm_bindgen]
    pub fn player_aim(&self, id: u32) -> Option<Vec<f32>> {
        let snap = self.inner.to_snap();
        let tee = snap.players.get(twsnap::SnapId(id))?.tee.as_ref()?;
        Some(vec![
            f32::from_fixed(tee.target.x) * 32.,
            f32::from_fixed(tee.target.y) * 32.,
            tee.weapon as u32 as f32,
        ])
    }

    /// 每帧推一次准星状态:玩家位置(tile)、瞄准点(DDNet 单位)、武器 id。
    ///
    /// 几何计算(贴边裁切、按缩放换算像素)都在 Rust 里做,
    /// 这样和别的精灵走同一条渲染管线,不用 DOM。
    #[wasm_bindgen]
    pub fn set_cursor(
        &mut self,
        anchor_x: f32,
        anchor_y: f32,
        aim_x: f32,
        aim_y: f32,
        weapon: u32,
    ) {
        self.cursor = Some(CursorState {
            anchor: (anchor_x, anchor_y),
            aim: (aim_x, aim_y),
            weapon,
        });
    }

    /// 不画准星(自由视角、跟随的玩家死了、开关关掉)
    #[wasm_bindgen]
    pub fn hide_cursor(&mut self) {
        self.cursor = None;
    }

    pub(crate) fn cursor(&self) -> Option<CursorState> {
        self.cursor
    }

    /// 当前帧的玩家列表(id/名字/队伍),给 demo 控制器的“看谁”用
    #[wasm_bindgen]
    pub fn players_json(&self) -> String {
        let players: Vec<_> = self
            .inner
            .to_snap()
            .players
            .iter()
            .map(|(id, p)| {
                serde_json::json!({
                    "id": id.0,
                    "name": p.name.as_str(),
                    "team": p.team,
                    "local": p.local,
                    "alive": p.tee.is_some(),
                    // 玩家自己在 Esc 菜单里暂停时,旁观准星要隐藏(和 DDNet UpdateSpectatorCursor 一致)
                    "paused": p.flags.contains(twsnap::flags::PlayerFlags::PAUSED),
                })
            })
            .collect();
        serde_json::Value::Array(players).to_string()
    }

    /// 取走这一帧要播的声音(JSON 数组),取完清空。
    ///
    /// 形状:`[{"n":"gun_fire","x":12.5,"y":30.0,"g":false}, ...]`
    #[wasm_bindgen]
    pub fn drain_sounds(&mut self) -> String {
        self.drain_pending();
        let events = std::mem::take(&mut self.pending);
        serde_json::to_string(&events).unwrap_or_else(|_| "[]".into())
    }

    pub(crate) fn render_ctx<'a>(
        &'a mut self,
        textures: &'a twgpu::sprites::SpriteTextures,
    ) -> (twgpu::sprites::SpriteRenderContext<'a>, bool) {
        let new_snap = self.new_snap;
        self.new_snap = false;
        (
            self.inner
                .render_ctx(&mut self.particles, textures, &mut self.rng),
            new_snap,
        )
    }
}

impl TwDemo {
    fn drain_pending(&mut self) {
        let events = self.sink.take();
        self.pending.extend(events);
        self.collect_client_predicted();
    }

    /// demo 里没有、客户端只给自己播的那几个音(二段跳、滑步)。
    /// 每个 snapshot 只处理一次,不然同一帧里会被重复触发。
    fn collect_client_predicted(&mut self) {
        let tick = self.inner.current_tick();
        if self.last_client_tick == Some(tick) {
            return;
        }
        self.last_client_tick = Some(tick);
        let snap = self.inner.to_snap();
        let mut events = Vec::new();
        for (id, player) in snap.players.iter() {
            let Some(tee) = &player.tee else {
                continue;
            };
            // 二段跳
            if tee.jumped_total >= 0 {
                if let Some(previous) = self.prev_jumped_total.insert(id.0, tee.jumped_total) {
                    if tee.jumped_total > previous {
                        events.extend(sound::client_predicted_airjump(tee.pos));
                    }
                }
            }
            // 滑步:在地面上、朝向和速度相反、速度够快
            let pos = vek::Vec2::new(
                f32::from_fixed(tee.pos.x),
                f32::from_fixed(tee.pos.y),
            );
            let vel = vek::Vec2::new(
                f32::from_fixed(tee.vel.x),
                f32::from_fixed(tee.vel.y),
            );
            let moving = vel * 50.;
            let want_other_dir = match tee.direction {
                twsnap::enums::Direction::Left => vel.x > 0.,
                twsnap::enums::Direction::Right => vel.x < 0.,
                twsnap::enums::Direction::None => false,
            };
            // twgame 的坐标是 DDNet 的世界单位(tile * 32),twsnap 给的是 tile
            let world = pos * 32.;
            if want_other_dir
                && moving.magnitude() > 500.
                && self.map.is_grounded(world)
                && tick - self.last_skid_tick >= 5
            {
                self.last_skid_tick = tick;
                events.extend(sound::client_predicted_skid(tee.pos));
            }
        }
        self.pending.extend(events);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    /// 跑完整个 demo,统计抽到的声音。
    /// `TWENGINE_TEST_DEMO=/path/to/xxx.demo cargo test -- --nocapture`
    #[test]
    fn sound_events_of_demo() {
        let Ok(path) = std::env::var("TWENGINE_TEST_DEMO") else {
            eprintln!("TWENGINE_TEST_DEMO 未设置,跳过");
            return;
        };
        let data = std::fs::read(&path).unwrap();
        let intermediate = TwDemoIntermediate::new(data).unwrap();
        println!(
            "map={:?} length={}s net={:?} embedded_map={}",
            intermediate.map_name,
            intermediate.length,
            intermediate.net_version,
            intermediate.map_data.is_some()
        );
        let map_data = intermediate.map_data.clone().expect("demo 里没有内嵌地图");
        let mut twmap = twgpu::twmap::TwMap::parse(&map_data).unwrap();
        twmap.load().unwrap();
        let game_map = std::sync::Arc::new(twgame::Map::try_from(&mut twmap).unwrap());
        let mut demo = intermediate.build_processor(game_map).unwrap();

        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut global = 0usize;
        let mut total = 0usize;
        let mut sounds_json = Vec::new();
        let length = 380.0_f64;
        let mut tick = 0.;
        while demo.continue_to_tick(tick).unwrap() {
            let json = demo.drain_sounds();
            if json != "[]" {
                sounds_json.push((demo.time(), json));
            }
            tick += 1.;
            if tick > length * 50. + 500. {
                break;
            }
        }
        for (_, json) in &sounds_json {
            let events: Vec<serde_json::Value> = serde_json::from_str(json).unwrap();
            for event in events {
                total += 1;
                if event["g"].as_bool().unwrap_or(false) {
                    global += 1;
                }
                *counts
                    .entry(event["n"].as_str().unwrap_or("?").to_string())
                    .or_default() += 1;
            }
        }
        let mut sorted: Vec<_> = counts.into_iter().collect();
        sorted.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
        println!("total={total} (global={global}) in {} frames", sounds_json.len());
        for (name, n) in &sorted {
            println!("{n:>6} {name}");
        }
        for (time, json) in sounds_json.iter().take(6) {
            println!("t={time:.2} {json}");
        }
        assert!(total > 0, "一条声音都没抽到");
    }

    /// 每个玩家的名字/皮肤/队伍来自哪一帧的 ClientInfo?
    /// `TWENGINE_TEST_DEMO=/path/to/xxx.demo cargo test players_of_demo -- --nocapture`
    #[test]
    fn players_of_demo() {
        let Ok(path) = std::env::var("TWENGINE_TEST_DEMO") else {
            eprintln!("TWENGINE_TEST_DEMO 未设置,跳过");
            return;
        };
        let data = std::fs::read(&path).unwrap();
        let intermediate = TwDemoIntermediate::new(data).unwrap();
        let map_data = intermediate.map_data.clone().expect("demo 里没有内嵌地图");
        let mut twmap = twgpu::twmap::TwMap::parse(&map_data).unwrap();
        twmap.load().unwrap();
        let game_map = std::sync::Arc::new(twgame::Map::try_from(&mut twmap).unwrap());
        let mut demo = intermediate.build_processor(game_map).unwrap();

        let mut last: BTreeMap<i32, (String, bool)> = BTreeMap::new();
        let mut tick = 0.;
        while demo.continue_to_tick(tick).unwrap() {
            let json = demo.players_json();
            let players: Vec<serde_json::Value> = serde_json::from_str(&json).unwrap();
            for player in players {
                let id = player["id"].as_i64().unwrap() as i32;
                let name = player["name"].as_str().unwrap_or("").to_string();
                let alive = player["alive"].as_bool().unwrap_or(false);
                let entry = last.entry(id).or_insert((String::new(), false));
                if entry.0 != name {
                    println!(
                        "t={:.2} id={id} 名字出现/变化: {:?} -> {:?}",
                        demo.time(),
                        entry.0,
                        name
                    );
                    entry.0 = name;
                }
                if entry.1 != alive {
                    println!(
                        "t={:.2} id={id} {:?} alive {alive}",
                        demo.time(),
                        entry.0
                    );
                    entry.1 = alive;
                }
            }
            tick += 1.;
            if tick > 400. * 50. {
                break;
            }
        }
        println!("最终玩家表:");
        for (id, (name, alive)) in &last {
            println!("  id={id} name={name:?} alive={alive}");
        }
    }
}
