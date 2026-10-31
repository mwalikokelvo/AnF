//! Original-page images from retained local PDFs; never accepts a caller file path.
use crate::{projects, reader, settings};
use std::path::{Path, PathBuf};
static RENDER: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> = std::sync::LazyLock::new(||std::sync::Arc::new(tokio::sync::Semaphore::new(1)));

fn retained_pdf(root: &Path, path: &str) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|_| "Original PDF is unavailable. Reimport the file on this computer.")?;
    let path = Path::new(path).canonicalize().map_err(|_| "Original PDF is unavailable. Reimport the file on this computer.")?;
    let relative = path.strip_prefix(&root).map_err(|_| "Only a retained source PDF can be displayed.")?;
    let components: Vec<_> = relative.components().collect();
    if components.len()!=2 || !components[0].as_os_str().to_str().is_some_and(|s|s.len()==64 && s.bytes().all(|b|b.is_ascii_hexdigit()))
        || !path.extension().is_some_and(|s|s.eq_ignore_ascii_case("pdf"))
        || !path.is_file() || path.metadata().map_err(|_|"Original PDF is unavailable.")?.len()>50*1024*1024 {
        return Err("Only a retained PDF under 50 MB can be displayed.".into());
    }
    Ok(path)
}

#[tauri::command]
pub async fn workspace_pdf_page(window: tauri::WebviewWindow, store: tauri::State<'_,projects::Store>, project_id:String, source_index:usize, page:usize) -> Result<String,String> {
    if window.label()!="workspace" {return Err("Original pages are available only in the workspace.".into());}
    if source_index>=4 || page==0 || page>600 {return Err("Choose a valid document page.".into());}
    let permit=RENDER.clone().try_acquire_owned().map_err(|_|"A PDF page is still rendering. Try again in a moment.")?;
    let store=store.inner().clone();
    let result=tokio::task::spawn_blocking(move||{
        let _permit=permit;
        let project=store.load(&project_id)?;
        let source=project.sources.get(source_index).ok_or("Source is no longer in this project.")?;
        if page>source.pages.len() {return Err("Page is outside this document.".into());}
        let path=retained_pdf(&settings::local_dir().join("sources"),source.path.as_deref().ok_or("Original file was not transferred with this document. Reimport it locally.")?)?;
        let png=reader::pdf_preview_page(&path,(page-1) as u32).map_err(|_|"Windows could not render this PDF page. Reading text is still available.")?;
        if png.len()>8_000_000 || !png.starts_with(b"\x89PNG\r\n\x1a\n") {return Err("This page cannot be displayed within the preview limit.".into());}
        Ok(format!("data:image/png;base64,{}",crate::claude::base64_for(&png)))
    }).await.map_err(|_|"PDF rendering stopped.")?;
    result
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn rejects_paths_outside_the_retained_source_tree(){
  let temp=std::env::temp_dir().join(format!("anf-pdf-{}",crate::local_ai::random_key().unwrap()));
  let root=temp.join("sources");let id="a".repeat(64);let folder=root.join(&id);std::fs::create_dir_all(&folder).unwrap();
  let pdf=folder.join("book.pdf");std::fs::write(&pdf,b"%PDF-").unwrap();
  assert_eq!(retained_pdf(&root,&pdf.to_string_lossy()).unwrap(),pdf.canonicalize().unwrap());
  let outside=temp.join("private.pdf");std::fs::write(&outside,b"%PDF-").unwrap();assert!(retained_pdf(&root,&outside.to_string_lossy()).is_err());
  let wrong=folder.join("book.txt");std::fs::write(&wrong,b"text").unwrap();assert!(retained_pdf(&root,&wrong.to_string_lossy()).is_err());
  let flat=root.join("book.pdf");std::fs::write(&flat,b"%PDF-").unwrap();assert!(retained_pdf(&root,&flat.to_string_lossy()).is_err());
  std::fs::remove_file(pdf).unwrap();std::fs::remove_file(outside).unwrap();std::fs::remove_file(wrong).unwrap();std::fs::remove_file(flat).unwrap();std::fs::remove_dir(folder).unwrap();std::fs::remove_dir(root).unwrap();std::fs::remove_dir(temp).unwrap();
 }
}
