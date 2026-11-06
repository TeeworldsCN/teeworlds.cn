impl TeeKeyframe {
    /// 不加任何姿态(客户端在这时候只留 base):想反向走、滑步时用
    const EMPTY: TeeKeyframe = TeeKeyframe {
        body: Transformation::DEFAULT,
        left_foot: Transformation::DEFAULT,
        right_foot: Transformation::DEFAULT,
    };
    /// 跑起来(带速度加成 / hook 飞行)才用:周期 200 单位,幅度比走路大一圈。
    /// 数据照抄客户端 `datasrc/content.py` 里的 `run_left` / `run_right`。
    const RUN_LEFT: &'static [(f32, TeeKeyframe)] = &[
        (0.0, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(18., -8., -0.27), right_foot: kf(-11., -2.5, 0.05) }),
        (0.2, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(6., 0., 0.), right_foot: kf(-14., -5., 0.1) }),
        (0.4, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(-7., 0., 0.), right_foot: kf(11., -8., -0.3) }),
        (0.6, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(-13., -4.5, 0.05), right_foot: kf(18., -8., -0.27) }),
        (0.8, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(0., -8., -0.2), right_foot: kf(3., 0., 0.) }),
        (1.0, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(18., -8., -0.27), right_foot: kf(-11., -2.5, 0.05) }),
    ];
    const RUN_RIGHT: &'static [(f32, TeeKeyframe)] = &[
        (0.0, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(-18., -8., 0.27), right_foot: kf(11., -2.5, -0.05) }),
        (0.2, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(0., -8., 0.2), right_foot: kf(-3., 0., 0.) }),
        (0.4, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(13., -4.5, -0.05), right_foot: kf(-18., -8., 0.27) }),
        (0.6, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(7., 0., 0.), right_foot: kf(-11., -8., 0.3) }),
        (0.8, TeeKeyframe { body: kf(0., 0., 0.), left_foot: kf(-6., 0., 0.), right_foot: kf(14., -5., -0.1) }),
        (1.0, TeeKeyframe { body: kf(0., -1., 0.), left_foot: kf(-18., -8., 0.27), right_foot: kf(11., -2.5, -0.05) }),
    ];
}

