//! Bounded, text-only readers. Archive members never reach the filesystem.
use std::{collections::HashMap, io::{Read, Seek}, path::Path};
use quick_xml::{events::Event, Reader};
const LIMIT: usize = 2_000_000;

fn member<R: Read + Seek>(zip: &mut zip::ZipArchive<R>, name: &str) -> Result<String,String> {
    let file=zip.by_name(name).map_err(|_|format!("Document is missing {name}."))?;
    if file.size()>LIMIT as u64 {return Err("A document section exceeds 2 MB. Split the document first.".into());}
    let mut bytes=Vec::new();
    file.take(LIMIT as u64+1).read_to_end(&mut bytes).map_err(|_|"Cannot decode this archive member. It may be protected or damaged.")?;
    if bytes.len()>LIMIT{return Err("Document section exceeds 2 MB.".into());}
    String::from_utf8(bytes).map_err(|_|"Document must use UTF-8 text.".into())
}
fn attributes(xml:&str, tag:&str)->Result<Vec<HashMap<String,String>>,String>{
    let mut reader=Reader::from_str(xml);let mut result=Vec::new();
    loop {match reader.read_event().map_err(|e|format!("Invalid document XML: {e}"))? {
        Event::Start(e)|Event::Empty(e) if e.local_name().as_ref()==tag => {
            let mut attrs=HashMap::new();
            for a in e.attributes(){let a=a.map_err(|e|e.to_string())?;attrs.insert(a.key.local_name().as_ref().to_string(),a.normalized_value(quick_xml::XmlVersion::Implicit1_0).map_err(|e|e.to_string())?.into_owned());}
            result.push(attrs);
        },
        Event::DocType(_)=>return Err("Document XML declarations with entities are unsupported.".into()),
        Event::Eof=>break,_=>{}
    }} Ok(result)
}
fn archive_path(base:&str, reference:&str)->Result<String,String>{
    let reference=reference.split('#').next().unwrap_or("");
    if reference.is_empty()||reference.starts_with('/')||reference.contains([':', '\\', '%']) {return Err("Unsupported EPUB resource path.".into());}
    let mut parts:Vec<&str>=base.split('/').filter(|p|!p.is_empty()).collect();
    for part in reference.split('/') {match part {"."|""=>{},".."=>{if parts.pop().is_none(){return Err("EPUB resource leaves its archive.".into());}},_=>parts.push(part)}}
    Ok(parts.join("/"))
}
pub fn read(path:&Path, cancel:Option<&crate::reader::Cancellation>)->Result<String,String>{
    let mut zip=zip::ZipArchive::new(std::fs::File::open(path).map_err(|e|e.to_string())?).map_err(|_|"This document archive is damaged.")?;
    if zip.len()>10000 {return Err("This document has too many archive members.".into());}
    if path.extension().is_some_and(|e|e.eq_ignore_ascii_case("docx")) {
        let xml=member(&mut zip,"word/document.xml")?;
        let mut reader=Reader::from_str(&xml);let mut out=String::new();let mut in_text=false;
        loop {match reader.read_event().map_err(|e|e.to_string())? {
            Event::Start(e) if e.local_name().as_ref()=="t"=>in_text=true,
            Event::Text(e) if in_text=>out.push_str(&e),
            Event::GeneralRef(e) if in_text=>{let name=&*e;let encoded=format!("&{name};");out.push_str(&quick_xml::escape::unescape(&encoded).map_err(|e|e.to_string())?);},
            Event::End(e)=>{if e.local_name().as_ref()=="t" {in_text=false;}if e.local_name().as_ref()=="p" {out.push('\n');}},
            Event::Empty(e)=>match e.local_name().as_ref(){"tab"=>out.push('\t'),"br"=>out.push('\n'),_=>{}},
            Event::DocType(_)=>return Err("Unsupported document XML declaration.".into()),Event::Eof=>break,_=>{}
        }}return Ok(out);
    }
    let container=member(&mut zip,"META-INF/container.xml")?;
    let root=attributes(&container,"rootfile")?.into_iter().find_map(|a|a.get("full-path").cloned()).ok_or("EPUB package location is missing.")?;
    let root=archive_path("",&root)?;let base=root.rsplit_once('/').map(|(p,_)|p).unwrap_or("");
    let package=member(&mut zip,&root)?;
    let manifest:HashMap<String,String>=attributes(&package,"item")?.into_iter().filter_map(|a|Some((a.get("id")?.clone(),a.get("href")?.clone()))).collect();
    let spine=attributes(&package,"itemref")?;
    if spine.is_empty()||spine.len()>1000{return Err("EPUB must contain 1–1,000 reading-order sections.".into());}
    let mut out=String::new();
    for item in spine {
        if let Some(c)=cancel {c.check()?;}
        if item.get("linear").is_some_and(|v|v=="no"){continue;}
        let reference=item.get("idref").and_then(|id|manifest.get(id)).ok_or("EPUB reading order references a missing chapter.")?;
        let path=archive_path(base,reference)?;
        let html=member(&mut zip,&path)?;
        let text=crate::workspace::html_text(&html);
        if out.len()+text.len()+2>LIMIT{return Err("EPUB text exceeds 2 MB. Split the book first.".into());}
        out.push_str(&text);out.push_str("\n\n");
    }
    Ok(out)
}

#[cfg(test)] mod tests {
    use super::*;use std::io::Write;
    #[test] fn archive_paths_cannot_escape(){assert!(archive_path("","../bad").is_err());assert!(archive_path("","https://bad").is_err());assert_eq!(archive_path("OPS/text","../one.xhtml").unwrap(),"OPS/one.xhtml");}
    #[test] fn epub_uses_spine_order_and_docx_preserves_text(){
        let dir=crate::settings::local_dir();std::fs::create_dir_all(&dir).unwrap();
        for ext in ["epub","docx"] {
            let path=dir.join(format!("book-reader-test.{ext}"));
            let mut zip=zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
            let files=if ext=="epub" {vec![("META-INF/container.xml","<container><rootfiles><rootfile full-path='OPS/book.opf'/></rootfiles></container>"),("OPS/book.opf","<package><manifest><item id='a' href='a.xhtml'/><item id='b' href='b.xhtml'/></manifest><spine><itemref idref='b'/><itemref idref='a'/></spine></package>"),("OPS/a.xhtml","<html><body><p>Second chapter.</p></body></html>"),("OPS/b.xhtml","<html><body><p>First &amp; foremost.</p><script>bad()</script></body></html>")]}else{vec![("word/document.xml","<w:document xmlns:w='urn:w'><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>Next</w:t></w:r></w:p></w:document>")]};
            for (name,text) in files {zip.start_file(name,zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)).unwrap();zip.write_all(text.as_bytes()).unwrap();}zip.finish().unwrap();
            let text=read(&path,None).unwrap();
            if ext=="epub" {assert!(text.find("First & foremost").unwrap()<text.find("Second chapter").unwrap());assert!(!text.contains("bad()"));}else{assert_eq!(text,"A & B\nNext\n");}
            std::fs::remove_file(path).unwrap();
        }
    }
}
