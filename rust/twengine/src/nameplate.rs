//! 名字牌的字形 atlas。
//!
//! 字形由 JS 用 Canvas2D 光栅化(系统字体,中文/emoji 都能画),单色字形的
//! alpha 位图传上来后在这里用 wgpu 生成 SDF;彩色字形(emoji)直接进 RGBA atlas。
//! 两个 atlas 都是 1024x1024 的 RGBA8 页,按 shelf 分配。
//!
//! 单色字形走 SDF:描边就是第二个距离阈值,和字号无关;彩色字形直接采样,
//! 不描边(彩色 SDF 没有意义)。

use std::collections::HashMap;

use twgpu::vek::Vec2;
use wgpu::{
    BindGroup, BindGroupDescriptor, BindGroupEntry, BindGroupLayout, BindGroupLayoutDescriptor,
    BindGroupLayoutEntry, BindingResource, BindingType, BlendComponent, BlendState, Buffer,
    BufferUsages, ColorTargetState, ColorWrites, Device, FragmentState, LoadOp, MipmapFilterMode,
    MultisampleState, Operations, PipelineCompilationOptions, PipelineLayoutDescriptor,
    PrimitiveState, PrimitiveTopology, Queue, RenderPassColorAttachment, RenderPassDescriptor,
    RenderPipeline, RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor,
    ShaderStages, StoreOp, Texture, TextureDescriptor, TextureDimension, TextureFormat,
    TextureSampleType, TextureUsages, TextureView, TextureViewDescriptor, TextureViewDimension,
    VertexState,
};

use crate::LABEL;

/// 一页 atlas 的边长
const ATLAS_SIZE: u32 = 1024;
/// 字形之间留的像素,避免线性采样时渗到相邻字形
const ATLAS_PAD: u32 = 2;
/// UV 在字形区域内部再收一点,双线性采样不会碰到 atlas 的边
const UV_INSET: f32 = 1.5;
/// atlas 的 mip 层数。1024 -> 64:再往下采样范围就超过字形的留白,会串到邻居
const ATLAS_MIPS: u32 = 5;

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct GlyphVertex {
    pos: [f32; 2],
    uv: [f32; 2],
    outline: f32,
    _pad: f32,
}

/// SDF 的半径(源像素),和 `nameplate.wgsl` 的 `SDF_RADIUS`、`nameplate_sdf.wgsl` 的
/// `RADIUS` 保持一致
const SDF_RADIUS: f64 = 16.0;

/// 从 alpha 位图算 SDF(CPU 版,给 X5 用)。编码和 GPU 那条路完全一样:
/// `0` = 远在外面、`128` ≈ 轮廓、`255` = 内部(`0.5 - d / (2 * RADIUS)`)。
///
/// 精确欧氏距离变换:一维平方距离递推(Felzenszwalb & Huttenlocher),先列后行。
/// 和 mapbox/tiny-sdf 用的是同一个算法。
fn sdf_from_alpha(alpha: &[u8], width: usize, height: usize) -> Vec<u8> {
    const INF: f64 = 1e20;
    let len = width * height;
    let mut outer = vec![INF; len];
    let mut inner = vec![0.0; len];
    for (i, &value) in alpha.iter().enumerate() {
        // 完全透明:只当 inner 的种子(初始 0),outer 保持 INF(这里没有墨迹)
        if value == 0 {
            continue;
        }
        // 覆盖率换算成「离边界的像素距离」:0.5 覆盖率正好是轮廓。
        // 偏外的部分进 outer,偏内的部分进 inner(完全覆盖时 inner 是 INF)
        let t = 0.5 - value as f64 / 255.0;
        if t > 0.0 {
            outer[i] = t;
        } else {
            // 墨迹:outer 的种子是 0(这里就是轮廓),inner 是往里的那一点点
            outer[i] = 0.0;
            inner[i] = if value == 255 { INF } else { -t };
        }
    }
    edt2d(&mut outer, width, height);
    edt2d(&mut inner, width, height);
    let scale = 127.5 / SDF_RADIUS;
    alpha
        .iter()
        .enumerate()
        .map(|(i, _)| {
            let d = outer[i].sqrt() - inner[i].sqrt();
            (127.5 - d * scale).clamp(0.0, 255.0).round() as u8
        })
        .collect()
}

