
#[cfg(test)]
mod tests {
    use super::{cycle_time, tee_anim, TeeAnim};

    #[test]
    fn in_air_wins_over_everything() {
        assert_eq!(tee_anim(0., 0., 1., true), TeeAnim::InAir);
        assert_eq!(tee_anim(9000., -30., -1., true), TeeAnim::InAir);
    }

    #[test]
    fn tiny_horizontal_velocity_is_idle() {
        // 客户端:Stationary = m_VelX ∈ [-1, 1],和位置有没有变无关
        assert_eq!(tee_anim(0., 0., 1., false), TeeAnim::Idle);
        assert_eq!(tee_anim(1., 0., 1., false), TeeAnim::Idle);
        assert_eq!(tee_anim(-1., 0., 1., false), TeeAnim::Idle);
        assert_eq!(tee_anim(2., 0.01, 1., false), TeeAnim::Walk);
    }

    #[test]
    fn running_needs_5000() {
        assert_eq!(tee_anim(4999., 19., 1., false), TeeAnim::Walk);
        assert_eq!(tee_anim(5000., 19., 1., false), TeeAnim::RunRight);
        assert_eq!(tee_anim(-5000., -19., -1., false), TeeAnim::RunLeft);
    }

    #[test]
    fn moving_against_facing_freeze_the_walk_cycle() {
        // 朝左但往右飘 -> 客户端不加走路动画
        assert_eq!(tee_anim(3000., 5., -1., false), TeeAnim::Blocked);
        assert_eq!(tee_anim(-3000., -5., 1., false), TeeAnim::Blocked);
        // 同向就正常走
        assert_eq!(tee_anim(3000., -5., -1., false), TeeAnim::Walk);
        // 没有朝向(None)时 WantOtherDir 不成立
        assert_eq!(tee_anim(3000., 5., 0., false), TeeAnim::Walk);
    }

    #[test]
    fn walk_phase_wraps_every_100_units() {
        assert!((cycle_time(0., 100.) - 0.).abs() < 1e-6);
        assert!((cycle_time(50., 100.) - 0.5).abs() < 1e-6);
        assert!((cycle_time(150., 100.) - 0.5).abs() < 1e-6);
        // 负坐标也要落在 [0, 1):客户端是 fmod 之后 +1
        assert!((cycle_time(-50., 100.) - 0.5).abs() < 1e-6);
        assert!((cycle_time(-150., 100.) - 0.5).abs() < 1e-6);
        assert!((cycle_time(-1., 100.) - 0.99).abs() < 1e-6);
        // 跑是 200 单位一轮
        assert!((cycle_time(100., 200.) - 0.5).abs() < 1e-6);
    }
}
