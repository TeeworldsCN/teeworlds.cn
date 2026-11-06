//! demo 里的声音事件。
//!
//! demo 文件本身没有音轨,但**有声音事件**:服务端把音效作为 snapshot 里的 net event
//! (`SoundWorld`/`SoundGlobal`)发下来,客户端自己录到的音效则用 `PlayAndRecord`
//! 发一条 `Sv_SoundGlobal` 消息进 demo 的 message chunk。这两处都在这里抽出来。
//!
//! 客户端还有极少数只在本机播的声音(skid、airjump),既不在 snapshot 里也不在 demo 的
//! 消息里,这一版没做,见 `static/ddnet/demo/player.js` 里的 TODO。

use serde::Serialize;
use twgpu::fixed::traits::FromFixed;
use twsnap::Events;

/// 顺序 = DDNet 的 `SOUND_*` 枚举顺序(datasrc/content.py 里 `container.sounds` 的添加顺序)。
/// 名字同时是 assets 里声音集的名字:`audio/wv/<name>-<n>.opus`。
pub const SOUND_NAMES: [&str; 41] = [
    "gun_fire",
    "shotgun_fire",
    "grenade_fire",
    "hammer_fire",
    "hammer_hit",
    "ninja_fire",
    "grenade_explode",
    "ninja_hit",
    "laser_fire",
    "laser_bounce",
    "weapon_switch",
    "player_pain_short",
    "player_pain_long",
    "body_land",
    "player_airjump",
    "player_jump",
    "player_die",
    "player_spawn",
    "player_skid",
    "tee_cry",
    "hook_loop",
    "hook_attach_ground",
    "hook_attach_player",
    "hook_noattach",
    "pickup_health",
    "pickup_armor",
    "pickup_grenade",
    "pickup_shotgun",
    "pickup_ninja",
    "weapon_spawn",
    "weapon_noammo",
    "hit",
    "chat_server",
    "chat_client",
    "chat_highlight",
    "ctf_drop",
    "ctf_return",
    "ctf_grab_pl",
    "ctf_grab_en",
    "ctf_capture",
    "menu",
];

/// 名字 -> 声音 id,越界返回 -1(渲染/播放都会忽略)
pub fn index_of(name: &str) -> i32 {
    SOUND_NAMES
        .iter()
        .position(|n| *n == name)
        .map(|i| i as i32)
        .unwrap_or(-1)
}

pub fn name_of(id: i32) -> &'static str {
    usize::try_from(id)
        .ok()
        .and_then(|i| SOUND_NAMES.get(i).copied())
        .unwrap_or("")
}

/// 一条要播的声音。`x`/`y` 是地图坐标(tile 为单位),JS 侧按相机位置算音量/声像。
#[derive(Serialize, Clone, Debug)]
pub struct SoundEvent {
    /// 声音集名字
    pub n: &'static str,
    pub x: f32,
    pub y: f32,
    /// true = 无位置(全局通道)
    pub g: bool,
}

impl SoundEvent {
    pub fn at(id: i32, pos: twsnap::Position) -> Option<Self> {
        let n = name_of(id);
        (!n.is_empty()).then(|| Self {
            n,
            x: f32::from_fixed(pos.x),
            y: f32::from_fixed(pos.y),
            g: false,
        })
    }
    pub fn global(id: i32) -> Option<Self> {
        let n = name_of(id);
        (!n.is_empty()).then(|| Self {
            n,
            x: 0.,
            y: 0.,
            g: true,
        })
    }
}

/// 客户端预测出来的声音(demo 的 snapshot 里没有,客户端只对本机播)。
///
/// 现在补两个,条件照抄 `src/game/gamecore.cpp` / `src/game/client/components/players.cpp`:
/// - `player_airjump`:`m_JumpedTotal` 增加(落地跳会把它清 0,所以"变大"就是二段跳)
/// - `player_skid`:在地面上 + 移动方向和朝向相反 + 速度 > 500/50 tile/s,客户端还限流 100ms
pub fn client_predicted_airjump(pos: twsnap::Position) -> Option<SoundEvent> {
    SoundEvent::at(index_of("player_airjump"), pos)
}

pub fn client_predicted_skid(pos: twsnap::Position) -> Option<SoundEvent> {
    SoundEvent::at(index_of("player_skid"), pos)
}

/// snapshot 里的 net event -> 声音。
///
/// 只处理会发声的那几种,其余(DamageIndicator/Explosion/Death)在客户端里是特效,不出声。
pub fn from_snap_events(events: &[Events], out: &mut Vec<SoundEvent>) {
    let hammer_hit = index_of("hammer_hit");
    let player_spawn = index_of("player_spawn");
    for event in events {
        match event {
            Events::Sound(twsnap::events::Sound { pos, sound }) => {
                out.extend(SoundEvent::at(i32::from(*sound), *pos));
            }
            Events::SoundGlobal(twsnap::events::SoundGlobal { sound }) => {
                out.extend(SoundEvent::global(i32::from(*sound)));
            }
            // 客户端: NETEVENTTYPE_HAMMERHIT -> Effects.HammerHit -> SOUND_HAMMER_HIT
            Events::HammerHit(twsnap::events::HammerHit { pos }) => {
                out.extend(SoundEvent::at(hammer_hit, *pos));
            }
            // 客户端: NETEVENTTYPE_SPAWN -> Effects.PlayerSpawn -> SOUND_PLAYER_SPAWN
            Events::Spawn(twsnap::events::Spawn { pos }) => {
                out.extend(SoundEvent::at(player_spawn, *pos));
            }
            _ => {}
        }
    }
}
