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
        if image.width() as u64 * image.height() as u64 > 25_000_000 {
            return Err("Image is too large for OCR. Resize it below 25 megapixels.".into());
        }
        let image = image
            .resize(1800, 2400, image::imageops::FilterType::Triangle)
            .into_rgb8();
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
pub fn pdf_page(path: &Path, index: u32) -> Result<Vec<u8>, String> {
    use windows::{
        Data::Pdf::{PdfDocument, PdfPageRenderOptions},
        Storage::Streams::{DataReader, DataWriter, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    // Read with ordinary file access, avoiding WinRT StorageFile path restrictions.
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
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
        opts.SetDestinationWidth(1600)?;
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
}
