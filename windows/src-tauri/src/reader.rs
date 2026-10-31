//! Offline OCR. PDF pages are rendered by Windows, OCR is bundled Rust inference.
use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

pub struct Cancellation {
    pub epoch: Arc<AtomicU64>,
    pub job: u64,
}
impl Cancellation {
    pub fn check(&self) -> Result<(), String> {
        if self.epoch.load(Ordering::SeqCst) == self.job {
            Ok(())
        } else {
            Err("Cancelled.".into())
        }
    }
}

pub struct Reader {
    engine: OcrEngine,
}

const OCR_MAX_WIDTH: u32 = 1800;
const OCR_MAX_HEIGHT: u32 = 2400;
#[cfg(any(windows, test))]
const OCR_PDF_WIDTH: u32 = 1600;

fn validate_image_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 { return Err("Image has no pixels.".into()); }
    if width as u64 * height as u64 > 25_000_000 {
        return Err("Image is too large for OCR. Resize it below 25 megapixels.".into());
    }
    Ok(())
}

fn prepare_ocr_image(image: image::DynamicImage) -> Result<image::RgbImage, String> {
    validate_image_dimensions(image.width(), image.height())?;
    // Preserve a captured glyph's pixel grid. Upsampling a 1600x2240 PDF raster
    // to 1714x2400 blurred thin strokes and dropped letters in real OCR tests.
    // Only reduce oversized images. The source decoder is limited to 128 MB /
    // 25 MP; this stage produces at most 4.32 MP (12.96 MB RGB). OCR's normalized
    // grayscale tensor is at most 17.28 MB, in addition to model/workspace memory.
    let image = if image.width() > OCR_MAX_WIDTH || image.height() > OCR_MAX_HEIGHT {
        image.resize(OCR_MAX_WIDTH, OCR_MAX_HEIGHT, image::imageops::FilterType::Triangle)
    } else { image };
    Ok(image.into_rgb8())
}

#[cfg(any(windows, test))]
fn render_dimensions(width: f32, height: f32, max_width: u32, max_height: u32) -> Option<(u32, u32)> {
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 { return None; }
    let scale = (max_width as f32 / width).min(max_height as f32 / height);
    if !scale.is_finite() || scale <= 0.0 { return None; }
    Some(((width * scale).round().clamp(1.0, max_width as f32) as u32,
          (height * scale).round().clamp(1.0, max_height as f32) as u32))
}
impl Reader {
    pub fn new(directory: &Path) -> Result<Self, String> {
        let load = |name| {
            Model::load_file(directory.join(name))
                .map_err(|e| format!("OCR pack could not load: {e}"))
        };
        let engine = OcrEngine::new(OcrEngineParams {
            detection_model: Some(load("ocr-detection.rten")?),
            recognition_model: Some(load("ocr-recognition.rten")?),
            ..Default::default()
        })
        .map_err(|e| e.to_string())?;
        Ok(Self { engine })
    }
    pub fn image(&self, bytes: &[u8]) -> Result<String, String> {
        let mut decoder = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(10000);
        limits.max_image_height = Some(10000);
        limits.max_alloc = Some(128_000_000);
        decoder.limits(limits);
        let image = decoder
            .decode()
            .map_err(|e| format!("Image cannot be decoded safely: {e}"))?;
        let image = prepare_ocr_image(image)?;
        let source = ImageSource::from_bytes(image.as_raw(), image.dimensions())
            .map_err(|e| e.to_string())?;
        let input = self
            .engine
            .prepare_input(source)
            .map_err(|e| e.to_string())?;
        self.engine
            .get_text(&input)
            .map_err(|e| format!("OCR failed: {e}"))
    }
}

