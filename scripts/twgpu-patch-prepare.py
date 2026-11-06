#!/usr/bin/env python3
"""
把我们对 vendor/twgpu 的所有改动落到工作区,然后重新生成
patches/twgpu-web-fixes.patch。

用法(仓库根目录):
    python3 scripts/twgpu-patch-prepare.py

为什么要这个脚本:`bun run engine` 会在编译后自动 `git checkout` 掉
vendor/twgpu(补丁是构建期的临时改动)。所以手工改 vendor 再编译,
改动会被抹掉。所有 vendor 侧修改都必须写在这里,再生成 patch ——
patch 才是唯一事实来源。

Rust 代码片段放在 scripts/twgpu-templates/ 下,避免 python 三引号嵌套。
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUBMODULE = ROOT / "vendor/twgpu"
PATCH = ROOT / "patches/twgpu-web-fixes.patch"
TEMPLATES = ROOT / "scripts/twgpu-templates"


def sh(*cmd, check=True):
    r = subprocess.run(cmd, cwd=SUBMODULE, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"失败: {' '.join(cmd)}\n{r.stdout}\n{r.stderr}")
    return r


def tpl(name):
    return (TEMPLATES / name).read_text()


def read(path):
    return (SUBMODULE / path).read_text()


def write(path, text):
    (SUBMODULE / path).write_text(text)


def edit(path, *pairs):
    """按顺序做文本替换;找不到锚点就报错(说明上游变过了)。"""
    s = read(path)
    for old, new in pairs:
        if old not in s:
            sys.exit(f"{path} 里找不到锚点:\n{old[:300]}")
        s = s.replace(old, new, 1)
    write(path, s)


# ---------------------------------------------------------------- 各项改动


def mipmap_rs():
    """在 GPU 路径旁边插入一条 CPU 就地生成 mip 链的版本(tilemap 用)。"""
    path = "twgpu/src/mipmap.rs"
    s = read(path)
    anchor = "    fn generate_2d_mipmap("
    s = s.replace(anchor, tpl("mipmap_cpu_impl.rs") + anchor, 1)
    write(path, s + tpl("mipmap_cpu_helpers.rs"))


def mapres_rs():
    path = "twgpu/src/textures/mapres.rs"
    s = read(path)

    # Mapres 增加统计字段
    s = s.replace(
        """pub struct Mapres {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub texture: Texture,
    pub array_texture: Option<Texture>,
}""",
        """pub struct Mapres {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub texture: Texture,
    pub array_texture: Option<Texture>,
    /// 生成 array texture 时 level 0 的字节数(CPU mip 的内存峰值就是它)
    pub mip_bytes: usize,
    /// 生成整条 mip 链花了多少毫秒
    pub mip_millis: f64,
}""",
        1,
    )
    s = s.replace(
        """            texture,
            array_texture: None,
        }""",
        """            texture,
            array_texture: None,
            mip_bytes: 0,
            mip_millis: 0.0,
        }""",
        1,
    )

    # 整块替换 generate_array_texture
    start = s.index(
        "    /// Generates the array texture for this mapres, if it isn't already generated"
    )
    end = s.index("    /// Accessor to the array texture of this mapres")
    s = s[:start] + tpl("mapres_generate_array_texture.rs") + s[end:]

    # 调用点改成传图像
    s = s.replace(
        """            if tilemap_textures[i] {
                let mut encoder =
                    device.create_command_encoder(&CommandEncoderDescriptor { label: LABEL });
                mapres.generate_array_texture(&mut blit, &mut encoder, device, queue);
                queue.submit([encoder.finish()]);
            }""",
        """            if tilemap_textures[i] {
                if let Some(Image::Embedded(emb)) = map.images.get(i) {
                    mapres.generate_array_texture(emb.image.unwrap_ref(), device, queue);
                }
            }""",
        1,
    )
    s = s.replace(
        """        let mut blank = Mapres::from_rgba(
            "Blank Image".into(),
            &RgbaImage::from_pixel(16, 16, Rgba([255; 4])),
            &mut blit,
            &mut encoder,
            device,
            queue,
        );
        blank.generate_array_texture(&mut blit, &mut encoder, device, queue);
        queue.submit([encoder.finish()]);""",
        """        let blank_image = RgbaImage::from_pixel(16, 16, Rgba([255; 4]));
        let mut blank = Mapres::from_rgba(
            "Blank Image".into(),
            &blank_image,
            &mut blit,
            &mut encoder,
            device,
            queue,
        );
        blank.generate_array_texture(&blank_image, device, queue);""",
        1,
    )

    # 诊断访问器
    s = s.replace(
        """impl MapresStorage {
    pub fn upload(""",
        """impl MapresStorage {
    /// 每张 mapres 生成 mip 链的耗时与内存(诊断用)
    pub fn mip_stats(&self) -> Vec<(&str, usize, f64)> {
        self.mapres
            .iter()
            .filter(|m| m.mip_bytes > 0)
            .map(|m| (m.name.as_str(), m.mip_bytes, m.mip_millis))
            .collect()
    }

    pub fn upload(""",
        1,
    )

    # 时间戳工具 + 纯函数 + 单测
    s = s.replace(
        'const LABEL: Option<&str> = Some("Mapres");',
        'const LABEL: Option<&str> = Some("Mapres");\n\n' + tpl("mapres_now_millis.rs"),
        1,
    )
    write(path, s + tpl("mapres_tile_grid.rs"))


def map_data_rs():
    edit(
        "twgpu/src/map/map_data.rs",
        (
            """pub struct GpuMapDataStatic {
    pub(crate) textures: MapresStorage,
    pub(crate) groups: Vec<GpuGroupData>,
}""",
            """pub struct GpuMapDataStatic {
    pub(crate) textures: MapresStorage,
    pub(crate) groups: Vec<GpuGroupData>,
}

impl GpuMapDataStatic {
    /// 只读访问 mapres 存储(统计/诊断用)
    pub fn mapres(&self) -> &MapresStorage {
        &self.textures
    }
}""",
        ),
    )


def samplers_rs():
    path = "twgpu/src/textures/samplers.rs"
    s = read(path)
    s = s.replace(
        """#[derive(Clone)]
pub struct Samplers {
    clamp_to_edge: Sampler,
    repeating: Sampler,
}""",
        """#[derive(Clone)]
pub struct Samplers {
    clamp_to_edge: Sampler,
    repeating: Sampler,
    /// 只采 mip level 0 的 clamp-to-edge 采样器(tilemap 兜底用)
    clamp_to_edge_lod0: Sampler,
    /// 全局是否启用 mipmap(见 `with_mipmaps`)
    mipmaps: bool,
    /// tilemap 是否强制只采 level 0(见 `with_tilemap_lod0`)
    pub tilemap_lod0: bool,
}""",
        1,
    )
    s = s.replace(
        """        let settings = SamplerDescriptor {
            mag_filter: FilterMode::Linear,
            min_filter: FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..SamplerDescriptor::default()
        };""",
        """        let settings = SamplerDescriptor {
            mag_filter: FilterMode::Linear,
            min_filter: FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..SamplerDescriptor::default()
        };
        // 只暴露 level 0:min_filter 也必须换成不带 mip 的那档,
        // 否则 GL 侧的 MIN_FILTER 仍然是 *_MIPMAP_*,采样器依旧不完整。
        let lod0_settings = SamplerDescriptor {
            min_filter: FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            lod_max_clamp: 0.0,
            ..settings.clone()
        };""",
        1,
    )
    s = s.replace(
        """            repeating: device.create_sampler(&SamplerDescriptor {
                label: Some("Clamp-To-Edge"),""",
        """            repeating: device.create_sampler(&SamplerDescriptor {
                label: Some("Repeat"),""",
        1,
    )
    s = s.replace(
        """                ..settings.clone()
            }),
        }
    }
}""",
        """                ..settings.clone()
            }),
            clamp_to_edge_lod0: device.create_sampler(&SamplerDescriptor {
                label: Some("Clamp-To-Edge (lod 0)"),
                address_mode_u: AddressMode::ClampToEdge,
                address_mode_v: AddressMode::ClampToEdge,
                address_mode_w: AddressMode::ClampToEdge,
                ..lod0_settings
            }),
            mipmaps: true,
            tilemap_lod0: false,
        }
    }

    /// 全局开/关 mipmap(`?mips=0` 的兜底开关)
    pub fn with_mipmaps(mut self, enabled: bool) -> Self {
        self.mipmaps = enabled;
        self
    }

    /// 让 tilemap 只采 mip level 0,其余渲染照常用 mipmap
    pub fn with_tilemap_lod0(mut self, enabled: bool) -> Self {
        self.tilemap_lod0 = enabled;
        self
    }

    /// tilemap 该用只采 level 0 的采样器吗(全局关了 mip 或单独关了 tilemap)
    pub fn tilemap_needs_lod0(&self) -> bool {
        self.tilemap_lod0 || !self.mipmaps
    }

    /// 强制只采 mip level 0 的 clamp-to-edge 采样器(tilemap 用)
    pub fn clamp_to_edge_lod0(&self, binding: u32) -> BindGroupEntry<'_> {
        BindGroupEntry {
            binding,
            resource: BindingResource::Sampler(&self.clamp_to_edge_lod0),
        }
    }
}""",
        1,
    )
    write(path, s)


def tilemap_render_rs():
    edit(
        "twgpu/src/map/tilemap/tilemap_render.rs",
        (
            "                samplers.clamp_to_edge(4),",
            """                if samplers.tilemap_needs_lod0() {
                    samplers.clamp_to_edge_lod0(4)
                } else {
                    samplers.clamp_to_edge(4)
                },""",
        ),
    )


def tee_rendering_rs():
    """tee 的动画状态机和客户端对齐。

    原来 twgpu 只按"两个 snapshot 的 pos.x 是否相等"分 Idle/Walking,另外一律 InAir:
    - 没有跑动画(客户端 |m_VelX| >= 5000 用 run_left/run_right,周期 200 而不是 100)
    - 站着不动但速度非零(顶墙、被推)会被当成走路
    - 想反向走(滑步)时客户端不加走路动画,这里照动
    """
    edit(
        "twgpu/src/sprites/tee_rendering.rs",
        # 1) 状态判定整段换掉
        (
            """        let in_air = solid_at(self.map, position + Vec2::new(0., 0.5));
        let tee_state = if [Vec2::new(14., 19.) / 32., Vec2::new(-14., 19.) / 32.]
            .iter()
            .any(|offset| solid_at(self.map, position + *offset))
        {
            if tee1.pos.x == tee2.pos.x {
                TeeState::Idle
            } else {
                TeeState::Walking
            }
        } else {
            TeeState::InAir
        };

        let animation = TeeKeyframe::BASE
            + match tee_state {
                TeeState::Idle => TeeKeyframe::IDLE,
                TeeState::InAir => TeeKeyframe::IN_AIR,
                TeeState::Walking => {
                    let repeat_interval = 100. / 32.;
                    let walk_time =
                        position.x.rem_euclid(repeat_interval) / repeat_interval + repeat_interval;
                    sample(TeeKeyframe::WALK, walk_time)
                }
            };""",
            tpl("tee_animation_state.rs"),
        ),
        # 2) 速度上面已经算过了,后面不要重复算;滑步粒子改用玩家朝向(客户端是 m_Direction)
        (
            """        let velocity = self.clock.lerp_tee_vec(tees, |tee| tee.vel);
        let vel_length = (velocity).magnitude();
        let direction = match tee1.direction {
            twsnap::enums::Direction::Left => -1.,
            twsnap::enums::Direction::None => 0.,
            twsnap::enums::Direction::Right => 1.,
        };
        let want_other_direction =
            (direction == -1. && velocity.x > 0.) || (direction == 1. && velocity.x < 0.);
        if want_other_direction""",
            """        let vel_length = velocity.magnitude();
        let direction = facing;
        // 滑步粒子:朝向和速度反着、且在地上蹭
        let want_other_direction =
            (facing == -1. && velocity.x > 0.) || (facing == 1. && velocity.x < 0.);
        if want_other_direction""",
        ),
        # 3) TeeState 枚举没了,换成相位函数
        (
            """#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum TeeState {
    Idle,
    InAir,
    Walking,
}

