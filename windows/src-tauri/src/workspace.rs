//! Key-free utilities. No model output is executed as code or an app action.
use crate::{platform, settings};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::{io::Write, net::IpAddr, path::Path, process::Command};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reading: Option<ReadingState>,
    pub name: String,
    pub text: String,
    #[serde(default)]
    pub pages: Vec<Page>,
    #[serde(default)]
    pub path: Option<String>,
}
#[derive(Clone,Serialize,Deserialize)]
pub struct ReadingState {pub offset:usize,pub bookmarks:Vec<usize>,pub annotations:Vec<Highlight>}
#[derive(Clone,Serialize,Deserialize)]
pub struct Highlight {pub id:String,pub start:usize,pub end:usize,pub quote:String,pub color:String,pub note:String}
pub fn valid_reading(source:&Source)->bool{
    let Some(state)=&source.reading else{return true;};
    if state.bookmarks.len()>100||state.annotations.len()>100{return false;}
    let text:Vec<u16>=source.text.encode_utf16().collect();
    if state.offset>text.len()||state.bookmarks.iter().any(|n|*n>text.len()){return false;}
    let mut ids=std::collections::HashSet::new();
    state.annotations.iter().all(|a|!a.id.is_empty()&&a.id.len()<=80&&ids.insert(a.id.as_str())&&a.start<a.end&&a.end<=text.len()&&a.end-a.start<=2000&&matches!(a.color.as_str(),"gold"|"green"|"pink")&&a.note.encode_utf16().count()<=1000&&text[a.start..a.end].iter().copied().eq(a.quote.encode_utf16()))
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Page {
    pub number: usize,
    pub text: String,
    pub ocr: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub id: usize,
    pub source_name: String,
    pub page: Option<usize>,
    pub text: String,
    pub ocr: bool,
}
const MAX_SOURCE: usize = 2_000_000;
const MAX_PDF_PAGES: usize = 600;

pub fn read_file(path: &str) -> Result<Source, String> {
    read_file_with(path, None, None)
}
pub fn read_file_with(
    path: &str,
    pack: Option<&Path>,
    cancel: Option<&crate::reader::Cancellation>,
) -> Result<Source, String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("Choose a file by its full path.".into());
    }
    let meta = std::fs::metadata(path).map_err(|_| "The selected file cannot be read.")?;
    if !meta.is_file() || meta.len() > 50 * 1024 * 1024 {
        return Err("Choose a file under 50 MB.".into());
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let mut pages = Vec::new();
    let text = if ext == "pdf" {
        let extracted = pdf_extract::extract_text_by_pages(path)
            .map_err(|_| "This PDF could not be read. It may be encrypted or damaged.")?;
        if extracted.len() > MAX_PDF_PAGES {
            return Err(format!("This PDF has {} pages. AnF can read up to {MAX_PDF_PAGES}; split this file into smaller parts first.", extracted.len()));
        }
        let mut reader = None;
        let mut total = 0;
        for (index, mut text) in extracted.into_iter().enumerate() {
            if let Some(c) = cancel {
                c.check()?;
            }
            let ocr = text.trim().chars().count() < 20;
            if ocr {
                let directory = pack
                    .map(|p| p.to_path_buf())
                    .or_else(crate::reader::pack_directory)
                    .ok_or("This page needs OCR. Use the complete installer with the OCR pack.")?;
                if reader.is_none() {
                    reader = Some(crate::reader::Reader::new(&directory)?);
                }
                text = reader
                    .as_ref()
                    .unwrap()
                    .image(&crate::reader::pdf_page(path, index as u32)?)?;
            }
            total += text.len();
            if total > MAX_SOURCE {
                return Err("Document text exceeds 2 MB. Split it into smaller files.".into());
            }
            pages.push(Page {
                number: index + 1,
                text,
                ocr,
            });
        }
        pages
            .iter()
            .map(|p| p.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n")
    } else if matches!(ext.as_str(), "epub" | "docx") {
        crate::book::read(path, cancel)?
    } else if matches!(ext.as_str(), "png" | "jpg" | "jpeg") {
        let directory = pack
            .map(|p| p.to_path_buf())
            .or_else(crate::reader::pack_directory)
            .ok_or("OCR pack is missing. Use the complete installer.")?;
        let text = crate::reader::Reader::new(&directory)?
            .image(&std::fs::read(path).map_err(|e| e.to_string())?)?;
        pages.push(Page {
            number: 1,
            text: text.clone(),
            ocr: true,
        });
        text
    } else {
        if meta.len() > MAX_SOURCE as u64 {
            return Err("Text files must be under 2 MB.".into());
        }
        std::fs::read_to_string(path).map_err(|_| "Use a PDF or a UTF-8 text file.")?
    };
    if let Some(c) = cancel {
        c.check()?;
    }
    if text.trim().is_empty() {
        return Err(
            "No readable text found. OCR works best on clear English or Latin-alphabet text."
                .into(),
        );
    }
    if text.len() > MAX_SOURCE {
        return Err(
            "The document has too much text. Split it into smaller files (under 2 MB of text)."
                .into(),
        );
    }
    Ok(Source {reading:None,
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        text,
        pages,
        path: Some(path.to_string_lossy().into()),
    })
}

/// Retrieve excerpts on every question rather than silently reading only page one.
pub fn excerpts(text: &str, query: &str) -> String {
    let words: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 3)
        .map(|w| w.to_lowercase())
        .collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let mut end = (start + 900).min(text.len());
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        let chunk = &text[start..end];
        let lower = chunk.to_lowercase();
        let score = words.iter().filter(|w| lower.contains(w.as_str())).count();
        chunks.push((score, start, chunk));
        start = end;
    }
    chunks.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
    chunks.truncate(3);
    chunks.sort_by_key(|c| c.1);
    chunks
        .iter()
        .map(|(_, offset, t)| format!("[Excerpt at character byte {offset}]\n{t}"))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_documentation()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && ip.octets()[0] != 0
                && ip.octets()[0] < 224
                && !(ip.octets()[0] == 100 && (64..128).contains(&ip.octets()[1]))
        }
        IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .map(|ip| public_ip(ip.into()))
            .unwrap_or_else(|| {
                !ip.is_loopback()
                    && !ip.is_unspecified()
                    && !ip.is_multicast()
                    && (ip.segments()[0] & 0xe000) == 0x2000
                    && ip.segments()[0] != 0x2001
            }),
    }
}

