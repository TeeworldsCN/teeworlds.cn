/// tee 的动画状态,和客户端 `players.cpp` 里挑动画的那套判定一一对应(含单元测试)
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum TeeAnim {
    InAir,
    Idle,
    Walk,
    RunLeft,
    RunRight,
    /// 想反着走(滑步):客户端这时不加走路动画
    Blocked,
}

/// 挑动画状态,顺序照抄客户端 `players.cpp`:
///
/// ```c
/// bool Stationary = m_VelX <= 1 && m_VelX >= -1;
/// bool InAir = !Collision()->CheckPoint(x, y + 16);
/// bool Running = m_VelX >= 5000 || m_VelX <= -5000;
/// bool WantOtherDir = (m_Direction == -1 && Vel.x > 0) || (m_Direction == 1 && Vel.x < 0);
/// if (InAir)                    ANIM_INAIR
/// else if (Stationary)          ANIM_IDLE
/// else if (!WantOtherDir)       Running ? ANIM_RUN_LEFT/RIGHT : ANIM_WALK
/// ```
///
/// 注意 `vel_x_net` 是 NetObj 里的 `m_VelX`(速度 ×256),`velocity_x` 是插值后的速度
/// (DDNet 单位/tick)—— 客户端也是两个不同口径的输入。
fn tee_anim(vel_x_net: f32, velocity_x: f32, facing: f32, in_air: bool) -> TeeAnim {
    if in_air {
        return TeeAnim::InAir;
    }
    if vel_x_net <= 1. && vel_x_net >= -1. {
        return TeeAnim::Idle;
    }
    if (facing == -1. && velocity_x > 0.) || (facing == 1. && velocity_x < 0.) {
        return TeeAnim::Blocked;
    }
    if vel_x_net >= 5000. {
        return TeeAnim::RunRight;
    }
    if vel_x_net <= -5000. {
        return TeeAnim::RunLeft;
    }
    TeeAnim::Walk
}

/// 走/跑动画的相位:世界坐标 x 每走过 `period` 个 DDNet 单位循环一次
/// (客户端的 `WalkTime = fmod(x, 100) / 100`,`RunTime = fmod(x, 200) / 200`)
fn cycle_time(x_units: f32, period: f32) -> f32 {
    (x_units / period).rem_euclid(1.)
}