#[cfg(windows)]
pub fn pdf_page(path: &Path, index: u32) -> Result<Vec<u8>, String> { pdf_bitmap(path,index,false) }
#[cfg(windows)]
pub fn pdf_preview_page(path: &Path, index: u32) -> Result<Vec<u8>, String> { pdf_bitmap(path,index,true) }
#[cfg(windows)]
fn pdf_bitmap(path: &Path, index: u32, bounded: bool) -> Result<Vec<u8>, String> {
    use windows::{
        Data::Pdf::{PdfDocument, PdfPageRenderOptions},
        Storage::Streams::{DataReader, DataWriter, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    // Read with ordinary file access, avoiding WinRT StorageFile path restrictions.
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path).map_err(|_| "Original PDF is unavailable.")?.take(50 * 1024 * 1024 + 1).read_to_end(&mut bytes).map_err(|_| "Original PDF could not be read.")?;
    if bytes.len() > 50 * 1024 * 1024 { return Err("PDF exceeds the 50 MB limit.".into()); }
    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.is_ok();
    struct Init(bool);
    impl Drop for Init {
        fn drop(&mut self) {
            if self.0 {
                unsafe { RoUninitialize() }
            }
        }
    }
    let _init = Init(initialized);
    let render = || -> windows::core::Result<Vec<u8>> {
        let source = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&source.GetOutputStreamAt(0)?)?;
        writer.WriteBytes(&bytes)?;
        writer.StoreAsync()?.get()?;
        writer.FlushAsync()?.get()?;
        writer.DetachStream()?;
        source.Seek(0)?;
        let pdf = PdfDocument::LoadFromStreamAsync(&source)?.get()?;
        let page = pdf.GetPage(index)?;
        let opts = PdfPageRenderOptions::new()?;
        let size = page.Size()?;
        // OCR and display have independent limits. In particular, an extreme
        // aspect ratio must be bounded before Windows allocates its bitmap;
        // checking compressed stream size afterwards is too late.
        let (max_width, max_height) = if bounded { (1600, 2400) } else { (OCR_PDF_WIDTH, OCR_MAX_HEIGHT) };
        let (width, height) = render_dimensions(size.Width, size.Height, max_width, max_height)
            .ok_or_else(|| windows::core::Error::from_hresult(windows::core::HRESULT(0x80070057u32 as i32)))?;
        opts.SetDestinationWidth(width)?;
        opts.SetDestinationHeight(height)?;
        let stream = InMemoryRandomAccessStream::new()?;
        page.RenderWithOptionsToStreamAsync(&stream, &opts)?.get()?;
        let size = stream.Size()?;
        if size > 32_000_000 {
            return Err(windows::core::Error::from_hresult(windows::core::HRESULT(
                0x8007000Eu32 as i32,
            )));
        }
        let input = stream.GetInputStreamAt(0)?;
        let reader = DataReader::CreateDataReader(&input)?;
        reader.LoadAsync(size as u32)?.get()?;
        let mut bytes = vec![0; size as usize];
        reader.ReadBytes(&mut bytes)?;
        page.Close()?;
        Ok(bytes)
    };
    render().map_err(|e| format!("Scanned PDF page could not be rendered by Windows: {e}"))
}
#[cfg(not(windows))]
pub fn pdf_preview_page(path: &Path, index: u32) -> Result<Vec<u8>, String> { pdf_page(path,index) }
#[cfg(not(windows))]
pub fn pdf_page(_path: &Path, _index: u32) -> Result<Vec<u8>, String> {
    Err("Scanned PDF rendering is available on Windows.".into())
}

pub fn pack_directory() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let portable = exe.parent()?.join("local-ai");
    if portable.join("ocr-detection.rten").is_file() {
        Some(portable)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_raster_pixels_are_preserved() {
        let original = image::RgbImage::from_fn(32, 48, |x,y| image::Rgb([(x*7) as u8,(y*5) as u8,((x+y)*3) as u8]));
        let prepared = prepare_ocr_image(image::DynamicImage::ImageRgb8(original.clone())).unwrap();
        assert_eq!(prepared, original, "Small source images must not be resampled.");
    }

    #[test]
    fn oversized_rasters_are_downscaled_and_pixel_limits_remain_strict() {
        let image = image::DynamicImage::ImageRgb8(image::RgbImage::new(3600, 2400));
        assert_eq!(prepare_ocr_image(image).unwrap().dimensions(), (1800, 1200));
        assert!(validate_image_dimensions(5000, 5000).is_ok());
        assert!(validate_image_dimensions(5001, 5000).is_err());
        assert!(validate_image_dimensions(u32::MAX, u32::MAX).is_err());
        assert!(validate_image_dimensions(0, 1400).is_err());
    }

    #[test]
    fn pdf_raster_is_bounded_before_rendering_including_extreme_shapes() {
        assert_eq!(render_dimensions(500.0, 700.0, OCR_PDF_WIDTH, OCR_MAX_HEIGHT), Some((1600, 2240)));
        assert_eq!(render_dimensions(100.0, 100_000.0, OCR_PDF_WIDTH, OCR_MAX_HEIGHT), Some((2, 2400)));
        assert_eq!(render_dimensions(100_000.0, 100.0, OCR_PDF_WIDTH, OCR_MAX_HEIGHT), Some((1600, 2)));
        for (w,h) in [(f32::NAN,1.0),(1.0,f32::INFINITY),(0.0,1.0),(-1.0,1.0)] { assert!(render_dimensions(w,h,1600,2400).is_none()); }
    }
    #[test]
    #[ignore = "runs real bundled OCR models and Windows scanned-PDF rendering"]
    fn scanned_pdf_is_read_with_page_reference() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let s = crate::workspace::read_file_with(
            &root.join("tests/data/scan.pdf").to_string_lossy(),
            Some(&root.join("../local-ai")),
            None,
        )
        .unwrap();
        assert!(
            s.text.to_lowercase().contains("seven letters"),
            "OCR: {}",
            s.text
        );
        assert_eq!(s.pages[0].number, 1);
        assert!(s.pages[0].ocr);
    }

    #[test]
    #[ignore = "diagnostic: bundled model reads initial El as Fl in Atkinson; retain strict corpus expectations"]
    fn native_and_noisy_skewed_latin_corpus_keeps_text_and_footnotes() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let reader = Reader::new(&root.join("../local-ai")).unwrap();
        for file in ["ocr-native-small.png", "ocr-noisy-skew.jpg"] {
            let bytes = std::fs::read(root.join("tests/data").join(file)).unwrap();
            let text = reader.image(&bytes).unwrap();
            let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
            for phrase in ["reading notes stay on this computer", "le jardin contient trente roses", "el libro tiene cinco cartas", "footnote: page 42"] {
                assert!(normalized.contains(phrase), "{file} lost {phrase:?}. OCR: {text}");
            }
        }
    }
}
