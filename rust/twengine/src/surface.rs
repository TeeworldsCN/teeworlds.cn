use crate::error;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct TwSurface {
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    device: Option<wgpu::Device>,
}

#[wasm_bindgen]
impl TwSurface {
    pub(crate) fn new(
        instance: &wgpu::Instance,
        canvas: web_sys::HtmlCanvasElement,
        device: Option<wgpu::Device>,
    ) -> Result<Self, JsError> {
        let rect = canvas.get_bounding_client_rect();
        let width = rect.width() as u32;
        let height = rect.height() as u32;
        log::info!("TwEngine: Initializing {width}x{height} canvas surface");
        let surface_target = wgpu::SurfaceTarget::Canvas(canvas);
        let surface = error(instance.create_surface(surface_target))?;
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: wgpu::TextureFormat::Rgba8Unorm,
            color_space: wgpu::SurfaceColorSpace::Auto,
            width,
            height,
            present_mode: wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: 0,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: Vec::new(),
        };
        if let Some(device) = &device {
            surface.configure(device, &config);
        }
        Ok(Self {
            surface,
            config,
            device,
        })
    }

    pub(crate) fn inner(&self) -> &wgpu::Surface<'_> {
        &self.surface
    }

    /// Only required for webgl compat: https://github.com/gfx-rs/wgpu/pull/5901
    pub(crate) fn set_device(&mut self, device: wgpu::Device) {
        self.surface.configure(&device, &self.config);
        self.device = Some(device);
    }

    pub(crate) fn frame(&self) -> Result<wgpu::SurfaceTexture, JsError> {
        match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => Ok(frame),
            wgpu::CurrentSurfaceTexture::Timeout => {
                Err(JsError::new("Surface texture timeout error"))
            }
            wgpu::CurrentSurfaceTexture::Occluded => {
                Err(JsError::new("Surface texture occluded error"))
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                Err(JsError::new("Surface texture outdated error"))
            }
            wgpu::CurrentSurfaceTexture::Lost => Err(JsError::new("Surface texture lost error")),
            wgpu::CurrentSurfaceTexture::Validation => {
                Err(JsError::new("Surface texture validation error"))
            }
        }
    }

    pub(crate) fn get_size(&self) -> (u32, u32) {
        (self.config.width, self.config.height)
    }

    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) {
        self.config.width = width;
        self.config.height = height;
        self.surface
            .configure(self.device.as_ref().unwrap(), &self.config)
    }
}
