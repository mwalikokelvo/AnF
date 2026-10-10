//! Bounded, lazy EPUB/TXT ingestion. Archives are never extracted to disk.
use crate::CoreError;
use quick_xml::events::Event;
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    io::{Cursor, Read},
    sync::{Arc, Mutex},
};
use zeroize::{Zeroize, Zeroizing};
use zip::ZipArchive;

#[derive(Clone, Debug, uniffi::Record)]
pub struct DocumentMetadata {
    pub title: String,
    pub authors: Vec<String>,
    pub languages: Vec<String>,
    pub series: String,
    pub series_number: String,
    pub publication_date: String,
    pub chapters: u32,
    pub cover_media_type: String,
}
struct SecretBytes(Zeroizing<Vec<u8>>);
impl AsRef<[u8]> for SecretBytes {
    fn as_ref(&self) -> &[u8] {
        self.0.as_slice()
    }
}
type Archive = ZipArchive<Cursor<SecretBytes>>;
struct Document {
    metadata: DocumentMetadata,
    archive: Option<Archive>,
    paths: Vec<String>,
    text: Option<Zeroizing<String>>,
    slices: Vec<(usize, usize)>,
    cover_path: String,
}
impl Drop for Document {
    fn drop(&mut self) {
        self.metadata.title.zeroize();
        self.metadata.authors.zeroize();
        self.metadata.languages.zeroize();
        self.metadata.series.zeroize();
        self.metadata.series_number.zeroize();
        self.metadata.publication_date.zeroize();
        self.paths.zeroize();
        self.cover_path.zeroize();
    }
}
#[derive(uniffi::Object)]
pub struct DocumentSession {
    document: Mutex<Option<Document>>,
}

fn entry(archive: &mut Archive, path: &str, limit: usize) -> Result<Zeroizing<Vec<u8>>, CoreError> {
    let mut file = archive.by_name(path).map_err(|_| CoreError::InvalidInput)?;
    if file.size() > limit as u64 {
        return Err(CoreError::InvalidInput);
    }
    let mut output = Zeroizing::new(Vec::new());
    (&mut file)
        .take(limit as u64 + 1)
        .read_to_end(&mut output)
        .map_err(|_| CoreError::InvalidInput)?;
    if output.len() > limit {
        return Err(CoreError::InvalidInput);
    }
    Ok(output)
}
fn xml(bytes: &[u8]) -> Result<&str, CoreError> {
    let value = std::str::from_utf8(bytes)
        .map_err(|_| CoreError::InvalidInput)?
        .trim_start_matches('\u{feff}');
    if value.contains("<!ENTITY") {
        return Err(CoreError::InvalidInput);
    }
    Ok(value)
}
fn metadata_xml(bytes: &[u8]) -> Result<&str, CoreError> {
    let value = xml(bytes)?;
    if value.contains("<!DOCTYPE") {
        return Err(CoreError::InvalidInput);
    }
    Ok(value)
}
fn archive_path(package: &str, href: &str) -> Result<String, CoreError> {
    let base = url::Url::parse(&format!("https://epub.invalid/{package}"))
        .map_err(|_| CoreError::InvalidInput)?;
    let target = base.join(href).map_err(|_| CoreError::InvalidInput)?;
    if target.host_str() != Some("epub.invalid")
        || target.scheme() != "https"
        || target.query().is_some()
    {
        return Err(CoreError::InvalidInput);
    }
    let path = percent_encoding::percent_decode_str(target.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| CoreError::InvalidInput)?;
    if path.is_empty()
        || path.contains('\0')
        || path.contains('\\')
        || path.split('/').any(|p| p == "..")
    {
        return Err(CoreError::InvalidInput);
    }
    Ok(path.into_owned())
}
#[derive(Default, Deserialize)]
struct Container {
    rootfiles: Rootfiles,
}
#[derive(Default, Deserialize)]
struct Rootfiles {
    #[serde(default)]
    rootfile: Vec<Rootfile>,
}
#[derive(Default, Deserialize)]
struct Rootfile {
    #[serde(rename = "@full-path")]
    path: String,
}
#[derive(Default, Deserialize)]
struct Package {
    metadata: Metadata,
    manifest: Manifest,
    spine: Spine,
}
#[derive(Default, Deserialize)]
struct Metadata {
    #[serde(default)]
    title: Vec<String>,
    #[serde(default)]
    creator: Vec<String>,
    #[serde(default)]
    language: Vec<String>,
    #[serde(default)]
    date: Vec<String>,
    #[serde(default)]
    meta: Vec<Meta>,
}
#[derive(Default, Deserialize)]
struct Meta {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@content", default)]
    content: String,
    #[serde(rename = "@property", default)]
    property: String,
    #[serde(rename = "$text", default)]
    text: String,
}
#[derive(Default, Deserialize)]
struct Manifest {
    #[serde(default)]
    item: Vec<Item>,
}
#[derive(Default, Deserialize)]
struct Item {
    #[serde(rename = "@id")]
    id: String,
    #[serde(rename = "@href")]
    href: String,
    #[serde(rename = "@media-type")]
    media_type: String,
    #[serde(rename = "@properties", default)]
    properties: String,
}
#[derive(Default, Deserialize)]
struct Spine {
    #[serde(default)]
    itemref: Vec<Itemref>,
}
#[derive(Default, Deserialize)]
struct Itemref {
    #[serde(rename = "@idref")]
    idref: String,
    #[serde(rename = "@linear", default)]
    linear: String,
}