pub async fn read_web(url: &str) -> Result<Source, String> {
    let url = reqwest::Url::parse(url).map_err(|_| "Enter a complete https:// address.")?;
    if url.scheme() != "https"
        || url.port_or_known_default() != Some(443)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Use a public HTTPS webpage without embedded login details.".into());
    }
    let host = url.host_str().ok_or("Webpage has no host.")?;
    let addresses: Vec<_> = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::net::lookup_host((host, 443)),
    )
    .await
    .map_err(|_| "Website lookup timed out.")?
    .map_err(|_| "Could not find website.")?
    .collect();
    if addresses.is_empty() || addresses.iter().any(|a| !public_ip(a.ip())) {
        return Err("Only public internet webpages can be read here.".into());
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .resolve_to_addrs(host, &addresses)
        .timeout(std::time::Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url.clone())
        .header("User-Agent", "AnF/0.1.3 webpage reader")
        .send()
        .await
        .map_err(|_| "Could not read this website. Open it in your browser instead.")?;
    if !response.status().is_success() {
        return Err(format!("Website returned {}. Open it in your browser; redirects and sign-in pages are not followed.",response.status()));
    }
    if !response
        .headers()
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|s| s.contains("text/html") || s.contains("text/plain"))
    {
        return Err("Use an HTML or plain-text webpage.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Website download failed.")?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Webpage is too large. Use a smaller article.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8_lossy(&bytes);
    let text = html_text(&body);
    if text.trim().is_empty() {
        return Err("No readable article text found. This site may require JavaScript or login; use your browser.".into());
    }
    if text.len() > MAX_SOURCE {
        return Err("Webpage has too much text. Choose a shorter page.".into());
    }
    Ok(Source {reading:None,
        name: url.to_string(),
        text,
        pages: Vec::new(),
        path: None,
    })
}

