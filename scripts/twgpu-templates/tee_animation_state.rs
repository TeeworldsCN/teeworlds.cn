        // ---- 动画状态 ----
        // 判定和客户端 players.cpp 的 "evaluate animation" 一致,细节见 `tee_anim`
        let velocity = self.clock.lerp_tee_vec(tees, |tee| tee.vel);
        let facing = match tee2.direction {
            twsnap::enums::Direction::Left => -1.,
            twsnap::enums::Direction::Right => 1.,
            twsnap::enums::Direction::None => 0.,
        };
        // `m_VelX` 是 NetObj 里的定点值(速度 ×256,单位 DDNet 世界单位/tick)
        let vel_x_net = f32::from_fixed(tee2.vel.x) * 256.;
        // 客户端:Collision()->CheckPoint(x, y + 16),脚下 16 单位那一个点
        let in_air = !solid_at(self.map, position + Vec2::new(0., 16. / 32.));

        let animation = TeeKeyframe::BASE
            + match tee_anim(vel_x_net, velocity.x, facing, in_air) {
                TeeAnim::InAir => TeeKeyframe::IN_AIR,
                TeeAnim::Idle => TeeKeyframe::IDLE,
                // 走/跑的相位都取自世界坐标 x:走 100 单位一轮,跑 200 单位一轮
                TeeAnim::Walk => sample(TeeKeyframe::WALK, cycle_time(position.x * 32., 100.)),
                TeeAnim::RunLeft => {
                    sample(TeeKeyframe::RUN_LEFT, cycle_time(position.x * 32., 200.))
                }
                TeeAnim::RunRight => {
                    sample(TeeKeyframe::RUN_RIGHT, cycle_time(position.x * 32., 200.))
                }
                // 想往反方向走(滑步):客户端这时不加走路动画,脚停在 base 姿势
                TeeAnim::Blocked => TeeKeyframe::EMPTY,
            };