/// 二维 EDT:逐列 + 逐行各做一次一维变换
fn edt2d(grid: &mut [f64], width: usize, height: usize) {
    let longest = width.max(height);
    let mut f = vec![0.0; longest];
    let mut v = vec![0usize; longest];
    let mut z = vec![0.0; longest + 1];
    for x in 0..width {
        edt1d(grid, x, width, height, &mut f, &mut v, &mut z);
    }
    for y in 0..height {
        edt1d(grid, y * width, 1, width, &mut f, &mut v, &mut z);
    }
}

/// 一维平方距离变换(和 tiny-sdf 的 `edt1d` 逐句对应,包括 `k` 会减到 -1 的那一步)
fn edt1d(
    grid: &mut [f64],
    offset: usize,
    stride: usize,
    length: usize,
    f: &mut [f64],
    v: &mut [usize],
    z: &mut [f64],
) {
    v[0] = 0;
    z[0] = f64::NEG_INFINITY;
    z[1] = f64::INFINITY;
    f[0] = grid[offset];
    let mut k: isize = 0;
    for q in 1..length {
        f[q] = grid[offset + q * stride];
        let q2 = (q * q) as f64;
        let mut s = 0.0;
        loop {
            let r = v[k as usize];
            s = (f[q] - f[r] + q2 - (r * r) as f64) / (q - r) as f64 / 2.0;
            if s <= z[k as usize] {
                k -= 1;
                if k < 0 {
                    break;
                }
            } else {
                break;
            }
        }
        k += 1;
        v[k as usize] = q;
        z[k as usize] = s;
        z[k as usize + 1] = f64::INFINITY;
    }
    let mut k: usize = 0;
    for q in 0..length {
        while z[k + 1] < q as f64 {
            k += 1;
        }
        let r = v[k];
        // 注意用浮点减:`q - r` 在 usize 里会下溢(q < r 时),平方后是个天文数字
        let qr = q as f64 - r as f64;
        grid[offset + q * stride] = f[r] + qr * qr;
    }
}

struct Shelf {
    y: u32,
    height: u32,
    x: u32,
}

struct Page {
    texture: Texture,
    /// 显示用(整张,采样时按 LOD 选 mip)
    bind_group: BindGroup,
    /// mip 降采样用:`mip_views[i]` 是第 i 级的 view,`mip_binds[i]` 采样第 i 级
    mip_views: Vec<TextureView>,
    mip_binds: Vec<BindGroup>,
    shelves: Vec<Shelf>,
}

struct Glyph {
    page: usize,
    color: bool,
    /// atlas 里的 UV(左上、右下)
    uv: [f32; 4],
}

struct Quad {
    id: u32,
    center: [f32; 2],
    size: [f32; 2],
    outline: f32,
}

struct DrawItem {
    color: bool,
    page: usize,
    vertex: u32,
}

pub struct NameplateRenderer {
    device: Device,
    queue: Queue,
    gen_layout: BindGroupLayout,
    gen_pipeline: RenderPipeline,
    /// 逐级 2x2 降采样 atlas(给 SDF / emoji 生 mip 链)
    mip_pipeline: RenderPipeline,
    display_layout: BindGroupLayout,
    mono_pipeline: RenderPipeline,
    color_pipeline: RenderPipeline,
    camera_buffer: twgpu::GpuCamera,
    camera_bind_group: BindGroup,
    sampler: Sampler,
    vertex_buffer: Buffer,
    vertex_capacity: usize,
    mono_pages: Vec<Page>,
    color_pages: Vec<Page>,
    glyphs: HashMap<u32, Glyph>,
    quads: Vec<Quad>,
    draw_items: Vec<DrawItem>,
    /// SDF 用 CPU(wasm 里)算 —— X5(QQ / 微信内置浏览器)上「渲染到纹理 + copy 进 atlas」不通
    cpu_sdf: bool,
    /// atlas 的 mip 层数。CPU 那条路要完全避开「渲染到纹理 / copy」,只有 level 0
    page_mips: u32,
}