fn chapter_text(data: &[u8]) -> Result<String, CoreError> {
    let mut reader = quick_xml::Reader::from_str(xml(data)?);
    let mut output = String::new();
    let mut blocked = 0u32;
    loop {
        match reader.read_event().map_err(|_| CoreError::InvalidInput)? {
            Event::Start(e) => {
                let name = e.local_name();
                if blocked > 0
                    || matches!(
                        name.as_ref(),
                        b"head" | b"script" | b"style" | b"iframe" | b"object"
                    )
                {
                    blocked += 1;
                } else if matches!(name.as_ref(), b"p" | b"div" | b"h1" | b"h2" | b"h3" | b"li") {
                    output.push('\n');
                }
            }
            Event::End(_) => {
                blocked = blocked.saturating_sub(1);
            }
            Event::Empty(e) if blocked == 0 && e.local_name().as_ref() == b"br" => {
                output.push('\n')
            }
            Event::Text(e) if blocked == 0 => {
                output.push_str(&e.unescape().map_err(|_| CoreError::InvalidInput)?)
            }
            Event::CData(e) if blocked == 0 => output
                .push_str(std::str::from_utf8(e.as_ref()).map_err(|_| CoreError::InvalidInput)?),
            Event::DocType(e) => {
                let bytes: &[u8] = e.as_ref();
                if bytes.contains(&b'[') {
                    return Err(CoreError::InvalidInput);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(output.trim().to_owned())
}
fn decode_text(data: &[u8]) -> Result<Zeroizing<String>, CoreError> {
    if data.starts_with(&[0xff, 0xfe]) || data.starts_with(&[0xfe, 0xff]) {
        if !data.len().is_multiple_of(2) {
            return Err(CoreError::InvalidInput);
        }
        let little = data[0] == 0xff;
        let words = Zeroizing::new(
            data[2..]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|v| {
                    if little {
                        u16::from_le_bytes([v[0], v[1]])
                    } else {
                        u16::from_be_bytes([v[0], v[1]])
                    }
                })
                .collect::<Vec<_>>(),
        );
        Ok(Zeroizing::new(
            String::from_utf16(&words).map_err(|_| CoreError::InvalidInput)?,
        ))
    } else {
        Ok(Zeroizing::new(
            std::str::from_utf8(data)
                .map_err(|_| CoreError::InvalidInput)?
                .trim_start_matches('\u{feff}')
                .into(),
        ))
    }
}
fn text_slices(text: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + 32 * 1024).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        if end < text.len() {
            if let Some(line) = text[start..end].rfind('\n') {
                if line > 24 * 1024 {
                    end = start + line + 1;
                }
            }
        }
        ranges.push((start, end));
        start = end;
    }
    if ranges.is_empty() {
        ranges.push((0, 0));
    }
    ranges
}

#[uniffi::export]
impl DocumentSession {
    #[uniffi::constructor]
    pub fn open(data: Vec<u8>, format: String) -> Result<Arc<Self>, CoreError> {
        let data = Zeroizing::new(data);
        if data.is_empty() || data.len() > 100 * 1024 * 1024 {
            return Err(CoreError::InvalidInput);
        }
        let document = if format == "TXT" {
            let text = decode_text(&data)?;
            let slices = text_slices(&text);
            Document {
                metadata: DocumentMetadata {
                    title: String::new(),
                    authors: vec![],
                    languages: vec![],
                    series: String::new(),
                    series_number: String::new(),
                    publication_date: String::new(),
                    chapters: slices.len() as u32,
                    cover_media_type: String::new(),
                },
                archive: None,
                paths: vec![],
                text: Some(text),
                slices,
                cover_path: String::new(),
            }
        } else if format == "EPUB" {
            let mut archive = ZipArchive::new(Cursor::new(SecretBytes(data)))
                .map_err(|_| CoreError::InvalidInput)?;
            if archive.len() > 10000 {
                return Err(CoreError::InvalidInput);
            }
            let mut names = HashSet::new();
            let mut expanded = 0u64;
            for i in 0..archive.len() {
                let file = archive
                    .by_index_raw(i)
                    .map_err(|_| CoreError::InvalidInput)?;
                if !names.insert(file.name().to_owned()) || file.name().len() > 4096 {
                    return Err(CoreError::InvalidInput);
                }
                expanded = expanded
                    .checked_add(file.size())
                    .ok_or(CoreError::InvalidInput)?;
                if expanded > 256 * 1024 * 1024 {
                    return Err(CoreError::InvalidInput);
                }
            }
            if entry(&mut archive, "mimetype", 100)?.as_slice() != b"application/epub+zip" {
                return Err(CoreError::InvalidInput);
            }
            let container = entry(&mut archive, "META-INF/container.xml", 1024 * 1024)?;
            let container: Container = quick_xml::de::from_str(metadata_xml(&container)?)
                .map_err(|_| CoreError::InvalidInput)?;
            let package_path = container
                .rootfiles
                .rootfile
                .first()
                .ok_or(CoreError::InvalidInput)?
                .path
                .clone();
            let package_bytes = entry(&mut archive, &package_path, 2 * 1024 * 1024)?;
            let package: Package = quick_xml::de::from_str(metadata_xml(&package_bytes)?)
                .map_err(|_| CoreError::InvalidInput)?;
            let manifest: HashMap<_, _> = package
                .manifest
                .item
                .into_iter()
                .map(|i| (i.id.clone(), i))
                .collect();
            let paths: Result<Vec<_>, _> = package
                .spine
                .itemref
                .into_iter()
                .filter(|i| i.linear != "no")
                .map(|i| {
                    let item = manifest.get(&i.idref).ok_or(CoreError::InvalidInput)?;
                    if !matches!(
                        item.media_type.as_str(),
                        "application/xhtml+xml" | "text/html"
                    ) {
                        return Err(CoreError::InvalidInput);
                    }
                    archive_path(&package_path, &item.href)
                })
                .collect();
            let paths = paths?;
            if paths.is_empty() || paths.len() > 10000 {
                return Err(CoreError::InvalidInput);
            }
            let metadata = package.metadata;
            let series = metadata
                .meta
                .iter()
                .find(|m| m.name == "calibre:series" || m.property == "belongs-to-collection")
                .map(|m| {
                    if m.content.is_empty() {
                        m.text.clone()
                    } else {
                        m.content.clone()
                    }
                })
                .unwrap_or_default();
            let number = metadata
                .meta
                .iter()
                .find(|m| m.name == "calibre:series_index" || m.property == "group-position")
                .map(|m| {
                    if m.content.is_empty() {
                        m.text.clone()
                    } else {
                        m.content.clone()
                    }
                })
                .unwrap_or_default();
            let cover_id = metadata
                .meta
                .iter()
                .find(|m| m.name == "cover")
                .map(|m| m.content.as_str());
            let cover = manifest.values().find(|i| {
                i.properties.split_whitespace().any(|p| p == "cover-image")
                    || cover_id == Some(i.id.as_str())
            });
            let cover_path = cover
                .map(|i| archive_path(&package_path, &i.href))
                .transpose()?
                .unwrap_or_default();
            Document {
                metadata: DocumentMetadata {
                    title: metadata.title.first().cloned().unwrap_or_default(),
                    authors: metadata.creator,
                    languages: metadata.language,
                    series,
                    series_number: number,
                    publication_date: metadata.date.first().cloned().unwrap_or_default(),
                    chapters: paths.len() as u32,
                    cover_media_type: cover.map(|i| i.media_type.clone()).unwrap_or_default(),
                },
                archive: Some(archive),
                paths,
                text: None,
                slices: vec![],
                cover_path,
            }
        } else {
            return Err(CoreError::InvalidInput);
        };
        Ok(Arc::new(Self {
            document: Mutex::new(Some(document)),
        }))
    }
    pub fn metadata(&self) -> Result<DocumentMetadata, CoreError> {
        Ok(self
            .document
            .lock()
            .map_err(|_| CoreError::Locked)?
            .as_ref()
            .ok_or(CoreError::Locked)?
            .metadata
            .clone())
    }
    pub fn chapter(&self, index: u32) -> Result<String, CoreError> {
        let mut guard = self.document.lock().map_err(|_| CoreError::Locked)?;
        let document = guard.as_mut().ok_or(CoreError::Locked)?;
        if index >= document.metadata.chapters {
            return Err(CoreError::InvalidInput);
        }
        if let Some(text) = &document.text {
            let (start, end) = document.slices[index as usize];
            return Ok(text[start..end].into());
        }
        let path = &document.paths[index as usize];
        chapter_text(&entry(
            document.archive.as_mut().ok_or(CoreError::Locked)?,
            path,
            4 * 1024 * 1024,
        )?)
    }
    pub fn cover(&self) -> Result<Vec<u8>, CoreError> {
        let mut guard = self.document.lock().map_err(|_| CoreError::Locked)?;
        let document = guard.as_mut().ok_or(CoreError::Locked)?;
        if document.cover_path.is_empty() {
            return Ok(vec![]);
        }
        Ok(entry(
            document.archive.as_mut().ok_or(CoreError::Locked)?,
            &document.cover_path,
            3 * 1024 * 1024,
        )?
        .to_vec())
    }
    pub fn close(&self) -> Result<(), CoreError> {
        self.document.lock().map_err(|_| CoreError::Locked)?.take();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    #[test]
    fn text_and_close() {
        let doc = DocumentSession::open(
            b"\xef\xbb\xbfA whole document\nSecond sentence.".to_vec(),
            "TXT".into(),
        )
        .unwrap();
        assert!(doc.chapter(0).unwrap().starts_with("A whole"));
        doc.close().unwrap();
        assert!(doc.chapter(0).is_err());
        assert!(doc.metadata().is_err());
        for bytes in [vec![0xff, 0xfe, 65, 0], vec![0xfe, 0xff, 0, 65]] {
            assert_eq!(
                DocumentSession::open(bytes, "TXT".into())
                    .unwrap()
                    .chapter(0)
                    .unwrap(),
                "A"
            );
        }
        let text = "🙂 chapter text\n".repeat(10000);
        let doc = DocumentSession::open(text.as_bytes().to_vec(), "TXT".into()).unwrap();
        assert_eq!(
            (0..doc.metadata().unwrap().chapters)
                .map(|i| doc.chapter(i).unwrap())
                .collect::<String>(),
            text
        );
    }
    #[test]
    fn epub_metadata_lazy_text_and_cover() {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (path, data) in [
            ("mimetype", "application/epub+zip"),
            (
                "META-INF/container.xml",
                r#"<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#,
            ),
            (
                "OPS/book.opf",
                r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Native sample</dc:title><dc:creator>A writer</dc:creator><dc:language>en</dc:language><meta name="calibre:series" content="Sample series"/></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="c1"/></spine></package>"#,
            ),
            (
                "OPS/chapter.xhtml",
                r#"<!DOCTYPE html><html><head><title>Do not narrate this</title><style>bad</style></head><body><h1>Morning</h1><p>Hello &amp; welcome.</p><script>ignore()</script><p>Keep reading [now].</p></body></html>"#,
            ),
            ("OPS/cover.png", "fixture-cover"),
        ] {
            zip.start_file(path, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(data.as_bytes()).unwrap();
        }
        let doc = DocumentSession::open(zip.finish().unwrap().into_inner(), "EPUB".into()).unwrap();
        assert_eq!(doc.metadata().unwrap().title, "Native sample");
        assert_eq!(doc.metadata().unwrap().series, "Sample series");
        let text = doc.chapter(0).unwrap();
        assert!(text.contains("Hello & welcome."));
        assert!(text.contains("Keep reading [now]."));
        assert!(!text.contains("ignore()"));
        assert!(!text.contains("Do not narrate"));
        assert_eq!(doc.cover().unwrap(), b"fixture-cover");
        assert!(doc.chapter(1).is_err());
        doc.close().unwrap();
        assert!(doc.cover().is_err());
    }
    #[test]
    fn reject_bad_archives_and_external_members() {
        assert!(DocumentSession::open(b"bad".to_vec(), "EPUB".into()).is_err());
        assert!(archive_path("OPS/book.opf", "https://remote.example/a.xhtml").is_err());
        assert!(
            chapter_text(b"<!DOCTYPE html [<!ENTITY x SYSTEM 'file:///private'>]><html/>").is_err()
        );
    }
}