""",
            tpl("tee_cycle_time.rs"),
        ),
        # 4) 跑动画的关键帧
        ("const HAMMER_STILL: Transformation = kf(0., 0., -0.1);", tpl("tee_run_keyframes.rs") + "const HAMMER_STILL: Transformation = kf(0., 0., -0.1);"),
        # 5) 定点转浮点要用 FromFixed
        ("use fixed::traits::{Fixed, ToFixed};", "use fixed::traits::{Fixed, FromFixed, ToFixed};"),
        # 6) skid 粒子:客户端是 `!InAir`(在地上蹭),这里原来写成 in_air(天上才冒烟)
        (
            """        if want_other_direction
            && in_air
            && vel_length > 10.""",
            """        // 客户端的条件是 `!InAir && WantOtherDir && length(Vel * 50) > 500`,
        // 也就是"在地面上反着蹭",不是在天上。位置也放在身后(-Direction * 6)。
        if want_other_direction
            && !in_air
            && vel_length > 10.""",
        ),
        (
            "position + Vec2::new(direction * 6. / 32., 12. / 32.),",
            "position + Vec2::new(-direction * 6. / 32., 12. / 32.),",
        ),
        # 6) 判定表的单元测试(留在 patch 里,`cargo test -p twgpu` 能跑)
        (
            "const NINJA_SWING: &[(f32, Transformation)] = &[",
            tpl("tee_animation_tests.rs") + "const NINJA_SWING: &[(f32, Transformation)] = &[",
        ),
    )


def particles_rs():
    """skid 烟雾的重力方向。

    客户端 `CEffects::SkidTrail` 用的是 `random_float(-500.0f)`,屏幕坐标 y 向下,
    负重力 = 往上飘;twgpu 写成了 `rng.f32_max(500./32.)`(正的),烟往下掉。
    """
    edit(
        "twgpu/src/sprites/particles.rs",
        (
            "            gravity: rng.f32_max(500. / 32.),",
            """            // 客户端:random_float(-500.0f) —— 负重力,烟往上飘
            gravity: -rng.f32_max(500. / 32.),""",
        ),
    )


def twgpu_web_rs():
    edit(
        "twgpu-web/src/twgpu.rs",
        (
            """        canvas: Option<web_sys::HtmlCanvasElement>,
    ) -> Result<Self, JsError> {""",
            """        canvas: Option<web_sys::HtmlCanvasElement>,
        mipmaps: Option<bool>,
        tilemap_mips: Option<bool>,
    ) -> Result<Self, JsError> {""",
        ),
        # 显式指定后端时不要再碰 navigator.gpu:有些内置浏览器(QQ/X5)的 WebGPU 是桩,
        # requestAdapter() 会一直挂着,而 wgpu 这句探测没有超时,初始化就卡死了。
        (
            "        let webgpu_supported = wgpu::util::is_browser_webgpu_supported().await;",
            """        let webgpu_supported = match backend.as_deref() {
            Some(_) => false,
            None => wgpu::util::is_browser_webgpu_supported().await,
        };""",
        ),
        (
            "        let samplers = twgpu::textures::Samplers::new(&device);",
            """        // `mipmaps=false` 全局退回 level 0;`tilemap_mips=false` 只让 tilemap 退回,
        // 精灵/tee 继续享受 mipmap(部分 mobile GLES 上 array texture 的 mip 链是坏的)。
        let samplers = twgpu::textures::Samplers::new(&device)
            .with_mipmaps(mipmaps.unwrap_or(true))
            .with_tilemap_lod0(!tilemap_mips.unwrap_or(true));""",
        ),
    )


def lib_rs():
    edit("twgpu/src/lib.rs", ("mod mipmap;", "pub mod mipmap;"))


def cargo_toml():
    path = "twgpu/Cargo.toml"
    s = read(path)
    if "web-sys" not in s:
        s = s.replace(
            "[dependencies]",
            '[dependencies]\nweb-sys = { version = "0.3.74", features = ["Performance", "Window"] }',
            1,
        )
        write(path, s)


def main():
    # 总是从干净 vendor 开始,所有改动都由本脚本提供(保证幂等)
    sh("git", "checkout", "--", ".")

    mipmap_rs()
    mapres_rs()
    map_data_rs()
    samplers_rs()
    tilemap_render_rs()
    twgpu_web_rs()
    lib_rs()
    cargo_toml()
    tee_rendering_rs()
    particles_rs()

    diff = sh("git", "diff").stdout
    if not diff.strip():
        sys.exit("vendor 没有任何改动")
    PATCH.write_text(diff)
    print(
        f"已更新 {PATCH.name}: {diff.count('diff --git')} 个文件, {len(diff.splitlines())} 行"
    )


if __name__ == "__main__":
    main()