/// Page-aware retrieval with rare-word weighting; generic summaries sample the source.
pub fn evidence(sources: &[Source], query: &str) -> Vec<Evidence> {
    let terms: Vec<_> = query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::to_lowercase)
        .filter(|t| {
            t.len() > 2
                && ![
                    "the",
                    "and",
                    "for",
                    "from",
                    "this",
                    "that",
                    "what",
                    "please",
                    "summarize",
                    "summary",
                    "compare",
                    "document",
                    "documents",
                    "loaded",
                    "source",
                    "sources",
                ]
                .contains(&t.as_str())
        })
        .collect();
    let mut all = Vec::new();
    for (si, source) in sources.iter().enumerate() {
        let pages: Vec<_> = if source.pages.is_empty() {
            vec![(None, source.text.as_str(), false)]
        } else {
            source
                .pages
                .iter()
                .map(|p| (Some(p.number), p.text.as_str(), p.ocr))
                .collect()
        };
        for (page, text, ocr) in pages {
            let mut start = 0;
            while start < text.len() {
                let mut end = (start + 450).min(text.len());
                while !text.is_char_boundary(end) {
                    end -= 1;
                }
                all.push((si, page, text[start..end].to_string(), ocr));
                start = end;
            }
        }
    }
    let rarity: Vec<_> = terms
        .iter()
        .map(|t| {
            ((all.len() + 1) as f64
                / (all
                    .iter()
                    .filter(|c| c.2.to_lowercase().contains(t))
                    .count()
                    + 1) as f64)
                .ln()
                + 1.0
        })
        .collect();
    let mut selected = Vec::new();
    for si in 0..sources.len() {
        let candidates: Vec<_> = all
            .iter()
            .enumerate()
            .filter(|(_, c)| c.0 == si)
            .map(|(i, c)| {
                let lower = c.2.to_lowercase();
                let score: f64 = terms
                    .iter()
                    .zip(&rarity)
                    .map(|(t, w)| w * (lower.matches(t).count().min(3) as f64))
                    .sum();
                (i, score)
            })
            .collect();
        if candidates.is_empty() {
            continue;
        }
        let mut ranked = candidates.clone();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        let count = if sources.len() == 1 {
            3
        } else {
            (4 / sources.len()).max(1)
        };
        if ranked[0].1 == 0.0 {
            for j in 0..count.min(candidates.len()) {
                selected.push(candidates[j * (candidates.len() - 1) / (count - 1).max(1)].0);
            }
        } else {
            selected.extend(ranked.iter().take(count).map(|c| c.0));
        }
    }
    selected.sort_unstable();
    selected.dedup();
    selected.truncate(4);
    selected
        .into_iter()
        .enumerate()
        .map(|(i, index)| {
            let (si, page, text, ocr) = &all[index];
            Evidence {
                id: i + 1,
                source_name: sources[*si].name.clone(),
                page: *page,
                text: text.clone(),
                ocr: *ocr,
            }
        })
        .collect()
}