impl NameplateRenderer {
    /// `cpu_sdf`: SDF 由 JS 算好上传(`upload_glyph_sdf`)。只有 X5(QQ / 微信内置浏览器)
    /// 需要 —— 那边「渲染到临时纹理再 `copy_texture_to_texture` 进 atlas」这条路不通,
    /// 连 mip 链也一起关掉(同样要渲染到别的 mip level)。
    pub fn new(device: Device, queue: Queue, format: TextureFormat, cpu_sdf: bool) -> Self {
        let gen_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: LABEL,
            entries: &[BindGroupLayoutEntry {
                binding: 0,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Texture {
                    sample_type: TextureSampleType::Float { filterable: true },
                    view_dimension: TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            }],
        });
        let gen_shader = device.create_shader_module(wgpu::include_wgsl!("nameplate_sdf.wgsl"));
        let gen_pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: LABEL,
            bind_group_layouts: &[Some(&gen_layout)],
            immediate_size: 0,
        });
        let gen_pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
            label: LABEL,
            layout: Some(&gen_pipeline_layout),
            vertex: VertexState {
                module: &gen_shader,
                entry_point: Some("vs_main"),
                compilation_options: PipelineCompilationOptions::default(),
                buffers: &[],
            },
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                ..PrimitiveState::default()
            },
            depth_stencil: None,
            multisample: MultisampleState::default(),
            fragment: Some(FragmentState {
                module: &gen_shader,
                entry_point: Some("fs_main"),
                compilation_options: PipelineCompilationOptions::default(),
                targets: &[Some(ColorTargetState {
                    format: TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let mip_shader = device.create_shader_module(wgpu::include_wgsl!("nameplate_mip.wgsl"));
        let mip_pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: LABEL,
            bind_group_layouts: &[Some(&gen_layout)],
            immediate_size: 0,
        });
        let mip_pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
            label: LABEL,
            layout: Some(&mip_pipeline_layout),
            vertex: VertexState {
                module: &mip_shader,
                entry_point: Some("vs_main"),
                compilation_options: PipelineCompilationOptions::default(),
                buffers: &[],
            },
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                ..PrimitiveState::default()
            },
            depth_stencil: None,
            multisample: MultisampleState::default(),
            fragment: Some(FragmentState {
                module: &mip_shader,
                entry_point: Some("fs_main"),
                compilation_options: PipelineCompilationOptions::default(),
                targets: &[Some(ColorTargetState {
                    format: TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let camera_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: LABEL,
            entries: &[twgpu::GpuCamera::bind_group_layout_entry(0)],
        });
        let display_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: LABEL,
            entries: &[
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        sample_type: TextureSampleType::Float { filterable: true },
                        view_dimension: TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let display_shader = device.create_shader_module(wgpu::include_wgsl!("nameplate.wgsl"));
        let display_pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: LABEL,
            bind_group_layouts: &[Some(&camera_layout), Some(&display_layout)],
            immediate_size: 0,
        });
        let blend = Some(BlendState {
            color: BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                operation: wgpu::BlendOperation::Add,
            },
        });
        let make_pipeline = |fragment: &str| {
            device.create_render_pipeline(&RenderPipelineDescriptor {
                label: LABEL,
                layout: Some(&display_pipeline_layout),
                vertex: VertexState {
                    module: &display_shader,
                    entry_point: Some("vs_main"),
                    compilation_options: PipelineCompilationOptions::default(),
                    buffers: &[Some(wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<GlyphVertex>() as u64,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![
                            0 => Float32x2,
                            1 => Float32x2,
                            2 => Float32
                        ],
                    })],
                },
                primitive: PrimitiveState {
                    topology: PrimitiveTopology::TriangleList,
                    ..PrimitiveState::default()
                },
                depth_stencil: None,
                multisample: MultisampleState::default(),
                fragment: Some(FragmentState {
                    module: &display_shader,
                    entry_point: Some(fragment),
                    compilation_options: PipelineCompilationOptions::default(),
                    targets: &[Some(ColorTargetState {
                        format,
                        blend,
                        write_mask: ColorWrites::ALL,
                    })],
                }),
                multiview_mask: None,
                cache: None,
            })
        };
        let mono_pipeline = make_pipeline("fs_mono");
        let color_pipeline = make_pipeline("fs_color");

        let camera_buffer = twgpu::GpuCamera::upload(&twgpu::Camera::new(1.), &device);
        let camera_bind_group = device.create_bind_group(&BindGroupDescriptor {
            label: LABEL,
            layout: &camera_layout,
            entries: &[BindGroupEntry {
                binding: 0,
                resource: BindingResource::Buffer(camera_buffer.full_binding()),
            }],
        });
        let sampler = device.create_sampler(&SamplerDescriptor {
            label: LABEL,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            // 小字号是缩得很厉害的 mip 采样,关掉 mipmap 就会有点状杂边
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..SamplerDescriptor::default()
        });
        let vertex_capacity = 4 * 256;
        let vertex_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: LABEL,
            size: (vertex_capacity * std::mem::size_of::<GlyphVertex>()) as u64,
            usage: BufferUsages::VERTEX | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let renderer = Self {
            device,
            queue,
            gen_layout,
            gen_pipeline,
            mip_pipeline,
            display_layout,
            mono_pipeline,
            color_pipeline,
            camera_buffer,
            camera_bind_group,
            sampler,
            vertex_buffer,
            vertex_capacity,
            mono_pages: Vec::new(),
            color_pages: Vec::new(),
            glyphs: HashMap::new(),
            quads: Vec::new(),
            draw_items: Vec::new(),
            cpu_sdf,
            page_mips: if cpu_sdf { 1 } else { ATLAS_MIPS },
        };
        let mut renderer = renderer;
        renderer.warmup();
        renderer
    }

    /// 在加载阶段把两条 pipeline 都真跑一遍:WebGL 的 shader 编译是懒的,
    /// 不预热的话第一个字形上传会卡 20ms 左右(正好落在名字刚出现的时候)。
    fn warmup(&mut self) {
        // 预创建并初始化一页 mono/color atlas:1024x1024 的纹理第一次真正使用
        // 时,WebGL 要分配 + 清零,正好会落在第一个字形上传上
        let mut warm_page = None;
        if let Some((page, x, y)) = self.allocate_page(false, 8, 8) {
            warm_page = Some((page, x, y));
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.mono_pages[page].texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                &[0u8; 8 * 8 * 4],
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(8 * 4),
                    rows_per_image: Some(8),
                },
                wgpu::Extent3d {
                    width: 8,
                    height: 8,
                    depth_or_array_layers: 1,
                },
            );
        }
        if let Some((page, x, y)) = self.allocate_page(true, 8, 8) {
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.color_pages[page].texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                &[0u8; 4],
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4),
                    rows_per_image: Some(1),
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
        }
        let source = self.device.create_texture(&TextureDescriptor {
            label: LABEL,
            size: wgpu::Extent3d {
                width: 8,
                height: 8,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::R8Unorm,
            usage: TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let source_view = source.create_view(&TextureViewDescriptor::default());
        let sdf_target = self.device.create_texture(&TextureDescriptor {
            label: LABEL,
            size: wgpu::Extent3d {
                width: 8,
                height: 8,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let sdf_view = sdf_target.create_view(&TextureViewDescriptor::default());
        let gen_bind = self.device.create_bind_group(&BindGroupDescriptor {
            label: LABEL,
            layout: &self.gen_layout,
            entries: &[BindGroupEntry {
                binding: 0,
                resource: BindingResource::TextureView(&source_view),
            }],
        });
        let dummy_page = self.device.create_texture(&TextureDescriptor {
            label: LABEL,
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::TEXTURE_BINDING
                | TextureUsages::COPY_DST
                | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let dummy_view = dummy_page.create_view(&TextureViewDescriptor::default());
        let display_bind = self.device.create_bind_group(&BindGroupDescriptor {
            label: LABEL,
            layout: &self.display_layout,
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: BindingResource::TextureView(&dummy_view),
                },
                BindGroupEntry {
                    binding: 1,
                    resource: BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        let dummy_vertices = [GlyphVertex {
            pos: [0., 0.],
            uv: [0., 0.],
            outline: 0.,
            _pad: 0.,
        }; 6];
        let dummy_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: LABEL,
            size: (dummy_vertices.len() * std::mem::size_of::<GlyphVertex>()) as u64,
            usage: BufferUsages::VERTEX | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        self.queue
            .write_buffer(&dummy_buffer, 0, bytemuck::cast_slice(&dummy_vertices));
        let display_target = self.device.create_texture(&TextureDescriptor {
            label: LABEL,
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let display_view = display_target.create_view(&TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: LABEL });
        // X5 那条路(SDF 由 JS 算)完全不碰「渲染到临时纹理 + copy」,这两步也就不用预热
        if self.page_mips > 1 {
            let mut pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: LABEL,
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &sdf_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(wgpu::Color::BLACK),
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.gen_pipeline);
            pass.set_bind_group(0, &gen_bind, &[]);
            pass.draw(0..3, 0..1);
        }
        if let (Some((page, x, y)), true) = (warm_page, self.page_mips > 1) {
            encoder.copy_texture_to_texture(
                sdf_target.as_image_copy(),
                wgpu::TexelCopyTextureInfo {
                    texture: &self.mono_pages[page].texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d {
                    width: 8,
                    height: 8,
                    depth_or_array_layers: 1,
                },
            );
        }
        for pipeline in [&self.mono_pipeline, &self.color_pipeline] {
            let mut pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: LABEL,
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &display_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(wgpu::Color::BLACK),
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &self.camera_bind_group, &[]);
            pass.set_bind_group(1, &display_bind, &[]);
            pass.set_vertex_buffer(0, dummy_buffer.slice(..));
            pass.draw(0..6, 0..1);
        }
        self.queue.submit([encoder.finish()]);
    }

    /// 上传一个字形的位图。`color == false` 时 `pixels` 是 alpha(1 字节/像素),
    /// 会在 GPU 上生成 SDF;否则是 RGBA,直接进彩色 atlas。
    pub fn upload_glyph(
        &mut self,
        id: u32,
        width: u32,
        height: u32,
        color: bool,
        pixels: &[u8],
    ) -> Result<(), String> {
        if width == 0
            || height == 0
            || width > ATLAS_SIZE - 2 * ATLAS_PAD
            || height > ATLAS_SIZE - 2 * ATLAS_PAD
        {
            return Err("invalid glyph size".into());
        }
        let expected = if color {
            width as usize * height as usize * 4
        } else {
            width as usize * height as usize
        };
        if pixels.len() != expected {
            return Err("glyph pixel buffer size mismatch".into());
        }
        let (page_index, x, y) = self
            .allocate_page(color, width, height)
            .ok_or_else(|| "glyph atlas is full".to_string())?;
        if color {
            let page = &self.color_pages[page_index];
            let row_bytes = width as usize * 4;
            let padded = (row_bytes + 255) & !255;
            let mut buffer = vec![0u8; padded * height as usize];
            for row in 0..height as usize {
                buffer[row * padded..row * padded + row_bytes]
                    .copy_from_slice(&pixels[row * row_bytes..(row + 1) * row_bytes]);
            }
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &page.texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                &buffer,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded as u32),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        } else if self.cpu_sdf {
            // X5:距离场在 wasm 里用 CPU 算(精确 EDT),然后直接 write_texture 进 atlas。
            // 全程没有渲染到纹理、也没有 copy_texture_to_texture。
            let sdf = sdf_from_alpha(pixels, width as usize, height as usize);
            let row_bytes = width as usize * 4;
            let padded = (row_bytes + 255) & !255;
            let mut buffer = vec![0u8; padded * height as usize];
            for (row, values) in sdf.chunks_exact(width as usize).enumerate() {
                for (col, value) in values.iter().enumerate() {
                    let at = row * padded + col * 4;
                    buffer[at] = *value;
                    buffer[at + 1] = *value;
                    buffer[at + 2] = *value;
                    buffer[at + 3] = 255;
                }
            }
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.mono_pages[page_index].texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                &buffer,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded as u32),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            // alpha 位图 -> 临时 R8 源纹理;SDF 先渲染到字形大小的临时目标,
            // 再 copy 到 atlas 的分配区域(避免依赖 sub-viewport/scissor)
            let source = self.device.create_texture(&TextureDescriptor {
                label: LABEL,
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: TextureFormat::R8Unorm,
                usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
                view_formats: &[],
            });
            let row_bytes = width as usize;
            let padded = (row_bytes + 255) & !255;
            let mut buffer = vec![0u8; padded * height as usize];
            for row in 0..height as usize {
                buffer[row * padded..row * padded + row_bytes]
                    .copy_from_slice(&pixels[row * row_bytes..(row + 1) * row_bytes]);
            }
            self.queue.write_texture(
                source.as_image_copy(),
                &buffer,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded as u32),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
            let source_view = source.create_view(&TextureViewDescriptor::default());
            let sdf_target = self.device.create_texture(&TextureDescriptor {
                label: LABEL,
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: TextureDimension::D2,
                format: TextureFormat::Rgba8Unorm,
                usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::COPY_SRC,
                view_formats: &[],
            });
            let sdf_view = sdf_target.create_view(&TextureViewDescriptor::default());
            let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
                label: LABEL,
                layout: &self.gen_layout,
                entries: &[BindGroupEntry {
                    binding: 0,
                    resource: BindingResource::TextureView(&source_view),
                }],
            });
            let mut encoder = self
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: LABEL });
            {
                let mut pass = encoder.begin_render_pass(&RenderPassDescriptor {
                    label: LABEL,
                    color_attachments: &[Some(RenderPassColorAttachment {
                        view: &sdf_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(wgpu::Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                    multiview_mask: None,
                });
                pass.set_pipeline(&self.gen_pipeline);
                pass.set_bind_group(0, &bind_group, &[]);
                pass.draw(0..3, 0..1);
            }
            encoder.copy_texture_to_texture(
                sdf_target.as_image_copy(),
                wgpu::TexelCopyTextureInfo {
                    texture: &self.mono_pages[page_index].texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x, y, z: 0 },
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
            self.queue.submit([encoder.finish()]);
        }
        self.regenerate_mips(color, page_index);
        let rect_x = x as f32;
        let rect_y = y as f32;
        self.glyphs.insert(
            id,
            Glyph {
                page: page_index,
                color,
                uv: [
                    (rect_x + UV_INSET) / ATLAS_SIZE as f32,
                    (rect_y + UV_INSET) / ATLAS_SIZE as f32,
                    (rect_x + width as f32 - UV_INSET) / ATLAS_SIZE as f32,
                    (rect_y + height as f32 - UV_INSET) / ATLAS_SIZE as f32,
                ],
            },
        );
        Ok(())
    }

    fn allocate_page(&mut self, color: bool, width: u32, height: u32) -> Option<(usize, u32, u32)> {
        let need_w = width + 2 * ATLAS_PAD;
        let need_h = height + 2 * ATLAS_PAD;
        {
            let pages = if color {
                &mut self.color_pages
            } else {
                &mut self.mono_pages
            };
            for (index, page) in pages.iter_mut().enumerate() {
                for shelf in page.shelves.iter_mut() {
                    if need_h <= shelf.height && shelf.x + need_w <= ATLAS_SIZE {
                        let x = shelf.x;
                        shelf.x += need_w;
                        return Some((index, x + ATLAS_PAD, shelf.y + ATLAS_PAD));
                    }
                }
                let y = page.shelves.last().map(|s| s.y + s.height).unwrap_or(0);
                if y + need_h <= ATLAS_SIZE {
                    page.shelves.push(Shelf {
                        y,
                        height: need_h,
                        x: need_w,
                    });
                    return Some((index, ATLAS_PAD, y + ATLAS_PAD));
                }
            }
        }
        // 新开一页
        let texture = self.device.create_texture(&TextureDescriptor {
            label: LABEL,
            size: wgpu::Extent3d {
                width: ATLAS_SIZE,
                height: ATLAS_SIZE,
                depth_or_array_layers: 1,
            },
            mip_level_count: self.page_mips,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::TEXTURE_BINDING
                | TextureUsages::COPY_DST
                | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&TextureViewDescriptor::default());
        // 每一级的 view + 采样上一级的 bind group
        let mut mip_views = Vec::new();
        let mut mip_binds = Vec::new();
        for level in 0..self.page_mips {
            let level_view = texture.create_view(&TextureViewDescriptor {
                label: LABEL,
                base_mip_level: level,
                mip_level_count: Some(1),
                ..TextureViewDescriptor::default()
            });
            if level + 1 < self.page_mips {
                mip_binds.push(self.device.create_bind_group(&BindGroupDescriptor {
                    label: LABEL,
                    layout: &self.gen_layout,
                    entries: &[BindGroupEntry {
                        binding: 0,
                        resource: BindingResource::TextureView(&level_view),
                    }],
                }));
            }
            mip_views.push(level_view);
        }
        let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
            label: LABEL,
            layout: &self.display_layout,
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: BindingResource::TextureView(&view),
                },
                BindGroupEntry {
                    binding: 1,
                    resource: BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        let page = Page {
            texture,
            bind_group,
            mip_views,
            mip_binds,
            shelves: vec![Shelf {
                y: 0,
                height: need_h,
                x: need_w,
            }],
        };
        let pages = if color {
            &mut self.color_pages
        } else {
            &mut self.mono_pages
        };
        let index = pages.len();
        pages.push(page);
        Some((index, ATLAS_PAD, ATLAS_PAD))
    }

    /// 上传完一个字形之后重建这一页的 mip 链(逐级 2x2 降采样)
    fn regenerate_mips(&self, color: bool, page_index: usize) {
        let pages = if color {
            &self.color_pages
        } else {
            &self.mono_pages
        };
        let Some(page) = pages.get(page_index) else {
            return;
        };
        if page.mip_views.len() <= 1 {
            return;
        }
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: LABEL });
        for level in 1..page.mip_views.len() {
            let mut pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: LABEL,
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &page.mip_views[level],
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.mip_pipeline);
            pass.set_bind_group(0, &page.mip_binds[level - 1], &[]);
            pass.draw(0..3, 0..1);
        }
        self.queue.submit([encoder.finish()]);
    }

    /// 每帧的名字牌字形:`[id, cx, cy, w, h, outline_em]` × n
    pub fn set_quads(&mut self, data: &[f32]) {
        self.quads.clear();
        for chunk in data.chunks_exact(6) {
            self.quads.push(Quad {
                id: chunk[0] as u32,
                center: [chunk[1], chunk[2]],
                size: [chunk[3], chunk[4]],
                outline: chunk[5].clamp(0., 0.5),
            });
        }
    }

    /// 在 render pass 之前更新相机和顶点缓冲。
    pub fn prepare(&mut self, camera: &twgpu::Camera) {
        self.camera_buffer.update(camera, &self.queue);
        self.draw_items.clear();
        let mut vertices: Vec<GlyphVertex> = Vec::with_capacity(self.quads.len() * 4);
        for quad in &self.quads {
            let Some(glyph) = self.glyphs.get(&quad.id) else {
                continue;
            };
            let half = Vec2::new(quad.size[0], quad.size[1]) / 2.;
            let center = Vec2::new(quad.center[0], quad.center[1]);
            // 两个三角形分开写(0,1,2 / 2,1,3),这样多个 quad 可以放进同一个
            // triangle list 的 draw range;triangle strip 会在 quad 之间连出额外的三角形
            let corners = [
                (Vec2::new(-1., -1.), [glyph.uv[0], glyph.uv[1]]),
                (Vec2::new(1., -1.), [glyph.uv[2], glyph.uv[1]]),
                (Vec2::new(-1., 1.), [glyph.uv[0], glyph.uv[3]]),
                (Vec2::new(1., 1.), [glyph.uv[2], glyph.uv[3]]),
            ];
            let base = vertices.len() as u32;
            for index in [0, 1, 2, 2, 1, 3] {
                let (direction, uv) = corners[index];
                let position = center + direction * half;
                vertices.push(GlyphVertex {
                    pos: [position.x, position.y],
                    uv,
                    outline: quad.outline,
                    _pad: 0.,
                });
            }
            self.draw_items.push(DrawItem {
                color: glyph.color,
                page: glyph.page,
                vertex: base,
            });
        }
        if vertices.is_empty() {
            return;
        }
        if vertices.len() > self.vertex_capacity {
            self.vertex_capacity = vertices.len().next_power_of_two();
            self.vertex_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: LABEL,
                size: (self.vertex_capacity * std::mem::size_of::<GlyphVertex>()) as u64,
                usage: BufferUsages::VERTEX | BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });
        }
        self.queue
            .write_buffer(&self.vertex_buffer, 0, bytemuck::cast_slice(&vertices));
    }

    pub fn render<'a>(&'a self, pass: &mut wgpu::RenderPass<'a>) {
        if self.draw_items.is_empty() {
            return;
        }
        pass.set_bind_group(0, &self.camera_bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        let mut i = 0;
        while i < self.draw_items.len() {
            let first = &self.draw_items[i];
            let mut end = i + 1;
            while end < self.draw_items.len() {
                let next = &self.draw_items[end];
                if next.color != first.color || next.page != first.page {
                    break;
                }
                end += 1;
            }
            let (pipeline, pages) = if first.color {
                (&self.color_pipeline, &self.color_pages)
            } else {
                (&self.mono_pipeline, &self.mono_pages)
            };
            pass.set_pipeline(pipeline);
            pass.set_bind_group(1, &pages[first.page].bind_group, &[]);
            let start = self.draw_items[i].vertex;
            let count = (end - i) as u32 * 6;
            pass.draw(start..start + count, 0..1);
            i = end;
        }
    }
}