pub(crate) fn html_text(body: &str) -> String {
    let html = Html::parse_document(body);
    let root = Selector::parse("main, article").unwrap();
    let paragraphs = Selector::parse("h1,h2,h3,h4,p,li,td,pre,blockquote").unwrap();
    let scope = html
        .select(&root)
        .next()
        .unwrap_or_else(|| html.root_element());
    let lines: Vec<_> = scope
        .select(&paragraphs)
        .filter(|e| {
            !e.ancestors()
                .filter_map(scraper::ElementRef::wrap)
                .any(|a| matches!(a.value().name(), "script" | "style" | "nav" | "footer"))
        })
        .map(|e| {
            e.text()
                .collect::<Vec<_>>()
                .join(" ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|s| !s.is_empty())
        .collect();
    if lines.is_empty() && !body.contains('<') {
        body.to_string()
    } else {
        lines.join("\n\n")
    }
}

fn xml(s: &str) -> String {
    s.chars()
        .filter(|c| *c == '\n' || *c == '\t' || (*c >= ' ' && *c != '\u{fffe}' && *c != '\u{ffff}'))
        .collect::<String>()
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn styled_runs(mut text: &str) -> Vec<(bool, bool, String)> {
    let mut runs = Vec::new();
    while let Some(start) = text.find('*') {
        if start > 0 { runs.push((false, false, text[..start].into())); }
        let rest = &text[start..];
        let marker = if rest.starts_with("**") { "**" } else { "*" };
        let after = &rest[marker.len()..];
        if let Some(end) = after.find(marker).filter(|&n| n > 0 && !after[..n].contains('*')) {
            runs.push((marker.len() == 2, marker.len() == 1, after[..end].into()));
            text = &after[end + marker.len()..];
        } else {
            runs.push((false, false, "*".into())); text = &rest[1..];
        }
    }
    if !text.is_empty() { runs.push((false, false, text.into())); }
    runs
}
fn formatted_line(line: &str, format: &str) -> String {
    let (heading, text) = if let Some(t) = line.strip_prefix("### ") { (3,t) }
        else if let Some(t) = line.strip_prefix("## ") { (2,t) }
        else if let Some(t) = line.strip_prefix("# ") { (1,t) } else { (0,line) };
    let text = text.strip_prefix("- ").or_else(|| text.strip_prefix("* ")).map(|t| format!("• {t}")).unwrap_or_else(|| text.into());
    let runs = styled_runs(&text);
    let size = match heading { 1 => 36, 2 => 30, 3 => 26, _ => 22 };
    match format {
        "html" => {
            let tag = if heading > 0 { format!("h{heading}") } else { "p".into() };
            let content: String = runs.iter().map(|(b,i,t)| if *b { format!("<strong>{}</strong>",html_escape(t)) } else if *i { format!("<em>{}</em>",html_escape(t)) } else {html_escape(t)}).collect();
            format!("<{tag}>{content}</{tag}>")
        }
        "rtf" => {
            let content: String = runs.iter().map(|(b,i,t)| format!("{{\\fs{size}{}{} {}}}",if *b || heading>0 {"\\b"}else{""},if *i {"\\i"}else{""},rtf_escape(t))).collect();
            format!("{content}\\par\n")
        }
        _ => {
            let content: String = runs.iter().map(|(b,i,t)|format!("<w:r><w:rPr><w:sz w:val=\"{size}\"/>{}{}</w:rPr><w:t xml:space=\"preserve\">{}</w:t></w:r>",if *b || heading>0 {"<w:b/>"}else{""},if *i {"<w:i/>"}else{""},xml(t))).collect();
            format!("<w:p>{content}</w:p>")
        }
    }
}
pub fn save_document(title: &str, text: &str, format: &str) -> Result<String, String> {
    if text.trim().is_empty() || text.len() > 200_000 {
        return Err("Document must contain text under 200 KB.".into());
    }
    let dir = settings::local_dir().join("documents");
    platform::ensure_private_dir(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let extension = match format { "docx" => "docx", "txt" => "txt", "ics" => "ics", "svg" => "svg", "json" => "json", "md" => "md", "html" => "html", "rtf" => "rtf", _ => return Err("Choose Word, plain text, Markdown, HTML, or RTF. Use Print to PDF for a PDF copy.".into()) };
    let path = dir.join(format!("AnF-{stamp}.{extension}"));
    if format != "docx" {
        let content = match format {
            "txt" | "md" | "ics" | "svg" | "json" => text.to_string(),
            "html" => format!("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>{}</title><style>body{{max-width:800px;margin:40px auto;font:17px/1.7 system-ui;padding:20px}}p{{white-space:pre-wrap}}</style><body><h1>{}</h1>{}</body></html>", html_escape(title), html_escape(title), text.lines().map(|l|formatted_line(l,"html")).collect::<String>()),
            "rtf" => format!("{{\\rtf1\\ansi\\deff0 {{\\fonttbl {{\\f0 Calibri;}}}}\\f0\\fs22 {}}}", text.lines().map(|l|formatted_line(l,"rtf")).collect::<String>()),
            _ => unreachable!(),
        };
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        return Ok(path.to_string_lossy().into());
    }
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let opts =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let document = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val=\"32\"/></w:rPr><w:t>{}</w:t></w:r></w:p>{}<w:sectPr/></w:body></w:document>",xml(title),text.lines().map(|line|formatted_line(line,"docx")).collect::<String>());
    for (name,data) in [
        ("[Content_Types].xml","<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"),
        ("_rels/.rels","<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"),
        ("word/document.xml",document.as_str()),
    ] { zip.start_file(name,opts).map_err(|e|e.to_string())?; zip.write_all(data.as_bytes()).map_err(|e|e.to_string())?; }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}

fn html_escape(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;") }

fn rtf_escape(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"), '{' => out.push_str("\\{"), '}' => out.push_str("\\}"), '\n' => out.push_str("\\line "),
            _ if c.is_ascii() => out.push(c),
            _ => { let mut units = [0u16; 2]; for unit in c.encode_utf16(&mut units) { out.push_str(&format!("\\u{}?", *unit as i16)); } }
        }
    }
    out
}

pub fn launch(app: &str) -> Result<(), String> {
    if app == "documents" {
        let dir = settings::local_dir().join("documents");
        platform::ensure_private_dir(&dir).map_err(|e| e.to_string())?;
        platform::reveal_folder(&dir.to_string_lossy());
        return Ok(());
    }
    #[cfg(windows)]
    {
        let exe = match app {
            "notepad" => "notepad.exe",
            "calculator" => "calc.exe",
            "explorer" => "explorer.exe",
            _ => return Err("Choose one of the listed apps.".into()),
        };
        let system = std::env::var_os("WINDIR").ok_or("Windows folder unavailable.")?;
        platform::no_console(&mut Command::new(Path::new(&system).join(
            if app == "explorer" {
                exe.to_string()
            } else {
                format!("System32/{exe}")
            },
        )))
        .spawn()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("These app buttons are available on Windows.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires internet to test the public webpage reader"]
    fn reads_a_public_webpage_without_api_keys() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let source = rt.block_on(read_web("https://example.com/")).unwrap();
        assert!(source.text.contains("documentation"), "{}", source.text);
    }
    #[test]
    fn reads_a_real_pdf_without_cloud_access() {
        let source = read_file(
            &Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/data/simple.pdf")
                .to_string_lossy(),
        )
        .unwrap();
        assert!(
            source.text.contains("small demonstration"),
            "{}",
            source.text
        );
    }
    #[test]
    fn private_addresses_are_refused() {
        for s in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.1.1",
            "100.64.0.1",
            "::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!public_ip(s.parse().unwrap()), "{s}");
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
    }
    #[test]
    fn excerpts_find_later_document_content() {
        let text = format!(
            "{}\nThe warranty expires after three years.",
            "Introduction. ".repeat(1000)
        );
        let answer = excerpts(&text, "What is the warranty?");
        assert!(answer.contains("three years"));
        assert!(answer.len() < 3000);
    }
    #[test]
    fn retrieval_tracks_pages_and_represents_both_documents() {
        let sources = vec![
            Source {reading:None,
                name: "A".into(),
                text: String::new(),
                pages: vec![Page {
                    number: 12,
                    text: "Warranty lasts three years.".into(),
                    ocr: false,
                }],
                path: None,
            },
            Source {reading:None,
                name: "B".into(),
                text: "Warranty lasts five years.".into(),
                pages: vec![],
                path: None,
            },
        ];
        let result = evidence(&sources, "Compare warranty coverage");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].page, Some(12));
        assert_eq!(result[1].source_name, "B");
        assert!(result[1].text.contains("five years"));
    }
    #[test]
    fn summary_samples_end_of_long_source() {
        let s = Source {reading:None,
            name: "Long".into(),
            text: format!("{}FINAL CONCLUSION", "Opening words. ".repeat(1000)),
            pages: vec![],
            path: None,
        };
        let result = evidence(&[s], "Summarize the loaded document");
        assert!(result.iter().any(|e| e.text.contains("FINAL CONCLUSION")));
    }
    #[test]
    fn html_ignores_scripts_and_navigation() {
        let out=html_text("<main><h1>Article</h1><p>Useful fact.</p><script>bad()</script><nav><p>menu</p></nav></main>");
        assert!(out.contains("Useful fact"));
        assert!(!out.contains("bad()") && !out.contains("menu"));
    }
    #[test]
    fn docx_contains_escaped_text_and_relationships() {
        let path = save_document("Test <title>", "Hello & goodbye", "docx").unwrap();
        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut text = String::new();
        std::io::Read::read_to_string(
            &mut archive.by_name("word/document.xml").unwrap(),
            &mut text,
        )
        .unwrap();
        assert!(text.contains("Hello &amp; goodbye"));
        assert!(archive.by_name("_rels/.rels").is_ok());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn plain_html_and_rich_text_exports_preserve_content_safely() {
        for format in ["txt", "md", "ics", "svg", "json"] {
            let path = save_document("Export test", "Hello & goodbye", format).unwrap();
            assert_eq!(std::fs::read_to_string(&path).unwrap(), "Hello & goodbye");
            std::fs::remove_file(path).unwrap();
        }
        let html = save_document("<Title>", "<script>unsafe & text</script>", "html").unwrap();
        let html_text = std::fs::read_to_string(&html).unwrap();
        assert!(html_text.contains("&lt;script&gt;unsafe &amp; text&lt;/script&gt;"));
        std::fs::remove_file(html).unwrap();
        let rtf = save_document("Export test", "Hi {there} — café", "rtf").unwrap();
        let rtf_text = std::fs::read_to_string(&rtf).unwrap();
        assert!(rtf_text.contains("Hi "));
        assert!(rtf_text.contains("\\{there\\}"));
        assert!(rtf_text.contains("\\u8212?"));
        std::fs::remove_file(rtf).unwrap();
    }
    #[test]
    fn formatted_exports_keep_headings_emphasis_and_literal_tags() {
        assert_eq!(formatted_line("## A & B", "html"), "<h2>A &amp; B</h2>");
        assert_eq!(formatted_line("**Bold** and *gentle* <tag>", "html"), "<p><strong>Bold</strong> and <em>gentle</em> &lt;tag&gt;</p>");
        let word = formatted_line("**Bold** and *gentle*", "docx");
        assert!(word.contains("<w:b/>") && word.contains("<w:i/>"));
        assert!(!word.contains('*'));
        assert!(formatted_line("# Heading", "rtf").contains("\\fs36\\b"));
        assert!(formatted_line("- Item", "html").contains("• Item"));
        assert!(formatted_line("An unmatched * stays", "html").contains("unmatched * stays"));
    }
}
